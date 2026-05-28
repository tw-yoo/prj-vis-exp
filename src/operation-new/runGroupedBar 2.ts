import type { ChainState } from '../operation-next/chainState'
import { clearGroupBoundary } from '../operation-next/chainState'
import {
  buildOperationNextRunOutcome,
  restoreChainState,
  serializeChainState,
  stateWithOperationDependencies,
  storeOperationRuntimeResult,
} from '../operation-next/executionState'
import { ChartType } from '../domain/chart'
import { OperationOp, type DatumValue, type OperationSpec } from '../domain/operation/types'
import type { GroupedSpec } from '../rendering/bar/groupedBarRenderer'
import {
  ensureGroupedBarChartInstance,
  type GroupedBarChartInstance,
} from '../rendering-new/instances/groupedBarInstance'
import { runGroupedBarOperations } from '../operation-next/runners/groupedBar'
import {
  createBarChartState,
  getBarDatumValues,
  isBarTransformDrawOperation,
} from '../operation-next/runners/barGroupShared'
import type { ParsedOperationRun } from '../operation-next/types'
import { filterApplier } from './appliers/groupedBar/filter'
import { averageApplier } from './appliers/groupedBar/average'
import { diffApplier } from './appliers/groupedBar/diff'
import { retrieveValueApplier } from './appliers/groupedBar/retrieveValue'
import { drawTransformApplierGrouped } from './appliers/barGroup/drawTransform'
import type { ApplierArgs, OperationApplier } from './applier'

function isPortedOp(op: OperationSpec): boolean {
  if (isBarTransformDrawOperation(op)) return true
  return (
    op.op === OperationOp.Filter ||
    op.op === OperationOp.Average ||
    op.op === OperationOp.Diff ||
    op.op === OperationOp.RetrieveValue
  )
}

function pickApplier(op: OperationSpec): OperationApplier<GroupedBarChartInstance> | null {
  if (isBarTransformDrawOperation(op)) return drawTransformApplierGrouped
  switch (op.op) {
    case OperationOp.Filter:
      return filterApplier
    case OperationOp.Average:
      return averageApplier
    case OperationOp.Diff:
      return diffApplier
    case OperationOp.RetrieveValue:
      return retrieveValueApplier
    default:
      return null
  }
}

/**
 * GROUPED_BAR op runner.
 *
 * Routing: filter / average / diff / Draw-transform go through new
 * operation-new appliers. Unported ops batch to legacy
 * `runGroupedBarOperations`. State is serialized across the new ↔ legacy
 * boundary so chained ops see consistent ChainState.
 *
 * After a Draw transform converts the chart to a different type (e.g.
 * StackedToSimple), subsequent runChartOps calls land on the new chart's
 * runner via the dispatcher; within a single run, the same applier loop
 * keeps going and the next op simply operates on the legacy active state
 * the transform left behind.
 */
export async function runGroupedBarOperationsNew(run: ParsedOperationRun) {
  const groupedSpec = run.runtimeSpec as GroupedSpec
  console.info('[operation-new] runGroupedBarOperationsNew: entry', {
    groupCount: run.groups.length,
    opsTotal: run.groups.reduce((sum, g) => sum + g.ops.length, 0),
    runtimeScope: run.options?.runtimeScope,
  })

  const instance = ensureGroupedBarChartInstance(run.container, groupedSpec)
  await instance.waitForBuild()

  const hasAnyPorted = run.groups.some((g) => g.ops.some(isPortedOp))
  if (!hasAnyPorted) {
    return runGroupedBarOperations(run)
  }

  const baseWorking: DatumValue[] = getBarDatumValues(run.container, ChartType.GROUPED_BAR, run.runtimeSpec)
  let state: ChainState = restoreChainState(baseWorking, run.options?.initialChainState)
  let nextIndex = run.options?.operationIndexStart ?? 0
  let lastResult: DatumValue[] | null = null

  for (let groupIdx = 0; groupIdx < run.groups.length; groupIdx += 1) {
    const group = run.groups[groupIdx]
    const internalNext = run.groups[groupIdx + 1]?.ops[0]
    const isLastGroup = groupIdx === run.groups.length - 1
    const nextGroupHeadOp = internalNext ?? (isLastGroup ? run.options?.nextRunHeadOp : undefined)

    state = clearGroupBoundary(state)

    let batchStart = 0
    for (let i = 0; i <= group.ops.length; i += 1) {
      const op = group.ops[i]
      const reachedEnd = i === group.ops.length
      const isPorted = !reachedEnd && isPortedOp(op)

      if (isPorted || reachedEnd) {
        if (i > batchStart) {
          const batchOps = group.ops.slice(batchStart, i)
          const legacyRun: ParsedOperationRun = {
            ...run,
            groups: [{ name: group.name, ops: batchOps }],
            options: {
              ...run.options,
              operationIndexStart: nextIndex,
              initialChainState: serializeChainState(state),
            },
          }
          const outcome = await runGroupedBarOperations(legacyRun)
          if (outcome && typeof outcome === 'object' && 'continuation' in outcome) {
            const cont = (outcome as { continuation?: unknown }).continuation
            state = restoreChainState(baseWorking, cont as Parameters<typeof restoreChainState>[1])
          }
          if (outcome && typeof outcome === 'object' && 'result' in outcome) {
            const rest = (outcome as { result?: unknown }).result
            if (Array.isArray(rest)) lastResult = rest as DatumValue[]
          }
          nextIndex += batchOps.length
        }
        batchStart = i + 1
      }

      if (isPorted) {
        const applier = pickApplier(op)
        if (!applier) {
          nextIndex += 1
          continue
        }
        const operationState = stateWithOperationDependencies(op, state)
        await run.options?.onOperationReady?.({ operation: op, operationIndex: nextIndex })
        const applierArgs: ApplierArgs<GroupedBarChartInstance> = {
          operation: op,
          operationIndex: nextIndex,
          state: operationState,
          instance,
          options: run.options,
          groupOps: group.ops,
          groupOperationIndex: i,
          nextGroupHeadOp,
          runtimeSpec: run.runtimeSpec,
          chartType: run.chartType,
        }
        const { result, nextState } = await applier.apply(applierArgs)
        lastResult = result
        state = nextState
        storeOperationRuntimeResult(op, nextIndex, result, run.options?.runtimeScope)
        await run.options?.onOperationCompleted?.({ operation: op, operationIndex: nextIndex, result })
        nextIndex += 1
      }
    }
  }

  // Seed legacy bar chart state on the host so any subsequent legacy ops
  // (after filter in another run) pick up a consistent chartType.
  createBarChartState(run.container, ChartType.GROUPED_BAR, run.runtimeSpec)

  console.info('[operation-new] runGroupedBarOperationsNew: done', {
    finalResultLen: lastResult?.length ?? 0,
    annotationRecords: state.annotationRecords.map((r) => r.cssClass),
  })

  return buildOperationNextRunOutcome(lastResult, state)
}

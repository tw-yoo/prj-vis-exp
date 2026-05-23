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
import type { StackedSpec } from '../rendering/bar/stackedBarRenderer'
import {
  ensureStackedBarChartInstance,
  type StackedBarChartInstance,
} from '../rendering-new/instances/stackedBarInstance'
import { runStackedBarOperations } from '../operation-next/runners/stackedBar'
import {
  createBarChartState,
  getBarDatumValues,
  isBarTransformDrawOperation,
} from '../operation-next/runners/barGroupShared'
import type { ParsedOperationRun } from '../operation-next/types'
import { filterApplier } from './appliers/stackedBar/filter'
import { averageApplier } from './appliers/stackedBar/average'
import { diffApplier } from './appliers/stackedBar/diff'
import { retrieveValueApplier } from './appliers/stackedBar/retrieveValue'
import { drawTransformApplierStacked } from './appliers/barGroup/drawTransform'
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

function pickApplier(op: OperationSpec): OperationApplier<StackedBarChartInstance> | null {
  if (isBarTransformDrawOperation(op)) return drawTransformApplierStacked
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
 * STACKED_BAR op runner.
 *
 * Routing: filter / average / diff / Draw-transform → new operation-new
 * appliers. Other ops batch to legacy `runStackedBarOperations`. The
 * legacy code internally handles stacked-to-grouped conversion via Draw
 * transforms, so once a Draw applier runs and converts the chart, the
 * subsequent dispatcher call lands on the new chart type's runner.
 */
export async function runStackedBarOperationsNew(run: ParsedOperationRun) {
  const stackedSpec = run.runtimeSpec as StackedSpec
  console.info('[operation-new] runStackedBarOperationsNew: entry', {
    groupCount: run.groups.length,
    opsTotal: run.groups.reduce((sum, g) => sum + g.ops.length, 0),
    runtimeScope: run.options?.runtimeScope,
  })

  const instance = ensureStackedBarChartInstance(run.container, stackedSpec)
  await instance.waitForBuild()

  const hasAnyPorted = run.groups.some((g) => g.ops.some(isPortedOp))
  if (!hasAnyPorted) {
    return runStackedBarOperations(run)
  }

  const baseWorking: DatumValue[] = getBarDatumValues(run.container, ChartType.STACKED_BAR, run.runtimeSpec)
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
          const outcome = await runStackedBarOperations(legacyRun)
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
        const applierArgs: ApplierArgs<StackedBarChartInstance> = {
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

  createBarChartState(run.container, ChartType.STACKED_BAR, run.runtimeSpec)

  console.info('[operation-new] runStackedBarOperationsNew: done', {
    finalResultLen: lastResult?.length ?? 0,
    annotationRecords: state.annotationRecords.map((r) => r.cssClass),
  })

  return buildOperationNextRunOutcome(lastResult, state)
}

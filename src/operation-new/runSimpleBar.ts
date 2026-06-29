import { ChartType } from '../domain/chart'
import { type DatumValue, type JsonValue, type OperationSpec } from '../domain/operation/types'
import { toDatumValuesFromRaw, type RawRow } from '../domain/data/datum'
import { type SimpleBarSpec } from '../rendering/bar/simpleBarRenderer'
import { clearGroupBoundary, type ChainState } from '../operation-next/chainState'
import {
  buildOperationNextRunOutcome,
  restoreChainState,
  stateWithOperationDependencies,
  storeOperationRuntimeResult,
} from '../operation-next/executionState'
import { computeLiveReferencedIds } from '../operation-next/diffEndpoint'
import type { ParsedOperationRun } from '../operation-next/types'
import { runStubChartOperationRenderer } from '../operation-next/runners/shared'
import {
  ensureSimpleBarChartInstance,
  type SimpleBarChartInstance,
} from '../rendering-new/instances/simpleBarInstance'
import { createApplierRegistry, type OperationApplier } from './applier'
import { retrieveValueApplier } from './appliers/simpleBar/retrieveValue'
import { filterApplier } from './appliers/simpleBar/filter'
import { diffApplier } from './appliers/simpleBar/diff'
import { diffByValueApplier } from './appliers/simpleBar/diffByValue'
import { averageApplier } from './appliers/simpleBar/average'
import { findExtremumApplier } from './appliers/simpleBar/findExtremum'
import { sortApplier } from './appliers/simpleBar/sort'
import { countApplier } from './appliers/simpleBar/count'
import { sumApplier } from './appliers/simpleBar/sum'
import { compareBoolApplier } from './appliers/simpleBar/compareBool'
import { nthApplier } from './appliers/simpleBar/nth'
import { addApplier } from './appliers/simpleBar/add'
import { scaleApplier } from './appliers/simpleBar/scale'

const APPLIERS: OperationApplier<SimpleBarChartInstance>[] = [
  retrieveValueApplier,
  filterApplier,
  diffApplier,
  diffByValueApplier,
  averageApplier,
  findExtremumApplier,
  sortApplier,
  countApplier,
  sumApplier,
  compareBoolApplier,
  nthApplier,
  addApplier,
  scaleApplier,
]

const REGISTRY = createApplierRegistry(APPLIERS)

function getInlineRows(spec: SimpleBarSpec): RawRow[] {
  const values = (spec.data as { values?: JsonValue[] } | undefined)?.values
  if (!Array.isArray(values)) return []
  return values.filter((value): value is RawRow => !!value && typeof value === 'object' && !Array.isArray(value))
}

function workingDataFromInstance(instance: SimpleBarChartInstance, spec: SimpleBarSpec): DatumValue[] {
  const resolved = instance.resolvedEncoding
  if (!resolved) return []
  const rows = instance.dataRows.length > 0 ? (instance.dataRows as RawRow[]) : getInlineRows(spec)
  return toDatumValuesFromRaw(rows, {
    xField: resolved.xField,
    yField: resolved.yField,
  })
}

/**
 * SIMPLE_BAR op runner — replaces `runSimpleBarOperations` from
 * `src/operation-next/runners/simpleBar.ts`.
 *
 * Flow (same shape as `runSimpleLineOperationsNew`, but with the bar
 * applier registry):
 *   1. Ensure a SimpleBarChartInstance exists on the host.
 *   2. Restore ChainState from initialChainState or build fresh.
 *   3. For each group / op: dispatch to the matching applier, thread state.
 *   4. Build OperationNextRunOutcome and return.
 */
export async function runSimpleBarOperationsNew(run: ParsedOperationRun) {
  const barSpec = run.runtimeSpec as SimpleBarSpec
  console.info('[operation-new] runSimpleBarOperationsNew: entry', {
    groupCount: run.groups.length,
    opsTotal: run.groups.reduce((sum, g) => sum + g.ops.length, 0),
    runtimeScope: run.options?.runtimeScope,
    hasInitialChainState: !!run.options?.initialChainState,
  })
  const instance = ensureSimpleBarChartInstance(run.container, barSpec)
  await instance.waitForBuild()

  // If a full SVG rebuild just occurred (e.g., spec-change or SVG detached),
  // the instance's yScale resets to the original full domain. Restore the
  // filtered domain recorded in initialChainState so subsequent annotation
  // positions stay consistent with the data state from prior substeps.
  if (instance.wasLastBuildRebuild && run.options?.initialChainState?.scaleState?.currentDomain) {
    await instance.transitionChartScale({
      yDomain: run.options.initialChainState.scaleState.currentDomain,
      duration: 0,
    })
  }

  let nextIndex = run.options?.operationIndexStart ?? 0
  let lastResult: DatumValue[] | null = null
  let state: ChainState = restoreChainState(
    workingDataFromInstance(instance, barSpec),
    run.options?.initialChainState,
  )

  // Per-op live reference set: refs consumed by the current op or any op after
  // it in the remaining sequence. Used by appliers to decide which prior
  // annotations are still needed vs. should fade out and be removed.
  const allOpsInOrder: OperationSpec[] = run.groups.flatMap((g) => g.ops)
  let cursor = 0

  for (let groupIdx = 0; groupIdx < run.groups.length; groupIdx += 1) {
    const group = run.groups[groupIdx]
    // Internal lookahead: next group head within THIS run. Falls back to
    // run.options.nextRunHeadOp when this is the last group of the run —
    // covers the case where substep / sentence splits scatter chained ops
    // across multiple runChartOps calls (player resolves the cross-run
    // successor via logicalArtifacts.nodeOps).
    const internalNext = run.groups[groupIdx + 1]?.ops[0]
    const isLastGroup = groupIdx === run.groups.length - 1
    const nextGroupHeadOp = internalNext ?? (isLastGroup ? run.options?.nextRunHeadOp : undefined)
    console.info('[operation-new] runSimpleBarOperationsNew: group start', {
      groupName: group.name,
      ops: group.ops.map((o) => o.op),
      nextGroupHeadOp: nextGroupHeadOp?.op ?? null,
      nextSource: internalNext ? 'internal' : (nextGroupHeadOp ? 'cross-run' : 'none'),
    })
    state = clearGroupBoundary(state)

    for (let groupOperationIndex = 0; groupOperationIndex < group.ops.length; groupOperationIndex += 1) {
      const operation = group.ops[groupOperationIndex]
      const operationIndex = nextIndex
      nextIndex += 1
      const opKey = typeof operation.op === 'string' ? operation.op : ''
      const applier = REGISTRY.get(opKey)
      if (!applier) {
        console.warn('[operation-new] runSimpleBarOperationsNew: unknown op (skipped)', { op: opKey })
        continue
      }
      console.info('[operation-new] runSimpleBarOperationsNew: dispatch op', {
        op: opKey,
        operationIndex,
        nodeId: operation.meta?.nodeId,
        workingDataLen: state.workingData.length,
      })

      const operationState = stateWithOperationDependencies(operation, state)
      await run.options?.onOperationReady?.({ operation, operationIndex })
      // Per-op "still-live" keep set: refs consumed by THIS op or any later op
      // (intra-call via computeLiveReferencedIds + cross-call future groups from
      // the viewer). Passed to appliers as `referencedResultIds` so their
      // applyAnnotationContextFade removes a prior annotation once no
      // current-or-later op needs it — instead of the static all-groups set,
      // which kept consumed annotations dimmed forever (case 1hlsoeyqlr1r1n41).
      const liveReferencedIds = Array.from(
        new Set([
          ...computeLiveReferencedIds(allOpsInOrder, cursor),
          ...(run.options?.futureReferencedResultIds ?? run.options?.referencedResultIds ?? []),
        ]),
      )
      cursor += 1
      const { result, nextState } = await applier.apply({
        operation,
        operationIndex,
        state: operationState,
        instance,
        options: { ...run.options, referencedResultIds: liveReferencedIds },
        groupOps: group.ops,
        groupOperationIndex,
        nextGroupHeadOp,
        runtimeSpec: run.runtimeSpec,
        chartType: run.chartType,
      })

      lastResult = result
      state = nextState
      storeOperationRuntimeResult(operation, operationIndex, result, run.options?.runtimeScope)
      await run.options?.onOperationCompleted?.({ operation, operationIndex, result })
    }
  }

  console.info('[operation-new] runSimpleBarOperationsNew: done', {
    finalResultLen: lastResult?.length ?? 0,
    annotationRecords: state.annotationRecords.map((r) => ({ cls: r.cssClass, opId: r.operationId })),
  })
  if (!lastResult) {
    const stub = await runStubChartOperationRenderer(run, ChartType.SIMPLE_BAR, 'simple-bar-new')
    lastResult = Array.isArray(stub) ? stub : null
  }
  return buildOperationNextRunOutcome(lastResult, state)
}

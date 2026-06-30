import type { DatumValue, JsonValue, OperationSpec } from '../domain/operation/types'
import { OperationOp } from '../domain/operation/types'
import { toDatumValuesFromRaw, type RawRow } from '../domain/data/datum'
import {
  getMultipleLineStoredData,
  resolveMultiLineEncoding,
  type MultiLineSpec,
} from '../rendering/line/multipleLineRenderer'
import {
  ensureMultipleLineChartInstance,
  type MultipleLineChartInstance,
} from '../rendering-new/instances/multipleLineInstance'
import { runMultipleLineOperations } from '../operation-next/runners/multipleLine'
import { clearGroupBoundary, type ChainState } from '../operation-next/chainState'
import {
  buildOperationNextRunOutcome,
  restoreChainState,
  serializeChainState,
  stateWithOperationDependencies,
  storeOperationRuntimeResult,
} from '../operation-next/executionState'
import type { ParsedOperationRun } from '../operation-next/types'
import { filterApplier } from './appliers/multipleLine/filter'
import { findExtremumApplier } from './appliers/multipleLine/findExtremum'
import { diffApplier } from './appliers/multipleLine/diff'
import { averageApplier } from './appliers/multipleLine/average'
import { lagDiffApplier } from './appliers/multipleLine/lagDiff'
import { retrieveValueApplier } from './appliers/multipleLine/retrieveValue'
import { pairDiffApplier } from './appliers/multipleLine/pairDiff'
import { sumApplier } from './appliers/multipleLine/sum'
import type { ApplierArgs, OperationApplier } from './applier'

const PORTED_OPS = new Set<string>([
  OperationOp.Filter,
  OperationOp.FindExtremum,
  OperationOp.Diff,
  OperationOp.Average,
  OperationOp.LagDiff,
  OperationOp.RetrieveValue,
  OperationOp.PairDiff,
  OperationOp.Sum,
])

function getInlineRows(spec: MultiLineSpec): RawRow[] {
  const values = (spec.data as { values?: JsonValue[] } | undefined)?.values
  if (!Array.isArray(values)) return []
  return values.filter((value): value is RawRow => !!value && typeof value === 'object' && !Array.isArray(value))
}

function isPortedOp(op: OperationSpec): boolean {
  return typeof op.op === 'string' && PORTED_OPS.has(op.op)
}

function pickApplier(op: string): OperationApplier<MultipleLineChartInstance> | null {
  switch (op) {
    case OperationOp.Filter:
      return filterApplier as OperationApplier<MultipleLineChartInstance>
    case OperationOp.FindExtremum:
      return findExtremumApplier
    case OperationOp.Diff:
      return diffApplier
    case OperationOp.Average:
      return averageApplier
    case OperationOp.LagDiff:
      return lagDiffApplier
    case OperationOp.RetrieveValue:
      return retrieveValueApplier
    case OperationOp.PairDiff:
      return pairDiffApplier
    case OperationOp.Sum:
      return sumApplier
    default:
      return null
  }
}

/**
 * MULTI_LINE op runner.
 *
 * Routing: filter / findExtremum / diff / average / lagDiff go through the
 * new operation-new appliers (single shared-parent transitions, idempotent
 * DOM, fade-out on annotation churn). retrieveValue / pairDiff remain on
 * the legacy `runMultipleLineOperations` until they are ported.
 *
 * Runs of unported ops are batched between ported-op boundaries so the
 * legacy runner sees them as a cohesive group with intact internal state.
 */
export async function runMultipleLineOperationsNew(run: ParsedOperationRun) {
  const lineSpec = run.runtimeSpec as MultiLineSpec
  console.info('[operation-new] runMultipleLineOperationsNew: entry', {
    groupCount: run.groups.length,
    opsTotal: run.groups.reduce((sum, g) => sum + g.ops.length, 0),
    runtimeScope: run.options?.runtimeScope,
  })

  const instance = ensureMultipleLineChartInstance(run.container, lineSpec)
  await instance.waitForBuild()

  // Fast path — no ported op anywhere in this run. Hand off to legacy.
  const hasAnyPorted = run.groups.some((g) => g.ops.some(isPortedOp))
  if (!hasAnyPorted) {
    return runMultipleLineOperations(run)
  }

  // Prefer rows stored on the container (handles `data.url` and inline values
  // uniformly via the renderer's storage path). Fall back to inline values
  // only when the renderer hasn't stored anything yet.
  const resolved = resolveMultiLineEncoding(lineSpec)
  const storedRows = getMultipleLineStoredData(run.container) as RawRow[]
  const inlineRows = storedRows.length > 0 ? storedRows : getInlineRows(lineSpec)
  const baseWorking: DatumValue[] = resolved
    ? toDatumValuesFromRaw(inlineRows, {
        xField: resolved.xField,
        yField: resolved.yField,
        groupField: resolved.colorField ?? undefined,
      })
    : []

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
        // Flush legacy batch (unported ops).
        if (i > batchStart) {
          const batchOps = group.ops.slice(batchStart, i)
          const legacyRun: ParsedOperationRun = {
            ...run,
            groups: [{ name: group.name, ops: batchOps }],
            options: {
              ...run.options,
              operationIndexStart: nextIndex,
              // Pass current state forward so the legacy ops see post-filter
              // working data, salience, derivedData, etc.
              initialChainState: serializeChainState(state),
            },
          }
          const outcome = await runMultipleLineOperations(legacyRun)
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
        const applier = pickApplier(op.op as string)
        if (!applier) {
          console.warn('[operation-new] runMultipleLineOperationsNew: no applier for op', { op: op.op })
          nextIndex += 1
          continue
        }
        const operationState = stateWithOperationDependencies(op, state)
        await run.options?.onOperationReady?.({ operation: op, operationIndex: nextIndex })
        const applierArgs: ApplierArgs<MultipleLineChartInstance> = {
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

  console.info('[operation-new] runMultipleLineOperationsNew: done', {
    finalResultLen: lastResult?.length ?? 0,
    annotationRecords: state.annotationRecords.map((r) => r.cssClass),
  })

  return buildOperationNextRunOutcome(lastResult, state)
}

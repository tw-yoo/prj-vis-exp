import { ChartType } from '../domain/chart'
import { type DatumValue, type JsonValue } from '../domain/operation/types'
import { toDatumValuesFromRaw, type RawRow } from '../domain/data/datum'
import { resolveSimpleLineEncoding, type LineSpec } from '../rendering/line/simpleLineRenderer'
import { clearGroupBoundary, type ChainState } from '../operation-next/chainState'
import {
  buildOperationNextRunOutcome,
  restoreChainState,
  stateWithOperationDependencies,
  storeOperationRuntimeResult,
} from '../operation-next/executionState'
import type { ParsedOperationRun } from '../operation-next/types'
import { runStubChartOperationRenderer } from '../operation-next/runners/shared'
import {
  ensureSimpleLineChartInstance,
  type SimpleLineChartInstance,
} from '../rendering-new/instances/simpleLineInstance'
import { createApplierRegistry, type OperationApplier } from './applier'
import { retrieveValueApplier } from './appliers/simpleLine/retrieveValue'
import { filterApplier } from './appliers/simpleLine/filter'
import { diffApplier } from './appliers/simpleLine/diff'
import { averageApplier } from './appliers/simpleLine/average'
import { findExtremumApplier } from './appliers/simpleLine/findExtremum'
import { lagDiffApplier } from './appliers/simpleLine/lagDiff'
import { countApplier } from './appliers/simpleLine/count'
import { compareBoolApplier } from './appliers/simpleLine/compareBool'
import { sumApplier } from './appliers/simpleLine/sum'
import { nthApplier } from './appliers/simpleLine/nth'
import { sortApplier } from './appliers/simpleLine/sort'
import { diffByValueApplier } from './appliers/simpleLine/diffByValue'

const APPLIERS: OperationApplier[] = [
  retrieveValueApplier,
  filterApplier,
  diffApplier,
  averageApplier,
  findExtremumApplier,
  lagDiffApplier,
  countApplier,
  compareBoolApplier,
  sumApplier,
  nthApplier,
  sortApplier,
  diffByValueApplier,
]

const REGISTRY = createApplierRegistry(APPLIERS)

function getInlineRows(spec: LineSpec): RawRow[] {
  const values = (spec.data as { values?: JsonValue[] } | undefined)?.values
  if (!Array.isArray(values)) return []
  return values.filter((value): value is RawRow => !!value && typeof value === 'object' && !Array.isArray(value))
}

function workingDataFromInstance(instance: SimpleLineChartInstance, spec: LineSpec): DatumValue[] {
  const resolved = instance.resolvedEncoding ?? resolveSimpleLineEncoding(spec)
  if (!resolved) return []
  const rows = instance.dataRows.length > 0 ? instance.dataRows : getInlineRows(spec)
  return toDatumValuesFromRaw(rows as RawRow[], {
    xField: resolved.xField,
    yField: resolved.yField,
  })
}

/**
 * SIMPLE_LINE op runner — replaces `runSimpleLineOperations` from
 * `src/operation-next/runners/simpleLine.ts`.
 *
 * Flow (op-agnostic):
 *   1. Ensure a SimpleLineChartInstance exists on the host (dispatcher already
 *      did this; we just re-acquire).
 *   2. Restore ChainState from `options.initialChainState`, or build fresh
 *      from the instance's raw rows.
 *   3. For each group: reset group-local fields, then for each op:
 *        a. resolve operation dependencies (workingData from referenced runtime results)
 *        b. dispatch to the matching applier from the registry
 *        c. thread state forward; store runtime result for downstream refs.
 *   4. Build the OperationNextRunOutcome and return.
 */
export async function runSimpleLineOperationsNew(run: ParsedOperationRun) {
  const lineSpec = run.runtimeSpec as LineSpec
  console.info('[operation-new] runSimpleLineOperationsNew: entry', {
    groupCount: run.groups.length,
    opsTotal: run.groups.reduce((sum, g) => sum + g.ops.length, 0),
    runtimeScope: run.options?.runtimeScope,
    hasInitialChainState: !!run.options?.initialChainState,
    hasRuntimeSnapshot: !!run.options?.runtimeSnapshot,
    resetRuntime: run.options?.resetRuntime,
  })
  const instance = ensureSimpleLineChartInstance(run.container, lineSpec)
  await instance.waitForBuild()

  let nextIndex = run.options?.operationIndexStart ?? 0
  let lastResult: DatumValue[] | null = null

  let state: ChainState = restoreChainState(workingDataFromInstance(instance, lineSpec), run.options?.initialChainState)

  for (const group of run.groups) {
    console.info('[operation-new] runSimpleLineOperationsNew: group start', {
      groupName: group.name,
      ops: group.ops.map((o) => o.op),
    })
    state = clearGroupBoundary(state)

    for (const operation of group.ops) {
      const operationIndex = nextIndex
      nextIndex += 1
      const opKey = typeof operation.op === 'string' ? operation.op : ''
      const applier = REGISTRY.get(opKey)
      if (!applier) {
        console.warn('[operation-new] runSimpleLineOperationsNew: unknown op (skipped)', { op: opKey })
        continue
      }
      console.info('[operation-new] runSimpleLineOperationsNew: dispatch op', {
        op: opKey,
        operationIndex,
        nodeId: operation.meta?.nodeId,
        workingDataLen: state.workingData.length,
      })

      const operationState = stateWithOperationDependencies(operation, state)
      const { result, nextState } = await applier.apply({
        operation,
        operationIndex,
        state: operationState,
        instance,
        options: run.options,
      })

      lastResult = result
      state = nextState
      storeOperationRuntimeResult(operation, operationIndex, result, run.options?.runtimeScope)
      await run.options?.onOperationCompleted?.({ operation, operationIndex, result })
    }
  }

  console.info('[operation-new] runSimpleLineOperationsNew: done', {
    finalResultLen: lastResult?.length ?? 0,
    annotationRecords: state.annotationRecords.map((r) => ({ cls: r.cssClass, opId: r.operationId })),
  })
  if (!lastResult) {
    const stub = await runStubChartOperationRenderer(run, ChartType.SIMPLE_LINE, 'simple-line-new')
    lastResult = Array.isArray(stub) ? stub : null
  }
  return buildOperationNextRunOutcome(lastResult, state)
}

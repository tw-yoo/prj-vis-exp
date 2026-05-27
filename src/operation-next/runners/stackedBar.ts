import { ChartType } from '../../domain/chart'
import { OperationOp, type DatumValue, type OperationSpec } from '../../domain/operation/types'
import type { ParsedOperationRun } from '../types'
import {
  createBarChartState,
  isBarTransformDrawOperation,
  isFilterOperation,
  runBarTransformOperation,
  runGroupedBarAverageOperation,
  runGroupedBarDiffOperation,
  runGroupedBarFilterOperation,
  runStackedBarFilterOperation,
  runStackedBarFindExtremumOperation,
  runStackedBarNthOperation,
  runStackedBarRetrieveValueOperation,
} from './barGroupShared'
import {
  buildOperationNextRunOutcome,
  restoreChainState,
  stateWithOperationDependencies,
  storeOperationRuntimeResult,
} from '../executionState'
import { getSupportedOperationsForChart, runStubChartOperationRenderer } from './shared'
import { isTerminalBadgeOperation, runTerminalBadgeOperation } from './terminalShared'

export const STACKED_BAR_SUPPORTED_OPERATIONS = getSupportedOperationsForChart(ChartType.STACKED_BAR)

function isAverageOperation(operation: OperationSpec) {
  return operation.op === OperationOp.Average
}

function isDiffOperation(operation: OperationSpec) {
  return operation.op === OperationOp.Diff
}

function isFindExtremumOperation(operation: OperationSpec) {
  return operation.op === OperationOp.FindExtremum
}

function isRetrieveValueOperation(operation: OperationSpec) {
  return operation.op === OperationOp.RetrieveValue
}

function isNthOperation(operation: OperationSpec) {
  return operation.op === OperationOp.Nth
}

export async function runStackedBarOperations(run: ParsedOperationRun) {
  let active = createBarChartState(run.container, ChartType.STACKED_BAR, run.runtimeSpec)
  active = { ...active, chainState: restoreChainState(active.chainState.originalData, run.options?.initialChainState) }
  let lastResult: DatumValue[] | null = null
  let operationIndex = run.options?.operationIndexStart ?? 0

  for (const group of run.groups) {
    for (const operation of group.ops) {
      if (isBarTransformDrawOperation(operation)) {
        active = await runBarTransformOperation(run.container, active, operation)
        operationIndex += 1
        continue
      }

      if (isTerminalBadgeOperation(operation)) {
        await run.options?.onOperationReady?.({ operation, operationIndex })
        const operationState = stateWithOperationDependencies(operation, active.chainState)
        const badge = await runTerminalBadgeOperation(run.container, operation, operationState, {
          chartType: ChartType.STACKED_BAR,
        })
        active = { ...active, chainState: badge.nextState }
        lastResult = badge.result
        await run.options?.onOperationCompleted?.({ operation, operationIndex, result: badge.result })
        storeOperationRuntimeResult(operation, operationIndex, badge.result, run.options?.runtimeScope)
        operationIndex += 1
        continue
      }

      if (
        !isFilterOperation(operation) &&
        !isAverageOperation(operation) &&
        !isDiffOperation(operation) &&
        !isFindExtremumOperation(operation) &&
        !isRetrieveValueOperation(operation) &&
        !isNthOperation(operation)
      ) {
        operationIndex += 1
        continue
      }

      await run.options?.onOperationReady?.({ operation, operationIndex })
      if (active.chartType === ChartType.STACKED_BAR) {
        if (isAverageOperation(operation)) {
          const operationState = stateWithOperationDependencies(operation, active.chainState)
          const averaged = await runGroupedBarAverageOperation(run.container, operation, operationState, run.options?.referencedResultIds)
          active = { ...active, chainState: averaged.nextState }
          lastResult = averaged.result
          await run.options?.onOperationCompleted?.({ operation, operationIndex, result: averaged.result })
          storeOperationRuntimeResult(operation, operationIndex, averaged.result, run.options?.runtimeScope)
          operationIndex += 1
          continue
        }
        if (isDiffOperation(operation)) {
          const operationState = stateWithOperationDependencies(operation, active.chainState)
          const diffed = await runGroupedBarDiffOperation(run.container, operation, operationState, run.options?.surfaceManager)
          active = { ...active, chainState: diffed.nextState }
          lastResult = diffed.result
          await run.options?.onOperationCompleted?.({ operation, operationIndex, result: diffed.result })
          storeOperationRuntimeResult(operation, operationIndex, diffed.result, run.options?.runtimeScope)
          operationIndex += 1
          continue
        }
        if (isFindExtremumOperation(operation)) {
          const operationState = stateWithOperationDependencies(operation, active.chainState)
          const extremum = await runStackedBarFindExtremumOperation(run.container, operation, operationState)
          active = { ...active, chainState: extremum.nextState }
          lastResult = extremum.result
          await run.options?.onOperationCompleted?.({ operation, operationIndex, result: extremum.result })
          storeOperationRuntimeResult(operation, operationIndex, extremum.result, run.options?.runtimeScope)
          operationIndex += 1
          continue
        }
        if (isRetrieveValueOperation(operation)) {
          const operationState = stateWithOperationDependencies(operation, active.chainState)
          const retrieved = await runStackedBarRetrieveValueOperation(run.container, operation, operationState)
          active = { ...active, chainState: retrieved.nextState }
          lastResult = retrieved.result
          await run.options?.onOperationCompleted?.({ operation, operationIndex, result: retrieved.result })
          storeOperationRuntimeResult(operation, operationIndex, retrieved.result, run.options?.runtimeScope)
          operationIndex += 1
          continue
        }
        if (isNthOperation(operation)) {
          const operationState = stateWithOperationDependencies(operation, active.chainState)
          const nth = await runStackedBarNthOperation(run.container, operation, operationState)
          active = { ...active, chainState: nth.nextState }
          lastResult = nth.result
          await run.options?.onOperationCompleted?.({ operation, operationIndex, result: nth.result })
          storeOperationRuntimeResult(operation, operationIndex, nth.result, run.options?.runtimeScope)
          operationIndex += 1
          continue
        }
        const filtered = await runStackedBarFilterOperation(run.container, active.spec, operation)
        active = filtered.active
        lastResult = filtered.result
        await run.options?.onOperationCompleted?.({ operation, operationIndex, result: filtered.result })
        storeOperationRuntimeResult(operation, operationIndex, filtered.result, run.options?.runtimeScope)
        operationIndex += 1
        continue
      }

      const operationState = stateWithOperationDependencies(operation, active.chainState)
      if (isAverageOperation(operation)) {
        const averaged = await runGroupedBarAverageOperation(run.container, operation, operationState, run.options?.referencedResultIds)
        active = { ...active, chainState: averaged.nextState }
        lastResult = averaged.result
      } else if (isDiffOperation(operation)) {
        const diffed = await runGroupedBarDiffOperation(run.container, operation, operationState, run.options?.surfaceManager)
        active = { ...active, chainState: diffed.nextState }
        lastResult = diffed.result
      } else if (isFindExtremumOperation(operation)) {
        const extremum = await runStackedBarFindExtremumOperation(run.container, operation, operationState)
        active = { ...active, chainState: extremum.nextState }
        lastResult = extremum.result
      } else if (isRetrieveValueOperation(operation)) {
        const retrieved = await runStackedBarRetrieveValueOperation(run.container, operation, operationState)
        active = { ...active, chainState: retrieved.nextState }
        lastResult = retrieved.result
      } else if (isNthOperation(operation)) {
        const nth = await runStackedBarNthOperation(run.container, operation, operationState)
        active = { ...active, chainState: nth.nextState }
        lastResult = nth.result
      } else {
        const filtered = await runGroupedBarFilterOperation(run.container, operation, operationState)
        active = { ...active, chainState: filtered.nextState }
        lastResult = filtered.result
      }
      await run.options?.onOperationCompleted?.({ operation, operationIndex, result: lastResult })
      storeOperationRuntimeResult(operation, operationIndex, lastResult, run.options?.runtimeScope)
      operationIndex += 1
    }
  }

  if (!lastResult) {
    const stub = await runStubChartOperationRenderer(run, ChartType.STACKED_BAR, 'stacked-bar')
    lastResult = Array.isArray(stub) ? stub : null
  }
  return buildOperationNextRunOutcome(lastResult, active.chainState)
}

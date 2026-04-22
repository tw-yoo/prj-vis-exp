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
} from './barGroupShared'
import {
  buildOperationNextRunOutcome,
  restoreChainState,
  stateWithOperationDependencies,
  storeOperationRuntimeResult,
} from '../executionState'
import { getSupportedOperationsForChart, runStubChartOperationRenderer } from './shared'

export const GROUPED_BAR_SUPPORTED_OPERATIONS = getSupportedOperationsForChart(ChartType.GROUPED_BAR)

function isAverageOperation(operation: OperationSpec) {
  return operation.op === OperationOp.Average
}

function isDiffOperation(operation: OperationSpec) {
  return operation.op === OperationOp.Diff
}

export async function runGroupedBarOperations(run: ParsedOperationRun) {
  let active = createBarChartState(run.container, ChartType.GROUPED_BAR, run.runtimeSpec)
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

      if (!isFilterOperation(operation) && !isAverageOperation(operation) && !isDiffOperation(operation)) {
        operationIndex += 1
        continue
      }

      if (active.chartType === ChartType.STACKED_BAR) {
        if (!isFilterOperation(operation)) {
          console.warn('[operation-next] grouped-bar: operation requires grouped layout after stacked-to-grouped transform.', { operation })
          operationIndex += 1
          continue
        }
        await run.options?.onOperationReady?.({ operation, operationIndex })
        const filtered = await runStackedBarFilterOperation(run.container, active.spec, operation)
        active = filtered.active
        lastResult = filtered.result
        await run.options?.onOperationCompleted?.({ operation, operationIndex, result: filtered.result })
        storeOperationRuntimeResult(operation, operationIndex, filtered.result, run.options?.runtimeScope)
        operationIndex += 1
        continue
      }

      await run.options?.onOperationReady?.({ operation, operationIndex })
      const operationState = stateWithOperationDependencies(operation, active.chainState)
      if (isFilterOperation(operation)) {
        const filtered = await runGroupedBarFilterOperation(run.container, operation, operationState)
        active = { ...active, chainState: filtered.nextState }
        lastResult = filtered.result
      } else if (isAverageOperation(operation)) {
        const averaged = await runGroupedBarAverageOperation(run.container, operation, operationState, run.options?.referencedResultIds)
        active = { ...active, chainState: averaged.nextState }
        lastResult = averaged.result
      } else if (isDiffOperation(operation)) {
        const diffed = await runGroupedBarDiffOperation(run.container, operation, operationState)
        active = { ...active, chainState: diffed.nextState }
        lastResult = diffed.result
      }

      if (lastResult) {
        await run.options?.onOperationCompleted?.({ operation, operationIndex, result: lastResult })
        storeOperationRuntimeResult(operation, operationIndex, lastResult, run.options?.runtimeScope)
      }
      operationIndex += 1
    }
  }

  if (!lastResult) {
    const stub = await runStubChartOperationRenderer(run, ChartType.GROUPED_BAR, 'grouped-bar')
    lastResult = Array.isArray(stub) ? stub : null
  }
  return buildOperationNextRunOutcome(lastResult, active.chainState)
}

import { ChartType } from '../../domain/chart'
import type { DatumValue } from '../../domain/operation/types'
import type { ParsedOperationRun } from '../types'
import {
  createBarChartState,
  isBarTransformDrawOperation,
  isFilterOperation,
  runBarTransformOperation,
  runGroupedBarFilterOperation,
  runStackedBarFilterOperation,
} from './barGroupShared'
import { getSupportedOperationsForChart, runStubChartOperationRenderer } from './shared'

export const GROUPED_BAR_SUPPORTED_OPERATIONS = getSupportedOperationsForChart(ChartType.GROUPED_BAR)

export async function runGroupedBarOperations(run: ParsedOperationRun) {
  let active = createBarChartState(run.container, ChartType.GROUPED_BAR, run.runtimeSpec)
  let lastResult: DatumValue[] | null = null

  for (const group of run.groups) {
    for (const operation of group.ops) {
      if (isBarTransformDrawOperation(operation)) {
        active = await runBarTransformOperation(run.container, active, operation)
        continue
      }

      if (!isFilterOperation(operation)) continue

      if (active.chartType === ChartType.STACKED_BAR) {
        const filtered = await runStackedBarFilterOperation(run.container, active.spec, operation)
        active = filtered.active
        lastResult = filtered.result
        continue
      }

      const filtered = await runGroupedBarFilterOperation(run.container, operation, active.chainState)
      active = { ...active, chainState: filtered.nextState }
      lastResult = filtered.result
    }
  }

  if (lastResult) return lastResult
  return runStubChartOperationRenderer(run, ChartType.GROUPED_BAR, 'grouped-bar')
}

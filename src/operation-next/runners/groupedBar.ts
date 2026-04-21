import { ChartType } from '../../domain/chart'
import type { ParsedOperationRun } from '../types'
import { getSupportedOperationsForChart, runStubChartOperationRenderer } from './shared'

export const GROUPED_BAR_SUPPORTED_OPERATIONS = getSupportedOperationsForChart(ChartType.GROUPED_BAR)

export async function runGroupedBarOperations(run: ParsedOperationRun) {
  return runStubChartOperationRenderer(run, ChartType.GROUPED_BAR, 'grouped-bar')
}

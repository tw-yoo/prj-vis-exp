import { ChartType } from '../../domain/chart'
import type { ParsedOperationRun } from '../types'
import { getSupportedOperationsForChart, runStubChartOperationRenderer } from './shared'

export const STACKED_BAR_SUPPORTED_OPERATIONS = getSupportedOperationsForChart(ChartType.STACKED_BAR)

export async function runStackedBarOperations(run: ParsedOperationRun) {
  return runStubChartOperationRenderer(run, ChartType.STACKED_BAR, 'stacked-bar')
}

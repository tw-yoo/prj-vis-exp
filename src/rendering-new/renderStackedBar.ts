import type { ChartSpec } from '../domain/chart'
import { ensureStackedBarChartInstance, type StackedBarChartInstance } from './instances/stackedBarInstance'

/**
 * Entry-point used by the renderChart dispatcher for STACKED_BAR charts.
 * Idempotent: same spec across substeps reuses the attached SVG.
 */
export async function renderStackedBarChartNew(
  host: HTMLElement,
  spec: ChartSpec,
): Promise<StackedBarChartInstance> {
  console.info('[operation-new] renderStackedBarChartNew: entry', {
    hostId: host?.id || '(no-id)',
  })
  const instance = ensureStackedBarChartInstance(host, spec)
  await instance.waitForBuild()
  console.info('[operation-new] renderStackedBarChartNew: ready', {
    chartTypeKey: instance.chartTypeKey,
    layout: instance.layout,
  })
  return instance
}

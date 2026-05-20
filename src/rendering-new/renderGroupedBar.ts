import type { ChartSpec } from '../domain/chart'
import { ensureGroupedBarChartInstance, type GroupedBarChartInstance } from './instances/groupedBarInstance'

/**
 * Entry-point used by the renderChart dispatcher for GROUPED_BAR charts.
 * Idempotent: same spec across substeps reuses the attached SVG.
 */
export async function renderGroupedBarChartNew(
  host: HTMLElement,
  spec: ChartSpec,
): Promise<GroupedBarChartInstance> {
  console.info('[operation-new] renderGroupedBarChartNew: entry', {
    hostId: host?.id || '(no-id)',
  })
  const instance = ensureGroupedBarChartInstance(host, spec)
  await instance.waitForBuild()
  console.info('[operation-new] renderGroupedBarChartNew: ready', {
    chartTypeKey: instance.chartTypeKey,
    layout: instance.layout,
  })
  return instance
}

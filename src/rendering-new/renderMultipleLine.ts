import type { ChartSpec } from '../domain/chart'
import { ensureMultipleLineChartInstance, type MultipleLineChartInstance } from './instances/multipleLineInstance'

/**
 * Entry-point used by the renderChart dispatcher for MULTI_LINE charts.
 * Idempotent: same spec across substeps reuses the attached SVG.
 */
export async function renderMultipleLineChartNew(
  host: HTMLElement,
  spec: ChartSpec,
): Promise<MultipleLineChartInstance> {
  console.info('[operation-new] renderMultipleLineChartNew: entry', {
    hostId: host?.id || '(no-id)',
  })
  const instance = ensureMultipleLineChartInstance(host, spec)
  await instance.waitForBuild()
  console.info('[operation-new] renderMultipleLineChartNew: ready', {
    chartTypeKey: instance.chartTypeKey,
    layout: instance.layout,
  })
  return instance
}

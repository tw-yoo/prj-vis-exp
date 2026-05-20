import type { ChartSpec } from '../domain/chart'
import { ensureSimpleBarChartInstance, type SimpleBarChartInstance } from './instances/simpleBarInstance'

/**
 * Entry-point used by the renderChart dispatcher for SIMPLE_BAR charts.
 *
 * - If a SimpleBarChartInstance is already attached to `host` and its specKey
 *   matches the incoming spec, this call is a no-op (idempotent rendering).
 * - Otherwise it replaces the SVG with a freshly-built skeleton + annotation
 *   layer attached to the same host element.
 */
export async function renderSimpleBarChartNew(
  host: HTMLElement,
  spec: ChartSpec,
): Promise<SimpleBarChartInstance> {
  console.info('[operation-new] renderSimpleBarChartNew: entry', {
    host,
    hostId: host?.id || '(no-id)',
    specSummary: {
      mark: typeof spec.mark === 'string' ? spec.mark : (spec.mark as { type?: string })?.type ?? null,
      width: spec.width,
      height: spec.height,
    },
  })
  const instance = ensureSimpleBarChartInstance(host, spec)
  await instance.waitForBuild()
  console.info('[operation-new] renderSimpleBarChartNew: ready', {
    chartTypeKey: instance.chartTypeKey,
    layout: instance.layout,
    annotationLayerExists: !!instance.annotationLayer?.node(),
  })
  return instance
}

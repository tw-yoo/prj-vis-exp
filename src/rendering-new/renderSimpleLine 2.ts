import type { ChartSpec } from '../domain/chart'
import { ensureSimpleLineChartInstance, type SimpleLineChartInstance } from './instances/simpleLineInstance'

/**
 * Entry-point used by the renderChart dispatcher for SIMPLE_LINE charts.
 *
 * - If a SimpleLineChartInstance is already attached to `host` and its specKey
 *   matches the incoming spec, this call is a no-op (idempotent rendering).
 * - Otherwise it replaces the SVG with a freshly-built skeleton + annotation
 *   layer attached to the same host element.
 *
 * Returns the instance so the operation runner can pick it up via
 * `getAttachedInstance(host)`.
 */
export async function renderSimpleLineChartNew(
  host: HTMLElement,
  spec: ChartSpec,
): Promise<SimpleLineChartInstance> {
  console.info('[operation-new] renderSimpleLineChartNew: entry', {
    host,
    hostId: host?.id || '(no-id)',
    specSummary: {
      hasLayer: Array.isArray((spec as { layer?: unknown }).layer),
      mark: typeof spec.mark === 'string' ? spec.mark : (spec.mark as { type?: string })?.type ?? null,
      width: spec.width,
      height: spec.height,
    },
  })
  const instance = ensureSimpleLineChartInstance(host, spec)
  await instance.waitForBuild()
  console.info('[operation-new] renderSimpleLineChartNew: ready', {
    chartTypeKey: instance.chartTypeKey,
    layout: instance.layout,
    annotationLayerExists: !!instance.annotationLayer?.node(),
  })
  return instance
}

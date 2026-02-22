import type { ChartRenderPort, ChartSurfaceRef } from '../../../application/ports/outbound'
import type { VegaLiteSpec } from '../../../domain/chart'
import { renderChart } from '../../../rendering/renderChart'
import { renderVegaLiteChart } from '../../../rendering/chartRenderer'

function toContainer(surface: ChartSurfaceRef): HTMLElement {
  if (surface.kind !== 'dom' || !(surface.handle instanceof HTMLElement)) {
    throw new Error('Browser chart renderer requires DOM surface handle.')
  }
  return surface.handle
}

export class BrowserChartRenderPort implements ChartRenderPort<VegaLiteSpec> {
  async render(surface: ChartSurfaceRef, spec: VegaLiteSpec) {
    await renderChart(toContainer(surface), spec)
  }
}

export class BrowserVegaLiteRenderPort implements ChartRenderPort<VegaLiteSpec> {
  async render(surface: ChartSurfaceRef, spec: VegaLiteSpec) {
    await renderVegaLiteChart(toContainer(surface), spec)
  }
}

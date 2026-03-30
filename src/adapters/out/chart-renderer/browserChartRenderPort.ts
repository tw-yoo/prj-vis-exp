import type { ChartRenderPort, ChartSurfaceRef } from '../../../application/ports/outbound'
import type { ChartSpec } from '../../../domain/chart'
import { renderChart } from '../../../rendering/renderChart'

function toContainer(surface: ChartSurfaceRef): HTMLElement {
  if (surface.kind !== 'dom' || !(surface.handle instanceof HTMLElement)) {
    throw new Error('Browser chart renderer requires DOM surface handle.')
  }
  return surface.handle
}

export class BrowserChartRenderPort implements ChartRenderPort<ChartSpec> {
  async render(surface: ChartSurfaceRef, spec: ChartSpec) {
    await renderChart(toContainer(surface), spec)
  }
}

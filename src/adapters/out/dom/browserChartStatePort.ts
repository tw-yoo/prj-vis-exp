import type { ChartStatePort, ChartSurfaceRef } from '../../../application/ports/outbound'
import type { DatumValue } from '../../../domain/operation/types'

export type BrowserChartStateDeps<Spec> = {
  readWorkingData: (container: HTMLElement, spec: Spec) => DatumValue[]
}

function toContainer(surface: ChartSurfaceRef): HTMLElement {
  if (surface.kind !== 'dom' || !(surface.handle instanceof HTMLElement)) {
    throw new Error('Browser chart state adapter requires DOM surface handle.')
  }
  return surface.handle
}

export class BrowserChartStatePort<Spec = unknown> implements ChartStatePort<Spec> {
  private readonly deps: BrowserChartStateDeps<Spec>

  constructor(deps: BrowserChartStateDeps<Spec>) {
    this.deps = deps
  }

  readWorkingData(surface: ChartSurfaceRef, spec: Spec) {
    return this.deps.readWorkingData(toContainer(surface), spec)
  }
}

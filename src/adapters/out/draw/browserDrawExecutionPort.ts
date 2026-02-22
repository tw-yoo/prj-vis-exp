import type { ChartSurfaceRef, DrawExecutionPort } from '../../../application/ports/outbound'
import type { OperationSpec } from '../../../domain/operation/types'

export type BrowserDrawExecutionDeps = {
  createHandler: (container: HTMLElement) => { run: (op: OperationSpec) => void | Promise<void> }
  clearAnnotations?: (container: HTMLElement) => void
}

function toContainer(surface: ChartSurfaceRef): HTMLElement {
  if (surface.kind !== 'dom' || !(surface.handle instanceof HTMLElement)) {
    throw new Error('Browser draw adapter requires DOM surface handle.')
  }
  return surface.handle
}

export class BrowserDrawExecutionPort implements DrawExecutionPort {
  private readonly deps: BrowserDrawExecutionDeps

  constructor(deps: BrowserDrawExecutionDeps) {
    this.deps = deps
  }

  createHandler(surface: ChartSurfaceRef) {
    return this.deps.createHandler(toContainer(surface))
  }

  clearAnnotations(surface: ChartSurfaceRef) {
    if (!this.deps.clearAnnotations) return
    this.deps.clearAnnotations(toContainer(surface))
  }
}

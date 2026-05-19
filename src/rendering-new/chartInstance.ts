import type * as d3 from 'd3'
import type { ChartSpec } from '../domain/chart'

const INSTANCE_KEY = '__operationNewChartInstance'

export interface ChartInstanceLayout {
  marginLeft: number
  marginTop: number
  plotWidth: number
  plotHeight: number
}

export interface ChartInstanceSnapshot {
  specKey: string
  yDomain: [number, number]
}

export interface ChartInstance {
  readonly host: HTMLElement
  readonly chartTypeKey: 'simple-line'

  /** Live D3 selection on the root <svg> element. */
  readonly svg: d3.Selection<SVGSVGElement, unknown, null, undefined>

  /** Layer that holds all operation annotations. Created once during the first build and never re-appended. */
  readonly annotationLayer: d3.Selection<SVGGElement, unknown, null, undefined>

  readonly layout: ChartInstanceLayout

  /** Idempotent build/refresh. Returns true if a rebuild happened, false if no-op (same spec). */
  ensureRendered(spec: ChartSpec): boolean

  /** Smoothly transition the y scale + axis + line + points to a new y domain. */
  rescaleY(newDomain: [number, number]): Promise<void>

  snapshot(): ChartInstanceSnapshot
}

type HostWithInstance = HTMLElement & { [INSTANCE_KEY]?: ChartInstance }

export function getAttachedInstance(host: HTMLElement): ChartInstance | null {
  const existing = (host as HostWithInstance)[INSTANCE_KEY]
  if (!existing) return null
  if (!host.contains(existing.svg.node())) return null
  return existing
}

export function attachInstance(host: HTMLElement, instance: ChartInstance) {
  ;(host as HostWithInstance)[INSTANCE_KEY] = instance
}

export function detachInstance(host: HTMLElement) {
  delete (host as HostWithInstance)[INSTANCE_KEY]
}

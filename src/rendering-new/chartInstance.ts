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

export type ChartTypeKey = 'simple-line' | 'simple-bar' | 'stacked-bar' | 'grouped-bar' | 'multi-line'

/**
 * Op-agnostic scale-transition options. All fields are optional; the chart
 * instance applies whichever dimensions are present in one shared d3
 * transition so axis ticks and marks stay aligned every frame.
 */
export interface TransitionChartScaleOptions {
  /** Continuous Y domain (linear scale). */
  yDomain?: [number, number]
  /** Continuous X domain — for `scaleTime` / `scaleLinear` x-axes. */
  xDomain?: [number, number] | [Date, Date]
  /** Ordinal X domain — for `scaleBand` / `scalePoint` x-axes. */
  xLabelDomain?: string[]
  /** Subset of point/bar `data-target` values considered in-scope. null = all in scope. */
  activeTargets?: Set<string> | null
  /**
   * Opacity to apply to out-of-scope marks. Default is `OPACITIES.DIM` (≈0.2).
   * Filter `remove` mode passes 0 here so out-of-scope bars become visually
   * hidden while remaining in the DOM (preserves chart identity).
   */
  outOfScopeOpacity?: number
  duration?: number
  ease?: (t: number) => number
}

export interface ChartInstance {
  readonly host: HTMLElement
  readonly chartTypeKey: ChartTypeKey

  /** Live D3 selection on the root <svg> element. */
  readonly svg: d3.Selection<SVGSVGElement, unknown, null, undefined>

  /** Layer that holds all operation annotations. Created once during the first build and never re-appended. */
  readonly annotationLayer: d3.Selection<SVGGElement, unknown, null, undefined>

  readonly layout: ChartInstanceLayout

  /** Idempotent build/refresh. Returns true if a rebuild happened, false if no-op (same spec). */
  ensureRendered(spec: ChartSpec): boolean

  /**
   * Op-agnostic scale-transition primitive. Single call mutates scales
   * synchronously and rides one shared d3 transition for axes + marks. Every
   * applier (filter, sort, etc.) routes scale changes through this.
   */
  transitionChartScale(opts: TransitionChartScaleOptions): Promise<void>

  snapshot(): ChartInstanceSnapshot
}

type HostWithInstance = HTMLElement & { [INSTANCE_KEY]?: ChartInstance }

/**
 * Returns the chart instance previously attached to `host`, or null if none.
 *
 * We deliberately do NOT validate that `existing.svg.node()` is still in the
 * host. The legacy operation runners (pairDiff focus, split-surface manager,
 * etc.) sometimes swap the SVG element under the host without going through
 * our dispatcher — if we treated that as "instance lost" we'd rebuild and
 * wipe the annotations the legacy runner just drew. Each instance's
 * `ensureRendered` is responsible for re-acquiring the current svg from the
 * host when its cached selection is stale.
 */
export function getAttachedInstance(host: HTMLElement): ChartInstance | null {
  const existing = (host as HostWithInstance)[INSTANCE_KEY]
  return existing ?? null
}

export function attachInstance(host: HTMLElement, instance: ChartInstance) {
  ;(host as HostWithInstance)[INSTANCE_KEY] = instance
}

export function detachInstance(host: HTMLElement) {
  delete (host as HostWithInstance)[INSTANCE_KEY]
}

import * as d3 from 'd3'
import { type ChartSpec } from '../../domain/chart'
import { DataAttributes, SvgAttributes, SvgClassNames, SvgElements } from '../../rendering/interfaces'
import { DURATIONS, EASINGS, OPACITIES } from '../../rendering/common/d3Helpers'
import {
  renderMultipleLineChart,
  type MultiLineSpec,
} from '../../rendering/line/multipleLineRenderer'
import {
  attachInstance,
  getAttachedInstance,
  type ChartInstance,
  type ChartInstanceLayout,
  type ChartInstanceSnapshot,
  type TransitionChartScaleOptions,
} from '../chartInstance'

/**
 * Identity key matching the legacy runner's `pointKey(target, series)` so
 * applier-side scope sets line up with what the renderer's circles carry.
 * Format mirrors operation-next/runners/multipleLine.ts:585.
 */
export function multiLinePointKey(target: string, series: string | null | undefined): string {
  return `${series ?? ''}::${target}`
}

export interface MultiLineFilterScopeOptions {
  /** Set of `multiLinePointKey(target|id, series)` values that remain in scope. */
  activePointKeys: Set<string>
  outOfScopeOpacity?: number
  duration?: number
  ease?: (t: number) => number
}

function computeSpecKey(spec: ChartSpec): string {
  const data = spec.data as { url?: string; values?: unknown[]; name?: string } | undefined
  if (data?.url) return `url:${data.url}`
  if (Array.isArray(data?.values)) {
    const sample = data.values.slice(0, 3)
    try {
      return `vals:${data.values.length}:${JSON.stringify(sample)}`
    } catch {
      return `vals:${data.values.length}`
    }
  }
  if (data?.name) return `name:${data.name}`
  return 'no-data'
}

/**
 * Stateful instance wrapping the existing multi-line renderer.
 *
 * Phase 3d scope: idempotent `ensureRendered` — same spec across substeps
 * skips the rebuild and reuses the SVG. Operation runner stays on the
 * existing `runMultipleLineOperations`, which already handles per-series
 * paths + circles + color-stable filter / diff / average / findExtremum /
 * lagDiff / pairDiff.
 *
 * Future work: split per-series paths into the instance and add a true
 * shared-transition `transitionChartScale` that animates every series's
 * path + circles + axes in lockstep (matching simple-line's d3 idiom).
 */
export class MultipleLineChartInstance implements ChartInstance {
  readonly chartTypeKey = 'multi-line' as const
  readonly host: HTMLElement

  svg!: d3.Selection<SVGSVGElement, unknown, null, undefined>
  annotationLayer!: d3.Selection<SVGGElement, unknown, null, undefined>
  layout: ChartInstanceLayout = { marginLeft: 0, marginTop: 0, plotWidth: 0, plotHeight: 0 }

  activeTargets: Set<string> | null = null
  outOfScopeOpacity: number = OPACITIES.DIM

  private specKey = ''
  private buildPromise: Promise<void> | null = null

  constructor(host: HTMLElement) {
    this.host = host
  }

  ensureRendered(spec: ChartSpec): boolean {
    const nextKey = computeSpecKey(spec)
    if (nextKey === this.specKey && this.specKey !== '') {
      // Spec hasn't changed. Even if our cached `svg` selection was detached
      // by some internal flow (e.g. multipleLine pairDiff focus replacing the
      // chart surface), we don't want to rebuild — re-acquire whatever svg
      // is currently in the host and reuse it. This preserves any
      // annotations the legacy runner drew across substeps.
      const currentSvg = this.host.querySelector('svg') as SVGSVGElement | null
      if (currentSvg) {
        if (!this.svg || !this.host.contains(this.svg.node())) {
          this.svg = d3.select(currentSvg) as d3.Selection<SVGSVGElement, unknown, null, undefined>
          this.layout = {
            marginLeft: Number(currentSvg.getAttribute('data-m-left') ?? 0),
            marginTop: Number(currentSvg.getAttribute('data-m-top') ?? 0),
            plotWidth: Number(currentSvg.getAttribute('data-plot-w') ?? 0),
            plotHeight: Number(currentSvg.getAttribute('data-plot-h') ?? 0),
          }
          let layerNode = currentSvg.querySelector<SVGGElement>('g.operation-next-annotation-layer')
          if (!layerNode) {
            const layer = this.svg
              .append(SvgElements.Group)
              .attr(
                SvgAttributes.Class,
                `${SvgClassNames.AnnotationLayer} operation-next-annotation-layer`,
              )
            layerNode = layer.node()
          }
          this.annotationLayer = d3.select(layerNode!) as d3.Selection<SVGGElement, unknown, null, undefined>
          console.info('[operation-new] MultipleLineChartInstance.ensureRendered: NO-OP (re-acquired SVG)', {
            specKeyHash: nextKey.length,
          })
        } else {
          console.info('[operation-new] MultipleLineChartInstance.ensureRendered: NO-OP (specKey match)', {
            specKeyHash: nextKey.length,
          })
        }
        return false
      }
    }
    console.info('[operation-new] MultipleLineChartInstance.ensureRendered: rebuilding', {
      reason: this.specKey === '' ? 'first-build' : nextKey !== this.specKey ? 'spec-changed' : 'no-svg-in-host',
    })
    this.specKey = nextKey
    this.buildPromise = this.buildFromSpec(spec)
    return true
  }

  async waitForBuild(): Promise<void> {
    if (this.buildPromise) await this.buildPromise
  }

  snapshot(): ChartInstanceSnapshot {
    return {
      specKey: this.specKey,
      yDomain: [0, 1],
    }
  }

  async transitionChartScale(_opts: TransitionChartScaleOptions): Promise<void> {
    // No-op stub for ops still going through the legacy runner. Filter uses
    // the more specific `transitionFilterScope` below; other ops will be
    // ported as we extend operation-new coverage.
  }

  /** All `<circle data-target>` points in this chart (across all series). */
  pointMarks(): d3.Selection<SVGCircleElement, unknown, d3.BaseType, unknown> {
    return this.svg.selectAll<SVGCircleElement, unknown>(`${SvgElements.Circle}[${DataAttributes.Target}]`)
  }

  /**
   * Main series `<path>`s — the colored lines, excluding annotation paths,
   * filter-overlay segments, and axis `.domain` paths. Matches the legacy
   * `mainLinePath()` helper so applier-side selectors agree with the renderer.
   */
  mainLinePaths(): d3.Selection<SVGPathElement, unknown, d3.BaseType, unknown> {
    return this.svg.selectAll<SVGPathElement, unknown>(SvgElements.Path).filter(function () {
      const path = this as SVGPathElement
      if (path.classList.contains(SvgClassNames.Annotation) || path.classList.contains(SvgClassNames.LineAnnotation)) return false
      if (path.classList.contains('domain')) return false
      if (path.closest(`.${SvgClassNames.XAxis}, .${SvgClassNames.YAxis}`)) return false
      if (path.closest(`.${SvgClassNames.AnnotationLayer}`)) return false
      return path.getAttribute(SvgAttributes.Fill) === 'none' && path.hasAttribute(SvgAttributes.Stroke)
    })
  }

  /**
   * Shared-parent transition for filter scope changes — all points fade to
   * their new opacity in lockstep so frame timing stays aligned. Out-of-scope
   * points hit `outOfScopeOpacity` (DIM by default); in-scope points return to
   * FULL. The applier can hang additional `.transition(parent)` calls off the
   * returned parent — line-segment overlays, ref lines, etc. — so they all
   * share the same scheduler.
   *
   * Returns the parent transition so callers can chain child transitions.
   * Resolves when the parent transition settles.
   */
  async transitionFilterScope(opts: MultiLineFilterScopeOptions): Promise<void> {
    if (!this.svg || this.svg.empty()) return
    const duration = opts.duration ?? DURATIONS.DIM
    const ease = opts.ease ?? EASINGS.SMOOTH
    const outOpacity = opts.outOfScopeOpacity ?? OPACITIES.DIM
    const activeKeys = opts.activePointKeys

    this.activeTargets = activeKeys.size > 0 ? new Set([...activeKeys]) : null
    this.outOfScopeOpacity = outOpacity

    console.info('[operation-new] MultipleLineChartInstance.transitionFilterScope', {
      activeKeyCount: activeKeys.size,
      outOpacity,
    })

    const parent = this.svg.transition().duration(duration).ease(ease) as unknown as d3.Transition<
      d3.BaseType,
      unknown,
      d3.BaseType,
      unknown
    >
    const inheritT = parent as never

    const points = this.pointMarks()
    if (!points.empty()) {
      points
        .interrupt('filter-scope')
        .transition(inheritT)
        .style(SvgAttributes.Opacity, function () {
          const node = this as SVGCircleElement
          const target = node.getAttribute(DataAttributes.Target) ?? ''
          const id = node.getAttribute(DataAttributes.Id) ?? ''
          const series = node.getAttribute(DataAttributes.Series) ?? ''
          const inScope = activeKeys.has(multiLinePointKey(target, series))
            || activeKeys.has(multiLinePointKey(id, series))
          return inScope ? OPACITIES.FULL : outOpacity
        })
    }

    try {
      await parent.end()
    } catch {
      /* interrupted */
    }
  }

  private async buildFromSpec(spec: ChartSpec) {
    await renderMultipleLineChart(this.host, spec as MultiLineSpec)
    const svgNode = this.host.querySelector('svg') as SVGSVGElement | null
    if (!svgNode) return
    this.svg = d3.select(svgNode) as d3.Selection<SVGSVGElement, unknown, null, undefined>
    this.layout = {
      marginLeft: Number(svgNode.getAttribute('data-m-left') ?? 0),
      marginTop: Number(svgNode.getAttribute('data-m-top') ?? 0),
      plotWidth: Number(svgNode.getAttribute('data-plot-w') ?? 0),
      plotHeight: Number(svgNode.getAttribute('data-plot-h') ?? 0),
    }
    let layerNode = svgNode.querySelector<SVGGElement>('g.operation-next-annotation-layer')
    if (!layerNode) {
      const layer = this.svg
        .append(SvgElements.Group)
        .attr(
          SvgAttributes.Class,
          `${SvgClassNames.AnnotationLayer} operation-next-annotation-layer`,
        )
      layerNode = layer.node()
    }
    this.annotationLayer = d3.select(layerNode!) as d3.Selection<SVGGElement, unknown, null, undefined>
  }
}

export function ensureMultipleLineChartInstance(host: HTMLElement, spec: ChartSpec): MultipleLineChartInstance {
  const existing = getAttachedInstance(host)
  if (existing && existing.chartTypeKey === 'multi-line') {
    const instance = existing as MultipleLineChartInstance
    instance.ensureRendered(spec)
    return instance
  }
  const instance = new MultipleLineChartInstance(host)
  attachInstance(host, instance)
  instance.ensureRendered(spec)
  return instance
}

import * as d3 from 'd3'
import { type ChartSpec } from '../../domain/chart'
import { SvgAttributes, SvgClassNames, SvgElements } from '../../rendering/interfaces'
import { DURATIONS, EASINGS, OPACITIES } from '../../rendering/common/d3Helpers'
import {
  renderGroupedBarChart,
  type GroupedSpec,
} from '../../rendering/bar/groupedBarRenderer'
import {
  attachInstance,
  getAttachedInstance,
  type ChartInstance,
  type ChartInstanceLayout,
  type ChartInstanceSnapshot,
  type TransitionChartScaleOptions,
} from '../chartInstance'

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
 * Stateful instance wrapping the existing grouped-bar renderer.
 *
 * Phase 3c scope: idempotent `ensureRendered` — same spec across substeps
 * skips the rebuild and reuses the SVG already attached to the host. Filter /
 * diff / average animations stay on the existing `barGroupShared` helpers
 * (which already handle facet panels + inner scales correctly).
 *
 * Future work: build a true facet-aware `transitionChartScale` that updates
 * outer/inner scales + per-panel bars in a single shared d3 transition,
 * matching the simple-bar pattern.
 */
export class GroupedBarChartInstance implements ChartInstance {
  readonly chartTypeKey = 'grouped-bar' as const
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
          console.info('[operation-new] GroupedBarChartInstance.ensureRendered: NO-OP (re-acquired SVG)', {
            specKeyHash: nextKey.length,
          })
        } else {
          console.info('[operation-new] GroupedBarChartInstance.ensureRendered: NO-OP (specKey match)', {
            specKeyHash: nextKey.length,
          })
        }
        return false
      }
    }
    console.info('[operation-new] GroupedBarChartInstance.ensureRendered: rebuilding', {
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
    // No-op stub for legacy code paths. Filter routes through
    // `transitionFilterScope` below.
  }

  /** All data `<rect>` bars across panels. */
  mainBars(): d3.Selection<SVGRectElement, unknown, d3.BaseType, unknown> {
    return this.svg.selectAll<SVGRectElement, unknown>(`rect.${SvgClassNames.MainBar}`)
  }

  /**
   * Shared-parent transition for filter scope changes. Every main-bar in
   * every panel rides one d3 scheduler so opacity changes tick in lockstep.
   * In-scope bars return to FULL; out-of-scope bars hit `outOfScopeOpacity`
   * (DIM by default). Caller passes a `keyOf(node) => string` predicate so
   * the applier owns the identity scheme.
   */
  async transitionFilterScope(opts: {
    activeKeys: Set<string>
    keyOf: (node: SVGElement) => string
    outOfScopeOpacity?: number
    duration?: number
    ease?: (t: number) => number
  }): Promise<void> {
    if (!this.svg || this.svg.empty()) return
    const duration = opts.duration ?? DURATIONS.DIM
    const ease = opts.ease ?? EASINGS.SMOOTH
    const outOpacity = opts.outOfScopeOpacity ?? OPACITIES.DIM

    this.activeTargets = opts.activeKeys.size > 0 ? new Set([...opts.activeKeys]) : null
    this.outOfScopeOpacity = outOpacity

    console.info('[operation-new] GroupedBarChartInstance.transitionFilterScope', {
      activeKeyCount: opts.activeKeys.size,
      outOpacity,
    })

    const parent = this.svg.transition().duration(duration).ease(ease) as unknown as d3.Transition<
      d3.BaseType,
      unknown,
      d3.BaseType,
      unknown
    >
    const inheritT = parent as never

    const bars = this.mainBars()
    if (!bars.empty()) {
      bars
        .interrupt('filter-scope')
        .transition(inheritT)
        .style(SvgAttributes.Opacity, function () {
          return opts.activeKeys.has(opts.keyOf(this as SVGElement)) ? OPACITIES.FULL : outOpacity
        })
    }

    try {
      await parent.end()
    } catch {
      /* interrupted */
    }
  }

  private async buildFromSpec(spec: ChartSpec) {
    await renderGroupedBarChart(this.host, spec as GroupedSpec)
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

export function ensureGroupedBarChartInstance(host: HTMLElement, spec: ChartSpec): GroupedBarChartInstance {
  const existing = getAttachedInstance(host)
  if (existing && existing.chartTypeKey === 'grouped-bar') {
    const instance = existing as GroupedBarChartInstance
    instance.ensureRendered(spec)
    return instance
  }
  const instance = new GroupedBarChartInstance(host)
  attachInstance(host, instance)
  instance.ensureRendered(spec)
  return instance
}

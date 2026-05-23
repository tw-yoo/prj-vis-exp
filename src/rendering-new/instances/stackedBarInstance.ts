import * as d3 from 'd3'
import { type ChartSpec } from '../../domain/chart'
import { SvgAttributes, SvgClassNames, SvgElements } from '../../rendering/interfaces'
import { DURATIONS, EASINGS, OPACITIES } from '../../rendering/common/d3Helpers'
import {
  renderStackedBarChart,
  type StackedSpec,
} from '../../rendering/bar/stackedBarRenderer'
import {
  attachInstance,
  getAttachedInstance,
  type ChartInstance,
  type ChartInstanceLayout,
  type ChartInstanceSnapshot,
  type TransitionChartScaleOptions,
} from '../chartInstance'

/**
 * Stable spec identity used by `ensureRendered`. Data-only key — encoding /
 * mark / layer / transform / width / height variations between substeps are
 * absorbed without a rebuild. Only a true data swap triggers a fresh build.
 */
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
 * Stateful instance wrapping the existing stacked-bar renderer.
 *
 * Phase 3b scope: idempotent `ensureRendered` — same spec across substeps
 * skips the rebuild and reuses the SVG already attached to the host. This is
 * the single most important invariant (prevents the fade-out/fade-in that
 * happened during Phase 1+2 for simple-line). The actual annotation logic
 * stays on the existing `runStackedBarOperations` runner, which is already
 * well-tested.
 *
 * Future work: rewrite stack recalculation, color-legend transitions, and
 * filter-driven `transitionChartScale` from scratch using the d3
 * shared-transition idiom that simple-line + simple-bar use.
 */
export class StackedBarChartInstance implements ChartInstance {
  readonly chartTypeKey = 'stacked-bar' as const
  readonly host: HTMLElement

  svg!: d3.Selection<SVGSVGElement, unknown, null, undefined>
  annotationLayer!: d3.Selection<SVGGElement, unknown, null, undefined>
  layout: ChartInstanceLayout = { marginLeft: 0, marginTop: 0, plotWidth: 0, plotHeight: 0 }

  /** When non-null, restricts which bars are "in scope". Out-of-scope = dim opacity. */
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
          // Re-acquire whatever svg lives in the host (legacy runners may have
          // swapped it during split-surface flows).
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
          console.info('[operation-new] StackedBarChartInstance.ensureRendered: NO-OP (re-acquired SVG)', {
            specKeyHash: nextKey.length,
          })
        } else {
          console.info('[operation-new] StackedBarChartInstance.ensureRendered: NO-OP (specKey match)', {
            specKeyHash: nextKey.length,
          })
        }
        return false
      }
    }
    console.info('[operation-new] StackedBarChartInstance.ensureRendered: rebuilding', {
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

  /**
   * No-op stub for stacked-bar. The existing op runner (`barGroupShared`)
   * already drives the per-bar / axis transitions inline. Wired here so the
   * `ChartInstance` contract is satisfied uniformly across chart types.
   */
  async transitionChartScale(_opts: TransitionChartScaleOptions): Promise<void> {
    // Intentional no-op — legacy code paths drive stack-recalc transitions
    // inline. Filter routes through `transitionFilterScope` below.
  }

  /** All data `<rect>` bars (stack segments) across the chart. */
  mainBars(): d3.Selection<SVGRectElement, unknown, d3.BaseType, unknown> {
    return this.svg.selectAll<SVGRectElement, unknown>(`rect.${SvgClassNames.MainBar}`)
  }

  /**
   * Shared-parent transition for filter scope changes — mirrors the
   * grouped-bar variant. Each stack segment fades to in/out-of-scope opacity
   * under a single parent transition so frame timing stays aligned.
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

    console.info('[operation-new] StackedBarChartInstance.transitionFilterScope', {
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
    await renderStackedBarChart(this.host, spec as StackedSpec)
    const svgNode = this.host.querySelector('svg') as SVGSVGElement | null
    if (!svgNode) return
    this.svg = d3.select(svgNode) as d3.Selection<SVGSVGElement, unknown, null, undefined>
    this.layout = {
      marginLeft: Number(svgNode.getAttribute('data-m-left') ?? 0),
      marginTop: Number(svgNode.getAttribute('data-m-top') ?? 0),
      plotWidth: Number(svgNode.getAttribute('data-plot-w') ?? 0),
      plotHeight: Number(svgNode.getAttribute('data-plot-h') ?? 0),
    }
    // Ensure an annotation-layer <g> exists (the legacy runner creates it
    // lazily; we create it here once so subsequent ops can rely on it without
    // having to .raise() it later).
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

export function ensureStackedBarChartInstance(host: HTMLElement, spec: ChartSpec): StackedBarChartInstance {
  const existing = getAttachedInstance(host)
  if (existing && existing.chartTypeKey === 'stacked-bar') {
    const instance = existing as StackedBarChartInstance
    instance.ensureRendered(spec)
    return instance
  }
  const instance = new StackedBarChartInstance(host)
  attachInstance(host, instance)
  instance.ensureRendered(spec)
  return instance
}

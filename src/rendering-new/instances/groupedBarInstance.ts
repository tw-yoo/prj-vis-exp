import * as d3 from 'd3'
import { ChartType, type ChartSpec } from '../../domain/chart'
import { DataAttributes, SvgAttributes, SvgClassNames, SvgElements } from '../../rendering/interfaces'
import { DURATIONS, EASINGS, OPACITIES } from '../../rendering/common/d3Helpers'
import {
  renderGroupedBarChart,
  type GroupedSpec,
} from '../../rendering/bar/groupedBarRenderer'
import {
  convertGroupedToStacked,
  type StackGroupTransformResult,
} from '../../rendering/bar/stackGroupTransforms'
import { convertGroupedToSimple } from '../../rendering/bar/toSimpleTransforms'
import type { SimpleBarSpec } from '../../rendering/bar/simpleBarRenderer'
import type { DrawStackGroupSpec, DrawToSimpleSpec } from '../../rendering/draw/types'
import {
  recomposeGroupedBarsFromDom,
  type GroupedRectLayout,
} from '../../operation-new/primitives/stackComposition'
import { transitionLegendScope } from '../../operation-new/primitives/transitionLegend'
import {
  attachInstance,
  detachInstance,
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

  /**
   * Series → fill-color map captured from the base render. See StackedBar
   * for the full rationale — same contract here. For faceted grouped charts
   * (multiple panels), the map merges colors across panels since color
   * identity is consistent per series regardless of panel.
   */
  seriesColors: Map<string, string> = new Map()

  /** Series identity order from the base render (matches the legend). */
  fullSeriesDomain: string[] = []

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

  /**
   * Series-scope transition for grouped bars.
   *
   * Replaces "fade out-of-scope bars to 0.2 in place" with an inner-scale
   * redistribution: surviving bars within each (panel, target) group spread
   * evenly across the group's original span, widening to fill the gap left by
   * removed series. Out-of-scope bars stay in place and fade to opacity 0
   * under the same parent transition.
   *
   * Padding ratio between bars is inferred from the current DOM state, so the
   * surviving bars keep the same proportion of bar/gap as the original chart.
   *
   * Visual sequence (single shared d3 parent transition):
   *   1. In-scope bars transition `(x, width)` to their new redistributed
   *      positions in the same group span.
   *   2. Out-of-scope bars hold their `(x, width)` (no shift) and opacity → 0.
   *   3. y-axis stays unchanged — values per bar don't change in grouped
   *      layout (unlike stacked).
   *
   * @param opts.isInScope        Predicate driving whether a (panel, target,
   *                              series) cell remains in the chart.
   * @param opts.mode             'recompose' (default) widens survivors and
   *                              fades others; 'dim' is the legacy opacity-
   *                              only fallback.
   */
  async transitionSeriesScope(opts: {
    isInScope: (panel: string, target: string, series: string) => boolean
    mode?: 'recompose' | 'dim'
    outOfScopeOpacity?: number
    duration?: number
    ease?: (t: number) => number
  }): Promise<void> {
    if (!this.svg || this.svg.empty()) return
    const mode = opts.mode ?? 'recompose'
    const duration = opts.duration ?? DURATIONS.AXIS_RESCALE
    const ease = opts.ease ?? EASINGS.SMOOTH

    const bars = this.mainBars() as d3.Selection<SVGRectElement, unknown, d3.BaseType, unknown>
    if (bars.empty()) return

    console.info('[operation-new] GroupedBarChartInstance.transitionSeriesScope', {
      mode,
      barCount: bars.size(),
    })

    if (mode === 'dim') {
      const outOpacity = opts.outOfScopeOpacity ?? OPACITIES.DIM
      const parent = this.svg.transition().duration(DURATIONS.DIM).ease(ease) as unknown as d3.Transition<
        d3.BaseType,
        unknown,
        d3.BaseType,
        unknown
      >
      const inheritT = parent as never
      bars
        .interrupt('series-scope')
        .transition(inheritT)
        .style(SvgAttributes.Opacity, function () {
          const node = this as SVGElement
          const panel = node.getAttribute('data-chart-id') ?? 'root'
          const target = node.getAttribute('data-target') ?? ''
          const series = node.getAttribute('data-series') ?? node.getAttribute('data-group-value') ?? ''
          return opts.isInScope(panel, target, series) ? OPACITIES.FULL : outOpacity
        })
      try {
        await parent.end()
      } catch {
        /* interrupted */
      }
      return
    }

    // recompose mode
    const { layouts } = recomposeGroupedBarsFromDom({
      bars,
      isInScope: opts.isInScope,
    })

    const layoutByNode = new Map<SVGRectElement, GroupedRectLayout>()
    layouts.forEach((layout) => layoutByNode.set(layout.node, layout))

    const parent = this.svg.transition().duration(duration).ease(ease) as unknown as d3.Transition<
      d3.BaseType,
      unknown,
      d3.BaseType,
      unknown
    >
    const inheritT = parent as never

    bars
      .interrupt('series-scope')
      .transition(inheritT)
      .attr(SvgAttributes.X, function () {
        const layout = layoutByNode.get(this as SVGRectElement)
        return layout?.newX ?? Number(this.getAttribute(SvgAttributes.X) ?? 0)
      })
      .attr(SvgAttributes.Width, function () {
        const layout = layoutByNode.get(this as SVGRectElement)
        return layout?.newWidth ?? Number(this.getAttribute(SvgAttributes.Width) ?? 0)
      })
      .style(SvgAttributes.Opacity, function () {
        const layout = layoutByNode.get(this as SVGRectElement)
        return layout?.inScope ? OPACITIES.FULL : 0
      })

    // Reflect new scope on the instance so subsequent ops know which bars are visible.
    const activeKeysSet = new Set<string>()
    layouts.forEach((layout) => {
      if (layout.inScope) activeKeysSet.add(`${layout.panel}|${layout.target}|${layout.series}`)
    })
    this.activeTargets = activeKeysSet.size > 0 ? activeKeysSet : null
    this.outOfScopeOpacity = 0

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

    this.captureSeriesColors()
  }

  /**
   * Adopt an existing grouped-bar SVG already present in the host as this
   * instance's render output, instead of building one from scratch. Used by
   * cross-chart-type transitions (e.g. `StackedBarChartInstance.transitionToGrouped`)
   * so the next `runChartOps` call on this host short-circuits inside
   * `ensureRendered` to the NO-OP path — preserving any annotations the
   * transition left behind (e.g. pairDiff arrows).
   *
   * Without this hook, a fresh `GroupedBarChartInstance` always rebuilds
   * (specKey='' on first call → rebuild branch), wiping the post-transition
   * annotations. Case 11e148qcs7x70t8v: ops:n1 pairDiff transitions to grouped
   * + draws diff arrows; ops2:n2 filter must build on top of THAT state, not
   * a fresh re-rendered grouped chart.
   *
   * @returns `true` when adoption succeeded (host has a grouped SVG and the
   *   instance state is populated), `false` when no SVG is present (caller
   *   should fall back to `ensureRendered` which will rebuild).
   */
  adoptCurrentSvg(spec: ChartSpec): boolean {
    const svgNode = this.host.querySelector('svg') as SVGSVGElement | null
    if (!svgNode) {
      console.warn('[operation-new] GroupedBarChartInstance.adoptCurrentSvg: no svg in host, falling back to rebuild')
      return false
    }
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
    // Pre-seed specKey so the next `ensureRendered(spec)` call hits the NO-OP
    // branch (`nextKey === this.specKey && specKey !== ''`).
    this.specKey = computeSpecKey(spec)
    this.captureSeriesColors()
    console.info(
      '[operation-new] GroupedBarChartInstance.adoptCurrentSvg ' +
        JSON.stringify({
          specKeyHash: this.specKey.length,
          layout: this.layout,
          seriesCount: this.fullSeriesDomain.length,
        }),
    )
    return true
  }

  /**
   * Transitions the color legend so it reflects the current series subset.
   * Thin wrapper around `transitionLegendScope` primitive. Invoke right after
   * `transitionSeriesScope` recompose to animate the legend in lockstep.
   */
  async transitionLegend(opts: {
    activeSeries: Set<string>
    duration?: number
    ease?: (t: number) => number
  }): Promise<void> {
    if (!this.svg || this.svg.empty()) return
    await transitionLegendScope({
      svg: this.svg,
      activeSeries: opts.activeSeries,
      duration: opts.duration,
      ease: opts.ease,
    })
  }

  // -------------------------------------------------------------------------
  // Chart-type transitions (방안 8)
  //
  // Same architecture as StackedBarChartInstance: legacy helpers do the
  // in-place bar animation; this layer wraps them as instance methods so
  // applier-side dispatch is type-narrowed and detach-on-typeChange is
  // handled in one place.
  // -------------------------------------------------------------------------

  /**
   * Grouped → Stacked chart-type transition.
   *
   * Visual: side-by-side bars within each target slide together and re-stack
   * along the y-axis, with the y-scale expanding to fit the per-target
   * cumulative totals. The chart type shifts to STACKED_BAR.
   *
   * @param opts.currentSpec  The grouped spec that produced the current chart.
   * @param opts.stackGroup   Optional draw-op parameters.
   */
  async transitionToStacked(opts: {
    currentSpec: GroupedSpec
    stackGroup?: DrawStackGroupSpec
  }): Promise<StackGroupTransformResult | null> {
    console.info('[operation-new] GroupedBarChartInstance.transitionToStacked: starting')
    const result = await convertGroupedToStacked(this.host, opts.currentSpec, opts.stackGroup)
    if (result) {
      detachInstance(this.host)
    }
    return result
  }

  /**
   * Grouped → Simple-bar chart-type transition.
   *
   * Visual: only the selected series' bars remain; the rest fade out and
   * the surviving bars slide to a single bar per target. Chart type shifts
   * to SIMPLE_BAR, so this instance detaches.
   *
   * @param opts.currentSpec  Grouped spec.
   * @param opts.toSimple     Which series to keep + optional yDomain.
   */
  async transitionToSimple(opts: {
    currentSpec: GroupedSpec
    toSimple: DrawToSimpleSpec
  }): Promise<SimpleBarSpec | null> {
    console.info('[operation-new] GroupedBarChartInstance.transitionToSimple: starting', {
      series: opts.toSimple.series,
    })
    const simpleSpec = await convertGroupedToSimple(this.host, opts.currentSpec, opts.toSimple)
    if (simpleSpec) {
      detachInstance(this.host)
    }
    return simpleSpec ?? null
  }

  /**
   * Convenience wrapper around `transitionSeriesScope` that frames the
   * operation in terms of the new inner-scale (series) domain rather than a
   * per-cell predicate. Internally builds an "isInScope(series)" predicate
   * from `newSeriesDomain` and runs the standard recompose flow:
   *   - surviving bars within each (panel, target) group widen to fill the
   *     vacated space via innerScale recompute
   *   - removed-series bars fade to opacity 0
   *
   * This is the GroupedBar analogue of "narrow xLabelDomain" on simple-bar:
   * the inner scale's domain shrinks; the outer scale (categories) stays.
   *
   * @param opts.newSeriesDomain  Series to keep. Anything not in this list
   *                              is treated as out-of-scope.
   * @param opts.duration         Override default DURATIONS.AXIS_RESCALE.
   * @param opts.transitionLegendToo  If true (default), also transitions the
   *                              color legend in lockstep.
   */
  async transitionInnerScale(opts: {
    newSeriesDomain: string[]
    duration?: number
    ease?: (t: number) => number
    transitionLegendToo?: boolean
  }): Promise<void> {
    const activeSet = new Set(opts.newSeriesDomain)
    const tasks: Promise<void>[] = [
      this.transitionSeriesScope({
        isInScope: (_panel, _target, series) => activeSet.has(series),
        mode: 'recompose',
        duration: opts.duration,
        ease: opts.ease,
      }),
    ]
    if (opts.transitionLegendToo !== false && activeSet.size > 0) {
      tasks.push(this.transitionLegend({ activeSeries: activeSet, duration: opts.duration, ease: opts.ease }))
    }
    await Promise.all(tasks)
  }

  /**
   * Reads the base-rendered bars across all panels to capture each series'
   * canonical fill color and the full series-domain order. Series identity
   * is panel-independent (same series → same color regardless of facet), so
   * we merge across panels and keep the first color we see for each series.
   */
  private captureSeriesColors(): void {
    const colorMap = new Map<string, string>()
    const seriesOrder: string[] = []
    this.mainBars().each(function () {
      const node = this as SVGElement
      const series =
        node.getAttribute(DataAttributes.Series) ??
        node.getAttribute(DataAttributes.GroupValue) ??
        ''
      if (series === '') return
      if (!colorMap.has(series)) {
        const fill = node.getAttribute(SvgAttributes.Fill) ?? ''
        if (fill.length > 0) colorMap.set(series, fill)
        seriesOrder.push(series)
      }
    })
    this.seriesColors = colorMap
    this.fullSeriesDomain = seriesOrder
    console.info('[operation-new] GroupedBarChartInstance.captureSeriesColors', {
      seriesCount: seriesOrder.length,
      sample: seriesOrder.slice(0, 3),
    })
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

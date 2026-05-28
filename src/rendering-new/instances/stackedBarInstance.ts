import * as d3 from 'd3'
import { ChartType, type ChartSpec } from '../../domain/chart'
import { DataAttributes, SvgAttributes, SvgClassNames, SvgElements } from '../../rendering/interfaces'
import { DURATIONS, EASINGS, OPACITIES } from '../../rendering/common/d3Helpers'
import {
  renderStackedBarChart,
  type StackedSpec,
} from '../../rendering/bar/stackedBarRenderer'
import {
  convertStackedToDiverging,
  convertStackedToGrouped,
  type StackGroupTransformResult,
} from '../../rendering/bar/stackGroupTransforms'
import { convertStackedToSimple } from '../../rendering/bar/toSimpleTransforms'
import type { SimpleBarSpec } from '../../rendering/bar/simpleBarRenderer'
import type { DrawStackGroupSpec, DrawToSimpleSpec } from '../../rendering/draw/types'
import {
  recomposeStackedBarsFromDom,
  type StackedRectLayout,
} from '../../operation-new/primitives/stackComposition'
import { transitionLegendScope } from '../../operation-new/primitives/transitionLegend'
import type { ParentTransition } from '../../operation-new/primitives/sharedTransition'
import {
  attachInstance,
  detachInstance,
  getAttachedInstance,
  type ChartInstance,
  type ChartInstanceLayout,
  type ChartInstanceSnapshot,
  type TransitionChartScaleOptions,
} from '../chartInstance'
import { GroupedBarChartInstance } from './groupedBarInstance'

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
 * Shared-parent transition pattern: every per-phase mutation method
 * (`transitionSeriesScope`, `transitionLegend`) accepts an optional `parent`
 * — a d3 transition the caller creates once per phase. When supplied, the
 * method inherits that timeline so the bars, legend, axes, and annotation
 * fades all tick on the same scheduler frame; when omitted, the method falls
 * back to creating its own root transition for backward compatibility. The
 * applier-side entry point is `createPhaseTransition(duration, ease)` below.
 * Mirrors the validated pattern in `simpleBarInstance.transitionChartScale`
 * (lines ~459–532) and the validation-page idiom in
 * `validation/data/e2/e2_q2.js` and friends.
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

  /**
   * Series → fill-color map captured from the base render. Lets appliers
   * (filter, diff, average, ...) reference each series' canonical color
   * without re-reading the DOM or calling the renderer's color resolver. The
   * map preserves base-renderer color identity across subset transitions —
   * surviving series keep their original color even after a recompose.
   * Empty until the first `buildFromSpec` completes.
   */
  seriesColors: Map<string, string> = new Map()

  /**
   * Series identity order from the base render (matching the legend's row
   * order). Immutable across the chart's lifetime; subset transitions don't
   * mutate this — they only narrow `activeTargets`.
   */
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

  /**
   * Series-scope transition for stacked bars.
   *
   * Replaces "fade everything else to opacity 0.2 in place" (the legacy
   * `transitionFilterScope` behaviour) with a true stack recomposition: when
   * series go out of scope, the remaining segments slide down so the stack
   * re-anchors at y=0 with only the surviving series. The y-axis rescales
   * under the same parent transition so ticks and bars stay aligned every
   * frame.
   *
   * Visual sequence (single shared d3 parent transition):
   *   1. y-axis transitions to the new yScale (computed from surviving values).
   *   2. In-scope rects' (y, height) transition to new positions in the new
   *      scale. Their stack order within the target is preserved (DOM order).
   *   3. Out-of-scope rects' (y, height) collapse to zero height at the new
   *      cumulative top of the surviving stack, and opacity → 0.
   *
   * @param opts.isInScope        Predicate driving whether a (target, series)
   *                              cell remains in the stack. Mandatory in
   *                              `recompose` mode.
   * @param opts.mode             'recompose' (default) restacks survivors and
   *                              rescales y-axis. 'dim' is the legacy opacity-
   *                              only fallback (out-of-scope → outOfScopeOpacity).
   * @param opts.outOfScopeOpacity Used in `dim` mode (default OPACITIES.DIM).
   *                              In `recompose` mode out-of-scope is always 0.
   */
  async transitionSeriesScope(opts: {
    isInScope: (target: string, series: string) => boolean
    mode?: 'recompose' | 'dim'
    outOfScopeOpacity?: number
    duration?: number
    ease?: (t: number) => number
    /** Optional shared parent transition. When supplied, the bar + y-axis
     *  sub-transitions inherit its timeline (validation-page lockstep) and
     *  this method does NOT await — the caller awaits the parent's `end()`
     *  exactly once. When omitted, the method creates and awaits its own
     *  root transition (legacy behavior). */
    parent?: ParentTransition
  }): Promise<void> {
    if (!this.svg || this.svg.empty()) return
    const mode = opts.mode ?? 'recompose'
    const duration = opts.duration ?? DURATIONS.AXIS_RESCALE
    const ease = opts.ease ?? EASINGS.SMOOTH

    const bars = this.mainBars() as d3.Selection<SVGRectElement, unknown, d3.BaseType, unknown>
    if (bars.empty()) return

    console.info('[operation-new] StackedBarChartInstance.transitionSeriesScope', {
      mode,
      barCount: bars.size(),
      inheritedParent: !!opts.parent,
    })

    if (mode === 'dim') {
      // Backward-compat: opacity-only fade, no y-axis rescale.
      const outOpacity = opts.outOfScopeOpacity ?? OPACITIES.DIM
      const ownedParent = opts.parent
        ? null
        : (this.svg.transition().duration(DURATIONS.DIM).ease(ease) as unknown as ParentTransition)
      const inheritT = ((opts.parent ?? ownedParent) as unknown) as never
      bars
        .interrupt('series-scope')
        .transition(inheritT)
        .style(SvgAttributes.Opacity, function () {
          const node = this as SVGElement
          const target = node.getAttribute('data-target') ?? ''
          const series = node.getAttribute('data-series') ?? node.getAttribute('data-group-value') ?? ''
          return opts.isInScope(target, series) ? OPACITIES.FULL : outOpacity
        })
      if (ownedParent) {
        try {
          await ownedParent.end()
        } catch {
          /* interrupted */
        }
      }
      return
    }

    // recompose mode
    const { layouts, maxStackTotal } = recomposeStackedBarsFromDom({
      bars,
      isInScope: opts.isInScope,
    })

    // Build the new y-scale from the recomposed max. Guard against an
    // all-out-of-scope chart (maxStackTotal === 0) by giving the scale a
    // non-degenerate domain so axis ticks still render coherently.
    const plotH = this.layout.plotHeight
    const newMax = maxStackTotal > 0 ? maxStackTotal : 1
    const newYScale = d3.scaleLinear().domain([0, newMax]).nice().range([plotH, 0])

    // Per-node lookup for the transition callback.
    const layoutByNode = new Map<SVGRectElement, StackedRectLayout>()
    layouts.forEach((layout) => layoutByNode.set(layout.node, layout))

    const ownedParent = opts.parent
      ? null
      : (this.svg.transition().duration(duration).ease(ease) as unknown as ParentTransition)
    const inheritT = ((opts.parent ?? ownedParent) as unknown) as never

    // Y-axis transitions in lockstep with the bars. Stacked-bar layouts have
    // the y-axis inside the plot <g> (at translate(marginLeft, marginTop)),
    // so we select via `.${YAxis}` class which is unique to that <g>.
    const yAxisGroup = this.svg.select<SVGGElement>(`g.${SvgClassNames.YAxis}`)
    if (!yAxisGroup.empty()) {
      yAxisGroup.transition(inheritT).call(d3.axisLeft(newYScale).ticks(5))
    }

    bars
      .interrupt('series-scope')
      .transition(inheritT)
      .attr(SvgAttributes.Y, function () {
        const layout = layoutByNode.get(this as SVGRectElement)
        if (!layout) return Number(this.getAttribute(SvgAttributes.Y) ?? 0)
        return newYScale(layout.y1)
      })
      .attr(SvgAttributes.Height, function () {
        const layout = layoutByNode.get(this as SVGRectElement)
        if (!layout) return Number(this.getAttribute(SvgAttributes.Height) ?? 0)
        return Math.abs(newYScale(layout.y0) - newYScale(layout.y1))
      })
      .style(SvgAttributes.Opacity, function () {
        const layout = layoutByNode.get(this as SVGRectElement)
        return layout?.inScope ? OPACITIES.FULL : 0
      })

    // Reflect the new scope on the instance so subsequent ops (average / diff)
    // know which bars are visible.
    const activeKeysSet = new Set<string>()
    layouts.forEach((layout) => {
      if (layout.inScope) activeKeysSet.add(`${layout.target}|${layout.series}`)
    })
    this.activeTargets = activeKeysSet.size > 0 ? activeKeysSet : null
    this.outOfScopeOpacity = 0

    if (ownedParent) {
      try {
        await ownedParent.end()
      } catch {
        /* interrupted */
      }
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

    this.captureSeriesColors()
  }

  /**
   * Transitions the color legend so it reflects the current series subset.
   * Thin wrapper around `transitionLegendScope` primitive — exposed on the
   * instance for the same ergonomics as `transitionSeriesScope`. Callers
   * typically invoke this right after a `transitionSeriesScope` recompose
   * so the legend animates in lockstep with the bars.
   *
   * @param parent  Optional shared parent transition (validation-page
   *                lockstep idiom). When supplied, the underlying primitive
   *                inherits it instead of creating its own — the caller
   *                awaits the parent's `end()` exactly once.
   */
  async transitionLegend(opts: {
    activeSeries: Set<string>
    duration?: number
    ease?: (t: number) => number
    parent?: ParentTransition
  }): Promise<void> {
    if (!this.svg || this.svg.empty()) return
    await transitionLegendScope({
      svg: this.svg,
      activeSeries: opts.activeSeries,
      duration: opts.duration,
      ease: opts.ease,
      parent: opts.parent,
    })
  }

  /**
   * Creates the shared parent transition an applier rides for a single phase.
   * Sub-operations (`transitionSeriesScope`, `transitionLegend`, primitive
   * fades) receive this object and call `selection.transition(parent)` so the
   * d3 scheduler ticks every child in lockstep — matches the validation-page
   * "single `duration` constant" idiom and
   * `simpleBarInstance.transitionChartScale`'s shared-parent pattern.
   *
   * The caller awaits `parent.end()` exactly once at the end of the phase.
   */
  createPhaseTransition(
    duration: number = DURATIONS.AXIS_RESCALE,
    ease: (t: number) => number = EASINGS.SMOOTH,
  ): ParentTransition {
    return this.svg.transition().duration(duration).ease(ease) as unknown as ParentTransition
  }

  // -------------------------------------------------------------------------
  // Chart-type transitions (방안 8)
  //
  // Each method delegates to the corresponding legacy conversion helper which
  // performs the in-place bar animation, then issues a final base-renderer
  // call to materialize the new chart type. After conversion completes, the
  // chartType key on the host has shifted, so this instance is no longer the
  // right wrapper — we `detachInstance(host)` so the dispatcher attaches a
  // fresh instance (Grouped/Simple/etc.) on the next runChartOps call.
  //
  // The legacy helpers already implement smooth bar transitions; this layer
  // moves the orchestration onto the instance so applier-side code reads as
  // `instance.transitionToGrouped(...)` rather than reaching into legacy
  // `runBarTransformOperation`. That makes downstream refactors (e.g. swapping
  // the final renderer call for a true in-place SVG keep-and-rebind) a single-
  // file change here, not a cross-cutting applier rewrite.
  // -------------------------------------------------------------------------

  /**
   * Stacked → Grouped chart-type transition.
   *
   * Visual: existing bars in each target's stack animate to side-by-side
   * positions within the same target's x-band. After the bars settle, the
   * base grouped renderer materializes the final SVG (axes, legend, etc.).
   *
   * @param opts.currentSpec  The stacked spec that produced the current chart.
   * @param opts.stackGroup   Optional draw-op parameters (visibleSeries, etc.).
   * @returns                 The new chart-type + spec, or `null` if conversion
   *                          failed (e.g. dataset unavailable).
   */
  async transitionToGrouped(opts: {
    currentSpec: StackedSpec
    stackGroup?: DrawStackGroupSpec
  }): Promise<StackGroupTransformResult | null> {
    console.info('[operation-new] StackedBarChartInstance.transitionToGrouped: starting')
    const result = await convertStackedToGrouped(this.host, opts.currentSpec, opts.stackGroup)
    if (result && result.chartType === ChartType.GROUPED_BAR) {
      // Chart type shifted to GROUPED. Detach the stacked instance so the
      // dispatcher routes through the grouped runner next call; then PRE-
      // ATTACH a fresh GroupedBarChartInstance whose state is adopted from
      // the post-transition SVG. This lets the next `ensureRendered` call hit
      // the NO-OP branch, preserving the pairDiff annotations the transition
      // just drew. Without this, the next `runChartOps` rebuilds the grouped
      // chart from scratch (since a fresh instance starts with specKey='')
      // and the pairDiff arrows disappear — case 11e148qcs7x70t8v.
      detachInstance(this.host)
      const groupedInstance = new GroupedBarChartInstance(this.host)
      const adopted = groupedInstance.adoptCurrentSvg(result.spec as ChartSpec)
      if (adopted) {
        attachInstance(this.host, groupedInstance)
        console.info(
          '[operation-new] StackedBarChartInstance.transitionToGrouped: pre-attached grouped instance ' +
            JSON.stringify({ chartType: result.chartType }),
        )
      } else {
        console.warn(
          '[operation-new] StackedBarChartInstance.transitionToGrouped: grouped instance adoption FAILED — next op will rebuild and lose annotations',
        )
      }
    }
    return result
  }

  /**
   * Stacked → Diverging (centered) chart-type transition.
   *
   * Visual: the y-axis re-anchors at the data midpoint and bars split into
   * positive/negative directions. Chart type stays STACKED_BAR (only the
   * scale anchor changes), so the instance does NOT detach.
   *
   * @param opts.currentSpec  The stacked spec that produced the current chart.
   */
  async transitionToDiverging(opts: { currentSpec: StackedSpec }): Promise<void> {
    console.info('[operation-new] StackedBarChartInstance.transitionToDiverging: starting')
    await convertStackedToDiverging(this.host, opts.currentSpec)
    // Same chart type — invalidate specKey so the next ensureRendered
    // (which would otherwise no-op) picks up the diverging encoding.
    this.specKey = ''
  }

  /**
   * Stacked → Simple-bar chart-type transition.
   *
   * Visual: only the selected series remains; other stack segments collapse
   * to zero height and fade out, leaving a simple-bar chart with one bar
   * per target. Chart type shifts to SIMPLE_BAR, so this instance detaches.
   *
   * @param opts.currentSpec  Stacked spec.
   * @param opts.toSimple     Which series to retain + optional yDomain.
   */
  async transitionToSimple(opts: {
    currentSpec: StackedSpec
    toSimple: DrawToSimpleSpec
  }): Promise<SimpleBarSpec | null> {
    console.info('[operation-new] StackedBarChartInstance.transitionToSimple: starting', {
      series: opts.toSimple.series,
    })
    const simpleSpec = await convertStackedToSimple(this.host, opts.currentSpec, opts.toSimple)
    if (simpleSpec) {
      detachInstance(this.host)
    }
    return simpleSpec ?? null
  }

  /**
   * Reads the base-rendered bars to capture each series' canonical fill color
   * and the full series-domain order (matching the legend). Called once at
   * the tail of `buildFromSpec`; the captured map is then immutable across
   * subset transitions so surviving series keep their original color.
   *
   * Empty-series fallback: charts with no `data-series` (single-series stacks
   * collapsed to a simple-bar shape) leave `seriesColors` empty and
   * `fullSeriesDomain` empty — appliers should fall back to the renderer's
   * default fill in that case.
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
    console.info('[operation-new] StackedBarChartInstance.captureSeriesColors', {
      seriesCount: seriesOrder.length,
      sample: seriesOrder.slice(0, 3),
    })
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

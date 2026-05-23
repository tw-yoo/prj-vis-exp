import * as d3 from 'd3'
import type { JsonValue } from '../../types'
import { ChartType, type ChartSpec } from '../../domain/chart'
import { DataAttributes, SvgAttributes, SvgClassNames, SvgElements } from '../../rendering/interfaces'
import { resolveLayoutModel, type LayoutModel } from '../../rendering/common/chartLayout'
import { renderWithMeasuredLayout } from '../../rendering/common/renderWithMeasuredLayout'
import { resolveAxisTitle } from '../../rendering/common/resolveAxisTitle'
import { buildCategoricalDisplayLabelMap, categoricalTickFormatter } from '../../rendering/common/displayLabels'
import { wrapAxisTickLabels } from '../../rendering/common/wrapAxisTickLabels'
import { applyAxisTickLabelSize, DURATIONS, EASINGS, OPACITIES } from '../../rendering/common/d3Helpers'
import { formatTooltipValue, writeTooltipRootAttrs } from '../../rendering/common/chartHoverTooltip'
import { CHART_TEXT_SIZE } from '../../rendering/config/chartTextConfig'
import { bumpRenderEpoch } from '../../rendering/common/renderEpoch'
import { storeRuntimeChartState } from '../../rendering/utils/runtimeChartState'
import {
  clearSimpleBarSplitDomains,
  setSimpleBarStoredData,
  type SimpleBarSpec,
} from '../../rendering/bar/simpleBarRenderer'
import {
  attachInstance,
  getAttachedInstance,
  type ChartInstance,
  type ChartInstanceLayout,
  type ChartInstanceSnapshot,
  type TransitionChartScaleOptions,
} from '../chartInstance'

// ---------------------------------------------------------------------------
// Local types
// ---------------------------------------------------------------------------

type RawDatum = Record<string, JsonValue>

export type BarDatum = {
  row: RawDatum
  target: string
  id: string
  value: number
  xLabel: string
  xDisplayLabel: string
}

// ---------------------------------------------------------------------------
// Spec-key — used for idempotent ensureRendered
// ---------------------------------------------------------------------------

/**
 * Stable spec identity used by `ensureRendered`. Data-only key (same approach
 * as simple-line): encoding / mark / layer / width / height changes between
 * substeps are absorbed without a rebuild. Only a true data swap (different
 * url, different inline values length+fingerprint, different name) triggers
 * a fresh build — which is what differentiates one chart from another.
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

// ---------------------------------------------------------------------------
// Helpers (small, stateless — extracted from simpleBarRenderer.ts)
// ---------------------------------------------------------------------------

function resolveBarFill(spec: SimpleBarSpec): string {
  const mark = (spec as { mark?: JsonValue }).mark
  if (mark && typeof mark === 'object' && !Array.isArray(mark)) {
    const fill = (mark as { fill?: JsonValue }).fill
    if (typeof fill === 'string' && fill.trim().length > 0) return fill
    const color = (mark as { color?: JsonValue }).color
    if (typeof color === 'string' && color.trim().length > 0) return color
  }
  const configColor = (spec as { config?: { mark?: { color?: JsonValue } } }).config?.mark?.color
  if (typeof configColor === 'string' && configColor.trim().length > 0) return configColor
  return '#69b3a2'
}

const SORT_OP_FNS: Record<string, (values: number[], rows?: RawDatum[]) => number> = {
  sum: (values) => d3.sum(values),
  mean: (values) => d3.mean(values) ?? 0,
  average: (values) => d3.mean(values) ?? 0,
  avg: (values) => d3.mean(values) ?? 0,
  median: (values) => d3.median(values) ?? 0,
  min: (values) => d3.min(values) ?? 0,
  max: (values) => d3.max(values) ?? 0,
  count: (_values, rows) => rows?.length ?? 0,
  valid: (_values, rows) => rows?.length ?? 0,
}

function aggregateForSort(rows: RawDatum[], sortField: string, op = 'sum') {
  const normalizedOp = typeof op === 'string' ? op.toLowerCase() : 'sum'
  const fn = SORT_OP_FNS[normalizedOp] || SORT_OP_FNS.sum
  if (normalizedOp === 'count' || normalizedOp === 'valid' || !sortField) {
    const countResult = fn([], rows)
    return Number.isFinite(countResult) ? countResult : rows.length
  }
  const numericValues = rows.map((d) => Number(d[sortField])).filter(Number.isFinite)
  if (numericValues.length === 0) return 0
  const result = fn(numericValues, rows)
  return Number.isFinite(result) ? result : 0
}

function resolveCategoricalDomain(data: RawDatum[], xField: string, sortSpec: JsonValue | undefined): string[] {
  const fallbackDomain = Array.from(new Set(data.map((d) => String(d[xField]))))
  if (!sortSpec) return fallbackDomain
  if (Array.isArray(sortSpec)) return sortSpec.map((v) => String(v))
  if (typeof sortSpec === 'string') {
    const unique = Array.from(new Set(fallbackDomain))
    if (sortSpec === 'ascending') return unique.sort(d3.ascending)
    if (sortSpec === 'descending') return unique.sort(d3.descending)
    return unique
  }
  if (typeof sortSpec === 'object') {
    const { field: sortField, op = 'sum', order = 'ascending' } = sortSpec as {
      field?: string
      op?: string
      order?: string
    }
    const grouped = new Map<string, RawDatum[]>()
    data.forEach((d) => {
      const key = String(d[xField])
      if (!grouped.has(key)) grouped.set(key, [])
      grouped.get(key)!.push(d)
    })
    const entries = Array.from(grouped.entries()).map(([key, rows]) => ({
      key,
      value: aggregateForSort(rows, sortField || '', op),
    }))
    const direction = String(order).toLowerCase() === 'descending' ? -1 : 1
    entries.sort((a, b) => {
      const diff = (a.value ?? 0) - (b.value ?? 0)
      if (Number.isFinite(diff) && diff !== 0) return diff * direction
      return d3.ascending(String(a.key), String(b.key))
    })
    return entries.map((e) => e.key)
  }
  return fallbackDomain
}

function aggregateValues(data: RawDatum[], groupField: string, valueField: string, agg: string): RawDatum[] {
  const roll = d3.rollup(
    data,
    (v) => {
      const numeric = v.map((d) => Number(d[valueField])).filter(Number.isFinite)
      switch (agg) {
        case 'mean':
        case 'average':
        case 'avg':
          return d3.mean(numeric)
        case 'min':
          return d3.min(numeric)
        case 'max':
          return d3.max(numeric)
        case 'count':
          return numeric.length
        case 'sum':
        default:
          return d3.sum(numeric)
      }
    },
    (d) => d[groupField],
  )
  return Array.from(roll.entries()).map(([key, value]) => {
    const resolved = Number.isFinite(value ?? NaN) ? (value as number) : 0
    return { [groupField]: key, [valueField]: resolved }
  })
}

function resolveExplicitYDomain(scale: JsonValue | undefined): [number, number] | null {
  if (!scale || typeof scale !== 'object' || Array.isArray(scale)) return null
  const domain = (scale as { domain?: JsonValue }).domain
  if (!Array.isArray(domain) || domain.length < 2) return null
  const min = Number(domain[0])
  const max = Number(domain[1])
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) return null
  return min < max ? [min, max] : [max, min]
}

async function loadInlineRows(spec: SimpleBarSpec): Promise<RawDatum[]> {
  if (spec.data && Array.isArray((spec.data as { values?: JsonValue[] }).values)) {
    return (spec.data as { values: JsonValue[] }).values.map((row) => ({ ...(row as RawDatum) }))
  }
  if (spec.data && typeof (spec.data as { url?: JsonValue }).url === 'string') {
    const url = (spec.data as { url: string }).url
    if (url.endsWith('.json')) {
      const loaded = await d3.json(url)
      return Array.isArray(loaded) ? (loaded as RawDatum[]) : []
    }
    const loaded = await d3.csv(url)
    return Array.isArray(loaded) ? (loaded as RawDatum[]) : []
  }
  return []
}

function applyTransforms(data: RawDatum[], spec: SimpleBarSpec): RawDatum[] {
  const transforms = (spec as { transform?: JsonValue }).transform
  if (!Array.isArray(transforms)) return data
  let result = data
  transforms.forEach((t) => {
    const filterExpr = (t as { filter?: JsonValue })?.filter
    if (typeof filterExpr !== 'string') return
    const expr = filterExpr.replace(/datum\./g, 'd.')
    const filterFn = new Function('d', `return ${expr};`) as (d: RawDatum) => boolean
    result = result.filter((d) => {
      try {
        return filterFn(d)
      } catch {
        return true
      }
    })
  })
  return result
}

// ---------------------------------------------------------------------------
// SimpleBarChartInstance
// ---------------------------------------------------------------------------

export class SimpleBarChartInstance implements ChartInstance {
  readonly chartTypeKey = 'simple-bar' as const
  readonly host: HTMLElement

  svg!: d3.Selection<SVGSVGElement, unknown, null, undefined>
  skeleton!: d3.Selection<SVGGElement, unknown, null, undefined>
  annotationLayer!: d3.Selection<SVGGElement, unknown, null, undefined>

  layout: ChartInstanceLayout = { marginLeft: 0, marginTop: 0, plotWidth: 0, plotHeight: 0 }
  xScale!: d3.ScaleBand<string>
  yScale!: d3.ScaleLinear<number, number>
  xAxisGroup!: d3.Selection<SVGGElement, unknown, null, undefined>
  yAxisGroup!: d3.Selection<SVGGElement, unknown, null, undefined>
  bars!: d3.Selection<SVGRectElement, BarDatum, SVGGElement, unknown>
  barData: BarDatum[] = []
  barFill = '#69b3a2'

  resolvedEncoding: { xField: string; yField: string; xType: string; yType: string } | null = null

  /** When non-null, restricts which bars are "in scope". out-of-scope = dim opacity. */
  activeTargets: Set<string> | null = null

  /**
   * Opacity applied to out-of-scope bars in the current filter context.
   * Defaults to `OPACITIES.DIM`. Filter `remove` mode sets this to 0 so the
   * bars remain hidden across subsequent transitions (e.g. sort right after
   * filter shouldn't un-hide the removed bars).
   */
  outOfScopeOpacity: number = OPACITIES.DIM

  clipPathId = ''
  dataRows: RawDatum[] = []

  private specKey = ''
  private currentSpec: ChartSpec | null = null
  private buildPromise: Promise<void> | null = null

  constructor(host: HTMLElement) {
    this.host = host
  }

  ensureRendered(spec: ChartSpec): boolean {
    const nextKey = computeSpecKey(spec)
    if (nextKey === this.specKey && this.svg && this.host.contains(this.svg.node())) {
      console.info('[operation-new] SimpleBarChartInstance.ensureRendered: NO-OP (specKey match)', {
        specKeyHash: nextKey.length,
      })
      return false
    }
    console.info('[operation-new] SimpleBarChartInstance.ensureRendered: rebuilding', {
      reason: this.specKey === '' ? 'first-build' : nextKey !== this.specKey ? 'spec-changed' : 'svg-detached',
    })
    this.specKey = nextKey
    this.currentSpec = spec
    this.buildPromise = this.buildFromSpec(spec)
    return true
  }

  async waitForBuild(): Promise<void> {
    if (this.buildPromise) await this.buildPromise
  }

  snapshot(): ChartInstanceSnapshot {
    return {
      specKey: this.specKey,
      yDomain: this.yScale ? (this.yScale.domain() as [number, number]) : [0, 1],
    }
  }

  /**
   * Re-attach d3 selections to an SVG that already exists in this.host.
   *
   * Mirrors the SimpleLineChartInstance rehydrate flow: after the workbench
   * restores a cached chunk-scene SVG via `host.innerHTML = ...`, every cached
   * d3 selection on this instance (svg/skeleton/bars/axes/annotation layer)
   * points to elements no longer in the document. This method re-queries those
   * by class name, restores scale domains + activeTargets from `cachedScales`
   * (typically derived from the chunk-scene checkpoint's ChainState), and
   * re-binds `__data__` on each `<rect.main-bar>` via its `data-id` attribute.
   *
   * Sets `this.specKey = computeSpecKey(spec)` so the next `ensureRendered()`
   * is a NO-OP and does not wipe the just-rehydrated SVG.
   *
   * Returns true if the expected skeleton was found and rebinding succeeded;
   * false otherwise (caller should fall back to ensureRendered/buildFromSpec).
   *
   * Requires `this.barData.length > 0` — i.e. the instance must have rendered
   * the baseline at least once before. This always holds in the workbench
   * navigation flow (baseline render precedes any ops click).
   */
  rehydrateFromHost(
    spec: ChartSpec,
    cachedScales?: {
      yDomain?: [number, number]
      xLabelDomain?: string[]
      activeTargets?: Set<string> | null
      outOfScopeOpacity?: number
    },
  ): boolean {
    const svgEl = this.host.querySelector<SVGSVGElement>(SvgElements.Svg)
    if (!svgEl) return false
    const skeletonEl = svgEl.querySelector<SVGGElement>('g.chart-skeleton')
    const annotationLayerEl = svgEl.querySelector<SVGGElement>(`g.${SvgClassNames.AnnotationLayer}`)
    const xAxisEl = skeletonEl?.querySelector<SVGGElement>(`g.${SvgClassNames.XAxis}`) ?? null
    const yAxisEl = skeletonEl?.querySelector<SVGGElement>(`g.${SvgClassNames.YAxis}`) ?? null
    const barMarksEl = skeletonEl?.querySelector<SVGGElement>('g.bar-marks') ?? null
    if (!skeletonEl || !annotationLayerEl || !xAxisEl || !yAxisEl || !barMarksEl) {
      console.warn('[operation-new] SimpleBarChartInstance.rehydrateFromHost: missing skeleton elements', {
        hasSkeleton: !!skeletonEl,
        hasAnnotationLayer: !!annotationLayerEl,
        hasXAxis: !!xAxisEl,
        hasYAxis: !!yAxisEl,
        hasBarMarks: !!barMarksEl,
      })
      return false
    }
    if (this.barData.length === 0) {
      console.warn('[operation-new] SimpleBarChartInstance.rehydrateFromHost: no cached barData; instance was never built')
      return false
    }

    const marginLeft = Number(svgEl.getAttribute(DataAttributes.MarginLeft) ?? '0')
    const marginTop = Number(svgEl.getAttribute(DataAttributes.MarginTop) ?? '0')
    const plotWidth = Number(svgEl.getAttribute(DataAttributes.PlotWidth) ?? '0')
    const plotHeight = Number(svgEl.getAttribute(DataAttributes.PlotHeight) ?? '0')
    this.layout = { marginLeft, marginTop, plotWidth, plotHeight }

    this.svg = d3.select(svgEl)
    this.skeleton = d3.select(skeletonEl)
    this.annotationLayer = d3.select(annotationLayerEl)
    this.xAxisGroup = d3.select(xAxisEl)
    this.yAxisGroup = d3.select(yAxisEl)

    const clipPathEl = svgEl.querySelector<SVGClipPathElement>('clipPath')
    this.clipPathId = clipPathEl?.id ?? ''

    const values = this.barData.map((d) => d.value).filter(Number.isFinite)
    const fullYMin = d3.min(values) ?? 0
    const fullYMax = d3.max(values) ?? fullYMin + 1
    const yDomain = cachedScales?.yDomain ?? [fullYMin, fullYMax === fullYMin ? fullYMin + 1 : fullYMax]
    this.yScale = d3.scaleLinear().domain(yDomain).range([plotHeight, 0])

    const xLabelDomain =
      cachedScales?.xLabelDomain ?? Array.from(new Set(this.barData.map((d) => d.target)))
    this.xScale = d3.scaleBand<string>().domain(xLabelDomain).range([0, plotWidth]).padding(0.2)

    this.activeTargets = cachedScales?.activeTargets ?? null
    if (cachedScales?.outOfScopeOpacity !== undefined) {
      this.outOfScopeOpacity = cachedScales.outOfScopeOpacity
    }

    const byId = new Map(this.barData.map((d) => [d.id, d]))
    const barsSel = d3.select(barMarksEl).selectAll<SVGRectElement, unknown>(`rect.${SvgClassNames.MainBar}`)
    barsSel.each(function () {
      const id = this.getAttribute(DataAttributes.Id)
      if (id) {
        const datum = byId.get(id)
        if (datum) {
          ;(this as unknown as { __data__: BarDatum }).__data__ = datum
        }
      }
    })
    this.bars = barsSel as d3.Selection<SVGRectElement, BarDatum, SVGGElement, unknown>

    this.specKey = computeSpecKey(spec)
    this.currentSpec = spec
    this.buildPromise = null

    console.info('[operation-new] SimpleBarChartInstance.rehydrateFromHost: ok', {
      yDomain,
      xLabelCount: xLabelDomain.length,
      activeTargetsSize: this.activeTargets?.size ?? null,
      barCount: this.barData.length,
    })
    return true
  }

  /**
   * Op-agnostic scale-transition primitive — bar-specific implementation of
   * the shared `transitionChartScale` API. One parent transition rides axes
   * + bar y/height/x/width + opacity dim/full. The d3 scheduler ticks every
   * sub-transition in lockstep so axis ticks and bars stay aligned every
   * frame.
   */
  async transitionChartScale(opts: TransitionChartScaleOptions): Promise<void> {
    if (!this.yScale || !this.xScale) return

    const duration = opts.duration ?? DURATIONS.AXIS_RESCALE
    const ease = opts.ease ?? EASINGS.SMOOTH

    // ---------- Capture prev state + mutate scales synchronously ----------
    const prevYDomain = this.yScale.domain() as [number, number]
    const prevXDomain = this.xScale.domain().slice()

    let willChangeY = false
    let willChangeX = false

    if (opts.yDomain !== undefined) {
      let next = opts.yDomain
      if (next[0] === next[1]) next = [next[0], next[0] + 1]
      if (next[0] !== prevYDomain[0] || next[1] !== prevYDomain[1]) {
        this.yScale.domain(next).nice()
        willChangeY = true
      }
    }
    if (opts.xLabelDomain !== undefined) {
      const next = opts.xLabelDomain
      const sameLabels = prevXDomain.length === next.length && prevXDomain.every((v, i) => v === next[i])
      if (!sameLabels && next.length > 0) {
        this.xScale.domain(next)
        willChangeX = true
      }
    }
    if (opts.activeTargets !== undefined) this.activeTargets = opts.activeTargets
    if (opts.outOfScopeOpacity !== undefined) this.outOfScopeOpacity = opts.outOfScopeOpacity

    const willChangeOpacity = opts.activeTargets !== undefined || opts.outOfScopeOpacity !== undefined
    if (!willChangeY && !willChangeX && !willChangeOpacity) return

    console.info('[operation-new] SimpleBarChartInstance.transitionChartScale', {
      willChangeY,
      willChangeX,
      willChangeOpacity,
      yDomainFrom: prevYDomain,
      yDomainTo: this.yScale.domain(),
      xDomainSizeFrom: prevXDomain.length,
      xDomainSizeTo: this.xScale.domain().length,
      activeSize: this.activeTargets?.size ?? null,
    })

    // ---------- Shared d3 transition: parent + child .transition(parent) ----------
    const transition = this.svg.transition().duration(duration).ease(ease) as unknown as d3.Transition<
      d3.BaseType,
      unknown,
      d3.BaseType,
      unknown
    >
    const inheritT = transition as never

    const zeroY = this.yScale(0)
    const activeTargets = this.activeTargets
    const xScale = this.xScale
    const yScale = this.yScale

    // Helpers for the new scale positions/sizes.
    const newX = (d: BarDatum): number => xScale(d.target) ?? 0
    const newW = xScale.bandwidth()
    const newY = (d: BarDatum): number => (d.value >= 0 ? yScale(d.value) : zeroY)
    const newH = (d: BarDatum): number => Math.abs(yScale(d.value) - zeroY)

    // Persisted opacity for out-of-scope bars: callers can override per-call,
    // otherwise inherit from the instance (set by an earlier filter applier).
    const outOpacity = this.outOfScopeOpacity
    if (!this.bars.empty()) {
      if (activeTargets) {
        // In-scope: slide to new x/y/width/height, full opacity.
        this.bars
          .filter((d) => activeTargets.has(d.target))
          .transition(inheritT)
          .attr(SvgAttributes.X, (d) => newX(d))
          .attr(SvgAttributes.Width, newW)
          .attr(SvgAttributes.Y, (d) => newY(d))
          .attr(SvgAttributes.Height, (d) => newH(d))
          .style(SvgAttributes.Opacity, OPACITIES.FULL)

        // Out-of-scope: keep current x/width (band scale no longer maps them),
        // but slide y/height to the new yScale so the chart's vertical motion
        // stays consistent. Clip-path naturally hides anything that slides
        // outside the plot rectangle. opacity controlled by outOfScopeOpacity
        // (DIM by default; 0 = hidden, used for filter `remove` mode).
        this.bars
          .filter((d) => !activeTargets.has(d.target))
          .transition(inheritT)
          .attr(SvgAttributes.Y, (d) => newY(d))
          .attr(SvgAttributes.Height, (d) => newH(d))
          .style(SvgAttributes.Opacity, outOpacity)
      } else {
        // No active filter — every bar repositions and stays full opacity.
        this.bars
          .transition(inheritT)
          .attr(SvgAttributes.X, (d) => newX(d))
          .attr(SvgAttributes.Width, newW)
          .attr(SvgAttributes.Y, (d) => newY(d))
          .attr(SvgAttributes.Height, (d) => newH(d))
          .style(SvgAttributes.Opacity, OPACITIES.FULL)
      }
    }

    // Axes: same shared transition. d3 handles tick enter/update/exit and
    // smoothly interpolates positions for the new scale.
    if (willChangeY) {
      this.yAxisGroup.transition(inheritT).call(d3.axisLeft(this.yScale).ticks(5))
      applyAxisTickLabelSize(this.yAxisGroup)
    }
    if (willChangeX) {
      const xLabelMap = buildCategoricalDisplayLabelMap(this.dataRows, this.resolvedEncoding?.xField ?? '')
      this.xAxisGroup
        .transition(inheritT)
        .call(d3.axisBottom(this.xScale).tickFormat(categoricalTickFormatter(xLabelMap)))
      applyAxisTickLabelSize(this.xAxisGroup)
    }

    try {
      await transition.end()
    } catch {
      /* interrupted */
    }
  }

  // -------------------------------------------------------------------------
  // build (private)
  // -------------------------------------------------------------------------

  private async buildFromSpec(spec: ChartSpec) {
    const barSpec = spec as SimpleBarSpec
    clearSimpleBarSplitDomains(this.host)

    const enc = barSpec.encoding
    const xField = enc.x.field
    const yField = enc.y.field
    const xType = enc.x.type
    const yType = enc.y.type
    this.resolvedEncoding = { xField, yField, xType, yType }
    this.barFill = resolveBarFill(barSpec)

    let data = await loadInlineRows(barSpec)
    data.forEach((d) => {
      if (xType === 'quantitative') d[xField] = Number(d[xField])
      if (yType === 'quantitative') d[yField] = Number(d[yField])
    })
    data = applyTransforms(data, barSpec)

    const agg = enc.x.aggregate || enc.y.aggregate
    if (agg) {
      const groupField = enc.x.aggregate ? yField : xField
      const valueField = enc.x.aggregate ? xField : yField
      data = aggregateValues(data, groupField, valueField, agg)
    }
    this.dataRows = data
    setSimpleBarStoredData(this.host, data)
    storeRuntimeChartState(this.host, { chartType: ChartType.SIMPLE_BAR, spec: barSpec, renderer: 'd3' })

    const xDomain = resolveCategoricalDomain(data, xField, enc.x.sort)
    const xLabelMap = buildCategoricalDisplayLabelMap(data, xField)

    const explicitYDomain = resolveExplicitYDomain(enc.y.scale)
    let domainMin: number
    let domainMax: number
    if (explicitYDomain) {
      domainMin = explicitYDomain[0]
      domainMax = explicitYDomain[1]
    } else {
      const yValues = data.map((d) => Number(d[yField])).filter(Number.isFinite)
      const minY = d3.min(yValues)
      const maxY = d3.max(yValues)
      domainMin = Math.min(0, Number.isFinite(minY) ? (minY as number) : 0)
      domainMax = Math.max(0, Number.isFinite(maxY) ? (maxY as number) : 0)
      if (domainMin === domainMax) domainMax = domainMin + 1
    }

    const xAxisLabel = resolveAxisTitle(barSpec, data, 'x')
    const yAxisLabel = resolveAxisTitle(barSpec, data, 'y')
    const renderEpoch = bumpRenderEpoch(this.host)

    // Build per-bar BarDatum so we can join in transitions later.
    this.barData = data.map((row) => {
      const target = String(row[xField])
      const id = String((row as { id?: JsonValue }).id ?? row[xField])
      const value = Number(row[yField])
      return {
        row,
        target,
        id,
        value: Number.isFinite(value) ? value : 0,
        xLabel: target,
        xDisplayLabel: xLabelMap.get(target) ?? target,
      }
    })

    const initialLayout = resolveLayoutModel({ container: this.host, chartType: ChartType.SIMPLE_BAR, spec: barSpec })
    renderWithMeasuredLayout(this.host, initialLayout, (passLayout) =>
      this.renderPass(passLayout, {
        xDomain,
        xLabelMap,
        explicitYDomain,
        domainMin,
        domainMax,
        renderEpoch,
        xAxisLabel,
        yAxisLabel,
      }),
    )
  }

  // -------------------------------------------------------------------------
  // renderPass — builds the full SVG/skeleton from a layout. Invoked by
  // renderWithMeasuredLayout (possibly multiple times when axis-title overflow
  // forces a re-measure). On each pass the SVG is replaced and the instance's
  // cached selections reassigned.
  // -------------------------------------------------------------------------
  private renderPass(
    layout: LayoutModel,
    ctx: {
      xDomain: string[]
      xLabelMap: Map<string, string>
      explicitYDomain: [number, number] | null
      domainMin: number
      domainMax: number
      renderEpoch: number
      xAxisLabel: string | null
      yAxisLabel: string | null
    },
  ) {
    const { xDomain, xLabelMap, explicitYDomain, domainMin, domainMax, renderEpoch, xAxisLabel, yAxisLabel } = ctx
    const resolved = this.resolvedEncoding!
    const margin = layout.padding
    const plotW = layout.plot.width
    const plotH = layout.plot.height
    const width = Math.max(layout.canvas.width, margin.left + plotW + margin.right)
    const height = Math.max(layout.canvas.height, margin.top + plotH + margin.bottom)
    this.layout = { marginLeft: margin.left, marginTop: margin.top, plotWidth: plotW, plotHeight: plotH }

    const containerSel = d3.select(this.host)
    containerSel.selectAll('*').remove()

    const nextSvg = containerSel
      .append(SvgElements.Svg)
      .attr(SvgAttributes.ViewBox, `0 0 ${width} ${height}`)
      .attr(DataAttributes.RenderEpoch, renderEpoch)
      .attr(DataAttributes.MarginLeft, margin.left)
      .attr(DataAttributes.MarginTop, margin.top)
      .attr(DataAttributes.ExplanationTop, layout.explanation.top)
      .attr(DataAttributes.ExplanationHeight, layout.explanation.height)
      .attr(DataAttributes.ExplanationBottom, layout.explanation.bottom)
      .attr(DataAttributes.AnnotationTopClearance, layout.explanation.annotationTopClearance)
      .attr(DataAttributes.PlotWidth, plotW)
      .attr(DataAttributes.PlotHeight, plotH)
      .attr(DataAttributes.XField, resolved.xField)
      .attr(DataAttributes.YField, resolved.yField)
      .style('overflow', 'visible') as d3.Selection<SVGSVGElement, unknown, null, undefined>
    this.svg = nextSvg
    writeTooltipRootAttrs(nextSvg, {
      xLabel: xAxisLabel ?? resolved.xField,
      yLabel: yAxisLabel ?? resolved.yField,
      groupLabel: null,
    })

    // ----- Plot-area clip-path: keeps bars constrained during transitions.
    const clipPathId = `plot-clip-${renderEpoch}`
    this.clipPathId = clipPathId
    nextSvg
      .append('defs')
      .append('clipPath')
      .attr('id', clipPathId)
      .attr('clipPathUnits', 'userSpaceOnUse')
      .append(SvgElements.Rect)
      .attr(SvgAttributes.X, 0)
      .attr(SvgAttributes.Y, 0)
      .attr(SvgAttributes.Width, plotW)
      .attr(SvgAttributes.Height, plotH)

    const skeleton = nextSvg
      .append(SvgElements.Group)
      .attr(SvgAttributes.Class, 'chart-skeleton')
      .attr(SvgAttributes.Transform, `translate(${margin.left},${margin.top})`) as d3.Selection<
      SVGGElement,
      unknown,
      null,
      undefined
    >
    this.skeleton = skeleton

    // ----- Scales -----
    const xScale = d3.scaleBand<string>().domain(xDomain).range([0, plotW]).padding(0.2)
    const yScale = d3.scaleLinear().domain([domainMin, domainMax]).range([plotH, 0])
    if (!explicitYDomain) yScale.nice()
    this.xScale = xScale
    this.yScale = yScale
    const zeroY = yScale(0)

    // ----- X axis -----
    const xAxisGroup = skeleton
      .append(SvgElements.Group)
      .attr(SvgAttributes.Class, SvgClassNames.XAxis)
      .attr(SvgAttributes.Transform, `translate(0,${plotH})`)
      .call(d3.axisBottom(xScale).tickFormat(categoricalTickFormatter(xLabelMap))) as d3.Selection<
      SVGGElement,
      unknown,
      null,
      undefined
    >
    applyAxisTickLabelSize(xAxisGroup)
    this.xAxisGroup = xAxisGroup
    const xTicks = Array.from(xAxisGroup.selectAll<SVGGElement, unknown>('.tick').nodes())
    const axisLayout = wrapAxisTickLabels(xAxisGroup.selectAll<SVGTextElement, unknown>(SvgElements.Text), {
      showAllTicksByDefault: layout.tickLayout.showAllTicksByDefault,
      rotationReferencePolicy: layout.tickLayout.rotationReferencePolicy,
      maxCharsPerLine: layout.tickLayout.maxCharsPerLine,
      maxLines: layout.tickLayout.maxLines,
      allowDensityReduction: layout.tickLayout.allowDensityReduction,
      maxDensityStep: layout.tickLayout.maxDensityStep,
      overlapTolerancePx: layout.tickLayout.overlapTolerancePx,
      maxUnrotatedLabelLength: layout.tickLayout.maxUnrotatedLabelLength,
      candidateAngles: layout.tickLayout.candidateAngles,
      rotatedAnchor: layout.tickLayout.rotatedAnchor,
      tickElements: xTicks,
    })
    nextSvg.attr(DataAttributes.AxisRotation, String(Math.abs(axisLayout.angleDeg)))
    nextSvg.attr(DataAttributes.TickDensityStep, String(axisLayout.densityStep))

    // ----- Y axis -----
    const yAxisGroup = skeleton
      .append(SvgElements.Group)
      .attr(SvgAttributes.Class, SvgClassNames.YAxis)
      .call(d3.axisLeft(yScale).ticks(5)) as d3.Selection<SVGGElement, unknown, null, undefined>
    applyAxisTickLabelSize(yAxisGroup)
    this.yAxisGroup = yAxisGroup

    // ----- Bars (clip-path constrains them to the plot rectangle) -----
    const barsGroup = skeleton
      .append(SvgElements.Group)
      .attr(SvgAttributes.Class, 'bar-marks')
      .attr('clip-path', `url(#${clipPathId})`)
    this.bars = barsGroup
      .selectAll<SVGRectElement, BarDatum>(SvgElements.Rect)
      .data(this.barData)
      .join(SvgElements.Rect)
      .attr(SvgAttributes.Class, SvgClassNames.MainBar)
      .attr(SvgAttributes.X, (d) => xScale(d.target) ?? 0)
      .attr(SvgAttributes.Width, xScale.bandwidth())
      .attr(SvgAttributes.Y, (d) => (d.value >= 0 ? yScale(d.value) : zeroY))
      .attr(SvgAttributes.Height, (d) => Math.abs(yScale(d.value) - zeroY))
      .attr(SvgAttributes.Fill, this.barFill)
      .attr(DataAttributes.Id, (d) => d.id)
      .attr(DataAttributes.Target, (d) => d.target)
      .attr(DataAttributes.Value, (d) => d.value)
      .attr(DataAttributes.XValue, (d) => d.xDisplayLabel)
      .attr(DataAttributes.YValue, (d) => formatTooltipValue(d.value)) as d3.Selection<
      SVGRectElement,
      BarDatum,
      SVGGElement,
      unknown
    >

    // ----- Annotation layer (created once; appended AFTER skeleton so it
    // naturally renders on top without needing .raise()).
    this.annotationLayer = nextSvg
      .append(SvgElements.Group)
      .attr(
        SvgAttributes.Class,
        `${SvgClassNames.AnnotationLayer} operation-next-annotation-layer`,
      ) as d3.Selection<SVGGElement, unknown, null, undefined>

    // ----- Axis title labels -----
    const xTitlePos = {
      x: layout.axisTitles.x.x,
      y: Math.max(layout.axisTitles.x.y, height - margin.bottom + 44),
    }
    const yTitlePos = { x: layout.axisTitles.y.x, y: layout.axisTitles.y.y }
    if (xAxisLabel) {
      nextSvg
        .append(SvgElements.Text)
        .attr(SvgAttributes.Class, SvgClassNames.XAxisLabel)
        .attr(SvgAttributes.X, xTitlePos.x)
        .attr(SvgAttributes.Y, xTitlePos.y)
        .attr(SvgAttributes.TextAnchor, 'middle')
        .attr(SvgAttributes.FontSize, CHART_TEXT_SIZE.axisTitle)
        .attr(SvgAttributes.FontWeight, 'bold')
        .text(xAxisLabel)
    }
    if (yAxisLabel) {
      nextSvg
        .append(SvgElements.Text)
        .attr(SvgAttributes.Class, SvgClassNames.YAxisLabel)
        .attr(SvgAttributes.Transform, 'rotate(-90)')
        .attr(SvgAttributes.X, yTitlePos.x)
        .attr(SvgAttributes.Y, yTitlePos.y)
        .attr(SvgAttributes.TextAnchor, 'middle')
        .attr(SvgAttributes.FontSize, CHART_TEXT_SIZE.axisTitle)
        .attr(SvgAttributes.FontWeight, 'bold')
        .text(yAxisLabel)
    }
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function ensureSimpleBarChartInstance(host: HTMLElement, spec: ChartSpec): SimpleBarChartInstance {
  const existing = getAttachedInstance(host)
  if (existing && existing.chartTypeKey === 'simple-bar') {
    const instance = existing as SimpleBarChartInstance
    instance.ensureRendered(spec)
    return instance
  }
  const instance = new SimpleBarChartInstance(host)
  attachInstance(host, instance)
  instance.ensureRendered(spec)
  return instance
}

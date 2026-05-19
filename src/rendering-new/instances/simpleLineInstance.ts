import * as d3 from 'd3'
import type { JsonValue } from '../../types'
import { ChartType, type ChartSpec } from '../../domain/chart'
import { DataAttributes, SvgAttributes, SvgClassNames, SvgElements } from '../../rendering/interfaces'
import { resolveLayoutModel, type LayoutModel } from '../../rendering/common/chartLayout'
import { renderWithMeasuredLayout } from '../../rendering/common/renderWithMeasuredLayout'
import { resolveAxisTitle } from '../../rendering/common/resolveAxisTitle'
import { buildCategoricalDisplayLabelMap, categoricalTickFormatter } from '../../rendering/common/displayLabels'
import { wrapAxisTickLabels } from '../../rendering/common/wrapAxisTickLabels'
import { createTemporalTickFormatter } from '../../rendering/common/temporalTicks'
import { applyAxisTickLabelSize, COLORS, DURATIONS, EASINGS } from '../../rendering/common/d3Helpers'
import { formatTooltipValue, writeTooltipRootAttrs } from '../../rendering/common/chartHoverTooltip'
import { CHART_TEXT_SIZE } from '../../rendering/config/chartTextConfig'
import { bumpRenderEpoch } from '../../rendering/common/renderEpoch'
import { storeRuntimeChartState } from '../../rendering/utils/runtimeChartState'
import {
  clearSimpleLineSplitDomains,
  resolveSimpleLineEncoding,
  setSimpleLineStoredData,
  type LineSpec,
} from '../../rendering/line/simpleLineRenderer'
import {
  attachInstance,
  getAttachedInstance,
  type ChartInstance,
  type ChartInstanceLayout,
  type ChartInstanceSnapshot,
} from '../chartInstance'

// ---------------------------------------------------------------------------
// Local data types
// ---------------------------------------------------------------------------

type RawDatum = Record<string, JsonValue>

type ResolvedEncoding = {
  xField: string
  yField: string
  xType: string
  yType: string
  colorField?: string
}

type RenderPoint = {
  row: RawDatum
  xLabel: string
  xDisplayLabel: string
  xValue: string | number | Date
  xSort: number | string
  target: string
  id: string
  yValue: number
}

type LineStyle = { stroke: string; strokeWidth: number; pointRadius: number; showPoints: boolean }

type LineGenerator = d3.Line<RenderPoint>

// ---------------------------------------------------------------------------
// Spec → render-ready data (extracted helpers — small, stateless)
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? (value as Record<string, unknown>) : {}
}

function normalizeMarkType(mark: ChartSpec['mark']) {
  if (!mark) return null
  if (typeof mark === 'string') return mark
  if (typeof mark === 'object' && typeof mark.type === 'string') return mark.type
  return null
}

function toDateValue(raw: JsonValue): Date {
  if (raw instanceof Date) return raw
  if (typeof raw === 'number') {
    if (raw > 1e10) return new Date(raw)
    if (raw > 3e3) return new Date(raw * 1000)
    return new Date(Date.UTC(raw, 0, 1))
  }
  return new Date(String(raw))
}

function normalizeLineXValue(raw: JsonValue, xType: string) {
  if (xType === 'temporal') {
    const dt = toDateValue(raw)
    const isoFull = dt.toISOString()
    return { label: isoFull.slice(0, 10), id: isoFull, value: dt, sort: dt.getTime() }
  }
  if (xType === 'quantitative') {
    const num = Number(raw)
    if (Number.isFinite(num)) {
      const label = String(raw)
      return { label, id: label, value: num, sort: num }
    }
  }
  const label = raw != null ? String(raw) : ''
  return { label, id: label, value: label, sort: label }
}

function normalizeLineIdentifier(rawX: JsonValue, xType: string) {
  if (xType === 'temporal') {
    const dt = toDateValue(rawX)
    const isoFull = dt.toISOString()
    return { target: isoFull.slice(0, 10), id: isoFull }
  }
  const label = String(rawX)
  return { target: label, id: label }
}

function applyDiscreteSortOrder(labels: string[], sortSpec: JsonValue | undefined) {
  if (!sortSpec) return labels
  const next = labels.slice()
  const compareLabel = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
  if (Array.isArray(sortSpec)) {
    const order = new Map(sortSpec.map((entry, index) => [String(entry), index]))
    next.sort(
      (a, b) =>
        (order.get(a) ?? Number.MAX_SAFE_INTEGER) - (order.get(b) ?? Number.MAX_SAFE_INTEGER) || compareLabel(a, b),
    )
    return next
  }
  if (typeof sortSpec === 'string') {
    if (sortSpec === 'descending') {
      next.sort((a, b) => compareLabel(b, a))
      return next
    }
    if (sortSpec === 'ascending') {
      next.sort(compareLabel)
      return next
    }
  }
  return next
}

function normalizeLayers(spec: ChartSpec) {
  const baseEncoding = isRecord(spec.encoding) ? (spec.encoding as Record<string, JsonValue>) : {}
  if (Array.isArray(spec.layer) && spec.layer.length > 0) {
    return spec.layer.map((layer) => ({
      mark: normalizeMarkType((layer?.mark as ChartSpec['mark']) ?? spec.mark),
      encoding: {
        ...baseEncoding,
        ...(layer?.encoding && typeof layer.encoding === 'object' ? layer.encoding : {}),
      } as Record<string, JsonValue>,
    }))
  }
  return [{ mark: normalizeMarkType(spec.mark), encoding: baseEncoding }]
}

function resolveLineMinZero(spec: LineSpec, resolved: ResolvedEncoding) {
  const layers = normalizeLayers(spec as ChartSpec)
  for (const layer of layers) {
    const encoding = asRecord(layer.encoding)
    const yChannel = asRecord(encoding.y)
    const yField = typeof yChannel.field === 'string' ? yChannel.field.trim() : ''
    if (yField && yField !== resolved.yField) continue
    const scale = asRecord(yChannel.scale)
    if (typeof scale.zero === 'boolean') return scale.zero
  }
  return false
}

function resolveSortSpec(spec: LineSpec, resolved: ResolvedEncoding) {
  const layers = normalizeLayers(spec as ChartSpec)
  for (const layer of layers) {
    const encoding = asRecord(layer.encoding)
    const xChannel = asRecord(encoding.x)
    const field = typeof xChannel.field === 'string' ? xChannel.field.trim() : ''
    if (!field || field !== resolved.xField) continue
    if (Object.prototype.hasOwnProperty.call(xChannel, 'sort')) {
      return xChannel.sort as JsonValue | undefined
    }
  }
  return undefined
}

function resolveLineStyle(spec: LineSpec): LineStyle {
  const fallback = { stroke: '#4f46e5', strokeWidth: 2, pointRadius: 4, showPoints: true }
  let { stroke, strokeWidth, pointRadius, showPoints } = fallback

  const apply = (mark: unknown) => {
    const rec = asRecord(mark)
    if (typeof rec.stroke === 'string' && rec.stroke.trim().length > 0) stroke = rec.stroke
    else if (typeof rec.color === 'string' && rec.color.trim().length > 0) stroke = rec.color
    const width = Number(rec.strokeWidth)
    if (Number.isFinite(width) && width > 0) strokeWidth = width
    const size = Number(rec.size)
    if (Number.isFinite(size) && size > 0) pointRadius = Math.max(2, Math.sqrt(size / Math.PI))
  }

  apply((spec as { mark?: unknown }).mark)
  if (Array.isArray(spec.layer)) {
    spec.layer.forEach((layer) => {
      const layerMark = (layer as { mark?: unknown }).mark
      const markType = normalizeMarkType(layerMark as ChartSpec['mark'])
      if (markType === 'line') apply(layerMark)
      if (markType === 'point') showPoints = true
    })
  }
  const cfgMark = asRecord((spec as { config?: { mark?: unknown } }).config?.mark)
  if (stroke === fallback.stroke && typeof cfgMark.color === 'string' && cfgMark.color.trim().length > 0) {
    stroke = cfgMark.color
  }
  return { stroke, strokeWidth, pointRadius, showPoints }
}

function shouldKeepRow(row: RawDatum, filterSpec: unknown): boolean {
  if (filterSpec == null) return true
  if (typeof filterSpec === 'string') {
    const expr = filterSpec.replace(/\bdatum\./g, 'd.')
    try {
      const fn = new Function('d', `return (${expr});`) as (d: RawDatum) => boolean
      return Boolean(fn(row))
    } catch {
      return true
    }
  }
  const rec = asRecord(filterSpec)
  if (Array.isArray(rec.and)) return rec.and.every((entry) => shouldKeepRow(row, entry))
  if (Array.isArray(rec.or)) return rec.or.some((entry) => shouldKeepRow(row, entry))
  if (rec.not !== undefined) return !shouldKeepRow(row, rec.not)
  const field = typeof rec.field === 'string' ? rec.field : null
  if (!field) return true
  const value = row[field]
  if (Array.isArray(rec.oneOf)) return new Set(rec.oneOf.map(String)).has(String(value))
  if (rec.equal !== undefined) return String(value) === String(rec.equal)
  if (Array.isArray(rec.range) && rec.range.length >= 2) {
    const lo = Number(rec.range[0])
    const hi = Number(rec.range[1])
    const num = Number(value)
    if (!Number.isFinite(num) || !Number.isFinite(lo) || !Number.isFinite(hi)) return false
    return num >= lo && num <= hi
  }
  const num = Number(value)
  if (rec.lt !== undefined) return Number.isFinite(num) ? num < Number(rec.lt) : false
  if (rec.lte !== undefined) return Number.isFinite(num) ? num <= Number(rec.lte) : false
  if (rec.gt !== undefined) return Number.isFinite(num) ? num > Number(rec.gt) : false
  if (rec.gte !== undefined) return Number.isFinite(num) ? num >= Number(rec.gte) : false
  return true
}

function applyTransforms(data: RawDatum[], spec: LineSpec): RawDatum[] {
  const transforms = (spec as { transform?: unknown }).transform
  if (!Array.isArray(transforms)) return data
  let result = data
  transforms.forEach((t) => {
    const filterSpec = (asRecord(t) as { filter?: unknown }).filter
    if (filterSpec === undefined) return
    result = result.filter((row) => shouldKeepRow(row, filterSpec))
  })
  return result
}

async function loadInlineRows(spec: LineSpec): Promise<RawDatum[]> {
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

// ---------------------------------------------------------------------------
// Spec-key — used for idempotent ensureRendered
// ---------------------------------------------------------------------------

function computeSpecKey(spec: ChartSpec): string {
  const subset = {
    data: spec.data ?? null,
    encoding: spec.encoding ?? null,
    layer: spec.layer ?? null,
    mark: spec.mark ?? null,
    transform: (spec as { transform?: unknown }).transform ?? null,
    width: spec.width ?? null,
    height: spec.height ?? null,
  }
  try {
    return JSON.stringify(subset)
  } catch {
    return String(Date.now())
  }
}

// ---------------------------------------------------------------------------
// SimpleLineChartInstance
// ---------------------------------------------------------------------------

export class SimpleLineChartInstance implements ChartInstance {
  readonly chartTypeKey = 'simple-line' as const
  readonly host: HTMLElement

  svg!: d3.Selection<SVGSVGElement, unknown, null, undefined>
  skeleton!: d3.Selection<SVGGElement, unknown, null, undefined>
  annotationLayer!: d3.Selection<SVGGElement, unknown, null, undefined>

  layout: ChartInstanceLayout = { marginLeft: 0, marginTop: 0, plotWidth: 0, plotHeight: 0 }
  xScale!: d3.ScaleTime<number, number> | d3.ScaleLinear<number, number> | d3.ScalePoint<string>
  yScale!: d3.ScaleLinear<number, number>
  xAxisGroup!: d3.Selection<SVGGElement, unknown, null, undefined>
  yAxisGroup!: d3.Selection<SVGGElement, unknown, null, undefined>
  linePath!: d3.Selection<SVGPathElement, unknown, null, undefined>
  pointMarks!: d3.Selection<SVGCircleElement, RenderPoint, SVGGElement, unknown>
  lineGenerator!: LineGenerator
  points: RenderPoint[] = []
  resolvedEncoding: ResolvedEncoding | null = null

  /** When non-null, restricts the line and point selection that ops consider "in scope".
   * `lineGenerator.defined()` checks this so the line skips out-of-scope segments
   * (filtered-out targets create natural gaps). null = full data active. */
  activeTargets: Set<string> | null = null

  /** clipPath id used to constrain marks/line to the plot area. */
  clipPathId = ''

  /** Raw filtered rows from the spec, kept so operation runners can rebuild DatumValue[]
   * via toDatumValuesFromRaw without going through the legacy WeakMap. */
  dataRows: RawDatum[] = []

  private specKey = ''
  private currentSpec: ChartSpec | null = null
  private style: LineStyle = { stroke: '#4f46e5', strokeWidth: 2, pointRadius: 4, showPoints: true }

  private buildPromise: Promise<void> | null = null

  constructor(host: HTMLElement) {
    this.host = host
  }

  // ----- public API -----

  ensureRendered(spec: ChartSpec): boolean {
    const nextKey = computeSpecKey(spec)
    if (nextKey === this.specKey && this.svg && this.host.contains(this.svg.node())) {
      console.info('[operation-new] SimpleLineChartInstance.ensureRendered: NO-OP (specKey match)', {
        specKeyHash: nextKey.length,
      })
      return false
    }
    console.info('[operation-new] SimpleLineChartInstance.ensureRendered: rebuilding', {
      reason: this.specKey === '' ? 'first-build' : nextKey !== this.specKey ? 'spec-changed' : 'svg-detached',
      prevSpecKeyLen: this.specKey.length,
      nextSpecKeyLen: nextKey.length,
    })
    this.specKey = nextKey
    this.currentSpec = spec
    this.buildPromise = this.buildFromSpec(spec)
    return true
  }

  /** Used by the dispatcher entry-point to await the async build that ensureRendered started. */
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
   * Sets the active-target subset that `lineGenerator.defined()` uses to skip
   * out-of-scope segments. Pass `null` to restore the full line. Pure state
   * update — the visual change is applied by the next transition (typically
   * via `transitionChartScale`).
   */
  setActiveTargets(targets: Set<string> | null): void {
    this.activeTargets = targets
  }

  /** Back-compat wrapper around `transitionChartScale`. Prefer that primitive
   * for new code so X/Y/activeTargets stay synchronized in one motion. */
  async rescaleY(newDomain: [number, number]): Promise<void> {
    return this.transitionChartScale({ yDomain: newDomain })
  }

  /** Continuous-X rescale wrapper. Ordinal scales are no-ops. */
  async rescaleX(newDomain: [number, number] | [Date, Date]): Promise<void> {
    return this.transitionChartScale({ xDomain: newDomain })
  }

  /**
   * Op-agnostic scale-transition primitive. Any applier can call this with
   * any subset of {yDomain, xDomain, activeTargets}. Implementation is
   * intentionally simple: domains are mutated synchronously, then each
   * dependent visual (axes, line, points) gets a plain d3 transition that
   * interpolates to the new state via d3's default string/numeric tweens
   * — no `attrTween` machinery. The line keeps its full topology so its
   * `d` attribute interpolates smoothly; out-of-scope segments slide past
   * the plot edges and are hidden by the clip-path.
   */
  async transitionChartScale(opts: {
    yDomain?: [number, number]
    xDomain?: [number, number] | [Date, Date]
    activeTargets?: Set<string> | null
    duration?: number
    ease?: (t: number) => number
  }): Promise<void> {
    if (!this.yScale || !this.xScale) return
    const xType = this.resolvedEncoding?.xType ?? 'nominal'
    const isContinuousX = xType === 'temporal' || xType === 'quantitative'

    const duration = opts.duration ?? DURATIONS.AXIS_RESCALE
    const ease = opts.ease ?? EASINGS.SMOOTH

    // Capture previous domains BEFORE mutation (for change detection).
    const prevYDomain = this.yScale.domain() as [number, number]
    const prevXDomainRaw = isContinuousX ? (this.xScale.domain() as Array<number | Date>) : null

    // Mutate state synchronously so post-call reads of scale see new values.
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
    if (opts.xDomain !== undefined && isContinuousX && prevXDomainRaw) {
      const next = opts.xDomain
      const sameX =
        prevXDomainRaw.length === 2 &&
        (prevXDomainRaw[0] instanceof Date ? (prevXDomainRaw[0] as Date).getTime() : Number(prevXDomainRaw[0])) ===
          (next[0] instanceof Date ? next[0].getTime() : Number(next[0])) &&
        (prevXDomainRaw[1] instanceof Date ? (prevXDomainRaw[1] as Date).getTime() : Number(prevXDomainRaw[1])) ===
          (next[1] instanceof Date ? next[1].getTime() : Number(next[1]))
      if (!sameX) {
        ;(this.xScale as d3.ScaleTime<number, number> | d3.ScaleLinear<number, number>).domain(next as never)
        willChangeX = true
      }
    }
    if (opts.activeTargets !== undefined) {
      // Tracked on the instance so other ops can consult it; not used by
      // the visual transition (line + clip-path naturally handle scope).
      this.activeTargets = opts.activeTargets
    }

    if (!willChangeY && !willChangeX) {
      // No domain change → nothing to animate.
      return
    }

    console.info('[operation-new] SimpleLineChartInstance.transitionChartScale', {
      willChangeY,
      willChangeX,
      yDomainFrom: prevYDomain,
      yDomainTo: this.yScale.domain(),
      activeSize: this.activeTargets?.size ?? null,
    })

    // Recompute the new line path with the now-current scales. Topology stays
    // the same (all points), so d3's default string interpolation produces a
    // smooth morph — no attrTween needed.
    const newPath = this.lineGenerator(this.points) ?? ''

    // X position helper using the (post-mutation) live xScale.
    const xOf = (p: RenderPoint) => {
      if (xType === 'temporal') return (this.xScale as d3.ScaleTime<number, number>)(p.xValue as Date) ?? 0
      if (xType === 'quantitative') return (this.xScale as d3.ScaleLinear<number, number>)(p.xValue as number) ?? 0
      return (this.xScale as d3.ScalePoint<string>)(p.xLabel) ?? 0
    }

    // All sub-transitions share the named slot 'rescale' so they don't fight
    // concurrent transitions on the same selections that target *different*
    // attributes (e.g. salience's opacity fade on pointMarks).
    const TXN = 'rescale'
    const transitions: Promise<void>[] = []

    // Line path — simple `.attr('d', newPath)`. d3 interpolates the d string
    // numerically, sliding each control point from its old position to its
    // new one in lockstep.
    transitions.push(
      this.linePath
        .interrupt(TXN)
        .transition(TXN)
        .duration(duration)
        .ease(ease)
        .attr(SvgAttributes.D, newPath)
        .end()
        .catch(() => {}),
    )

    // Points cy / cx with the live scales.
    if (!this.pointMarks.empty()) {
      const sel = this.pointMarks.interrupt(TXN).transition(TXN).duration(duration).ease(ease)
      if (willChangeY) sel.attr(SvgAttributes.CY, (d) => this.yScale(d.yValue))
      if (willChangeX && isContinuousX) sel.attr(SvgAttributes.CX, (d) => xOf(d))
      transitions.push(sel.end().catch(() => {}))
    }

    // Y axis — `call(axis)` inside a transition makes d3 interpolate ticks.
    if (willChangeY) {
      transitions.push(
        this.yAxisGroup
          .interrupt(TXN)
          .transition(TXN)
          .duration(duration)
          .ease(ease)
          .call(d3.axisLeft(this.yScale).ticks(6))
          .end()
          .catch(() => {}),
      )
      applyAxisTickLabelSize(this.yAxisGroup)
    }

    // X axis — only continuous; ordinal stays put.
    if (willChangeX && isContinuousX) {
      const xAxisFn =
        xType === 'temporal'
          ? d3.axisBottom(this.xScale as d3.ScaleTime<number, number>)
          : d3.axisBottom(this.xScale as d3.ScaleLinear<number, number>)
      transitions.push(
        this.xAxisGroup
          .interrupt(TXN)
          .transition(TXN)
          .duration(duration)
          .ease(ease)
          .call(xAxisFn)
          .end()
          .catch(() => {}),
      )
      applyAxisTickLabelSize(this.xAxisGroup)
    }

    await Promise.all(transitions)
  }

  // ----- build (private) -----

  private async buildFromSpec(spec: ChartSpec) {
    const lineSpec = spec as LineSpec
    clearSimpleLineSplitDomains(this.host)
    const resolved = resolveSimpleLineEncoding(lineSpec)
    if (!resolved) {
      console.warn('[operation-new] simpleLineInstance: missing x/y encoding; skipping render')
      return
    }
    this.resolvedEncoding = resolved
    const rawData = await loadInlineRows(lineSpec)
    const filteredData = applyTransforms(rawData, lineSpec)
    this.dataRows = filteredData
    setSimpleLineStoredData(this.host, filteredData)
    storeRuntimeChartState(this.host, { chartType: ChartType.SIMPLE_LINE, spec: lineSpec, renderer: 'd3' })

    const xLabelMap = buildCategoricalDisplayLabelMap(filteredData, resolved.xField)
    const yMinZero = resolveLineMinZero(lineSpec, resolved)
    const xAxisLabel = resolveAxisTitle(lineSpec, filteredData, 'x')
    const yAxisLabel = resolveAxisTitle(lineSpec, filteredData, 'y')
    this.style = resolveLineStyle(lineSpec)
    const renderEpoch = bumpRenderEpoch(this.host)

    const points: RenderPoint[] = []
    filteredData.forEach((rawRow) => {
      const row = { ...rawRow }
      const rawX = row[resolved.xField]
      const rawY = row[resolved.yField]
      const yValue = Number(rawY)
      if (rawX == null || !Number.isFinite(yValue)) return
      if (resolved.xType === 'quantitative') {
        const num = Number(rawX)
        if (!Number.isFinite(num)) return
        row[resolved.xField] = num
      }
      row[resolved.yField] = yValue
      const normalized = normalizeLineXValue(row[resolved.xField], resolved.xType)
      const identity = normalizeLineIdentifier(row[resolved.xField], resolved.xType)
      points.push({
        row,
        xLabel: normalized.label,
        xDisplayLabel: xLabelMap.get(normalized.label) ?? normalized.label,
        xValue: normalized.value,
        xSort: normalized.sort,
        target: identity.target,
        id: identity.id,
        yValue,
      })
    })

    const xDomainLabels = Array.from(new Set(points.map((p) => p.xLabel)))
    if (resolved.xType === 'temporal' || resolved.xType === 'quantitative') {
      xDomainLabels.sort((a, b) => {
        const aPoint = points.find((p) => p.xLabel === a)
        const bPoint = points.find((p) => p.xLabel === b)
        return Number(aPoint?.xSort ?? 0) - Number(bPoint?.xSort ?? 0)
      })
    } else {
      const sortOrder = resolveSortSpec(lineSpec, resolved)
      const ordered = applyDiscreteSortOrder(xDomainLabels, sortOrder)
      xDomainLabels.splice(0, xDomainLabels.length, ...ordered)
    }
    const xSortIndex = new Map(xDomainLabels.map((label, index) => [label, index]))

    const yValues = points.map((p) => p.yValue)
    const minRaw = d3.min(yValues)
    const maxRaw = d3.max(yValues)
    let domainMin = Number.isFinite(minRaw as number) ? (minRaw as number) : 0
    let domainMax = Number.isFinite(maxRaw as number) ? (maxRaw as number) : 1
    if (yMinZero) {
      domainMin = Math.min(domainMin, 0)
      domainMax = Math.max(domainMax, 0)
    }
    if (domainMin === domainMax) domainMax = domainMin + 1
    const temporalTickFormatter = createTemporalTickFormatter(
      points.map((p) => p.xValue).filter((v): v is Date | number => v instanceof Date || typeof v === 'number'),
    )
    const sorted = points.slice().sort((a, b) => {
      if (resolved.xType === 'temporal' || resolved.xType === 'quantitative') {
        return Number(a.xSort) - Number(b.xSort)
      }
      return (xSortIndex.get(a.xLabel) ?? 0) - (xSortIndex.get(b.xLabel) ?? 0)
    })
    this.points = sorted

    const initialLayout = resolveLayoutModel({ container: this.host, chartType: ChartType.SIMPLE_LINE, spec: lineSpec })

    // Multi-pass measurement is reused from the existing renderer here so that
    // axis-title overflow is corrected before the chart settles. This still
    // honours the "no flicker during ops" invariant because `ensureRendered`
    // is idempotent — multi-pass only runs on the first build for a given
    // spec, not on each op call.
    renderWithMeasuredLayout(this.host, initialLayout, (passLayout) =>
      this.renderPass(passLayout, {
        resolved,
        sorted,
        xDomainLabels,
        xLabelMap,
        temporalTickFormatter,
        domainMin,
        domainMax,
        renderEpoch,
        xAxisLabel,
        yAxisLabel,
      }),
    )
  }

  // -------------------------------------------------------------------------
  // renderPass — builds the full SVG/skeleton from a layout. Invoked once or
  // multiple times by renderWithMeasuredLayout when axis-title overflow is
  // detected. Each call replaces the SVG entirely (consistent with the
  // existing renderers) and reassigns the instance's cached selections.
  // -------------------------------------------------------------------------
  private renderPass(
    layout: LayoutModel,
    ctx: {
      resolved: ResolvedEncoding
      sorted: RenderPoint[]
      xDomainLabels: string[]
      xLabelMap: Map<string, string>
      temporalTickFormatter: (value: Date | d3.NumberValue) => string
      domainMin: number
      domainMax: number
      renderEpoch: number
      xAxisLabel: string | null
      yAxisLabel: string | null
    },
  ) {
    const { resolved, sorted, xDomainLabels, xLabelMap, temporalTickFormatter, domainMin, domainMax, renderEpoch, xAxisLabel, yAxisLabel } =
      ctx
    const margin = layout.padding
    const plotW = layout.plot.width
    const plotH = layout.plot.height
    // resolveLayoutModel can return a canvas size that doesn't fully contain
    // the plot when plotHeight was bumped to minPlotHeight (line canvasHeight
    // uses defaultPlotHeight regardless). Stretch the canvas to fit so content
    // does not overflow the SVG viewport.
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
      .attr(DataAttributes.ColorField, resolved.colorField ?? null)
      .style('overflow', 'visible') as d3.Selection<SVGSVGElement, unknown, null, undefined>

    this.svg = nextSvg
    writeTooltipRootAttrs(nextSvg, {
      xLabel: xAxisLabel ?? resolved.xField,
      yLabel: yAxisLabel ?? resolved.yField,
      groupLabel: null,
    })

    // ----- Plot-area clip-path: keeps line + points visually constrained to
    // the plot rectangle so smooth axis transitions don't spill content into
    // the surrounding margins (axes / labels). Unique id per render epoch to
    // avoid collisions across rebuilds.
    const clipPathId = `plot-clip-${renderEpoch}`
    this.clipPathId = clipPathId
    nextSvg
      .append('defs')
      .append('clipPath')
      .attr('id', clipPathId)
      .attr(
        'clipPathUnits',
        'userSpaceOnUse',
      )
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
    const xScale = (() => {
      if (resolved.xType === 'temporal') {
        const timestamps = sorted
          .map((p) => (p.xValue instanceof Date ? p.xValue.getTime() : NaN))
          .filter(Number.isFinite)
        const minX = d3.min(timestamps) ?? Date.now()
        const maxX = d3.max(timestamps) ?? minX + 1
        return d3.scaleTime().domain([new Date(minX), new Date(maxX)]).range([0, plotW])
      }
      if (resolved.xType === 'quantitative') {
        const numbers = sorted.map((p) => (typeof p.xValue === 'number' ? p.xValue : NaN)).filter(Number.isFinite)
        let minX = d3.min(numbers) ?? 0
        let maxX = d3.max(numbers) ?? minX + 1
        if (minX === maxX) maxX = minX + 1
        return d3.scaleLinear().domain([minX, maxX]).range([0, plotW])
      }
      return d3.scalePoint<string>().domain(xDomainLabels).range([0, plotW]).padding(0.5)
    })()
    const yScale = d3.scaleLinear().domain([domainMin, domainMax]).nice().range([plotH, 0])
    this.xScale = xScale
    this.yScale = yScale

    // ----- X axis -----
    const xAxis =
      resolved.xType === 'temporal'
        ? d3.axisBottom(xScale as d3.ScaleTime<number, number>).tickFormat(temporalTickFormatter)
        : resolved.xType === 'quantitative'
          ? d3.axisBottom(xScale as d3.ScaleLinear<number, number>)
          : d3.axisBottom(xScale as d3.ScalePoint<string>).tickFormat(categoricalTickFormatter(xLabelMap))

    const xAxisGroup = skeleton
      .append(SvgElements.Group)
      .attr(SvgAttributes.Class, SvgClassNames.XAxis)
      .attr(SvgAttributes.Transform, `translate(0,${plotH})`)
      .call(xAxis) as d3.Selection<SVGGElement, unknown, null, undefined>
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
      .call(d3.axisLeft(yScale).ticks(6)) as d3.Selection<SVGGElement, unknown, null, undefined>
    applyAxisTickLabelSize(yAxisGroup)
    this.yAxisGroup = yAxisGroup

    // ----- Resolve x of a render point against the current scale -----
    const resolveX = (point: RenderPoint) => {
      if (resolved.xType === 'temporal') return (xScale as d3.ScaleTime<number, number>)(point.xValue as Date) ?? 0
      if (resolved.xType === 'quantitative') return (xScale as d3.ScaleLinear<number, number>)(point.xValue as number) ?? 0
      return (xScale as d3.ScalePoint<string>)(point.xLabel) ?? 0
    }
    // Line generator connects ALL points (no `.defined()` gap). Out-of-scope
    // segments are hidden naturally by the plot-area clip-path when their
    // points slide outside the rescaled axis. This keeps the path topology
    // stable so `.attr('d', newPath)` interpolates smoothly via d3's default
    // string interpolation — no attrTween / scale-interpolation gymnastics
    // needed.
    this.lineGenerator = d3
      .line<RenderPoint>()
      .x((p) => resolveX(p))
      .y((p) => yScale(p.yValue))

    // ----- Line path (clip-path constrains it to the plot rectangle) -----
    this.linePath = skeleton
      .append(SvgElements.Path)
      .datum(sorted)
      .attr(SvgAttributes.Class, 'line-path')
      .attr('clip-path', `url(#${clipPathId})`)
      .attr(SvgAttributes.D, this.lineGenerator(sorted) ?? '')
      .attr(SvgAttributes.Fill, 'none')
      .attr(SvgAttributes.Stroke, this.style.stroke)
      .attr(SvgAttributes.StrokeWidth, this.style.strokeWidth) as d3.Selection<
      SVGPathElement,
      unknown,
      null,
      undefined
    >

    // ----- Point marks (clip-path on the group; data-* attrs preserved) -----
    if (this.style.showPoints) {
      const marksGroup = skeleton
        .append(SvgElements.Group)
        .attr(SvgAttributes.Class, 'point-marks')
        .attr('clip-path', `url(#${clipPathId})`)
      this.pointMarks = marksGroup
        .selectAll<SVGCircleElement, RenderPoint>(SvgElements.Circle)
        .data(sorted)
        .join(SvgElements.Circle)
        .attr(SvgAttributes.CX, (p) => resolveX(p))
        .attr(SvgAttributes.CY, (p) => yScale(p.yValue))
        .attr(SvgAttributes.R, this.style.pointRadius)
        .attr(SvgAttributes.Fill, this.style.stroke)
        .attr(SvgAttributes.Opacity, 0.85)
        .attr(DataAttributes.Target, (p) => p.target)
        .attr(DataAttributes.Id, (p) => p.id)
        .attr(DataAttributes.Value, (p) => String(p.yValue))
        .attr(DataAttributes.XValue, (p) => p.xDisplayLabel)
        .attr(DataAttributes.YValue, (p) => formatTooltipValue(p.yValue)) as d3.Selection<
        SVGCircleElement,
        RenderPoint,
        SVGGElement,
        unknown
      >
    } else {
      this.pointMarks = skeleton.selectAll<SVGCircleElement, RenderPoint>(SvgElements.Circle)
    }

    // ----- Annotation layer (created once per build; appended AFTER skeleton
    // so it naturally renders on top without needing .raise()). -----
    this.annotationLayer = nextSvg
      .append(SvgElements.Group)
      .attr(
        SvgAttributes.Class,
        `${SvgClassNames.AnnotationLayer} operation-next-annotation-layer`,
      ) as d3.Selection<SVGGElement, unknown, null, undefined>

    // ----- Axis title labels -----
    // Reuse the layout's title positions when they're still valid; fall back
    // to corrected positions when the canvas was stretched above to fit the
    // plot. The renderWithMeasuredLayout helper will rerun the pass if either
    // title ends up overflowing.
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

/**
 * Returns the existing simple-line ChartInstance attached to `host` if one
 * exists with a matching specKey (no-op); otherwise tears down stale state and
 * builds a new instance.
 *
 * The caller MUST `await instance.waitForBuild()` after calling this to ensure
 * the SVG has been mounted before reading any state (e.g. annotation layer).
 */
export function ensureSimpleLineChartInstance(
  host: HTMLElement,
  spec: ChartSpec,
): SimpleLineChartInstance {
  const existing = getAttachedInstance(host)
  if (existing && existing.chartTypeKey === 'simple-line') {
    const instance = existing as SimpleLineChartInstance
    instance.ensureRendered(spec)
    return instance
  }
  const instance = new SimpleLineChartInstance(host)
  attachInstance(host, instance)
  instance.ensureRendered(spec)
  return instance
}

// Avoid unused-export warning for the type used by appliers.
export type { ResolvedEncoding, RenderPoint }

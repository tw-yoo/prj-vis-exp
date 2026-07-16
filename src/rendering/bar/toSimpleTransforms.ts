import * as d3 from 'd3'
import type { JsonObject, JsonValue } from '../../types'
import { ChartType } from '../../domain/chart'
import { renderSimpleBarChart, type SimpleBarSpec, setSimpleBarStoredData } from './simpleBarRenderer'
import { getGroupedBarStoredData, type GroupedSpec } from './groupedBarRenderer'
import { getStackedBarStoredData, type StackedSpec } from './stackedBarRenderer'
import { storeDerivedChartState } from '../utils/derivedChartState'
import { storeRuntimeChartState } from '../utils/runtimeChartState'
import { DataAttributes } from '../interfaces'
import { NON_SPLIT_EXIT_MS, NON_SPLIT_UPDATE_MS } from '../draw/animationPolicy'

type RawDatum = JsonObject
type SimpleSurfaceDatum = {
  target: string
  displayTarget: string
  value: number
  group?: string | null
}

function getLiveSvg(container: HTMLElement) {
  return container.querySelector('svg')
}

function isNodeHidden(node: Element) {
  const attrDisplay = (node.getAttribute('display') ?? '').trim().toLowerCase()
  if (attrDisplay === 'none') return true
  const styleDisplay = ((node as HTMLElement | SVGElement).style?.display ?? '').trim().toLowerCase()
  return styleDisplay === 'none'
}

function pruneHiddenSvgNodes(container: HTMLElement) {
  const svg = getLiveSvg(container)
  if (!svg) return
  Array.from(svg.querySelectorAll('*')).forEach((node) => {
    if (!isNodeHidden(node)) return
    node.remove()
  })
}

function normalizeSimpleBarDom(container: HTMLElement) {
  const svg = getLiveSvg(container)
  if (!svg) return

  svg.removeAttribute(DataAttributes.ColorField)
  svg.removeAttribute(DataAttributes.GroupLabel)
  svg.removeAttribute(DataAttributes.FacetField)

  Array.from(svg.querySelectorAll<SVGElement>('rect, path')).forEach((mark) => {
    if (isNodeHidden(mark)) {
      mark.remove()
      return
    }
    const target = (mark.getAttribute(DataAttributes.Target) ?? mark.getAttribute(DataAttributes.Id) ?? '').trim()
    if (!target) return
    mark.setAttribute(DataAttributes.Target, target)
    mark.setAttribute(DataAttributes.Id, target)
    mark.removeAttribute(DataAttributes.Series)
    mark.removeAttribute(DataAttributes.GroupValue)
  })
}

function finalizeSimpleBarHandoff(container: HTMLElement, spec: SimpleBarSpec, rows: RawDatum[]) {
  const svg = getLiveSvg(container)
  pruneHiddenSvgNodes(container)
  normalizeSimpleBarDom(container)
  if (svg) {
    svg.setAttribute(DataAttributes.XField, spec.encoding.x.field)
    svg.setAttribute(DataAttributes.YField, spec.encoding.y.field)
  }
  setSimpleBarStoredData(container, rows)
  storeRuntimeChartState(container, { chartType: ChartType.SIMPLE_BAR, spec, renderer: 'd3' })
  storeDerivedChartState(container, ChartType.SIMPLE_BAR, spec)
}

function cloneRows(rows: RawDatum[]) {
  return rows.map((row) => ({ ...row }))
}

function hasValues(data: unknown): data is { values?: JsonValue[] } {
  return !!data && typeof data === 'object' && 'values' in data
}

function isRawDatum(value: JsonValue): value is RawDatum {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function resolveDataset(stored: RawDatum[], specData: unknown) {
  if (stored && stored.length) {
    return cloneRows(stored)
  }
  if (!hasValues(specData)) {
    return []
  }
  const values = specData.values ?? []
  const normalized = values.filter(isRawDatum).map((value) => ({ ...value }))
  return normalized
}

function resolveSeriesColor(rows: RawDatum[], seriesField: string, seriesValue: string | number) {
  const seriesKey = String(seriesValue)
  for (const row of rows) {
    if (row == null) continue
    if (String(row[seriesField] ?? '') !== seriesKey) continue
    const fill = row.__fill
    if (typeof fill === 'string') {
      const trimmed = fill.trim()
      if (trimmed.length > 0 && trimmed.toLowerCase() !== 'none') return trimmed
    }
  }
  return null
}

function resolveSeriesColorFromRenderedMarks(container: HTMLElement, seriesValue: string | number) {
  const seriesKey = String(seriesValue)
  const marks = container.querySelectorAll<SVGElement>('svg [data-series]')
  for (const mark of Array.from(marks)) {
    const markSeries = mark.getAttribute('data-series')
    if (markSeries == null || String(markSeries) !== seriesKey) continue
    const fill = (mark.getAttribute('fill') ?? '').trim()
    if (fill.length > 0 && fill.toLowerCase() !== 'none' && fill.toLowerCase() !== 'transparent') return fill
    const stroke = (mark.getAttribute('stroke') ?? '').trim()
    if (stroke.length > 0 && stroke.toLowerCase() !== 'none' && stroke.toLowerCase() !== 'transparent') return stroke
  }
  return null
}

function normalizeSimpleSurfaceRows(rows: SimpleSurfaceDatum[], yField: string, xField: string) {
  return rows.map((row) => ({
    [xField]: row.target,
    [yField]: row.value,
    target: row.target,
    displayTarget: row.displayTarget,
    name: row.displayTarget,
    value: row.value,
    group: row.group ?? null,
  })) as RawDatum[]
}

function simpleAxisLabelsFromSpec(spec: GroupedSpec | StackedSpec) {
  const axisLabelsMeta = (spec as { meta?: { axisLabels?: { x?: JsonValue; y?: JsonValue } } }).meta?.axisLabels ?? {}
  return {
    x: axisLabelsMeta.x ?? spec.encoding.x.field,
    y: axisLabelsMeta.y ?? spec.encoding.y.field,
  }
}

export async function renderBarSelectionAsSimpleSurface(
  container: HTMLElement,
  spec: GroupedSpec | StackedSpec,
  rows: SimpleSurfaceDatum[],
): Promise<SimpleBarSpec | null> {
  if (!rows.length) return null
  const yField = spec.encoding.y.field
  const yType = spec.encoding.y.type
  const xField = '__surface_target__'
  const normalizedRows = normalizeSimpleSurfaceRows(rows, yField, xField)
  const axisLabels = simpleAxisLabelsFromSpec(spec)
  const baseMeta = ((spec as { meta?: Record<string, unknown> }).meta ?? {}) as Record<string, unknown>
  const baseAxisLabels = (baseMeta.axisLabels as Record<string, JsonValue> | undefined) ?? {}
  const simpleSpec: SimpleBarSpec = {
    ...spec,
    mark: 'bar',
    data: { values: normalizedRows },
    encoding: {
      x: {
        field: xField,
        type: 'nominal',
        sort: normalizedRows.map((row) => String(row[xField] ?? '')),
      },
      y: {
        field: yField,
        type: yType,
      },
    },
    meta: {
      ...baseMeta,
      axisLabels: {
        ...baseAxisLabels,
        x: axisLabels.x,
        y: axisLabels.y,
      },
    },
  }

  const simpleAny = simpleSpec as unknown as Record<string, unknown>
  delete simpleAny.facet
  delete simpleAny.spec
  delete simpleAny.repeat
  const encAny = simpleAny.encoding as Record<string, unknown>
  delete encAny.color
  delete encAny.column
  delete encAny.row
  delete encAny.xOffset
  delete encAny.yOffset

  await renderSimpleBarChart(container, simpleSpec)
  setSimpleBarStoredData(container, normalizedRows)
  storeRuntimeChartState(container, { chartType: ChartType.SIMPLE_BAR, spec: simpleSpec, renderer: 'd3' })
  storeDerivedChartState(container, ChartType.SIMPLE_BAR, simpleSpec)
  return simpleSpec
}

function setBarMarkColor(spec: SimpleBarSpec, color: string | null) {
  if (!color) return spec
  const mark = spec.mark
  if (!mark) return { ...spec, mark: { type: 'bar', color } }
  if (typeof mark === 'string') return { ...spec, mark: { type: mark, color } }
  if (typeof mark === 'object' && mark !== null) {
    return { ...spec, mark: { ...(mark as Record<string, JsonValue>), color } }
  }
  return spec
}

function toSimpleBarSpec(
  spec: GroupedSpec | StackedSpec,
  rows: RawDatum[],
  seriesField: string,
  seriesValue: string | number,
  options: {
    xField: string
    xType: string
    yField: string
    yType: string
    baseAxis?: JsonValue
    baseSort?: JsonValue
    explicitColor?: string | null
  },
) {
  const filtered = rows.filter((row) => String(row?.[seriesField] ?? '') === String(seriesValue))

  const encoding: SimpleBarSpec['encoding'] = {
    x: {
      field: options.xField,
      type: options.xType,
      ...(options.baseSort !== undefined ? { sort: options.baseSort } : {}),
    },
    y: {
      field: options.yField,
      type: options.yType,
    },
  }
  if (options.baseAxis !== undefined) {
    ;(encoding.x as Record<string, JsonValue>).axis = options.baseAxis
  }

  const next: SimpleBarSpec = {
    ...spec,
    mark: 'bar',
    data: { values: filtered },
    encoding,
  }

  // Remove grouped/stacked hints that could confuse type inference or alter layout.
  const nextAny = next as unknown as Record<string, unknown>
  delete nextAny.facet
  delete nextAny.repeat
  // Explicit canvas sizes inherited from the source spec (split orchestration
  // injects per-panel width/height) would pin the derived chart to the OLD
  // chart's canvas — e.g. a 140px-wide faceted panel becomes a 240px-min
  // simple-bar canvas that CSS then stretches across the host with blown-up
  // typography. The derived chart should size to its live container like any
  // fresh render.
  delete nextAny.width
  delete nextAny.height

  const encAny = nextAny.encoding as Record<string, unknown>
  delete encAny.color
  delete encAny.column
  delete encAny.row
  delete encAny.xOffset
  delete encAny.yOffset
  if (typeof encAny.y === 'object' && encAny.y && 'stack' in (encAny.y as Record<string, unknown>)) {
    delete (encAny.y as Record<string, unknown>).stack
  }

  const color = options.explicitColor ?? resolveSeriesColor(rows, seriesField, seriesValue)
  return setBarMarkColor(next, color)
}

async function animateStackedToSimple(
  container: HTMLElement,
  targetSeries: string,
  maxValue: number,
): Promise<void> {
  const svg = container.querySelector('svg')
  if (!svg) return

  const svgSel = d3.select<SVGSVGElement, unknown>(svg as SVGSVGElement)
  const mLeft = parseFloat(svg.getAttribute('data-m-left') ?? '0')
  const mTop = parseFloat(svg.getAttribute('data-m-top') ?? '0')
  const plotH = parseFloat(svg.getAttribute('data-plot-h') ?? '0')

  // Phase 1: fade non-target bars
  svgSel.selectAll<SVGRectElement, unknown>('rect.main-bar')
    .filter(function () {
      return (this.getAttribute('data-series') ?? '') !== targetSeries
    })
    .transition()
    .duration(NON_SPLIT_EXIT_MS)
    .attr('opacity', 0.08)

  type BarInfo = { el: SVGRectElement; x: number; y: number; width: number; height: number; value: number }
  const barInfos: BarInfo[] = []

  svgSel.selectAll<SVGRectElement, unknown>('rect.main-bar')
    .filter(function () {
      return (this.getAttribute('data-series') ?? '') === targetSeries
    })
    .each(function () {
      barInfos.push({
        el: this,
        x: parseFloat(this.getAttribute('x') ?? '0'),
        y: parseFloat(this.getAttribute('y') ?? '0'),
        width: parseFloat(this.getAttribute('width') ?? '0'),
        height: parseFloat(this.getAttribute('height') ?? '0'),
        value: parseFloat(this.getAttribute('data-value') ?? '0'),
      })
    })
    .attr('opacity', 0)

  if (!barInfos.length) return

  const overlay = svgSel.append('g').attr('class', 'stacked-to-simple-overlay')

  // Clone target bars into overlay at absolute SVG positions (bars are in g.translate(mLeft, mTop))
  const clones = overlay.selectAll<SVGRectElement, BarInfo>('rect')
    .data(barInfos)
    .enter()
    .append('rect')
    .attr('fill', (d) => d3.select(d.el).attr('fill') ?? '')
    .attr('opacity', 1)
    .attr('x', (d) => mLeft + d.x)
    .attr('y', (d) => mTop + d.y)
    .attr('width', (d) => d.width)
    .attr('height', (d) => d.height)

  // Phase 2: animate bars to simple bar proportional heights (dramatic growth effect)
  const moveTransition = clones
    .transition()
    .delay(NON_SPLIT_EXIT_MS * 0.6)
    .duration(NON_SPLIT_UPDATE_MS)
    .ease(d3.easeCubicInOut)
    .attr('height', (d) => {
      const simpleH = maxValue > 0 ? (d.value / maxValue) * plotH : d.height
      return Math.max(1, simpleH)
    })
    .attr('y', (d) => {
      const simpleH = maxValue > 0 ? (d.value / maxValue) * plotH : d.height
      return mTop + plotH - Math.max(1, simpleH)
    })

  await moveTransition.end().catch(() => { /* ignore if interrupted */ })

  overlay.remove()
}

export async function convertStackedToSimple(
  container: HTMLElement,
  spec: StackedSpec,
  toSimple: { series: string | number; yDomain?: [number, number] },
): Promise<SimpleBarSpec | null> {
  console.log('[convertStackedToSimple] called', { series: toSimple.series, yDomain: toSimple.yDomain, containerId: container.getAttribute('data-surface-id') })
  const values = resolveDataset(getStackedBarStoredData(container) as RawDatum[], spec.data)
  console.log('[convertStackedToSimple] dataset', { rowCount: values.length, colorField: spec.encoding.color?.field })
  if (!values.length) {
    console.warn('stacked-to-simple: no dataset available to hand off simple bar chart state')
    return null
  }
  const seriesField = spec.encoding.color?.field
  if (!seriesField) {
    console.warn('stacked-to-simple: stacked chart is missing a color/group field')
    return null
  }
  const xField = spec.encoding.x.field
  const yField = spec.encoding.y.field
  const xType = spec.encoding.x.type
  const yType = spec.encoding.y.type
  const baseAxis = (spec.encoding.x as Record<string, JsonValue>).axis
  const baseSort = (spec.encoding.x as Record<string, JsonValue>).sort
  const explicitColor =
    resolveSeriesColor(values, seriesField, toSimple.series) ?? resolveSeriesColorFromRenderedMarks(container, toSimple.series)

  const simple = toSimpleBarSpec(spec, values, seriesField, toSimple.series, {
    xField,
    xType,
    yField,
    yType,
    baseAxis,
    baseSort,
    explicitColor,
  })

  if (toSimple.yDomain) {
    ;(simple.encoding.y as Record<string, JsonValue>).scale = { domain: toSimple.yDomain as unknown as JsonValue }
  }

  const maxValue = toSimple.yDomain ? toSimple.yDomain[1] : 0
  await animateStackedToSimple(container, String(toSimple.series), maxValue)
  await renderSimpleBarChart(container, simple)
  finalizeSimpleBarHandoff(container, simple, (simple.data?.values as RawDatum[] | undefined) ?? [])
  return simple
}

/**
 * The RENDERED y domain of the live chart, read from its y-axis tick labels
 * (the ground truth after any `nice()` rounding). Faceted grouped charts share
 * one y domain across panels, so the first y-axis found is representative.
 * Returns `null` when the ticks aren't plain numbers (e.g. SI-suffixed).
 */
function readRenderedYDomain(container: HTMLElement): [number, number] | null {
  const svg = getLiveSvg(container)
  if (!svg) return null
  const ticks = Array.from(svg.querySelectorAll('.y-axis .tick text'))
    .map((t) => Number(String(t.textContent ?? '').replace(/,/g, '')))
    .filter(Number.isFinite)
  if (ticks.length < 2) return null
  const max = Math.max(...ticks)
  const min = Math.min(...ticks)
  if (!(max > min)) return null
  return [Math.min(0, min), max]
}

export async function convertGroupedToSimple(
  container: HTMLElement,
  spec: GroupedSpec,
  toSimple: { series: string | number },
): Promise<SimpleBarSpec | null> {
  const values = resolveDataset(getGroupedBarStoredData(container) as RawDatum[], spec.data)
  if (!values.length) {
    console.warn('grouped-to-simple: no dataset available to hand off simple bar chart state')
    return null
  }
  console.info('[grouped-to-simple] converting', {
    series: toSimple.series,
    rowCount: values.length,
    surfaceId: container.closest('[data-surface-id]')?.getAttribute('data-surface-id') ?? null,
  })

  const encodingAny = spec.encoding as unknown as Record<string, any>
  const xOffsetField = typeof encodingAny.xOffset?.field === 'string' ? (encodingAny.xOffset.field as string) : null
  const seriesField = xOffsetField ?? spec.encoding.color?.field
  if (!seriesField) {
    console.warn('grouped-to-simple: grouped chart is missing a series field (color or xOffset)')
    return null
  }

  const xDef = spec.encoding.x
  const yDef = spec.encoding.y
  const yField = yDef.field
  const yType = yDef.type

  const baseAxis = (xDef as Record<string, JsonValue>).axis
  const baseSort = (xDef as Record<string, JsonValue>).sort
  const explicitColor = resolveSeriesColor(values, seriesField, toSimple.series) ?? resolveSeriesColorFromRenderedMarks(container, toSimple.series)

  // If x encodes the series itself (common faceted grouped pattern), promote facet field to x.
  const columnField = spec.encoding.column?.field
  const rowField = spec.encoding.row?.field
  const facetField = (columnField && columnField !== seriesField ? columnField : null) ?? (rowField && rowField !== seriesField ? rowField : null)

  const resolvedXField = xDef.field === seriesField && facetField ? facetField : xDef.field
  const resolvedXType =
    resolvedXField === columnField
      ? (spec.encoding.column?.type ?? xDef.type)
      : resolvedXField === rowField
        ? (spec.encoding.row?.type ?? xDef.type)
        : xDef.type

  const simple = toSimpleBarSpec(spec, values, seriesField, toSimple.series, {
    xField: resolvedXField,
    xType: resolvedXType,
    yField,
    yType,
    baseAxis,
    baseSort,
    explicitColor,
  })
  if (!((simple.data?.values as RawDatum[] | undefined)?.length)) {
    console.warn('grouped-to-simple: series has no rows to convert', { series: toSimple.series })
    return null
  }

  // Preserve the source chart's rendered y scale: the conversion changes the
  // x LAYOUT only, so the y axis must not rescale (no flicker, bars keep their
  // heights mid-transition) — and on a split surface the sibling panel keeps
  // the same scale, so a later cross-surface diff still reads as a real
  // vertical gap instead of two near-identical line heights.
  const renderedYDomain = readRenderedYDomain(container)
  if (renderedYDomain) {
    ;(simple.encoding.y as Record<string, JsonValue>).scale = {
      domain: renderedYDomain as unknown as JsonValue,
    }
  }

  const swapped = await animatedGroupedToSimpleSwap(container, String(toSimple.series), simple)
  if (!swapped) {
    await renderSimpleBarChart(container, simple)
  }

  finalizeSimpleBarHandoff(container, simple, (simple.data?.values as RawDatum[] | undefined) ?? [])
  return simple
}

/**
 * Animated grouped→simple handoff, built as a VISUAL BRIDGE over a normal
 * re-render rather than a DOM adoption:
 *
 *   1. Snapshot the kept series' bars (screen rect + fill) and clone them into
 *      a pixel-space overlay pinned on the container, hiding the originals in
 *      the same frame (pixel-identical takeover).
 *   2. Dissolve the old chart under the overlay — vacated series, per-panel
 *      axes, facet titles, legend all fade as one.
 *   3. Re-render the simple chart through the ORDINARY renderer path (so it
 *      gets exactly the sizing/typography any chart rendered into this host
 *      gets), revealed at opacity 0.
 *   4. Glide the overlay clones onto the new bars' measured screen rects while
 *      the new chart fades in beneath them, then drop the overlay.
 *
 * Measuring both endpoints on REAL rendered charts sidesteps every staged-
 * layout pitfall (transient flex boxes, viewBox-vs-CSS scale mismatches).
 *
 * Handles both grouped shapes: facet-promoted x (old panel `data-chart-id` →
 * new bar `data-target`) and plain grouped (old `data-target` → new
 * `data-target`).
 *
 * @returns `false` when the bridge can't be set up (no live SVG / no matching
 *   bars) — the caller then falls back to a direct re-render.
 */
const G2S_OVERLAY_CLASS = 'grouped-to-simple-overlay-host'

/**
 * Re-apply the split shared-y-axis policy to a freshly rendered chart.
 * `applySplitSharedYAxisPolicy` stamps `sharedYAxisHidden` on the surface HOST
 * at split time and hides/compacts the SVG that existed then — a chart-type
 * conversion replaces that SVG, so the fresh one must re-hide its y axis and
 * reclaim the gutter to match how simple-bar splits render (y axis on the
 * left panel only). Mirrors `compactSharedYAxisSurface`
 * (operation-next/splitSurfaceVisuals.ts) for the single-plot-group case; the
 * arch boundary keeps rendering/ from importing it directly.
 */
function reapplySharedYAxisHiddenPolicy(container: HTMLElement, svg: SVGSVGElement): boolean {
  if (container.dataset.sharedYAxisHidden !== 'true') return false
  svg.querySelectorAll<SVGElement>('.y-axis, .y-axis-label').forEach((node) => {
    node.style.display = 'none'
    node.setAttribute('aria-hidden', 'true')
  })
  const marginLeft = Number(svg.getAttribute(DataAttributes.MarginLeft) ?? 0)
  if (!Number.isFinite(marginLeft) || marginLeft <= 0) return false
  const plotGroup = svg.querySelector('g')
  if (!plotGroup) return false
  const t = /translate\(\s*([-+\d.]+)(?:[,\s]+([-+\d.]+))?\s*\)/.exec(
    plotGroup.getAttribute('transform') ?? '',
  )
  const gx = t ? Number(t[1]) || 0 : marginLeft
  const gy = t ? Number(t[2]) || 0 : 0
  const offset = Math.min(marginLeft, gx)
  if (!(offset > 0)) return false
  plotGroup.setAttribute('transform', `translate(${gx - offset},${gy})`)
  const xTitle = svg.querySelector<SVGElement>('.x-axis-label')
  if (xTitle) {
    const x = Number(xTitle.getAttribute('x'))
    if (Number.isFinite(x)) xTitle.setAttribute('x', String(x - offset))
  }
  // Shrink the viewBox by the reclaimed gutter so the plot fills the panel
  // instead of leaving a blank strip on the right.
  const vb = (svg.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number)
  if (vb.length === 4 && vb.every(Number.isFinite) && vb[2] - offset > 0) {
    svg.setAttribute('viewBox', `${vb[0]} ${vb[1]} ${vb[2] - offset} ${vb[3]}`)
  }
  svg.setAttribute(DataAttributes.MarginLeft, String(Math.max(0, marginLeft - offset)))
  svg.setAttribute('data-shared-y-axis-compacted', 'true')
  svg.setAttribute('data-shared-y-axis-compact-offset', String(offset))
  return true
}

/**
 * Rebalance the split panels so both render at the same pixels-per-viewBox
 * scale (the shared-axis policy's invariant: flex-grow ∝ content viewBox
 * width). Without this, shrinking one panel's viewBox (reclaimed y-axis
 * gutter) zooms its bars relative to the neighbor's. Only SURFACE hosts are
 * touched — the hidden split-source pivot and the legend strip keep their
 * styles.
 */
function rebalanceSplitFlexByViewBox(container: HTMLElement) {
  const wrapper = container.closest<HTMLElement>('.surface-layout--split')
  if (!wrapper) return
  Array.from(wrapper.children).forEach((child) => {
    if (!(child instanceof HTMLElement)) return
    if (!child.getAttribute('data-surface-id')) return
    if (getComputedStyle(child).display === 'none') return
    const childSvg = child.querySelector<SVGSVGElement>('svg[data-render-epoch]')
    const childVb = childSvg?.viewBox?.baseVal
    if (!childVb || !(childVb.width > 0)) return
    child.style.flex = `${childVb.width / 1000} 1 0`
    child.dataset.splitFlexManaged = 'true'
  })
}

async function animatedGroupedToSimpleSwap(
  container: HTMLElement,
  targetSeries: string,
  simple: SimpleBarSpec,
): Promise<boolean> {
  const oldSvg = getLiveSvg(container) as SVGSVGElement | null
  if (!oldSvg) return false

  const oldXField = oldSvg.getAttribute(DataAttributes.XField)
  const promoted = simple.encoding.x.field !== oldXField

  // Snapshot the kept series' bars, keyed by the value that becomes the simple
  // bar's x category: the facet/panel id when the facet field was promoted to
  // x, otherwise the bar's own target.
  const containerRect = container.getBoundingClientRect()
  if (!(containerRect.width > 4) || !(containerRect.height > 4)) return false
  type Snap = { left: number; top: number; width: number; height: number; fill: string; el: SVGRectElement }
  const snaps = new Map<string, Snap>()
  oldSvg.querySelectorAll<SVGRectElement>('rect.main-bar').forEach((bar) => {
    const series = bar.getAttribute('data-series') ?? bar.getAttribute('data-group-value') ?? ''
    if (series !== targetSeries) return
    const key = promoted
      ? (bar.getAttribute('data-chart-id') ?? '')
      : (bar.getAttribute(DataAttributes.Target) ?? '')
    if (!key) return
    const rect = bar.getBoundingClientRect()
    snaps.set(key, {
      left: rect.left - containerRect.left,
      top: rect.top - containerRect.top,
      width: rect.width,
      height: rect.height,
      fill: bar.getAttribute('fill') ?? '#69b3a2',
      el: bar,
    })
  })
  if (snaps.size === 0) return false

  if (window.getComputedStyle(container).position === 'static') {
    container.style.position = 'relative'
  }

  // Lock the container's box for the duration of the swap. The surface host
  // often sits in a fit-content ancestor chain (flex-basis 0 host → split
  // wrapper → card) whose width is ultimately derived from the chart SVG
  // itself — removing the old SVG collapses the whole chain to ~0, and the
  // re-render's measure passes then resolve a degenerate 240×300 default
  // canvas. A min-width/min-height floor keeps the chain at its current size
  // until the new chart is in place.
  const prevMinWidth = container.style.minWidth
  const prevMinHeight = container.style.minHeight
  container.style.minWidth = `${containerRect.width}px`
  container.style.minHeight = `${containerRect.height}px`
  const unlockBox = () => {
    container.style.minWidth = prevMinWidth
    container.style.minHeight = prevMinHeight
  }

  // Pixel-space overlay (an un-viewBoxed SVG: 1 user unit = 1 CSS px) pinned
  // over the container. It carries the bar clones through the transition and
  // must survive the re-render below (preserveSelectors).
  const overlayHost = document.createElement('div')
  overlayHost.className = G2S_OVERLAY_CLASS
  overlayHost.style.position = 'absolute'
  overlayHost.style.inset = '0'
  overlayHost.style.pointerEvents = 'none'
  overlayHost.style.zIndex = '10'
  const overlaySvg = d3
    .select(overlayHost)
    .append('svg')
    .style('width', '100%')
    .style('height', '100%')
    .style('overflow', 'visible')
  const clones = overlaySvg
    .selectAll<SVGRectElement, [string, Snap]>('rect')
    .data(Array.from(snaps.entries()))
    .enter()
    .append('rect')
    .attr('x', (d) => d[1].left)
    .attr('y', (d) => d[1].top)
    .attr('width', (d) => d[1].width)
    .attr('height', (d) => d[1].height)
    .attr('fill', (d) => d[1].fill)
  container.appendChild(overlayHost)

  // Clones now cover the originals exactly — hide the originals and dissolve
  // the rest of the old chart (vacated bars, axes, facet titles, legend).
  snaps.forEach((snap) => {
    snap.el.style.opacity = '0'
  })
  const oldSel = d3.select(oldSvg as SVGSVGElement)
  oldSel.selectAll<SVGElement, unknown>('*').interrupt()
  await oldSel
    .transition()
    .duration(NON_SPLIT_EXIT_MS + 160)
    .ease(d3.easeCubicOut)
    .style('opacity', 0)
    .end()
    .catch(() => undefined)

  // Re-render through the ordinary path (this wipes the old SVG, which is
  // already invisible — the overlay clones are all the viewer sees), then
  // reveal the new chart at opacity 0 for the crossfade.
  await renderSimpleBarChart(container, simple, { preserveSelectors: [`.${G2S_OVERLAY_CLASS}`] })
  const chartSvg = container.querySelector<SVGSVGElement>('svg[data-render-epoch]')
  if (!chartSvg) {
    overlayHost.remove()
    unlockBox()
    return true // re-render happened; nothing left to animate
  }
  chartSvg.style.opacity = '0'
  // Split surfaces past the first show no y axis (shared-axis policy) — the
  // fresh chart must match BEFORE its bar rects are measured below, so the
  // clones glide to the compacted positions.
  const yAxisCompacted = reapplySharedYAxisHiddenPolicy(container, chartSvg)
  // Keep the overlay above the fresh chart in paint order.
  container.appendChild(overlayHost)

  // Measure the new bars' screen rects and glide each clone onto its match.
  const newRects = new Map<string, { left: number; top: number; width: number; height: number }>()
  const baseRect = container.getBoundingClientRect()
  chartSvg.querySelectorAll<SVGRectElement>('rect.main-bar').forEach((bar) => {
    const key = bar.getAttribute(DataAttributes.Target) ?? ''
    if (!key) return
    const rect = bar.getBoundingClientRect()
    newRects.set(key, {
      left: rect.left - baseRect.left,
      top: rect.top - baseRect.top,
      width: rect.width,
      height: rect.height,
    })
  })

  const moveClones = clones
    .transition()
    .duration(NON_SPLIT_UPDATE_MS)
    .ease(d3.easeCubicInOut)
    .attr('x', (d) => newRects.get(d[0])?.left ?? d[1].left)
    .attr('y', (d) => newRects.get(d[0])?.top ?? d[1].top)
    .attr('width', (d) => newRects.get(d[0])?.width ?? d[1].width)
    .attr('height', (d) => newRects.get(d[0])?.height ?? d[1].height)
    .style('opacity', (d) => (newRects.has(d[0]) ? 1 : 0))
    .end()
    .catch(() => undefined)

  const fadeInChart = d3
    .select(chartSvg)
    .transition()
    .delay(NON_SPLIT_UPDATE_MS * 0.3)
    .duration(NON_SPLIT_UPDATE_MS * 0.6)
    .ease(d3.easeCubicOut)
    .style('opacity', 1)
    .end()
    .catch(() => undefined)

  await Promise.all([moveClones, fadeInChart])

  overlayHost.remove()
  chartSvg.style.opacity = ''
  unlockBox()
  // Once the shared-axis compaction has run (i.e. this is the axis-less
  // panel's conversion — by then the sibling is typically converted too),
  // size the panels ∝ their chart viewBoxes so both keep equal pixel scale.
  // Rebalancing earlier (on the axis-BEARING panel's conversion) would shrink
  // it against a still-grouped neighbor whose canvas is far wider.
  if (yAxisCompacted) rebalanceSplitFlexByViewBox(container)
  console.info('[grouped-to-simple] bridge swap complete', {
    series: targetSeries,
    clones: snaps.size,
    matchedNewBars: newRects.size,
  })
  return true
}

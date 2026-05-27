import * as d3 from 'd3'
import type { JsonValue } from '../../types'
import { ChartType, type ChartSpec } from '../../domain/chart'
import { DataAttributes, SvgAttributes, SvgClassNames, SvgElements } from '../interfaces'
import { applyAxisTickLabelSize } from '../common/d3Helpers'
import { attachChartHoverTooltip, formatTooltipValue, writeTooltipRootAttrs } from '../common/chartHoverTooltip'
import { buildCategoricalDisplayLabelMap, categoricalTickFormatter } from '../common/displayLabels'
import { wrapAxisTickLabels } from '../common/wrapAxisTickLabels'
import { renderColorLegend, resolveColorLegendTitle as resolveChannelLegendTitle } from '../common/colorLegend'
import { resolveLayoutModel, estimateBottomPaddingForRotatedLabels } from '../common/chartLayout'
import { resolveAxisTitle } from '../common/resolveAxisTitle'
import { renderWithMeasuredLayout } from '../common/renderWithMeasuredLayout'
import { createTemporalTickFormatter } from '../common/temporalTicks'
import { CHART_TEXT_SIZE } from '../config/chartTextConfig'
import { bumpRenderEpoch } from '../common/renderEpoch'
import { storeRuntimeChartState } from '../utils/runtimeChartState'

const localDataStore: WeakMap<HTMLElement, RawDatum[]> = new WeakMap()
const splitDomainStore: WeakMap<HTMLElement, Record<string, Set<string>>> = new WeakMap()

type RawDatum = Record<string, JsonValue>
type AxisScale = d3.ScaleTime<number, number> | d3.ScaleLinear<number, number> | d3.ScalePoint<string>

function resolveLineMark(mark: ChartSpec['mark']) {
  if (typeof mark === 'string') return { type: mark, point: true }
  const markObj = mark && typeof mark === 'object' ? mark : {}
  const type = typeof markObj.type === 'string' ? markObj.type : 'line'
  const point = typeof markObj.point === 'boolean' ? markObj.point : true
  return { ...markObj, type, point }
}

function toDateValue(raw: JsonValue) {
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
    const isoDate = isoFull.slice(0, 10)
    return { label: isoDate, id: isoFull, value: dt, sort: dt.getTime() }
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

function getDatumRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

export type MultiLineSpec = ChartSpec & {
  encoding?: {
    x?: { field?: string; type?: string }
    y?: { field?: string; type?: string }
    color?: { field?: string }
  }
}
// Ops runner functions are in `src/renderer/line/multipleLineOps.ts`.

export type ResolvedMultiLineEncoding = {
  xField: string
  yField: string
  xType?: string
  yType?: string
  colorField?: string | null
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function normalizeLayers(spec: ChartSpec) {
  const baseEncoding = asRecord((spec as { encoding?: unknown }).encoding)
  if (Array.isArray(spec.layer) && spec.layer.length > 0) {
    return spec.layer.map((layer) => ({
      mark: layer?.mark ?? spec.mark,
      encoding: {
        ...baseEncoding,
        ...(layer?.encoding && typeof layer.encoding === 'object' ? (layer.encoding as Record<string, unknown>) : {}),
      },
    }))
  }
  return [{ mark: spec.mark, encoding: baseEncoding }]
}

function normalizeMarkType(mark: unknown) {
  if (!mark) return null
  if (typeof mark === 'string') return mark
  if (mark && typeof mark === 'object' && !Array.isArray(mark) && typeof (mark as Record<string, unknown>).type === 'string') {
    return String((mark as Record<string, unknown>).type)
  }
  return null
}

function compareDomainLabel(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

function applyDiscreteSortOrder(labels: string[], sortSpec: JsonValue | undefined) {
  if (!sortSpec) return labels
  const next = labels.slice()
  if (Array.isArray(sortSpec)) {
    const order = new Map(sortSpec.map((entry, index) => [String(entry), index]))
    next.sort((a, b) => (order.get(a) ?? Number.MAX_SAFE_INTEGER) - (order.get(b) ?? Number.MAX_SAFE_INTEGER) || compareDomainLabel(a, b))
    return next
  }
  if (typeof sortSpec === 'string') {
    if (sortSpec === 'descending') {
      next.sort((a, b) => compareDomainLabel(b, a))
      return next
    }
    if (sortSpec === 'ascending') {
      next.sort(compareDomainLabel)
      return next
    }
  }
  return next
}

function resolveMultiLineXSort(spec: MultiLineSpec, encoding: ResolvedMultiLineEncoding) {
  const layers = normalizeLayers(spec as ChartSpec)
  for (const layer of layers) {
    const layerEncoding = asRecord(layer.encoding)
    const xChannel = asRecord(layerEncoding.x)
    const field = typeof xChannel.field === 'string' ? xChannel.field.trim() : ''
    if (!field || field !== encoding.xField) continue
    if (Object.prototype.hasOwnProperty.call(xChannel, 'sort')) {
      return xChannel.sort as JsonValue | undefined
    }
  }
  return undefined
}

function resolveColorLegendTitle(spec: MultiLineSpec, encoding: ResolvedMultiLineEncoding) {
  const topColor = asRecord(asRecord((spec as { encoding?: unknown }).encoding).color)
  if (Object.prototype.hasOwnProperty.call(topColor, 'title')) {
    return resolveChannelLegendTitle(topColor, null)
  }
  const layers = normalizeLayers(spec as ChartSpec)
  for (const layer of layers) {
    const layerColor = asRecord(asRecord(layer.encoding).color)
    if (!Object.prototype.hasOwnProperty.call(layerColor, 'title')) continue
    return resolveChannelLegendTitle(layerColor, null)
  }
  return encoding.colorField ?? null
}

function resolveMultiLineStyle(spec: MultiLineSpec) {
  const fallbackStrokeWidth = 2
  const fallbackPointRadius = 4
  let strokeWidth = fallbackStrokeWidth
  let pointRadius = fallbackPointRadius
  let showPoints = true

  const applyMarkStyle = (mark: unknown) => {
    if (!mark || typeof mark !== 'object' || Array.isArray(mark)) return
    const markRec = mark as Record<string, unknown>
    const width = Number(markRec.strokeWidth)
    if (Number.isFinite(width) && width > 0) strokeWidth = width
    const size = Number(markRec.size)
    if (Number.isFinite(size) && size > 0) {
      pointRadius = Math.max(2, Math.sqrt(size / Math.PI))
    }
  }

  applyMarkStyle((spec as { mark?: unknown }).mark)
  if (Array.isArray(spec.layer)) {
    spec.layer.forEach((layer) => {
      const markType = normalizeMarkType(layer?.mark)
      if (markType === 'line') applyMarkStyle(layer?.mark)
      if (markType === 'point') showPoints = true
    })
  }

  return { strokeWidth, pointRadius, showPoints }
}

function resolveLineYDomainMinZero(spec: MultiLineSpec, encoding: ResolvedMultiLineEncoding) {
  const layers = normalizeLayers(spec as ChartSpec)
  for (const layer of layers) {
    const layerEncoding = asRecord(layer.encoding)
    const yChannel = asRecord(layerEncoding.y)
    const yField = typeof yChannel.field === 'string' ? yChannel.field.trim() : ''
    if (yField && yField !== encoding.yField) continue
    const scale = asRecord(yChannel.scale)
    if (typeof scale.zero === 'boolean') return scale.zero
  }
  return false
}

function normalizeLinePointIdentifier(rawX: JsonValue, xType: string) {
  if (xType === 'temporal') {
    const dt = toDateValue(rawX)
    const isoFull = dt.toISOString()
    return { target: isoFull.slice(0, 10), id: isoFull }
  }
  const label = String(rawX)
  return { target: label, id: label }
}

export function buildMultiLinePointId(target: string | number, series?: string | null) {
  const normalizedTarget = String(target ?? '').trim()
  const normalizedSeries = series != null ? String(series).trim() : ''
  if (!normalizedSeries) return normalizedTarget
  return `${normalizedSeries}::${normalizedTarget}`
}

function resolveColorPalette(spec: MultiLineSpec) {
  const fallback = ['#60a5fa', '#fb7185', '#f59e0b', '#10b981', '#c084fc', '#f472b6', '#22d3ee', '#a3e635', '#f97316']

  const colorChannel = asRecord(asRecord((spec as { encoding?: unknown }).encoding).color)
  const channelScale = asRecord(colorChannel.scale)
  if (Array.isArray(channelScale.range)) {
    const colors = channelScale.range
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter((entry) => entry.length > 0)
    if (colors.length > 0) return colors
  }

  const configRange = asRecord(asRecord((spec as { config?: unknown }).config).range)
  if (Array.isArray(configRange.category)) {
    const colors = configRange.category
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter((entry) => entry.length > 0)
    if (colors.length > 0) return colors
  }

  return fallback
}

function shouldKeepByFilter(row: RawDatum, filterSpec: unknown): boolean {
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
  if (!filterSpec || typeof filterSpec !== 'object' || Array.isArray(filterSpec)) return true

  const rec = filterSpec as Record<string, unknown>
  if (Array.isArray(rec.and)) return rec.and.every((entry) => shouldKeepByFilter(row, entry))
  if (Array.isArray(rec.or)) return rec.or.some((entry) => shouldKeepByFilter(row, entry))
  if (rec.not !== undefined) return !shouldKeepByFilter(row, rec.not)

  const field = typeof rec.field === 'string' ? rec.field : null
  if (!field) return true
  const value = row[field]

  if (Array.isArray(rec.oneOf)) {
    const tokenSet = new Set(rec.oneOf.map((entry) => String(entry)))
    return tokenSet.has(String(value))
  }
  if (rec.equal !== undefined) return String(value) === String(rec.equal)
  if (Array.isArray(rec.range) && rec.range.length >= 2) {
    const lower = Number(rec.range[0])
    const upper = Number(rec.range[1])
    const numeric = Number(value)
    if (!Number.isFinite(numeric) || !Number.isFinite(lower) || !Number.isFinite(upper)) return false
    return numeric >= lower && numeric <= upper
  }

  const numeric = Number(value)
  if (rec.lt !== undefined) {
    const threshold = Number(rec.lt)
    return Number.isFinite(numeric) && Number.isFinite(threshold) ? numeric < threshold : false
  }
  if (rec.lte !== undefined) {
    const threshold = Number(rec.lte)
    return Number.isFinite(numeric) && Number.isFinite(threshold) ? numeric <= threshold : false
  }
  if (rec.gt !== undefined) {
    const threshold = Number(rec.gt)
    return Number.isFinite(numeric) && Number.isFinite(threshold) ? numeric > threshold : false
  }
  if (rec.gte !== undefined) {
    const threshold = Number(rec.gte)
    return Number.isFinite(numeric) && Number.isFinite(threshold) ? numeric >= threshold : false
  }

  return true
}

function applyLineTransforms(data: RawDatum[], spec: MultiLineSpec) {
  let result = data
  const transforms = (spec as { transform?: unknown }).transform
  if (!Array.isArray(transforms)) return result

  transforms.forEach((transform) => {
    if (!transform || typeof transform !== 'object' || Array.isArray(transform)) return
    const filterSpec = (transform as { filter?: unknown }).filter
    if (filterSpec === undefined) return
    result = result.filter((row) => shouldKeepByFilter(row, filterSpec))
  })

  return result
}

async function loadLineData(spec: MultiLineSpec): Promise<RawDatum[]> {
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

function extractField(channel: unknown): string | undefined {
  const rec = asRecord(channel)
  return typeof rec.field === 'string' && rec.field.trim().length > 0 ? rec.field.trim() : undefined
}

function extractType(channel: unknown): string | undefined {
  const rec = asRecord(channel)
  return typeof rec.type === 'string' && rec.type.trim().length > 0 ? rec.type.trim() : undefined
}

/**
 * Multi-line specs in the wild often place x/y encoding at the layer level (especially layered line+point charts).
 * Resolve the effective x/y/color fields without requiring top-level `spec.encoding`.
 */
export function resolveMultiLineEncoding(spec: ChartSpec): ResolvedMultiLineEncoding | null {
  const baseEnc = asRecord((spec as { encoding?: unknown }).encoding)
  const baseX = baseEnc.x
  const baseY = baseEnc.y
  const baseColor = baseEnc.color

  const baseXField = extractField(baseX)
  const baseYField = extractField(baseY)
  const baseXType = extractType(baseX)
  const baseYType = extractType(baseY)
  const baseColorField = extractField(baseColor) ?? null

  let resolved: ResolvedMultiLineEncoding | null =
    baseXField && baseYField
      ? { xField: baseXField, yField: baseYField, xType: baseXType, yType: baseYType, colorField: baseColorField }
      : null

  const layers = Array.isArray(spec.layer) ? spec.layer : []
  if (!resolved && layers.length > 0) {
    for (const layer of layers) {
      const layerEnc = asRecord((layer as { encoding?: unknown })?.encoding)
      const layerX = layerEnc.x ?? baseX
      const layerY = layerEnc.y ?? baseY
      const xField = extractField(layerX)
      const yField = extractField(layerY)
      if (!xField || !yField) continue
      const colorField = baseColorField ?? extractField(layerEnc.color) ?? null
      resolved = {
        xField,
        yField,
        xType: extractType(layerX) ?? baseXType,
        yType: extractType(layerY) ?? baseYType,
        colorField,
      }
      break
    }
  }

  if (resolved && resolved.colorField == null && layers.length > 0) {
    for (const layer of layers) {
      const layerEnc = asRecord((layer as { encoding?: unknown })?.encoding)
      const layerColorField = extractField(layerEnc.color)
      if (layerColorField) {
        resolved.colorField = layerColorField
        break
      }
    }
  }

  return resolved
}

export async function renderMultipleLineChart(container: HTMLElement, spec: MultiLineSpec) {
  clearMultipleLineSplitDomains(container)

  const encoding = resolveMultiLineEncoding(spec)
  if (!encoding) {
    console.warn('renderMultipleLineChart: missing x/y encoding (cannot tag marks for ops)')
    return null
  }

  const rawData = await loadLineData(spec)
  const filteredData = applyLineTransforms(rawData, spec)
  const xLabelMap = buildCategoricalDisplayLabelMap(filteredData, encoding.xField)
  const yMinZero = resolveLineYDomainMinZero(spec, encoding)
  const xAxisLabel = resolveAxisTitle(spec, filteredData, 'x')
  const yAxisLabel = resolveAxisTitle(spec, filteredData, 'y')
  const style = resolveMultiLineStyle(spec)
  const renderEpoch = bumpRenderEpoch(container)

  type RenderDatum = {
    row: RawDatum
    xLabel: string
    xDisplayLabel: string
    xValue: string | number | Date
    xSort: number | string
    target: string
    id: string
    yValue: number
    series: string | null
  }

  const points: RenderDatum[] = []
  filteredData.forEach((rawRow) => {
    const row = { ...rawRow }
    const rawX = row[encoding.xField]
    const rawY = row[encoding.yField]
    const yValue = Number(rawY)
    if (rawX == null || !Number.isFinite(yValue)) return

    if ((encoding.xType ?? 'nominal') === 'quantitative') {
      const numericX = Number(rawX)
      if (!Number.isFinite(numericX)) return
      row[encoding.xField] = numericX
    }
    row[encoding.yField] = yValue

    const xType = encoding.xType ?? 'nominal'
    const normalized = normalizeLineXValue(row[encoding.xField], xType)
    const identity = normalizeLinePointIdentifier(row[encoding.xField], xType)
    const series = encoding.colorField
      ? row?.[encoding.colorField] != null
        ? String(row[encoding.colorField])
        : null
      : null
    points.push({
      row,
      xLabel: normalized.label,
      xDisplayLabel: xLabelMap.get(normalized.label) ?? normalized.label,
      xValue: normalized.value,
      xSort: normalized.sort,
      target: identity.target,
      id: buildMultiLinePointId(identity.target, series),
      yValue,
      series,
    })
  })

  localDataStore.set(
    container,
    points.map((point) => ({ ...point.row })),
  )
  storeRuntimeChartState(container, { chartType: ChartType.MULTI_LINE, spec, renderer: 'd3' })

  const uniqueSeries = Array.from(new Set(points.map((point) => point.series).filter((series): series is string => !!series)))
  const showLegend = Boolean(encoding.colorField) && uniqueSeries.length > 0
  const legendTitle = showLegend ? resolveColorLegendTitle(spec, encoding) : null
  const xType = encoding.xType ?? 'nominal'
  const xDomainLabels = Array.from(new Set(points.map((point) => point.xLabel)))
  if (xType === 'temporal' || xType === 'quantitative') {
    xDomainLabels.sort((a, b) => {
      const aPoint = points.find((point) => point.xLabel === a)
      const bPoint = points.find((point) => point.xLabel === b)
      return Number(aPoint?.xSort ?? 0) - Number(bPoint?.xSort ?? 0)
    })
  } else {
    const xSort = resolveMultiLineXSort(spec, encoding)
    const ordered = applyDiscreteSortOrder(xDomainLabels, xSort)
    xDomainLabels.splice(0, xDomainLabels.length, ...ordered)
  }
  const xSortIndex = new Map(xDomainLabels.map((label, index) => [label, index]))
  const yValues = points.map((point) => point.yValue)
  const minYRaw = d3.min(yValues)
  const maxYRaw = d3.max(yValues)
  let domainMin = Number.isFinite(minYRaw as number) ? (minYRaw as number) : 0
  let domainMax = Number.isFinite(maxYRaw as number) ? (maxYRaw as number) : 1
  if (yMinZero) {
    domainMin = Math.min(domainMin, 0)
    domainMax = Math.max(domainMax, 0)
  }
  if (domainMin === domainMax) domainMax = domainMin + 1
  const temporalTickFormatter = createTemporalTickFormatter(
    points
      .map((point) => point.xValue)
      .filter((value): value is Date | number => value instanceof Date || typeof value === 'number'),
  )

  const colorScale = d3.scaleOrdinal<string, string>(resolveColorPalette(spec)).domain(uniqueSeries)
  const minBottomPadding = estimateBottomPaddingForRotatedLabels(
    filteredData.map((row) => {
      const raw = row[encoding.xField]
      const key = raw == null ? '' : String(raw)
      return xLabelMap.get(key) ?? key
    }),
  )
  const initialLayout = resolveLayoutModel({
    container,
    chartType: ChartType.MULTI_LINE,
    spec,
    legend: { visible: showLegend },
    minBottomPadding,
  })

  const svg = renderWithMeasuredLayout(
    container,
    initialLayout,
    (layout) => {
      const margin = layout.padding
      const width = layout.canvas.width
      const height = layout.canvas.height
      const plotW = layout.plot.width
      const plotH = layout.plot.height

      const containerSelection = d3.select(container)
      containerSelection.selectAll('*').remove()

      const nextSvg = containerSelection
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
        .attr(DataAttributes.XField, encoding.xField)
        .attr(DataAttributes.YField, encoding.yField)
        .attr(DataAttributes.ColorField, encoding.colorField ?? null)
        .style('overflow', 'visible')
      writeTooltipRootAttrs(nextSvg, {
        xLabel: xAxisLabel ?? encoding.xField,
        yLabel: yAxisLabel ?? encoding.yField,
        groupLabel: encoding.colorField ? legendTitle ?? encoding.colorField : null,
      })

      const g = nextSvg.append(SvgElements.Group).attr(SvgAttributes.Transform, `translate(${margin.left},${margin.top})`)

      const buildXScale = (): AxisScale => {
        if (xType === 'temporal') {
          const timestamps = points
            .map((point) => (point.xValue instanceof Date ? point.xValue.getTime() : NaN))
            .filter(Number.isFinite)
          const minX = d3.min(timestamps) ?? Date.now()
          const maxX = d3.max(timestamps) ?? minX + 1
          return d3.scaleTime().domain([new Date(minX), new Date(maxX)]).range([0, plotW])
        }
        if (xType === 'quantitative') {
          const numbers = points
            .map((point) => (typeof point.xValue === 'number' ? point.xValue : NaN))
            .filter(Number.isFinite)
          let minX = d3.min(numbers) ?? 0
          let maxX = d3.max(numbers) ?? minX + 1
          if (minX === maxX) maxX = minX + 1
          return d3.scaleLinear().domain([minX, maxX]).range([0, plotW])
        }
        return d3.scalePoint<string>().domain(xDomainLabels).range([0, plotW]).padding(0.5)
      }

      const xScale = buildXScale()
      const yScale = d3.scaleLinear().domain([domainMin, domainMax]).nice().range([plotH, 0])
      const xAxis =
        xType === 'temporal'
          ? d3.axisBottom(xScale as d3.ScaleTime<number, number>).tickFormat(temporalTickFormatter)
          : xType === 'quantitative'
            ? d3.axisBottom(xScale as d3.ScaleLinear<number, number>)
            : d3.axisBottom(xScale as d3.ScalePoint<string>).tickFormat(categoricalTickFormatter(xLabelMap))
      g.append(SvgElements.Group)
        .attr(SvgAttributes.Class, SvgClassNames.XAxis)
        .attr(SvgAttributes.Transform, `translate(0,${plotH})`)
        .call(xAxis)
      applyAxisTickLabelSize(g.select<SVGGElement>(`.${SvgClassNames.XAxis}`))
      const xTicks = Array.from(g.select(`.${SvgClassNames.XAxis}`).selectAll<SVGGElement, unknown>('.tick').nodes())
      const axisLayout = wrapAxisTickLabels(g.select(`.${SvgClassNames.XAxis}`).selectAll<SVGTextElement, unknown>(SvgElements.Text), {
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

      g.append(SvgElements.Group).attr(SvgAttributes.Class, SvgClassNames.YAxis).call(d3.axisLeft(yScale).ticks(6))
      applyAxisTickLabelSize(g.select<SVGGElement>(`.${SvgClassNames.YAxis}`))

      const resolveX = (point: RenderDatum) => {
        if (xType === 'temporal') return (xScale as d3.ScaleTime<number, number>)(point.xValue as Date) ?? 0
        if (xType === 'quantitative') return (xScale as d3.ScaleLinear<number, number>)(point.xValue as number) ?? 0
        return (xScale as d3.ScalePoint<string>)(point.xLabel) ?? 0
      }

      const grouped = d3.group(points, (point) => point.series ?? '')
      grouped.forEach((seriesRows, seriesKey) => {
        const sorted = seriesRows.slice().sort((a, b) => {
          if (xType === 'temporal' || xType === 'quantitative') {
            return Number(a.xSort) - Number(b.xSort)
          }
          return (xSortIndex.get(a.xLabel) ?? 0) - (xSortIndex.get(b.xLabel) ?? 0)
        })
        const stroke = seriesKey && uniqueSeries.includes(seriesKey) ? colorScale(seriesKey) : '#4f46e5'

        const line = d3
          .line<RenderDatum>()
          .x((point) => resolveX(point))
          .y((point) => yScale(point.yValue))
        g.append(SvgElements.Path)
          .datum(sorted)
          .attr(SvgAttributes.D, line)
          .attr(SvgAttributes.Fill, 'none')
          .attr(SvgAttributes.Stroke, stroke)
          .attr(SvgAttributes.StrokeWidth, style.strokeWidth)
          .attr(DataAttributes.Series, seriesKey || null)

        if (style.showPoints) {
          const pointsGroup = g.append(SvgElements.Group).attr(DataAttributes.Series, seriesKey || null)
          pointsGroup
            .selectAll<SVGCircleElement, RenderDatum>(SvgElements.Circle)
            .data(sorted)
            .join(SvgElements.Circle)
            .attr(SvgAttributes.CX, (point) => resolveX(point))
            .attr(SvgAttributes.CY, (point) => yScale(point.yValue))
            .attr(SvgAttributes.R, style.pointRadius)
            .attr(SvgAttributes.Fill, stroke)
            .attr(SvgAttributes.Opacity, 0.85)
            .attr(DataAttributes.Target, (point) => point.target)
            .attr(DataAttributes.Id, (point) => point.id)
            .attr(DataAttributes.Value, (point) => String(point.yValue))
            .attr(DataAttributes.Series, seriesKey || null)
            .attr(DataAttributes.XValue, (point) => point.xDisplayLabel)
            .attr(DataAttributes.YValue, (point) => formatTooltipValue(point.yValue))
            .attr(DataAttributes.GroupValue, seriesKey || null)
        }
      })

      if (showLegend) {
        renderColorLegend({
          svg: nextSvg,
          layout,
          margin,
          plotWidth: plotW,
          title: legendTitle,
          items: uniqueSeries.map((series) => ({
            label: series,
            color: colorScale(series),
          })),
        })
      }

      if (xAxisLabel) {
        nextSvg
          .append(SvgElements.Text)
          .attr(SvgAttributes.Class, SvgClassNames.XAxisLabel)
          .attr(SvgAttributes.X, layout.axisTitles.x.x)
          .attr(SvgAttributes.Y, layout.axisTitles.x.y)
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
          .attr(SvgAttributes.X, layout.axisTitles.y.x)
          .attr(SvgAttributes.Y, layout.axisTitles.y.y)
          .attr(SvgAttributes.TextAnchor, 'middle')
          .attr(SvgAttributes.FontSize, CHART_TEXT_SIZE.axisTitle)
          .attr(SvgAttributes.FontWeight, 'bold')
          .text(yAxisLabel)
      }

      return nextSvg
    },
    { maxPasses: 4 },
  )
  attachChartHoverTooltip(container)
  return svg
}

export function getMultipleLineStoredData(container: HTMLElement) {
  return localDataStore.get(container) || []
}

function collectRenderedDatumRows(container: HTMLElement, encoding: ResolvedMultiLineEncoding): RawDatum[] {
  const { xField, yField, colorField } = encoding
  const svg = d3.select(container).select(SvgElements.Svg)
  if (svg.empty()) return []

  const rows: RawDatum[] = []
  const seen = new Set<string>()
  svg.selectAll<SVGGraphicsElement, unknown>('path, circle, rect').each(function (rawDatum: unknown) {
    const ownerData = getDatumRecord(rawDatum)
    const embeddedDatum = getDatumRecord(ownerData.datum)
    const fallback = getDatumRecord((this as SVGGraphicsElement & { __data__?: unknown }).__data__)
    const datum = Object.keys(embeddedDatum).length ? embeddedDatum : Object.keys(ownerData).length ? ownerData : fallback

    const rawX = datum?.[xField]
    const rawY = datum?.[yField]
    if (rawX == null || rawY == null) return
    const yNum = Number(rawY)
    if (!Number.isFinite(yNum)) return

    const series = colorField ? datum?.[colorField] : null
    const key = `${String(rawX)}__${String(series ?? '')}__${String(rawY)}`
    if (seen.has(key)) return
    seen.add(key)
    rows.push(datum as RawDatum)
  })
  return rows
}

export function setMultipleLineSplitDomains(container: HTMLElement, domains: Record<string, Set<string>>) {
  splitDomainStore.set(container, domains)
}

export function clearMultipleLineSplitDomains(container: HTMLElement) {
  splitDomainStore.delete(container)
}

export function getMultipleLineSplitDomain(container: HTMLElement, chartId: string | undefined) {
  if (!chartId) return null
  const domains = splitDomainStore.get(container)
  if (!domains) return null
  return domains[chartId] ?? null
}

export async function tagMultipleLineMarks(container: HTMLElement, spec: MultiLineSpec) {
  const encoding = resolveMultiLineEncoding(spec)
  if (!encoding) {
    console.warn('tagMultipleLineMarks: missing x/y encoding (skipped)')
    return
  }
  const xField = encoding.xField
  const yField = encoding.yField
  const colorField = encoding.colorField ?? null
  const xType = encoding.xType ?? 'nominal'
  // wait up to 5 frames for marks to exist
  for (let i = 0; i < 5; i += 1) {
    const svgCheck = d3.select(container).select(SvgElements.Svg)
    const markCount = svgCheck.selectAll<SVGGraphicsElement, unknown>('path, circle, rect').size()
    if (markCount > 0) break
    await new Promise((resolve) => requestAnimationFrame(resolve))
  }
  const svg = d3.select(container).select(SvgElements.Svg)
  svg
    .attr(DataAttributes.XField, xField)
    .attr(DataAttributes.YField, yField)
    .attr(DataAttributes.ColorField, colorField)
  svg.selectAll<SVGGraphicsElement, unknown>('path, circle, rect').each(function (rawDatum: unknown) {
    const ownerData = getDatumRecord(rawDatum)
    const embeddedDatum = getDatumRecord(ownerData.datum)
    const fallback = getDatumRecord((this as SVGGraphicsElement & { __data__?: unknown }).__data__)
    const datum = Object.keys(embeddedDatum).length ? embeddedDatum : Object.keys(ownerData).length ? ownerData : fallback
    const hasX = datum?.[xField] !== undefined && datum?.[xField] !== null
    const hasY = datum?.[yField] !== undefined && datum?.[yField] !== null
    if (!hasX || !hasY) return
    const rawTarget = datum?.[xField]
    const rawValue = datum?.[yField]
    const rawSeries = colorField ? datum?.[colorField] : null
    if (rawTarget != null && rawValue != null) {
      let isoDate = String(rawTarget)
      if (xType === 'temporal') {
        const dt = toDateValue(rawTarget as JsonValue)
        isoDate = dt.toISOString().slice(0, 10)
      }
      const valueVal = rawValue
      const pointId = buildMultiLinePointId(isoDate, rawSeries != null ? String(rawSeries) : null)
      d3.select(this as Element)
        .attr(DataAttributes.Target, isoDate)
        .attr(DataAttributes.Id, pointId)
        .attr(DataAttributes.Value, valueVal != null ? String(valueVal) : null)
    }
  })
}

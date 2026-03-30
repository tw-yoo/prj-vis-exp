import * as d3 from 'd3'
import type { JsonValue } from '../../types'
import { ChartType, type ChartSpec } from '../../domain/chart'
import { DataAttributes, SvgAttributes, SvgClassNames, SvgElements } from '../interfaces'
import { applyAxisTickLabelSize } from '../common/d3Helpers'
import { attachChartHoverTooltip, formatTooltipValue, writeTooltipRootAttrs } from '../common/chartHoverTooltip'
import { buildCategoricalDisplayLabelMap, categoricalTickFormatter } from '../common/displayLabels'
import { wrapAxisTickLabels } from '../common/wrapAxisTickLabels'
import { resolveLayoutModel } from '../common/chartLayout'
import { renderWithMeasuredLayout } from '../common/renderWithMeasuredLayout'
import { createTemporalTickFormatter } from '../common/temporalTicks'
import { CHART_TEXT_SIZE } from '../config/chartTextConfig'
import { bumpRenderEpoch } from '../common/renderEpoch'
import { storeRuntimeChartState } from '../utils/runtimeChartState'

const localDataStore: WeakMap<HTMLElement, RawDatum[]> = new WeakMap()
const splitDomainStore: WeakMap<HTMLElement, Record<string, Set<string>>> = new WeakMap()

type RawDatum = Record<string, JsonValue>
type AxisScale = d3.ScaleTime<number, number> | d3.ScaleLinear<number, number> | d3.ScalePoint<string>

type ResolvedLineEncoding = {
  xField: string
  yField: string
  xType: string
  yType: string
  colorField?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function normalizeMarkType(mark: ChartSpec['mark']) {
  if (!mark) return null
  if (typeof mark === 'string') return mark
  if (typeof mark === 'object' && typeof mark.type === 'string') return mark.type
  return null
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

function extractField(channel: unknown) {
  if (!isRecord(channel)) return null
  const field = channel.field
  return typeof field === 'string' && field.trim().length > 0 ? field.trim() : null
}

function extractType(channel: unknown) {
  if (!isRecord(channel)) return null
  const type = channel.type
  return typeof type === 'string' && type.trim().length > 0 ? type.trim() : null
}

export function resolveSimpleLineEncoding(spec: ChartSpec): ResolvedLineEncoding | null {
  const layers = normalizeLayers(spec)
  const preferred = layers.find((layer) => layer.mark === 'line') ?? layers[0]
  const encoding = preferred?.encoding ?? {}
  const xField = extractField(encoding.x)
  const yField = extractField(encoding.y)
  if (!xField || !yField) return null
  const xType = extractType(encoding.x) ?? 'nominal'
  const yType = extractType(encoding.y) ?? 'quantitative'
  const colorField = extractField(encoding.color) ?? undefined
  return { xField, yField, xType, yType, colorField }
}

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

function getDatumRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

function normalizeOptionalLabel(value: JsonValue | undefined) {
  if (value === undefined) return undefined
  if (value === null) return null
  const str = String(value).trim()
  return str.length > 0 ? str : null
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function extractAxisTitle(channel: unknown): string | null | undefined {
  const rec = asRecord(channel)
  if (Object.prototype.hasOwnProperty.call(rec, 'title')) {
    const title = rec.title
    if (title == null) return null
    if (typeof title === 'string') return title.trim().length > 0 ? title.trim() : null
  }
  const axis = asRecord(rec.axis)
  if (Object.prototype.hasOwnProperty.call(axis, 'title')) {
    const title = axis.title
    if (title == null) return null
    if (typeof title === 'string') return title.trim().length > 0 ? title.trim() : null
  }
  return undefined
}

function resolveSimpleLineAxisLabels(spec: LineSpec, resolved: ResolvedLineEncoding) {
  const axisLabelsMeta = (spec as { meta?: { axisLabels?: { x?: JsonValue; y?: JsonValue } } }).meta?.axisLabels ?? {}
  const xAxisLabelOverride = normalizeOptionalLabel(axisLabelsMeta.x)
  const yAxisLabelOverride = normalizeOptionalLabel(axisLabelsMeta.y)
  if (xAxisLabelOverride !== undefined || yAxisLabelOverride !== undefined) {
    return {
      xAxisLabel: xAxisLabelOverride === undefined ? resolved.xField : xAxisLabelOverride,
      yAxisLabel: yAxisLabelOverride === undefined ? resolved.yField : yAxisLabelOverride,
    }
  }

  const layers = normalizeLayers(spec as ChartSpec)
  let xTitle: string | null | undefined
  let yTitle: string | null | undefined
  for (const layer of layers) {
    const encoding = asRecord(layer.encoding)
    if (xTitle === undefined) {
      xTitle = extractAxisTitle(encoding.x)
    }
    if (yTitle === undefined) {
      yTitle = extractAxisTitle(encoding.y)
    }
    if (xTitle !== undefined && yTitle !== undefined) break
  }

  return {
    xAxisLabel: xTitle === undefined ? resolved.xField : xTitle,
    yAxisLabel: yTitle === undefined ? resolved.yField : yTitle,
  }
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

function resolveSimpleLineXSort(spec: LineSpec, resolved: ResolvedLineEncoding) {
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

function resolveSimpleLineStyle(spec: LineSpec) {
  const fallbackStroke = '#4f46e5'
  const fallbackStrokeWidth = 2
  const fallbackPointRadius = 4
  let stroke = fallbackStroke
  let strokeWidth = fallbackStrokeWidth
  let pointRadius = fallbackPointRadius
  let showPoints = true

  const applyMarkStyle = (mark: unknown) => {
    if (!mark || typeof mark !== 'object' || Array.isArray(mark)) return
    const markRec = mark as Record<string, unknown>
    if (typeof markRec.stroke === 'string' && markRec.stroke.trim().length > 0) {
      stroke = markRec.stroke
    } else if (typeof markRec.color === 'string' && markRec.color.trim().length > 0) {
      stroke = markRec.color
    }
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
      const layerMark = (layer as { mark?: unknown }).mark
      const markType = normalizeMarkType(layerMark as ChartSpec['mark'])
      if (markType === 'line') applyMarkStyle(layerMark)
      if (markType === 'point') showPoints = true
    })
  }

  const configMark = asRecord((spec as { config?: { mark?: unknown } }).config?.mark)
  if (stroke === fallbackStroke) {
    const cfgColor = configMark.color
    if (typeof cfgColor === 'string' && cfgColor.trim().length > 0) stroke = cfgColor
  }

  return { stroke, strokeWidth, pointRadius, showPoints }
}

function resolveLineYDomainMinZero(spec: LineSpec, resolved: ResolvedLineEncoding) {
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

function normalizeLinePointIdentifier(rawX: JsonValue, xType: string) {
  if (xType === 'temporal') {
    const dt = toDateValue(rawX)
    const isoFull = dt.toISOString()
    return { target: isoFull.slice(0, 10), id: isoFull }
  }
  const label = String(rawX)
  return { target: label, id: label }
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
  if (Array.isArray(rec.and)) {
    return rec.and.every((entry) => shouldKeepByFilter(row, entry))
  }
  if (Array.isArray(rec.or)) {
    return rec.or.some((entry) => shouldKeepByFilter(row, entry))
  }
  if (rec.not !== undefined) {
    return !shouldKeepByFilter(row, rec.not)
  }

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

function applyLineTransforms(data: RawDatum[], spec: LineSpec) {
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

async function loadLineData(spec: LineSpec): Promise<RawDatum[]> {
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

export type LineSpec = ChartSpec & {
  // Some "simple line" specs encode x/y at layer-level (e.g. line + point layering).
  // Keep encoding optional and resolve effective fields via `resolveSimpleLineEncoding`.
  encoding?: Record<string, JsonValue>
}

// Ops runner functions are in `src/renderer/line/simpleLineOps.ts`.

export async function renderSimpleLineChart(container: HTMLElement, spec: LineSpec) {
  clearSimpleLineSplitDomains(container)

  const resolved = resolveSimpleLineEncoding(spec as ChartSpec)
  if (!resolved) {
    console.warn('renderSimpleLineChart: missing x/y encoding')
    return null
  }

  const rawData = await loadLineData(spec)
  const filteredData = applyLineTransforms(rawData, spec)
  const xLabelMap = buildCategoricalDisplayLabelMap(filteredData, resolved.xField)
  const yMinZero = resolveLineYDomainMinZero(spec, resolved)
  const { xAxisLabel, yAxisLabel } = resolveSimpleLineAxisLabels(spec, resolved)
  const style = resolveSimpleLineStyle(spec)
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
  }

  const points: RenderDatum[] = []
  filteredData.forEach((rawRow) => {
    const row = { ...rawRow }
    const rawX = row[resolved.xField]
    const rawY = row[resolved.yField]
    const yValue = Number(rawY)
    if (rawX == null || !Number.isFinite(yValue)) return

    if (resolved.xType === 'quantitative') {
      const numericX = Number(rawX)
      if (!Number.isFinite(numericX)) return
      row[resolved.xField] = numericX
    }
    row[resolved.yField] = yValue

    const normalized = normalizeLineXValue(row[resolved.xField], resolved.xType)
    const identity = normalizeLinePointIdentifier(row[resolved.xField], resolved.xType)
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

  localDataStore.set(
    container,
    points.map((point) => ({ ...point.row })),
  )
  storeRuntimeChartState(container, { chartType: ChartType.SIMPLE_LINE, spec, renderer: 'd3' })

  const xDomainLabels = Array.from(new Set(points.map((point) => point.xLabel)))
  if (resolved.xType === 'temporal' || resolved.xType === 'quantitative') {
    xDomainLabels.sort((a, b) => {
      const aPoint = points.find((point) => point.xLabel === a)
      const bPoint = points.find((point) => point.xLabel === b)
      return Number(aPoint?.xSort ?? 0) - Number(bPoint?.xSort ?? 0)
    })
  } else {
    const xSort = resolveSimpleLineXSort(spec, resolved)
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

  const sorted = points.slice().sort((a, b) => {
    if (resolved.xType === 'temporal' || resolved.xType === 'quantitative') {
      return Number(a.xSort) - Number(b.xSort)
    }
    return (xSortIndex.get(a.xLabel) ?? 0) - (xSortIndex.get(b.xLabel) ?? 0)
  })

  const initialLayout = resolveLayoutModel({ container, chartType: ChartType.SIMPLE_LINE, spec })

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
        .attr(DataAttributes.PlotWidth, plotW)
        .attr(DataAttributes.PlotHeight, plotH)
        .attr(DataAttributes.XField, resolved.xField)
        .attr(DataAttributes.YField, resolved.yField)
        .attr(DataAttributes.ColorField, resolved.colorField ?? null)
        .style('overflow', 'visible')
      writeTooltipRootAttrs(nextSvg, {
        xLabel: xAxisLabel ?? resolved.xField,
        yLabel: yAxisLabel ?? resolved.yField,
        groupLabel: null,
      })

      const g = nextSvg.append(SvgElements.Group).attr(SvgAttributes.Transform, `translate(${margin.left},${margin.top})`)

      const buildXScale = () => {
        if (resolved.xType === 'temporal') {
          const timestamps = points
            .map((point) => (point.xValue instanceof Date ? point.xValue.getTime() : NaN))
            .filter(Number.isFinite)
          const minX = d3.min(timestamps) ?? Date.now()
          const maxX = d3.max(timestamps) ?? minX + 1
          return d3.scaleTime().domain([new Date(minX), new Date(maxX)]).range([0, plotW])
        }
        if (resolved.xType === 'quantitative') {
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
        resolved.xType === 'temporal'
          ? d3.axisBottom(xScale as d3.ScaleTime<number, number>).tickFormat(temporalTickFormatter)
          : resolved.xType === 'quantitative'
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
        if (resolved.xType === 'temporal') return (xScale as d3.ScaleTime<number, number>)(point.xValue as Date) ?? 0
        if (resolved.xType === 'quantitative') return (xScale as d3.ScaleLinear<number, number>)(point.xValue as number) ?? 0
        return (xScale as d3.ScalePoint<string>)(point.xLabel) ?? 0
      }

      const line = d3
        .line<RenderDatum>()
        .x((point) => resolveX(point))
        .y((point) => yScale(point.yValue))

      g.append(SvgElements.Path)
        .datum(sorted)
        .attr(SvgAttributes.D, line)
        .attr(SvgAttributes.Fill, 'none')
        .attr(SvgAttributes.Stroke, style.stroke)
        .attr(SvgAttributes.StrokeWidth, style.strokeWidth)

      if (style.showPoints) {
        g.selectAll<SVGCircleElement, RenderDatum>(SvgElements.Circle)
          .data(sorted)
          .join(SvgElements.Circle)
          .attr(SvgAttributes.CX, (point) => resolveX(point))
          .attr(SvgAttributes.CY, (point) => yScale(point.yValue))
          .attr(SvgAttributes.R, style.pointRadius)
          .attr(SvgAttributes.Fill, style.stroke)
          .attr(SvgAttributes.Opacity, 0.85)
          .attr(DataAttributes.Target, (point) => point.target)
          .attr(DataAttributes.Id, (point) => point.id)
          .attr(DataAttributes.Value, (point) => String(point.yValue))
          .attr(DataAttributes.XValue, (point) => point.xDisplayLabel)
          .attr(DataAttributes.YValue, (point) => formatTooltipValue(point.yValue))
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

export function getSimpleLineStoredData(container: HTMLElement) {
  return localDataStore.get(container) || []
}

export function setSimpleLineStoredData(container: HTMLElement, data: RawDatum[]) {
  localDataStore.set(container, data.map((row) => ({ ...row })))
}

export function setSimpleLineSplitDomains(container: HTMLElement, domains: Record<string, Set<string>>) {
  splitDomainStore.set(container, domains)
}

export function clearSimpleLineSplitDomains(container: HTMLElement) {
  splitDomainStore.delete(container)
}

export function getSimpleLineSplitDomain(container: HTMLElement, chartId: string | undefined) {
  if (!chartId) return null
  const domains = splitDomainStore.get(container)
  if (!domains) return null
  return domains[chartId] ?? null
}

type NormalizedLinePoint = {
  xLabel: string
  xDisplayLabel: string
  xId: string
  xValue: string | number | Date
  xSort: number | string
  yValue: number
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

function normalizeSplitGroups(
  split: {
    mode?: 'domain' | 'selector'
    groups?: Record<string, Array<string | number>>
    selectors?: Record<string, { include?: Array<string | number>; exclude?: Array<string | number>; all?: boolean }>
    restTo?: string
  },
  xDomain: string[],
) {
  const selectorEntries = Object.entries(split.selectors ?? {})
  if ((split.mode === 'selector' || selectorEntries.length > 0) && selectorEntries.length >= 2) {
    const [idA, selectorA] = selectorEntries[0]
    const [idB, selectorB] = selectorEntries[1]
    const buildDomain = (selector: { include?: Array<string | number>; exclude?: Array<string | number>; all?: boolean }) => {
      const includeSet = new Set((selector.include ?? []).map(String))
      const excludeSet = new Set((selector.exclude ?? []).map(String))
      const includeMode = includeSet.size > 0
      const allMode = selector.all === true || (!includeMode && excludeSet.size === 0)
      return xDomain.filter((label) => {
        if (allMode) return !excludeSet.has(label)
        if (includeMode) return includeSet.has(label)
        return !excludeSet.has(label)
      })
    }
    return { ids: [idA, idB] as [string, string], domains: [buildDomain(selectorA), buildDomain(selectorB)] as [string[], string[]] }
  }

  const entries = Object.entries(split.groups ?? {})
  if (entries.length === 0) return null
  const [idA, listA] = entries[0]
  const hasExplicitSecondGroup = entries.length >= 2
  const idB = entries[1]?.[0] ?? split.restTo ?? 'B'
  const listB = entries[1]?.[1] ?? []

  const setA = new Set((listA ?? []).map(String))
  const setB = new Set((listB ?? []).map(String))
  const domainA: string[] = []
  const domainB: string[] = []
  xDomain.forEach((label) => {
    if (setA.has(label)) domainA.push(label)
    else if (setB.has(label)) domainB.push(label)
    else if (!hasExplicitSecondGroup) domainB.push(label)
  })
  return { ids: [idA, idB] as [string, string], domains: [domainA, domainB] as [string[], string[]] }
}

function normalizeLinePoints(values: RawDatum[], xField: string, yField: string, xType: string) {
  const labelMap = buildCategoricalDisplayLabelMap(values, xField)
  const points: NormalizedLinePoint[] = []
  values.forEach((row) => {
    const rawX = row?.[xField]
    const rawY = row?.[yField]
    const yValue = Number(rawY)
    if (rawX == null || !Number.isFinite(yValue)) return
    const normalized = normalizeLineXValue(rawX, xType)
    points.push({
      xLabel: normalized.label,
      xDisplayLabel: labelMap.get(normalized.label) ?? normalized.label,
      xId: normalized.id,
      xValue: normalized.value,
      xSort: normalized.sort,
      yValue,
    })
  })
  return points
}

/** @deprecated SurfaceManager.splitSurface() + renderSimpleLineChart() 조합으로 대체됨. */
export async function renderSplitSimpleLineChart(
  container: HTMLElement,
  spec: LineSpec,
  split: {
    mode?: 'domain' | 'selector'
    groups?: Record<string, Array<string | number>>
    selectors?: Record<string, { include?: Array<string | number>; exclude?: Array<string | number>; all?: boolean }>
    restTo?: string
    orientation?: 'vertical' | 'horizontal'
  },
) {
  const renderEpoch = bumpRenderEpoch(container)
  const stored = (getSimpleLineStoredData(container) || []) as RawDatum[]
  const resolved = resolveSimpleLineEncoding(spec as ChartSpec)
  if (!resolved) return
  const xField = resolved.xField
  const yField = resolved.yField
  const xType = resolved.xType
  const points = normalizeLinePoints(stored, xField, yField, xType)
  if (!points.length) return

  const uniqueLabels = new Set(points.map((p) => p.xLabel))
  const domainLabels = Array.from(uniqueLabels)
  if (xType === 'temporal' || xType === 'quantitative') {
    domainLabels.sort((a, b) => {
      const aPoint = points.find((p) => p.xLabel === a)
      const bPoint = points.find((p) => p.xLabel === b)
      const aSort = aPoint ? Number(aPoint.xSort) : 0
      const bSort = bPoint ? Number(bPoint.xSort) : 0
      return aSort - bSort
    })
  }

  const splitGroups = normalizeSplitGroups(split, domainLabels)
  if (!splitGroups) return

  const yValues = points.map((p) => p.yValue)
  const minY = d3.min(yValues) ?? 0
  const maxY = d3.max(yValues) ?? 0
  let domainMin = Math.min(0, minY)
  let domainMax = Math.max(0, maxY)
  if (domainMin === domainMax) domainMax = domainMin + 1

  const [idA, idB] = splitGroups.ids
  const [domainA, domainB] = splitGroups.domains
  setSimpleLineSplitDomains(container, {
    [idA]: new Set(domainA),
    [idB]: new Set(domainB),
  })
  const temporalTickFormatter = createTemporalTickFormatter(
    points
      .map((point) => point.xValue)
      .filter((value): value is Date | number => value instanceof Date || typeof value === 'number'),
  )

  const initialLayout = resolveLayoutModel({
    container,
    chartType: ChartType.SIMPLE_LINE,
    spec,
    split: { enabled: true, orientation: split.orientation },
  })

  const svg = renderWithMeasuredLayout(
    container,
    initialLayout,
    (layout) => {
      const orientation = layout.splitPanels.orientation
      const margin = layout.padding
      const width = layout.canvas.width
      const height = layout.canvas.height
      const plotW = layout.plot.width
      const plotH = layout.plot.height
      const gap = layout.splitPanels.gap
      const subW = layout.splitPanels.panelWidth
      const subH = layout.splitPanels.panelHeight

      const containerSelection = d3.select(container)
      containerSelection.selectAll('*').remove()

      const nextSvg = containerSelection
        .append(SvgElements.Svg)
        .attr(SvgAttributes.ViewBox, `0 0 ${width} ${height}`)
        .attr(DataAttributes.RenderEpoch, renderEpoch)
        .attr(DataAttributes.MarginLeft, margin.left)
        .attr(DataAttributes.MarginTop, margin.top)
        .attr(DataAttributes.PlotWidth, plotW)
        .attr(DataAttributes.PlotHeight, plotH)
        .style('overflow', 'visible')

      const groups: Array<{ id: string; domain: string[]; offsetX: number; offsetY: number }> = [
        { id: idA, domain: domainA, offsetX: 0, offsetY: 0 },
        {
          id: idB,
          domain: domainB,
          offsetX: orientation === 'horizontal' ? subW + gap : 0,
          offsetY: orientation === 'vertical' ? subH + gap : 0,
        },
      ]

      const buildXScale = (domain: string[]): AxisScale => {
        if (xType === 'temporal') {
          const times = points.map((p) => (p.xValue instanceof Date ? p.xValue.getTime() : NaN)).filter(Number.isFinite)
          const minX = d3.min(times) ?? Date.now()
          const maxX = d3.max(times) ?? minX + 1
          return d3.scaleTime().domain([new Date(minX), new Date(maxX)]).range([0, subW])
        }
        if (xType === 'quantitative') {
          const nums = points.map((p) => (typeof p.xValue === 'number' ? p.xValue : NaN)).filter(Number.isFinite)
          const minX = d3.min(nums) ?? 0
          const maxX = d3.max(nums) ?? minX + 1
          return d3.scaleLinear().domain([minX, maxX]).range([0, subW])
        }
        return d3.scalePoint<string>().domain(domain).range([0, subW]).padding(0.5)
      }

      let maxAxisRotation = 0
      let maxDensityStep = 1
      groups.forEach(({ id, domain, offsetX, offsetY }) => {
        const g = nextSvg
          .append(SvgElements.Group)
          .attr(DataAttributes.ChartId, id)
          .attr(DataAttributes.ChartPanel, 'true')
          .attr(DataAttributes.PanelPlotX, 0)
          .attr(DataAttributes.PanelPlotY, 0)
          .attr(DataAttributes.PanelPlotWidth, subW)
          .attr(DataAttributes.PanelPlotHeight, subH)
          .attr(SvgAttributes.Transform, `translate(${margin.left + offsetX},${margin.top + offsetY})`)

        const xScale = buildXScale(domain)
        const yScale = d3.scaleLinear().domain([domainMin, domainMax]).nice().range([subH, 0])

        const xAxis =
          xType === 'temporal'
            ? d3.axisBottom(xScale as d3.ScaleTime<number, number>).tickFormat(temporalTickFormatter)
            : xType === 'quantitative'
              ? d3.axisBottom(xScale as d3.ScaleLinear<number, number>)
              : d3.axisBottom(xScale as d3.ScalePoint<string>).tickFormat(
                  categoricalTickFormatter(new Map(points.map((point) => [point.xLabel, point.xDisplayLabel]))),
                )
        g.append(SvgElements.Group)
          .attr(SvgAttributes.Class, SvgClassNames.XAxis)
          .attr(SvgAttributes.Transform, `translate(0,${subH})`)
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
        maxAxisRotation = Math.max(maxAxisRotation, Math.abs(axisLayout.angleDeg))
        maxDensityStep = Math.max(maxDensityStep, axisLayout.densityStep)

        g.append(SvgElements.Group).attr(SvgAttributes.Class, SvgClassNames.YAxis).call(d3.axisLeft(yScale).ticks(5))
        applyAxisTickLabelSize(g.select<SVGGElement>(`.${SvgClassNames.YAxis}`))

        const domainSet = new Set(domain)
        const rows = points.filter((p) => domainSet.has(p.xLabel))
        if (!rows.length) return

        const sortIndex = new Map(domain.map((label, idx) => [label, idx]))
        const sortedRows = rows.slice().sort((a, b) => {
          if (xType === 'temporal' || xType === 'quantitative') {
            return Number(a.xSort) - Number(b.xSort)
          }
          return (sortIndex.get(a.xLabel) ?? 0) - (sortIndex.get(b.xLabel) ?? 0)
        })

        const line = d3
          .line<NormalizedLinePoint>()
          .x((d) => {
            if (xType === 'temporal') return (xScale as d3.ScaleTime<number, number>)(d.xValue as Date) ?? 0
            if (xType === 'quantitative') return (xScale as d3.ScaleLinear<number, number>)(d.xValue as number) ?? 0
            return (xScale as d3.ScalePoint<string>)(d.xLabel) ?? 0
          })
          .y((d) => yScale(d.yValue))

        g.append(SvgElements.Path)
          .datum(sortedRows)
          .attr(SvgAttributes.D, line)
          .attr(SvgAttributes.Fill, 'none')
          .attr(SvgAttributes.Stroke, '#4f46e5')
          .attr(SvgAttributes.StrokeWidth, 2)
          .attr(DataAttributes.ChartId, id)

        g.selectAll<SVGCircleElement, NormalizedLinePoint>(SvgElements.Circle)
          .data(sortedRows)
          .join(SvgElements.Circle)
          .attr(SvgAttributes.CX, (d) => {
            if (xType === 'temporal') return (xScale as d3.ScaleTime<number, number>)(d.xValue as Date) ?? 0
            if (xType === 'quantitative') return (xScale as d3.ScaleLinear<number, number>)(d.xValue as number) ?? 0
            return (xScale as d3.ScalePoint<string>)(d.xLabel) ?? 0
          })
          .attr(SvgAttributes.CY, (d) => yScale(d.yValue))
          .attr(SvgAttributes.R, 3)
          .attr(SvgAttributes.Fill, '#4f46e5')
          .attr(DataAttributes.ChartId, id)
          .attr(DataAttributes.Target, (d) => d.xLabel)
          .attr(DataAttributes.Id, (d) => d.xId)
          .attr(DataAttributes.Value, (d) => String(d.yValue))
      })

      nextSvg.attr(DataAttributes.AxisRotation, String(maxAxisRotation))
      nextSvg.attr(DataAttributes.TickDensityStep, String(maxDensityStep))
      return nextSvg
    },
    { maxPasses: 4 },
  )
  return svg
}

export async function tagSimpleLineMarks(container: HTMLElement, spec: ChartSpec) {
  const resolved = resolveSimpleLineEncoding(spec)
  if (!resolved) return []
  const { xField, yField, xType, colorField } = resolved
  // wait up to 5 animation frames for marks to be rendered
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
    .attr(DataAttributes.ColorField, colorField ?? null)
  // Tag all shapes that actually carry datum with x/y.
  const rows: RawDatum[] = []
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
    if (rawTarget != null && rawValue != null) {
      let isoFull = String(rawTarget)
      let isoDate = String(rawTarget)
      if (xType === 'temporal') {
        try {
          const dt = toDateValue(rawTarget as JsonValue)
          const time = dt.getTime()
          if (Number.isFinite(time)) {
            isoFull = dt.toISOString()
            isoDate = isoFull.slice(0, 10)
          }
        } catch {
          // If the date value is invalid, skip ISO conversion and keep the raw label.
        }
      }
      const valueVal = rawValue
      d3.select(this as Element)
        .attr(DataAttributes.Target, isoDate)
        .attr(DataAttributes.Id, isoFull)
        .attr(DataAttributes.Value, valueVal != null ? String(valueVal) : null)

      const numeric = Number(valueVal)
      if (Number.isFinite(numeric)) {
        const row = datum as RawDatum
        rows.push({
          ...row,
          [xField]: rawTarget as JsonValue,
          [yField]: numeric,
        })
      }
    }
  })
  return rows
}

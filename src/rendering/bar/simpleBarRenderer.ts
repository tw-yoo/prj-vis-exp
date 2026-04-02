import * as d3 from 'd3'
import { ChartType, type ChartSpec } from '../../domain/chart'
import type { JsonValue } from '../../types'
import { DataAttributes, SvgAttributes, SvgClassNames, SvgElements } from '../interfaces'
import { applyAxisTickLabelSize } from '../common/d3Helpers'
import { attachChartHoverTooltip, formatTooltipValue, writeTooltipRootAttrs } from '../common/chartHoverTooltip'
import { buildCategoricalDisplayLabelMap, categoricalTickFormatter } from '../common/displayLabels'
import { wrapAxisTickLabels } from '../common/wrapAxisTickLabels'
import { resolveLayoutModel } from '../common/chartLayout'
import { renderWithMeasuredLayout } from '../common/renderWithMeasuredLayout'
import { CHART_TEXT_SIZE } from '../config/chartTextConfig'
import { bumpRenderEpoch } from '../common/renderEpoch'
import { storeRuntimeChartState } from '../utils/runtimeChartState'

type RawDatum = Record<string, JsonValue>

// Local store keyed by container element
const localDataStore: WeakMap<HTMLElement, RawDatum[]> = new WeakMap()
const splitDomainStore: WeakMap<HTMLElement, Record<string, Set<string>>> = new WeakMap()

export type SimpleBarSpec = ChartSpec & {
  encoding: {
    x: { field: string; type: string; aggregate?: string; sort?: JsonValue }
    y: { field: string; type: string; aggregate?: string }
  }
}

export type SimpleBarRenderOptions = {
  preserveSelectors?: string[]
  stateHost?: HTMLElement
  attachTooltip?: boolean
}

function clearRenderHostChildren(container: HTMLElement, preserveSelectors: string[] = []) {
  const preserved = new Set<Element>()
  preserveSelectors.forEach((selector) => {
    container.querySelectorAll(selector).forEach((node) => preserved.add(node))
  })
  Array.from(container.children).forEach((child) => {
    if (preserved.has(child)) return
    child.remove()
  })
}

function normalizeOptionalLabel(value: JsonValue | undefined) {
  if (value === undefined) return undefined
  if (value === null) return null
  const str = String(value).trim()
  return str.length > 0 ? str : null
}

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

function aggregateValues(data: RawDatum[], groupField: string, valueField: string, agg: string) {
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
    return {
      [groupField]: key,
      [valueField]: resolved,
    }
  })
}

function resolveCategoricalDomain(data: RawDatum[], xField: string, sortSpec: JsonValue | undefined) {
  const fallbackDomain = Array.from(new Set(data.map((d) => d[xField] as string | number)))
  if (!sortSpec) return fallbackDomain
  if (Array.isArray(sortSpec)) return sortSpec.map((v) => String(v)) as Array<string | number>
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

function writeDatasetAttrs(
  svg: d3.Selection<SVGSVGElement, unknown, d3.BaseType, unknown>,
  spec: SimpleBarSpec,
  margin: { top: number; right: number; bottom: number; left: number },
  explanation: { top: number; height: number; bottom: number; annotationTopClearance: number },
  plotW: number,
  plotH: number,
) {
  const { x, y } = spec.encoding
  svg
    .attr(DataAttributes.MarginLeft, margin.left)
    .attr(DataAttributes.MarginTop, margin.top)
    .attr(DataAttributes.ExplanationTop, explanation.top)
    .attr(DataAttributes.ExplanationHeight, explanation.height)
    .attr(DataAttributes.ExplanationBottom, explanation.bottom)
    .attr(DataAttributes.AnnotationTopClearance, explanation.annotationTopClearance)
    .attr(DataAttributes.PlotWidth, plotW)
    .attr(DataAttributes.PlotHeight, plotH)
    .attr(DataAttributes.XField, x.field)
    .attr(DataAttributes.YField, y.field)
    .attr(DataAttributes.XSortOrder, (() => {
      const sortSpec = spec?.encoding?.x?.sort
      if (!sortSpec) return null
      if (Array.isArray(sortSpec)) return sortSpec.join(',')
      if (typeof sortSpec === 'string') return sortSpec
      try {
        return JSON.stringify(sortSpec)
      } catch {
        return null
      }
    })())
}

/**
 * Render a basic (non-animated) simple bar chart into the provided container.
 * Accepts the parsed chart spec shape (enc.x/y field/type; optional data url/values, sort, aggregate).
 * Stores raw data per container in a WeakMap for later ops.
 */
export async function renderSimpleBarChart(
  container: HTMLElement,
  spec: SimpleBarSpec,
  options: SimpleBarRenderOptions = {},
) {
  const stateHost = options.stateHost ?? container
  const preserveSelectors = options.preserveSelectors ?? []
  const attachTooltip = options.attachTooltip ?? true
  const renderEpoch = bumpRenderEpoch(stateHost, container)
  const yField = spec.encoding.y.field
  const xField = spec.encoding.x.field
  const xType = spec.encoding.x.type
  const yType = spec.encoding.y.type
  const barFill = resolveBarFill(spec)
  clearSimpleBarSplitDomains(stateHost)
  const axisLabelsMeta = (spec as { meta?: { axisLabels?: { x?: JsonValue; y?: JsonValue } } }).meta?.axisLabels ?? {}
  const xAxisLabelOverride = normalizeOptionalLabel(axisLabelsMeta.x)
  const yAxisLabelOverride = normalizeOptionalLabel(axisLabelsMeta.y)
  const resolvedXAxisLabel = xAxisLabelOverride === undefined ? xField : xAxisLabelOverride
  const resolvedYAxisLabel = yAxisLabelOverride === undefined ? yField : yAxisLabelOverride

  let data: RawDatum[] = []
  if (spec.data && Array.isArray((spec.data as { values?: JsonValue[] }).values)) {
    data = (spec.data as { values: JsonValue[] }).values.map((d) => ({ ...(d as RawDatum) }))
  } else if (spec.data && typeof (spec.data as { url?: JsonValue }).url === 'string') {
    const url = (spec.data as { url: string }).url
    if (url.endsWith('.json')) {
      const loaded = await d3.json(url)
      data = Array.isArray(loaded) ? (loaded as RawDatum[]) : []
    } else {
      const loaded = await d3.csv(url)
      data = Array.isArray(loaded) ? (loaded as RawDatum[]) : []
    }
  } else {
    console.warn('renderSimpleBarChart: spec.data.values or spec.data.url is required')
    data = []
  }

  data.forEach((d) => {
    if (xType === 'quantitative') d[xField] = Number(d[xField])
    if (yType === 'quantitative') d[yField] = Number(d[yField])
  })

  const transforms = (spec as { transform?: JsonValue }).transform
  if (Array.isArray(transforms)) {
    transforms.forEach((t) => {
      const filterExpr = (t as { filter?: JsonValue })?.filter
      if (typeof filterExpr === 'string') {
        const expr = filterExpr.replace(/datum\./g, 'd.')
        const filterFn = new Function('d', `return ${expr};`) as (d: RawDatum) => boolean
        data = data.filter((d) => {
          try {
            return filterFn(d)
          } catch {
            return true
          }
        })
      }
    })
  }

  const enc = spec.encoding
  const agg = enc.x.aggregate || enc.y.aggregate
  if (agg) {
    const groupField = enc.x.aggregate ? enc.y.field : enc.x.field
    const valueField = enc.x.aggregate ? enc.x.field : enc.y.field
    data = aggregateValues(data, groupField, valueField, agg)
  }

  localDataStore.set(stateHost, data)
  storeRuntimeChartState(stateHost, { chartType: ChartType.SIMPLE_BAR, spec, renderer: 'd3' })

  const xDomain = resolveCategoricalDomain(data, xField, spec?.encoding?.x?.sort).map(String)
  const xLabelMap = buildCategoricalDisplayLabelMap(data, xField)
  const yValues = data.map((d) => Number(d[yField])).filter(Number.isFinite)
  const minY = d3.min(yValues)
  const maxY = d3.max(yValues)
  let domainMin = Math.min(0, Number.isFinite(minY) ? (minY as number) : 0)
  let domainMax = Math.max(0, Number.isFinite(maxY) ? (maxY as number) : 0)
  if (domainMin === domainMax) domainMax = domainMin + 1
  const initialLayout = resolveLayoutModel({ container, chartType: ChartType.SIMPLE_BAR, spec })
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
      clearRenderHostChildren(container, preserveSelectors)

      const nextSvg = containerSelection
        .append(SvgElements.Svg)
        .attr(SvgAttributes.ViewBox, `0 0 ${width} ${height}`)
        .attr(DataAttributes.RenderEpoch, renderEpoch)
        .style('overflow', 'visible')

      writeDatasetAttrs(nextSvg, spec, margin, layout.explanation, plotW, plotH)
      writeTooltipRootAttrs(nextSvg, {
        xLabel: resolvedXAxisLabel ?? xField,
        yLabel: resolvedYAxisLabel ?? yField,
        groupLabel: null,
      })

      const g = nextSvg.append(SvgElements.Group).attr(SvgAttributes.Transform, `translate(${margin.left},${margin.top})`)
      const xScale = d3.scaleBand<string>().domain(xDomain).range([0, plotW]).padding(0.2)
      const yScale = d3.scaleLinear().domain([domainMin, domainMax]).nice().range([plotH, 0])
      const zeroY = yScale(0)

      g.append(SvgElements.Group)
        .attr(SvgAttributes.Class, SvgClassNames.XAxis)
        .attr(SvgAttributes.Transform, `translate(0,${plotH})`)
        .call(d3.axisBottom(xScale).tickFormat(categoricalTickFormatter(xLabelMap)))
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

      g.append(SvgElements.Group).attr(SvgAttributes.Class, SvgClassNames.YAxis).call(d3.axisLeft(yScale).ticks(5))
      applyAxisTickLabelSize(g.select<SVGGElement>(`.${SvgClassNames.YAxis}`))

      g.selectAll<SVGRectElement, RawDatum>(SvgElements.Rect)
        .data(data)
        .join(SvgElements.Rect)
        .attr(SvgAttributes.Class, SvgClassNames.MainBar)
        .attr(SvgAttributes.X, (d) => xScale(String(d[xField]))!)
        .attr(SvgAttributes.Width, xScale.bandwidth())
        .attr(SvgAttributes.Y, (d) => {
          const value = Number(d[yField])
          return value >= 0 ? yScale(value) : zeroY
        })
        .attr(SvgAttributes.Height, (d) => Math.abs(yScale(Number(d[yField])) - zeroY))
        .attr(SvgAttributes.Fill, barFill)
        .attr(DataAttributes.Id, (d) => String((d as { id?: JsonValue }).id ?? d[xField]))
        .attr(DataAttributes.Target, (d) => String(d[xField]))
        .attr(DataAttributes.Value, (d) => Number(d[yField]))
        .attr(DataAttributes.XValue, (d) => xLabelMap.get(String(d[xField])) ?? String(d[xField]))
        .attr(DataAttributes.YValue, (d) => formatTooltipValue(Number(d[yField])))

      if (resolvedXAxisLabel) {
        nextSvg
          .append(SvgElements.Text)
          .attr(SvgAttributes.Class, SvgClassNames.XAxisLabel)
          .attr(SvgAttributes.X, layout.axisTitles.x.x)
          .attr(SvgAttributes.Y, layout.axisTitles.x.y)
          .attr(SvgAttributes.TextAnchor, 'middle')
          .attr(SvgAttributes.FontSize, CHART_TEXT_SIZE.axisTitle)
          .text(resolvedXAxisLabel)
      }

      if (resolvedYAxisLabel) {
        nextSvg
          .append(SvgElements.Text)
          .attr(SvgAttributes.Class, SvgClassNames.YAxisLabel)
          .attr(SvgAttributes.Transform, 'rotate(-90)')
          .attr(SvgAttributes.X, layout.axisTitles.y.x)
          .attr(SvgAttributes.Y, layout.axisTitles.y.y)
          .attr(SvgAttributes.TextAnchor, 'middle')
          .attr(SvgAttributes.FontSize, CHART_TEXT_SIZE.axisTitle)
          .text(resolvedYAxisLabel)
      }

      return nextSvg
    },
    { maxPasses: 4 },
  )

  return svg
}

function resolveAxisLabels(spec: SimpleBarSpec) {
  const yField = spec.encoding.y.field
  const xField = spec.encoding.x.field
  const axisLabelsMeta = (spec as { meta?: { axisLabels?: { x?: JsonValue; y?: JsonValue } } }).meta?.axisLabels ?? {}
  const xAxisLabelOverride = normalizeOptionalLabel(axisLabelsMeta.x)
  const yAxisLabelOverride = normalizeOptionalLabel(axisLabelsMeta.y)
  const resolvedXAxisLabel = xAxisLabelOverride === undefined ? xField : xAxisLabelOverride
  const resolvedYAxisLabel = yAxisLabelOverride === undefined ? yField : yAxisLabelOverride
  return { resolvedXAxisLabel, resolvedYAxisLabel }
}

export async function renderSumSimpleBarChart(
  container: HTMLElement,
  spec: SimpleBarSpec,
  sumConfig: { value: number; label?: string },
) {
  const label = sumConfig.label ?? 'Sum'
  const value = sumConfig.value
  if (!Number.isFinite(value)) return
  const xField = spec.encoding.x.field
  const yField = spec.encoding.y.field
  const aggregatedRow: RawDatum = {
    [xField]: label,
    [yField]: value,
  }
  await renderSimpleBarChart(container, {
    ...spec,
    data: { values: [aggregatedRow] },
  })
}


export function getSimpleBarStoredData(container: HTMLElement) {
  return localDataStore.get(container) || []
}

export function setSimpleBarStoredData(container: HTMLElement, data: RawDatum[]) {
  localDataStore.set(container, data.map((row) => ({ ...row })))
}

export function setSimpleBarSplitDomains(container: HTMLElement, domains: Record<string, Set<string>>) {
  splitDomainStore.set(container, domains)
}

export function clearSimpleBarSplitDomains(container: HTMLElement) {
  splitDomainStore.delete(container)
}

export function getSimpleBarSplitDomain(container: HTMLElement, chartId: string | undefined) {
  if (!chartId) return null
  const domains = splitDomainStore.get(container)
  if (!domains) return null
  return domains[chartId] ?? null
}

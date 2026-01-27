// @ts-nocheck
import * as d3 from 'd3'
import type { VegaLiteSpec } from '../../utils/chartRenderer'
import type { JsonValue } from '../../types'
import { DataAttributes, SvgAttributes, SvgClassNames, SvgElements } from '../interfaces'
import { type DrawSplitSpec } from '../draw/types'

type RawDatum = Record<string, JsonValue>

// Local store keyed by container element
const localDataStore: WeakMap<HTMLElement, RawDatum[]> = new WeakMap()

export type SimpleBarSpec = VegaLiteSpec & {
  encoding: {
    x: { field: string; type: string; aggregate?: string; sort?: JsonValue }
    y: { field: string; type: string; aggregate?: string }
  }
}

function normalizeOptionalLabel(value: JsonValue | undefined) {
  if (value === undefined) return undefined
  if (value === null) return null
  const str = String(value).trim()
  return str.length > 0 ? str : null
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
  return Array.from(roll.entries()).map(([key, value]) => ({
    [groupField]: key,
    [valueField]: value,
  }))
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
  svg: d3.Selection<SVGSVGElement, RawDatum, HTMLElement, RawDatum>,
  spec: SimpleBarSpec,
  margin: { top: number; right: number; bottom: number; left: number },
  plotW: number,
  plotH: number,
) {
  const { x, y } = spec.encoding
  svg
    .attr(DataAttributes.MarginLeft, margin.left)
    .attr(DataAttributes.MarginTop, margin.top)
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
 * Accepts a Vega-Lite-like spec (enc.x/y field/type; optional data url/values, sort, aggregate).
 * Stores raw data per container in a WeakMap for later ops.
 */
export async function renderSimpleBarChart(container: HTMLElement, spec: SimpleBarSpec) {
  const yField = spec.encoding.y.field
  const xField = spec.encoding.x.field
  const xType = spec.encoding.x.type
  const yType = spec.encoding.y.type
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

  localDataStore.set(container, data)

  const margin = { top: 60, right: 20, bottom: 80, left: 60 }
  const width = 600
  const height = 300
  const plotW = width - margin.left - margin.right
  const plotH = height - margin.top - margin.bottom

  const containerSelection = d3.select(container)
  containerSelection.selectAll('*').remove()

  const svg = containerSelection.append(SvgElements.Svg).attr(SvgAttributes.ViewBox, `0 0 ${width} ${height}`)
    .style('overflow', 'visible') as any

  writeDatasetAttrs(svg, spec, margin, plotW, plotH)

  const g = (svg as any).append(SvgElements.Group).attr(SvgAttributes.Transform, `translate(${margin.left},${margin.top})`)

  const xDomain = resolveCategoricalDomain(data, xField, spec?.encoding?.x?.sort).map(String)
  const xScale = d3.scaleBand<string>().domain(xDomain).range([0, plotW]).padding(0.2)
  const yValues = data.map((d) => Number(d[yField])).filter(Number.isFinite)
  const minY = d3.min(yValues)
  const maxY = d3.max(yValues)
  let domainMin = Math.min(0, Number.isFinite(minY) ? (minY as number) : 0)
  let domainMax = Math.max(0, Number.isFinite(maxY) ? (maxY as number) : 0)
  if (domainMin === domainMax) domainMax = domainMin + 1

  const yScale = d3.scaleLinear().domain([domainMin, domainMax]).nice().range([plotH, 0])
  const zeroY = yScale(0)

  g.append(SvgElements.Group)
    .attr(SvgAttributes.Class, SvgClassNames.XAxis)
    .attr(SvgAttributes.Transform, `translate(0,${plotH})`)
    .call(d3.axisBottom(xScale))
    .selectAll(SvgElements.Text)
    .attr(SvgAttributes.Transform, 'rotate(-45)')
    .style('text-anchor', 'end')

  g.append(SvgElements.Group).attr(SvgAttributes.Class, SvgClassNames.YAxis).call(d3.axisLeft(yScale).ticks(5))

  ;(g as any).selectAll(SvgElements.Rect)
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
    .attr(SvgAttributes.Fill, '#69b3a2')
    .attr(DataAttributes.Id, (d) => String((d as { id?: JsonValue }).id ?? d[xField]))
    .attr(DataAttributes.Target, (d) => String(d[xField]))
    .attr(DataAttributes.Value, (d) => Number(d[yField]))

  if (resolvedXAxisLabel) {
    svg
      .append(SvgElements.Text)
      .attr(SvgAttributes.Class, SvgClassNames.XAxisLabel)
      .attr(SvgAttributes.X, margin.left + plotW / 2)
      .attr(SvgAttributes.Y, height - margin.bottom + 40)
      .attr(SvgAttributes.TextAnchor, 'middle')
      .attr(SvgAttributes.FontSize, 14)
      .text(resolvedXAxisLabel)
  }

  if (resolvedYAxisLabel) {
    svg
      .append(SvgElements.Text)
      .attr(SvgAttributes.Class, SvgClassNames.YAxisLabel)
      .attr(SvgAttributes.Transform, 'rotate(-90)')
      .attr(SvgAttributes.X, -(margin.top + plotH / 2))
      .attr(SvgAttributes.Y, margin.left - 45)
      .attr(SvgAttributes.TextAnchor, 'middle')
      .attr(SvgAttributes.FontSize, 14)
      .text(resolvedYAxisLabel)
  }

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

function normalizeSplitGroups(split: DrawSplitSpec, xDomain: Array<string | number>) {
  const entries = Object.entries(split.groups ?? {})
  if (entries.length === 0) return null

  const [idA, listA] = entries[0]
  const idB = entries[1]?.[0] ?? split.restTo ?? 'B'
  const listB = entries[1]?.[1] ?? []

  const setA = new Set((listA ?? []).map(String))
  const setB = new Set((listB ?? []).map(String))

  const domainA: Array<string | number> = []
  const domainB: Array<string | number> = []

  xDomain.forEach((label) => {
    const s = String(label)
    if (setA.has(s)) domainA.push(label)
    else if (setB.has(s)) domainB.push(label)
    else domainB.push(label)
  })

  return {
    ids: [idA, idB] as [string, string],
    domains: [domainA, domainB] as [Array<string | number>, Array<string | number>],
  }
}

export async function renderSplitSimpleBarChart(container: HTMLElement, spec: SimpleBarSpec, split: DrawSplitSpec) {
  const data = localDataStore.get(container) || []
  const xField = spec.encoding.x.field
  const yField = spec.encoding.y.field
  const { resolvedXAxisLabel, resolvedYAxisLabel } = resolveAxisLabels(spec)

  const margin = { top: 60, right: 20, bottom: 80, left: 60 }
  const width = 600
  const height = 300
  const plotW = width - margin.left - margin.right
  const plotH = height - margin.top - margin.bottom
  const gap = 18

  const xDomain = resolveCategoricalDomain(data, xField, spec?.encoding?.x?.sort)
  const splitGroups = normalizeSplitGroups(split, xDomain)
  if (!splitGroups) return

  const yValues = data.map((d) => Number(d[yField])).filter(Number.isFinite)
  const minY = d3.min(yValues)
  const maxY = d3.max(yValues)
  let domainMin = Math.min(0, Number.isFinite(minY) ? (minY as number) : 0)
  let domainMax = Math.max(0, Number.isFinite(maxY) ? (maxY as number) : 0)
  if (domainMin === domainMax) domainMax = domainMin + 1

  const orientation = split.orientation ?? 'vertical'
  const subW = orientation === 'horizontal' ? (plotW - gap) / 2 : plotW
  const subH = orientation === 'vertical' ? (plotH - gap) / 2 : plotH

  const containerSelection = d3.select(container)
  containerSelection.selectAll('*').remove()

  const svg = containerSelection
    .append(SvgElements.Svg)
    .attr(SvgAttributes.ViewBox, `0 0 ${width} ${height}`)
    .style('overflow', 'visible')

  writeDatasetAttrs(svg as any, spec, margin, plotW, plotH)

  const [idA, idB] = splitGroups.ids
  const [domainA, domainB] = splitGroups.domains

  const groups: Array<{ id: string; domain: Array<string | number>; offsetX: number; offsetY: number }> = [
    { id: idA, domain: domainA, offsetX: 0, offsetY: 0 },
    {
      id: idB,
      domain: domainB,
      offsetX: orientation === 'horizontal' ? subW + gap : 0,
      offsetY: orientation === 'vertical' ? subH + gap : 0,
    },
  ]

  groups.forEach(({ id, domain, offsetX, offsetY }) => {
    const g = svg
      .append(SvgElements.Group)
      .attr(DataAttributes.ChartId, id)
      .attr(SvgAttributes.Transform, `translate(${margin.left + offsetX},${margin.top + offsetY})`)

    const xScale = d3.scaleBand<string | number>().domain(domain).range([0, subW]).padding(0.2)
    const yScale = d3.scaleLinear().domain([domainMin, domainMax]).nice().range([subH, 0])
    const zeroY = yScale(0)

    g.append(SvgElements.Group)
      .attr(SvgAttributes.Class, SvgClassNames.XAxis)
      .attr(SvgAttributes.Transform, `translate(0,${subH})`)
      .call(d3.axisBottom(xScale))
      .selectAll(SvgElements.Text)
      .attr(SvgAttributes.Transform, 'rotate(-45)')
      .style('text-anchor', 'end')

    g.append(SvgElements.Group).attr(SvgAttributes.Class, SvgClassNames.YAxis).call(d3.axisLeft(yScale).ticks(5))

    const domainSet = new Set(domain.map(String))
    const rows = data.filter((d) => domainSet.has(String(d[xField])))

    g.selectAll(SvgElements.Rect)
      .data(rows)
      .join(SvgElements.Rect)
      .attr(SvgAttributes.Class, SvgClassNames.MainBar)
      .attr(SvgAttributes.X, (d) => xScale(d[xField] as string | number)!)
      .attr(SvgAttributes.Width, xScale.bandwidth())
      .attr(SvgAttributes.Y, (d) => {
        const value = Number(d[yField])
        return value >= 0 ? yScale(value) : zeroY
      })
      .attr(SvgAttributes.Height, (d) => Math.abs(yScale(Number(d[yField])) - zeroY))
      .attr(SvgAttributes.Fill, '#69b3a2')
      .attr(DataAttributes.Id, (d, i) => String((d as { id?: JsonValue }).id ?? d[xField] ?? i))
      .attr(DataAttributes.Target, (d) => String(d[xField]))
      .attr(DataAttributes.Value, (d) => Number(d[yField]))
  })

  if (resolvedXAxisLabel) {
    svg
      .append(SvgElements.Text)
      .attr(SvgAttributes.Class, SvgClassNames.XAxisLabel)
      .attr(SvgAttributes.X, margin.left + plotW / 2)
      .attr(SvgAttributes.Y, height - margin.bottom + 40)
      .attr(SvgAttributes.TextAnchor, 'middle')
      .attr(SvgAttributes.FontSize, 14)
      .text(resolvedXAxisLabel)
  }

  if (resolvedYAxisLabel) {
    svg
      .append(SvgElements.Text)
      .attr(SvgAttributes.Class, SvgClassNames.YAxisLabel)
      .attr(SvgAttributes.Transform, 'rotate(-90)')
      .attr(SvgAttributes.X, -(margin.top + plotH / 2))
      .attr(SvgAttributes.Y, margin.left - 45)
      .attr(SvgAttributes.TextAnchor, 'middle')
      .attr(SvgAttributes.FontSize, 14)
      .text(resolvedYAxisLabel)
  }
}

export function getSimpleBarStoredData(container: HTMLElement) {
  return localDataStore.get(container) || []
}
// @ts-nocheck

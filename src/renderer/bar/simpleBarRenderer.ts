import * as d3 from 'd3'
import type { VegaLiteSpec } from '../../utils/chartRenderer'
import type { DatumValue, OperationSpec } from '../../types'
import {
  retrieveValue,
  filterData,
  findExtremum,
  sortData,
  sumData,
  averageData,
  diffData,
  lagDiffData,
  nthData,
  compareOp,
  compareBoolOp,
  countData,
  determineRange,
} from '../../logic/dataOps'
import { clearAnnotations, getChartContext, type ChartContext } from '../common/d3Helpers'
import { BarDrawHandler } from '../draw/BarDrawHandler'
import type { DrawOp } from '../draw/types'

// Local store keyed by container element
const localDataStore: WeakMap<HTMLElement, any[]> = new WeakMap()

export type SimpleBarSpec = VegaLiteSpec & {
  encoding: {
    x: { field: string; type: string; aggregate?: string; sort?: any }
    y: { field: string; type: string; aggregate?: string }
  }
}

function normalizeOptionalLabel(value: unknown) {
  if (value === undefined) return undefined
  if (value === null) return null
  const str = String(value).trim()
  return str.length > 0 ? str : null
}

function aggregateValues(data: any[], groupField: string, valueField: string, agg: string) {
  const roll = d3.rollup(
    data,
    (v) => {
      const numeric = v.map((d) => +d[valueField]).filter(Number.isFinite)
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

function resolveCategoricalDomain(data: any[], xField: string, sortSpec: any) {
  const fallbackDomain = Array.from(new Set(data.map((d) => d[xField])))
  if (!sortSpec) return fallbackDomain
  if (Array.isArray(sortSpec)) return sortSpec.slice()
  if (typeof sortSpec === 'string') {
    const unique = Array.from(new Set(fallbackDomain))
    if (sortSpec === 'ascending') return unique.sort(d3.ascending)
    if (sortSpec === 'descending') return unique.sort(d3.descending)
    return unique
  }
  if (typeof sortSpec === 'object') {
    const { field: sortField, op = 'sum', order = 'ascending' } = sortSpec
    const grouped = new Map<string, any[]>()
    data.forEach((d) => {
      const key = d[xField]
      if (!grouped.has(key)) grouped.set(key, [])
      grouped.get(key)!.push(d)
    })
    const entries = Array.from(grouped.entries()).map(([key, rows]) => ({
      key,
      value: aggregateForSort(rows, sortField, op),
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

const SORT_OP_FNS: Record<string, (values: number[], rows?: any[]) => number> = {
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

function aggregateForSort(rows: any[], sortField: string, op = 'sum') {
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

function toDatumValues(rawData: any[], xField: string, yField: string, orientation: 'vertical' | 'horizontal'): DatumValue[] {
  const isHorizontal = orientation === 'horizontal'
  const categoryField = isHorizontal ? yField : xField
  const measureField = isHorizontal ? xField : yField
  return rawData.map((row, idx) => {
    const targetRaw = row[categoryField] ?? `item_${idx}`
    const valueRaw = row[measureField]
    return {
      category: categoryField,
      measure: measureField,
      target: String(targetRaw),
      group: null,
      value: Number(valueRaw),
      id: row.id != null ? String(row.id) : String(idx),
    }
  })
}

function writeDatasetAttrs(svg: d3.Selection<SVGSVGElement, unknown, null, undefined>, spec: SimpleBarSpec, margin: any, plotW: number, plotH: number) {
  const { x, y } = spec.encoding
  const isHorizontal = x.type === 'quantitative' && y.type !== 'quantitative'
  svg
    .attr('data-orientation', isHorizontal ? 'horizontal' : 'vertical')
    .attr('data-m-left', margin.left)
    .attr('data-m-top', margin.top)
    .attr('data-plot-w', plotW)
    .attr('data-plot-h', plotH)
    .attr('data-x-field', x.field)
    .attr('data-y-field', y.field)
    .attr('data-x-sort-order', (() => {
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
  const isHorizontal = xType === 'quantitative' && yType !== 'quantitative'
  const axisLabelsMeta = ((spec as any)?.meta as any)?.axisLabels ?? {}
  const xAxisLabelOverride = normalizeOptionalLabel(axisLabelsMeta.x)
  const yAxisLabelOverride = normalizeOptionalLabel(axisLabelsMeta.y)
  const resolvedXAxisLabel = xAxisLabelOverride === undefined ? xField : xAxisLabelOverride
  const resolvedYAxisLabel = yAxisLabelOverride === undefined ? yField : yAxisLabelOverride

  let data: any[] = []
  if (spec.data && Array.isArray((spec.data as any).values)) {
    data = (spec.data as any).values.map((d: any) => ({ ...d }))
  } else if (spec.data && typeof (spec.data as any).url === 'string') {
    if ((spec.data as any).url.endsWith('.json')) {
      data = (await d3.json((spec.data as any).url)) ?? []
    } else {
      data = (await d3.csv((spec.data as any).url)) ?? []
    }
  } else {
    console.warn('renderSimpleBarChart: spec.data.values or spec.data.url is required')
    data = []
  }

  data.forEach((d) => {
    if (xType === 'quantitative') d[xField] = +d[xField]
    if (yType === 'quantitative') d[yField] = +d[yField]
  })

  const transforms = (spec as any).transform
  if (Array.isArray(transforms)) {
    transforms.forEach((t: any) => {
      if (t.filter) {
        const expr = t.filter.replace(/datum\./g, 'd.')
        const filterFn = new Function('d', `return ${expr};`) as (d: any) => boolean
        data = data.filter((d: any) => {
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

  const svg = containerSelection
    .append('svg')
    .attr('viewBox', [0, 0, width, height] as any)
    .style('overflow', 'visible')

  writeDatasetAttrs(svg as any, spec, margin, plotW, plotH)

  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

  if (isHorizontal) {
    const xValues = data.map((d) => d[xField]).filter(Number.isFinite)
    const minX = d3.min(xValues)
    const maxX = d3.max(xValues)
    let domainMin = Math.min(0, Number.isFinite(minX) ? (minX as number) : 0)
    let domainMax = Math.max(0, Number.isFinite(maxX) ? (maxX as number) : 0)
    if (domainMin === domainMax) domainMax = domainMin + 1

    const xScale = d3.scaleLinear().domain([domainMin, domainMax]).nice().range([0, plotW])
    const zeroX = xScale(0)
    const yScale = d3.scaleBand().domain(data.map((d) => d[yField])).range([0, plotH]).padding(0.2)

    g.append('g').attr('class', 'y-axis').call(d3.axisLeft(yScale))
    g.append('g').attr('class', 'x-axis').attr('transform', `translate(0,${plotH})`).call(d3.axisBottom(xScale).ticks(5))

    g.selectAll('rect')
      .data(data)
      .join('rect')
      .attr('class', 'main-bar')
      .attr('x', (d) => (d[xField] >= 0 ? zeroX : xScale(d[xField])))
      .attr('y', (d) => yScale(d[yField])!)
      .attr('width', (d) => Math.abs(xScale(d[xField]) - zeroX))
      .attr('height', yScale.bandwidth())
      .attr('fill', '#69b3a2')
      .attr('data-id', (d) => d.id ?? d[yField])
      .attr('data-target', (d) => d[yField])
      .attr('data-value', (d) => d[xField])
  } else {
    const xDomain = resolveCategoricalDomain(data, xField, spec?.encoding?.x?.sort)
    const xScale = d3.scaleBand().domain(xDomain as any).range([0, plotW]).padding(0.2)
    const yValues = data.map((d) => d[yField]).filter(Number.isFinite)
    const minY = d3.min(yValues)
    const maxY = d3.max(yValues)
    let domainMin = Math.min(0, Number.isFinite(minY) ? (minY as number) : 0)
    let domainMax = Math.max(0, Number.isFinite(maxY) ? (maxY as number) : 0)
    if (domainMin === domainMax) domainMax = domainMin + 1

    const yScale = d3.scaleLinear().domain([domainMin, domainMax]).nice().range([plotH, 0])
    const zeroY = yScale(0)

    g.append('g')
      .attr('class', 'x-axis')
      .attr('transform', `translate(0,${plotH})`)
      .call(d3.axisBottom(xScale))
      .selectAll('text')
      .attr('transform', 'rotate(-45)')
      .style('text-anchor', 'end')

    g.append('g').attr('class', 'y-axis').call(d3.axisLeft(yScale).ticks(5))

    g.selectAll('rect')
      .data(data)
      .join('rect')
      .attr('class', 'main-bar')
      .attr('x', (d) => xScale(d[xField])!)
      .attr('width', xScale.bandwidth())
      .attr('y', (d) => (d[yField] >= 0 ? yScale(d[yField]) : zeroY))
      .attr('height', (d) => Math.abs(yScale(d[yField]) - zeroY))
      .attr('fill', '#69b3a2')
      .attr('data-id', (d) => d.id ?? d[xField])
      .attr('data-target', (d) => d[xField])
      .attr('data-value', (d) => d[yField])
  }

  if (resolvedXAxisLabel) {
    svg
      .append('text')
      .attr('class', 'x-axis-label')
      .attr('x', margin.left + plotW / 2)
      .attr('y', height - margin.bottom + 40)
      .attr('text-anchor', 'middle')
      .attr('font-size', 14)
      .text(resolvedXAxisLabel)
  }

  if (resolvedYAxisLabel) {
    svg
      .append('text')
      .attr('class', 'y-axis-label')
      .attr('transform', 'rotate(-90)')
      .attr('x', -(margin.top + plotH / 2))
      .attr('y', margin.left - 45)
      .attr('text-anchor', 'middle')
      .attr('font-size', 14)
      .text(resolvedYAxisLabel)
  }

  return svg
}

/** Resolve chart context (svg, group, margins, fields) for a container. */
function getContext(container: HTMLElement): ChartContext {
  return getChartContext(container, { preferPlotArea: true, defaultOrientation: 'vertical' })
}

function toWorkingDatumValues(container: HTMLElement, vlSpec: SimpleBarSpec) {
  const raw = localDataStore.get(container) || []
  const { orientation, xField, yField } = getContext(container)
  const orient = orientation === 'horizontal' ? 'horizontal' : 'vertical'
  return toDatumValues(raw, xField || vlSpec.encoding.x.field, yField || vlSpec.encoding.y.field, orient)
}

type OpsSpecInput = { ops?: OperationSpec[] } | OperationSpec[] | null | undefined

function normalizeOpsList(opsSpec: OpsSpecInput): OperationSpec[] {
  if (!opsSpec) return []
  if (Array.isArray(opsSpec)) return opsSpec
  if (Array.isArray((opsSpec as any).ops)) return (opsSpec as any).ops
  return []
}

const OP_HANDLERS: Record<string, (data: DatumValue[], op: OperationSpec, container?: HTMLElement) => DatumValue[] | any> = {
  retrieveValue,
  filter: filterData,
  findExtremum,
  determineRange,
  compare: compareOp,
  compareBool: compareBoolOp,
  sort: sortData,
  sum: sumData,
  average: averageData,
  diff: diffData,
  lagDiff: lagDiffData,
  nth: nthData,
  count: countData,
  draw: (data, op, container) => handleDraw(container, data, op as DrawOp),
}

function handleDraw(container: HTMLElement | undefined, data: DatumValue[], op: DrawOp) {
  if (!container) return data
  const handler = new BarDrawHandler(container)
  handler.run(op)
  return data
}

/**
 * Run a list of operations against a rendered simple bar chart in the given container.
 * Rendering is invoked first to ensure the chart and data store are prepared.
 */
export async function runSimpleBarOps(
  container: HTMLElement,
  vlSpec: SimpleBarSpec,
  opsSpec: OpsSpecInput,
): Promise<DatumValue[] | any> {
  // render base chart
  await renderSimpleBarChart(container, vlSpec)

  const baseData = toWorkingDatumValues(container, vlSpec)
  let working: DatumValue[] | any = baseData

  const opsList = normalizeOpsList(opsSpec)

  for (const op of opsList) {
    const handler = OP_HANDLERS[op.op ?? '']
    if (!handler) {
      console.warn(`Unsupported operation: ${op.op}`)
      continue
    }
    // Pass container as the third argument so draw ops can target the rendered chart.
    working = handler(Array.isArray(working) ? working : baseData, op, container)
  }

  // Optional: clear annotations between runs (uses new helper)
  const ctx = getContext(container)
  clearAnnotations(ctx.svg)

  return working
}

import * as d3 from 'd3'
import type { VegaLiteSpec } from '../../utils/chartRenderer'
import type { DataOpResult, DatumValue, JsonValue, OperationSpec } from '../../types'
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
import { runDataOps, runDrawOps, splitOps } from '../ops/operationPipeline'
import { clearAnnotations, getChartContext, type ChartContext } from '../common/d3Helpers'
import { BarDrawHandler } from '../draw/BarDrawHandler'

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
  if (Array.isArray(sortSpec)) return sortSpec.slice() as Array<string | number>
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
      const key = d[xField] as string | number
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

function toDatumValues(rawData: RawDatum[], xField: string, yField: string): DatumValue[] {
  const categoryField = xField
  const measureField = yField
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

function writeDatasetAttrs(
  svg: d3.Selection<SVGSVGElement, RawDatum, HTMLElement, RawDatum>,
  spec: SimpleBarSpec,
  margin: { top: number; right: number; bottom: number; left: number },
  plotW: number,
  plotH: number,
) {
  const { x, y } = spec.encoding
  svg
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

  const svg = containerSelection.append('svg').attr('viewBox', `0 0 ${width} ${height}`)
    .style('overflow', 'visible')

  writeDatasetAttrs(svg, spec, margin, plotW, plotH)

  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

  const xDomain = resolveCategoricalDomain(data, xField, spec?.encoding?.x?.sort)
  const xScale = d3.scaleBand<string | number>().domain(xDomain).range([0, plotW]).padding(0.2)
  const yValues = data.map((d) => Number(d[yField])).filter(Number.isFinite)
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
    .attr('x', (d) => xScale(d[xField] as string | number)!)
    .attr('width', xScale.bandwidth())
    .attr('y', (d) => {
      const value = Number(d[yField])
      return value >= 0 ? yScale(value) : zeroY
    })
    .attr('height', (d) => Math.abs(yScale(Number(d[yField])) - zeroY))
    .attr('fill', '#69b3a2')
    .attr('data-id', (d) => String((d as { id?: JsonValue }).id ?? d[xField]))
    .attr('data-target', (d) => String(d[xField]))
    .attr('data-value', (d) => Number(d[yField]))

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
  return getChartContext(container, { preferPlotArea: true })
}

function toWorkingDatumValues(container: HTMLElement, vlSpec: SimpleBarSpec) {
  const raw = localDataStore.get(container) || []
  const { xField, yField } = getContext(container)
  return toDatumValues(raw, xField || vlSpec.encoding.x.field, yField || vlSpec.encoding.y.field)
}

type OpsSpecInput = { ops?: OperationSpec[] } | OperationSpec[] | null | undefined

function normalizeOpsList(opsSpec: OpsSpecInput): OperationSpec[] {
  if (!opsSpec) return []
  if (Array.isArray(opsSpec)) return opsSpec
  if (typeof opsSpec === 'object' && Array.isArray((opsSpec as { ops?: JsonValue }).ops)) {
    return (opsSpec as { ops: OperationSpec[] }).ops
  }
  if (typeof opsSpec === 'object') return [opsSpec as OperationSpec]
  return []
}

const DATA_OP_HANDLERS: Record<string, (data: DatumValue[], op: OperationSpec) => DataOpResult> = {
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
}

/**
 * Run a list of operations against a rendered simple bar chart in the given container.
 * Rendering is invoked first to ensure the chart and data store are prepared.
 */
export async function runSimpleBarOps(
  container: HTMLElement,
  vlSpec: SimpleBarSpec,
  opsSpec: OpsSpecInput,
): Promise<DataOpResult> {
  // render base chart
  await renderSimpleBarChart(container, vlSpec)

  const baseData = toWorkingDatumValues(container, vlSpec)

  const opsList = normalizeOpsList(opsSpec)
  const { dataOps, drawOps } = splitOps(opsList)

  const working = runDataOps(baseData, dataOps, DATA_OP_HANDLERS, {
    resetRuntime: true,
    storeRuntime: true,
  })

  if (drawOps.length > 0) {
    // Clear annotations between runs before applying draw ops.
    const ctx = getContext(container)
    clearAnnotations(ctx.svg)
    const handler = new BarDrawHandler(container)
    await runDrawOps(drawOps, (op) => handler.run(op))
  }

  return working
}

import * as d3 from 'd3'
import type { JsonValue } from '../../types'
import { renderVegaLiteChart, type VegaLiteSpec } from '../chartRenderer'
import { DataAttributes, SvgAttributes, SvgClassNames, SvgElements } from '../interfaces'
import { ensureXAxisLabelClearance } from '../common/d3Helpers'

const localDataStore: WeakMap<HTMLElement, RawDatum[]> = new WeakMap()
const splitDomainStore: WeakMap<HTMLElement, Record<string, Set<string>>> = new WeakMap()

type RawDatum = Record<string, JsonValue>
type AxisScale = d3.ScaleTime<number, number> | d3.ScaleLinear<number, number> | d3.ScalePoint<string>

function toRawRows(data: VegaLiteSpec['data']): RawDatum[] {
  if (!data || typeof data !== 'object' || !('values' in data)) return []
  const values = data.values
  if (!Array.isArray(values)) return []
  return values.filter((value): value is RawDatum => !!value && typeof value === 'object' && !Array.isArray(value))
}

function resolveLineMark(mark: VegaLiteSpec['mark']) {
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

function formatTemporalTick(value: Date | d3.NumberValue) {
  const date = value instanceof Date ? value : new Date(Number(value))
  return d3.timeFormat('%Y-%m-%d')(date)
}

function getDatumRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

export type LineSpec = VegaLiteSpec & {
  encoding: {
    x: { field: string; type: string }
    y: { field: string; type: string }
    color?: { field?: string }
  }
}

// Ops runner functions are in `src/renderer/line/simpleLineOps.ts`.

export async function renderSimpleLineChart(container: HTMLElement, spec: LineSpec) {
  const values = toRawRows(spec.data)
  localDataStore.set(container, values)
  clearSimpleLineSplitDomains(container)
  const mark = resolveLineMark(spec.mark)
  const withPoints = { ...spec, mark }
  const result = await renderVegaLiteChart(container, withPoints)
  await tagSimpleLineMarks(container, spec)
  ensureXAxisLabelClearance(container.id || 'chart', { attempts: 5, minGap: 14, maxShift: 120 })
  return result
}

export function getSimpleLineStoredData(container: HTMLElement) {
  return localDataStore.get(container) || []
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

function normalizeSplitGroups(split: { groups: Record<string, Array<string | number>>; restTo?: string }, xDomain: string[]) {
  const entries = Object.entries(split.groups ?? {})
  if (entries.length === 0) return null
  const [idA, listA] = entries[0]
  const idB = entries[1]?.[0] ?? split.restTo ?? 'B'
  const listB = entries[1]?.[1] ?? []

  const setA = new Set((listA ?? []).map(String))
  const setB = new Set((listB ?? []).map(String))
  const domainA: string[] = []
  const domainB: string[] = []
  xDomain.forEach((label) => {
    if (setA.has(label)) domainA.push(label)
    else if (setB.has(label)) domainB.push(label)
    else domainB.push(label)
  })
  return { ids: [idA, idB] as [string, string], domains: [domainA, domainB] as [string[], string[]] }
}

function normalizeLinePoints(values: RawDatum[], xField: string, yField: string, xType: string) {
  const points: NormalizedLinePoint[] = []
  values.forEach((row) => {
    const rawX = row?.[xField]
    const rawY = row?.[yField]
    const yValue = Number(rawY)
    if (rawX == null || !Number.isFinite(yValue)) return
    const normalized = normalizeLineXValue(rawX, xType)
    points.push({
      xLabel: normalized.label,
      xId: normalized.id,
      xValue: normalized.value,
      xSort: normalized.sort,
      yValue,
    })
  })
  return points
}

export async function renderSplitSimpleLineChart(container: HTMLElement, spec: LineSpec, split: { groups: Record<string, Array<string | number>>; restTo?: string; orientation?: 'vertical' | 'horizontal' }) {
  const stored = (getSimpleLineStoredData(container) || []) as RawDatum[]
  const xField = spec.encoding.x.field
  const yField = spec.encoding.y.field
  const xType = spec.encoding.x.type
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

  const orientation = split.orientation ?? 'vertical'
  const margin = { top: 60, right: 20, bottom: 80, left: 60 }
  const width = 600
  const height = 300
  const plotW = width - margin.left - margin.right
  const plotH = height - margin.top - margin.bottom
  const gap = 18
  const subW = orientation === 'horizontal' ? (plotW - gap) / 2 : plotW
  const subH = orientation === 'vertical' ? (plotH - gap) / 2 : plotH

  const containerSelection = d3.select(container)
  containerSelection.selectAll('*').remove()

  const svg = containerSelection
    .append(SvgElements.Svg)
    .attr(SvgAttributes.ViewBox, `0 0 ${width} ${height}`)
    .style('overflow', 'visible')

  const [idA, idB] = splitGroups.ids
  const [domainA, domainB] = splitGroups.domains
  setSimpleLineSplitDomains(container, {
    [idA]: new Set(domainA),
    [idB]: new Set(domainB),
  })

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

  groups.forEach(({ id, domain, offsetX, offsetY }) => {
    const g = svg
      .append(SvgElements.Group)
      .attr(DataAttributes.ChartId, id)
      .attr(SvgAttributes.Transform, `translate(${margin.left + offsetX},${margin.top + offsetY})`)

    const xScale = buildXScale(domain)
    const yScale = d3.scaleLinear().domain([domainMin, domainMax]).nice().range([subH, 0])

    const xAxis =
      xType === 'temporal'
        ? d3.axisBottom(xScale as d3.ScaleTime<number, number>).tickFormat(formatTemporalTick)
        : xType === 'quantitative'
          ? d3.axisBottom(xScale as d3.ScaleLinear<number, number>)
          : d3.axisBottom(xScale as d3.ScalePoint<string>)
    g.append(SvgElements.Group)
      .attr(SvgAttributes.Class, SvgClassNames.XAxis)
      .attr(SvgAttributes.Transform, `translate(0,${subH})`)
      .call(xAxis)
      .selectAll(SvgElements.Text)
      .attr(SvgAttributes.Transform, 'rotate(-45)')
      .style('text-anchor', 'end')

    g.append(SvgElements.Group).attr(SvgAttributes.Class, SvgClassNames.YAxis).call(d3.axisLeft(yScale).ticks(5))

    const domainSet = new Set(domain)
    const rows = points.filter((p) => domainSet.has(p.xLabel))
    if (!rows.length) return

    const sortIndex = new Map(domain.map((label, idx) => [label, idx]))
    const sorted = rows.slice().sort((a, b) => {
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
      .datum(sorted)
      .attr(SvgAttributes.D, line)
      .attr(SvgAttributes.Fill, 'none')
      .attr(SvgAttributes.Stroke, '#4f46e5')
      .attr(SvgAttributes.StrokeWidth, 2)

    g.selectAll<SVGCircleElement, NormalizedLinePoint>(SvgElements.Circle)
      .data(sorted)
      .join(SvgElements.Circle)
      .attr(SvgAttributes.CX, (d) => {
        if (xType === 'temporal') return (xScale as d3.ScaleTime<number, number>)(d.xValue as Date) ?? 0
        if (xType === 'quantitative') return (xScale as d3.ScaleLinear<number, number>)(d.xValue as number) ?? 0
        return (xScale as d3.ScalePoint<string>)(d.xLabel) ?? 0
      })
      .attr(SvgAttributes.CY, (d) => yScale(d.yValue))
      .attr(SvgAttributes.R, 3)
      .attr(SvgAttributes.Fill, '#4f46e5')
      .attr(DataAttributes.Target, (d) => d.xLabel)
      .attr(DataAttributes.Id, (d) => d.xId)
      .attr(DataAttributes.Value, (d) => String(d.yValue))
  })
}

export async function tagSimpleLineMarks(container: HTMLElement, spec: LineSpec) {
  const xField = spec.encoding.x.field
  const yField = spec.encoding.y.field
  const xType = spec.encoding.x.type
  // wait up to 5 animation frames for marks to be rendered
  for (let i = 0; i < 5; i += 1) {
    const svgCheck = d3.select(container).select(SvgElements.Svg)
    const markCount = svgCheck.selectAll<SVGGraphicsElement, unknown>('path, circle, rect').size()
    if (markCount > 0) break
    await new Promise((resolve) => requestAnimationFrame(resolve))
  }
  const svg = d3.select(container).select(SvgElements.Svg)
  // Tag all shapes that actually carry datum with x/y.
  let count = 0
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
        const dt = toDateValue(rawTarget as JsonValue)
        isoFull = dt.toISOString()
        isoDate = isoFull.slice(0, 10)
      }
      const valueVal = rawValue
      d3.select(this as Element)
        .attr(DataAttributes.Target, isoDate)
        .attr(DataAttributes.Id, isoFull)
        .attr(DataAttributes.Value, valueVal != null ? String(valueVal) : null)
      count += 1
    }
  })
  // eslint-disable-next-line no-console
  return count
}

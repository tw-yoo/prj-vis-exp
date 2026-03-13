import * as d3 from 'd3'
import type { JsonValue } from '../../types'
import { bumpRenderEpoch, renderVegaLiteChart, type VegaLiteSpec } from '../chartRenderer'
import { DataAttributes, SvgAttributes, SvgClassNames, SvgElements } from '../interfaces'
import { ensureXAxisLabelClearance } from '../common/d3Helpers'

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

function normalizeMarkType(mark: VegaLiteSpec['mark']) {
  if (!mark) return null
  if (typeof mark === 'string') return mark
  if (typeof mark === 'object' && typeof mark.type === 'string') return mark.type
  return null
}

function normalizeLayers(spec: VegaLiteSpec) {
  const baseEncoding = isRecord(spec.encoding) ? (spec.encoding as Record<string, JsonValue>) : {}
  if (Array.isArray(spec.layer) && spec.layer.length > 0) {
    return spec.layer.map((layer) => ({
      mark: normalizeMarkType((layer?.mark as VegaLiteSpec['mark']) ?? spec.mark),
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

export function resolveSimpleLineEncoding(spec: VegaLiteSpec): ResolvedLineEncoding | null {
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
  // Some "simple line" specs encode x/y at layer-level (e.g. line + point layering).
  // Keep encoding optional and resolve effective fields via `resolveSimpleLineEncoding`.
  encoding?: Record<string, JsonValue>
}

// Ops runner functions are in `src/renderer/line/simpleLineOps.ts`.

export async function renderSimpleLineChart(container: HTMLElement, spec: LineSpec) {
  clearSimpleLineSplitDomains(container)
  const mark = resolveLineMark(spec.mark)
  const withPoints = { ...spec, mark }
  const result = await renderVegaLiteChart(container, withPoints)
  const tagged = await tagSimpleLineMarks(container, spec as VegaLiteSpec)
  localDataStore.set(container, tagged)
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
  const resolved = resolveSimpleLineEncoding(spec as VegaLiteSpec)
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
    .attr(DataAttributes.RenderEpoch, renderEpoch)
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
      .attr(DataAttributes.ChartId, id)

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
      .attr(DataAttributes.ChartId, id)
      .attr(DataAttributes.Target, (d) => d.xLabel)
      .attr(DataAttributes.Id, (d) => d.xId)
      .attr(DataAttributes.Value, (d) => String(d.yValue))
  })
}

export async function tagSimpleLineMarks(container: HTMLElement, spec: VegaLiteSpec) {
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
        rows.push({
          [xField]: rawTarget as JsonValue,
          [yField]: numeric,
        })
      }
    }
  })
  return rows
}

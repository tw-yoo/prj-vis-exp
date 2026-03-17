import * as d3 from 'd3'
import type { JsonValue } from '../../types'
import { bumpRenderEpoch, renderVegaLiteChart, type VegaLiteSpec } from '../chartRenderer'
import { DataAttributes, SvgAttributes, SvgClassNames, SvgElements } from '../interfaces'
import { ensureXAxisLabelClearance } from '../common/d3Helpers'
import { wrapAxisTickLabels } from '../common/wrapAxisTickLabels'

const localDataStore: WeakMap<HTMLElement, RawDatum[]> = new WeakMap()
const splitDomainStore: WeakMap<HTMLElement, Record<string, Set<string>>> = new WeakMap()

type RawDatum = Record<string, JsonValue>
type AxisScale = d3.ScaleTime<number, number> | d3.ScaleLinear<number, number> | d3.ScalePoint<string>

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

export type MultiLineSpec = VegaLiteSpec & {
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
export function resolveMultiLineEncoding(spec: VegaLiteSpec): ResolvedMultiLineEncoding | null {
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

  const resolvedEncoding = resolveMultiLineEncoding(spec)
  if (!resolvedEncoding) {
    console.warn('renderMultipleLineChart: missing x/y encoding (cannot tag marks for ops)')
  }

  const withPoints = Array.isArray(spec.layer) && spec.layer.length > 0 ? spec : { ...spec, mark: resolveLineMark(spec.mark) }
  const result = await renderVegaLiteChart(container, withPoints)
  await tagMultipleLineMarks(container, spec)
  // IMPORTANT: Read back the rendered (post-transform/filter) Vega-Lite mark data so that
  // downstream app logic (ops, interactions) sees the same filtered dataset the user sees.
  localDataStore.set(container, resolvedEncoding ? collectRenderedDatumRows(container, resolvedEncoding) : [])
  ensureXAxisLabelClearance(container.id || 'chart', { attempts: 5, minGap: 14, maxShift: 120 })
  return result
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

type NormalizedMultiLinePoint = {
  xLabel: string
  xId: string
  xValue: string | number | Date
  xSort: number | string
  yValue: number
  series: string | null
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

function normalizeMultiLinePoints(values: RawDatum[], encoding: ResolvedMultiLineEncoding) {
  const xField = encoding.xField
  const yField = encoding.yField
  const xType = encoding.xType ?? 'nominal'
  const colorField = encoding.colorField ?? null
  const points: NormalizedMultiLinePoint[] = []
  values.forEach((row) => {
    const rawX = row?.[xField]
    const rawY = row?.[yField]
    const yValue = Number(rawY)
    if (rawX == null || !Number.isFinite(yValue)) return
    const normalized = normalizeLineXValue(rawX, xType)
    const series = colorField ? (row?.[colorField] != null ? String(row[colorField]) : null) : null
    points.push({
      xLabel: normalized.label,
      xId: normalized.id,
      xValue: normalized.value,
      xSort: normalized.sort,
      yValue,
      series,
    })
  })
  return points
}

export async function renderSplitMultipleLineChart(
  container: HTMLElement,
  spec: MultiLineSpec,
  split: {
    mode?: 'domain' | 'selector'
    groups?: Record<string, Array<string | number>>
    selectors?: Record<string, { include?: Array<string | number>; exclude?: Array<string | number>; all?: boolean }>
    restTo?: string
    orientation?: 'vertical' | 'horizontal'
  },
) {
  const renderEpoch = bumpRenderEpoch(container)
  const stored = (getMultipleLineStoredData(container) || []) as RawDatum[]
  const encoding = resolveMultiLineEncoding(spec)
  if (!encoding) {
    console.warn('renderSplitMultipleLineChart: missing x/y encoding')
    return
  }
  const xType = encoding.xType ?? 'nominal'
  const points = normalizeMultiLinePoints(stored, encoding)
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
  setMultipleLineSplitDomains(container, {
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

  const seriesValues = Array.from(new Set(points.map((p) => p.series ?? ''))).filter((s) => s !== '')
  const colorScale = d3.scaleOrdinal<string, string>(d3.schemeCategory10).domain(seriesValues)

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
    wrapAxisTickLabels(g.select(`.${SvgClassNames.XAxis}`).selectAll<SVGTextElement, unknown>(SvgElements.Text))

    g.append(SvgElements.Group).attr(SvgAttributes.Class, SvgClassNames.YAxis).call(d3.axisLeft(yScale).ticks(5))

    const domainSet = new Set(domain)
    const rows = points.filter((p) => domainSet.has(p.xLabel))
    if (!rows.length) return

    const sortIndex = new Map(domain.map((label, idx) => [label, idx]))
    const grouped = d3.group(rows, (d) => d.series ?? '')

    grouped.forEach((seriesRows, seriesKey) => {
      const sorted = seriesRows.slice().sort((a, b) => {
        if (xType === 'temporal' || xType === 'quantitative') {
          return Number(a.xSort) - Number(b.xSort)
        }
        return (sortIndex.get(a.xLabel) ?? 0) - (sortIndex.get(b.xLabel) ?? 0)
      })

      const line = d3
        .line<NormalizedMultiLinePoint>()
        .x((d) => {
          if (xType === 'temporal') return (xScale as d3.ScaleTime<number, number>)(d.xValue as Date) ?? 0
          if (xType === 'quantitative') return (xScale as d3.ScaleLinear<number, number>)(d.xValue as number) ?? 0
          return (xScale as d3.ScalePoint<string>)(d.xLabel) ?? 0
        })
        .y((d) => yScale(d.yValue))

      const stroke = seriesKey ? colorScale(seriesKey) : '#4f46e5'

      g.append(SvgElements.Path)
        .datum(sorted)
        .attr(SvgAttributes.D, line)
        .attr(SvgAttributes.Fill, 'none')
        .attr(SvgAttributes.Stroke, stroke)
        .attr(SvgAttributes.StrokeWidth, 2)
        .attr(DataAttributes.ChartId, id)
        .attr(DataAttributes.Series, seriesKey || null)

      const pointsGroup = g.append(SvgElements.Group).attr(DataAttributes.Series, seriesKey || null)
      pointsGroup
        .selectAll<SVGCircleElement, NormalizedMultiLinePoint>(SvgElements.Circle)
        .data(sorted)
        .join(SvgElements.Circle)
        .attr(SvgAttributes.CX, (d) =>
          xType === 'temporal'
            ? (xScale as d3.ScaleTime<number, number>)(d.xValue as Date) ?? 0
            : xType === 'quantitative'
              ? (xScale as d3.ScaleLinear<number, number>)(d.xValue as number) ?? 0
              : (xScale as d3.ScalePoint<string>)(d.xLabel) ?? 0,
        )
        .attr(SvgAttributes.CY, (d) => yScale(d.yValue))
        .attr(SvgAttributes.R, 3)
        .attr(SvgAttributes.Fill, stroke)
        .attr(DataAttributes.ChartId, id)
        .attr(DataAttributes.Target, (d) => d.xLabel)
        .attr(DataAttributes.Id, (d) => d.xId)
        .attr(DataAttributes.Value, (d) => String(d.yValue))
        .attr(DataAttributes.Series, seriesKey || null)
    })
  })
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
    }
  })
}

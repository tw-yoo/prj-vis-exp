import * as d3 from 'd3'
import { bumpRenderEpoch, renderVegaLiteChart, type VegaLiteSpec } from '../chartRenderer'
import type { JsonValue } from '../../types'
import { type DrawSplitSpec } from '../draw/types'
import { DataAttributes, SvgAttributes, SvgClassNames, SvgElements } from '../interfaces'
import { ensureXAxisLabelClearance } from '../common/d3Helpers'
import { wrapAxisTickLabels } from '../common/wrapAxisTickLabels'

type RawDatum = Record<string, JsonValue>
type SplitState = { field: string; domains: Record<string, Set<string>> }
type SplitGroupResult = {
  ids: [string, string]
  domains: [Array<string | number>, Array<string | number>]
}
type GroupedBarPoint = {
  category: string | number
  series: string | number
  value: number
}
type SeriesColorMap = Map<string, string>

const localDataStore: WeakMap<HTMLElement, RawDatum[]> = new WeakMap()
const originalDataStore: WeakMap<HTMLElement, RawDatum[]> = new WeakMap()
const splitStateStore: WeakMap<HTMLElement, SplitState> = new WeakMap()
const cloneRows = (rows: RawDatum[]) => rows.map((row) => ({ ...row }))

export type GroupedSpec = VegaLiteSpec & {
  encoding: {
    x: { field: string; type: string; sort?: JsonValue }
    y: { field: string; type: string; stack?: string | null }
    color?: { field?: string; type?: string; scale?: JsonValue; legend?: JsonValue }
    column?: { field?: string; type?: string }
    row?: { field?: string; type?: string }
    // Optional grouped hints (Vega-Lite v4+); used by draw conversions and Workbench chart-type inference.
    xOffset?: { field?: string; type?: string }
    yOffset?: { field?: string; type?: string }
  }
}

// Ops runner functions are in `src/renderer/bar/groupedBarOps.ts`.

export async function renderGroupedBarChart(
  container: HTMLElement,
  spec: GroupedSpec,
  options?: { preserveOriginal?: boolean },
) {
  clearGroupedBarSplitState(container)
  const result = await renderVegaLiteChart(container, spec)
  const facetField = resolveFacetField(spec) ?? undefined
  const rows = await tagBarMarks(
    container,
    spec.encoding.x.field,
    spec.encoding.y.field,
    spec.encoding.color?.field,
    facetField,
  )
  localDataStore.set(container, rows)
  if (!options?.preserveOriginal || !originalDataStore.has(container)) {
    originalDataStore.set(container, cloneRows(rows))
  }
  fitSvgToHost(container)
  ensureXAxisLabelClearance(container.id || 'chart', { attempts: 5, minGap: 14, maxShift: 120 })
  return result
}

export async function renderSumGroupedBarChart(
  container: HTMLElement,
  spec: GroupedSpec,
  config?: { label?: string; value?: number },
) {
  const rows = localDataStore.get(container) || []
  const xField = spec.encoding.x.field
  const yField = spec.encoding.y.field
  const colorField = spec.encoding.color?.field
  const label = config?.label ?? 'Sum'
  const requestedTotal = Number(config?.value)
  const hasRequestedTotal = Number.isFinite(requestedTotal)
  if (!rows.length) return

  if (!colorField) {
    const computed = rows
      .map((row) => Number(row[yField]))
      .filter(Number.isFinite)
      .reduce((acc, value) => acc + value, 0)
    const total = hasRequestedTotal ? requestedTotal : computed
    if (!Number.isFinite(total)) return
    await renderGroupedBarChart(container, {
      ...spec,
      data: { values: [{ [xField]: label, [yField]: total }] },
    })
    return
  }

  const bySeries = new Map<string, number>()
  rows.forEach((row) => {
    const seriesRaw = row[colorField]
    const value = Number(row[yField])
    if (seriesRaw == null || !Number.isFinite(value)) return
    const series = String(seriesRaw)
    bySeries.set(series, (bySeries.get(series) ?? 0) + value)
  })
  if (!bySeries.size) return

  const computedTotal = Array.from(bySeries.values()).reduce((acc, value) => acc + value, 0)
  const canScale = hasRequestedTotal && Number.isFinite(computedTotal) && Math.abs(computedTotal) > Number.EPSILON
  const fallbackEven = hasRequestedTotal && (!Number.isFinite(computedTotal) || Math.abs(computedTotal) <= Number.EPSILON)
  const values = Array.from(bySeries.entries()).map(([series, value], index, list) => ({
    [xField]: label,
    [yField]: canScale ? (value / computedTotal) * requestedTotal : fallbackEven ? requestedTotal / Math.max(1, list.length) : value,
    [colorField]: series,
  }))

  // Render as a single stacked bar to preserve series colors in one aggregate bar.
  const stackedLikeEncoding: GroupedSpec['encoding'] = {
    x: { ...spec.encoding.x },
    y: {
      ...spec.encoding.y,
      stack: 'zero',
    },
  }
  if (spec.encoding.color) {
    stackedLikeEncoding.color = { ...spec.encoding.color }
  }

  const stackedLikeSpec: GroupedSpec = {
    ...spec,
    encoding: stackedLikeEncoding,
    data: { values },
  }
  await renderGroupedBarChart(container, stackedLikeSpec)
}

function collectDomain(rows: RawDatum[], field: string): Array<string | number> {
  const domain: Array<string | number> = []
  const seen = new Set<string>()
  rows.forEach((row) => {
    const value = row[field]
    if (value == null) return
    const key = String(value)
    if (seen.has(key)) return
    seen.add(key)
    domain.push(value as string | number)
  })
  return domain
}

function normalizeSplitGroups(split: DrawSplitSpec, categoryDomain: Array<string | number>): SplitGroupResult | null {
  const selectorEntries = Object.entries(split.selectors ?? {})
  if ((split.mode === 'selector' || selectorEntries.length > 0) && selectorEntries.length >= 2) {
    const [idA, selectorA] = selectorEntries[0]
    const [idB, selectorB] = selectorEntries[1]
    const buildDomain = (selectorRaw: unknown) => {
      const selector = (selectorRaw && typeof selectorRaw === 'object'
        ? (selectorRaw as { include?: Array<string | number>; exclude?: Array<string | number>; all?: boolean })
        : {}) as { include?: Array<string | number>; exclude?: Array<string | number>; all?: boolean }
      const includeSet = new Set((selector.include ?? []).map(String))
      const excludeSet = new Set((selector.exclude ?? []).map(String))
      const includeMode = includeSet.size > 0
      const allMode = selector.all === true || (!includeMode && excludeSet.size === 0)
      return categoryDomain.filter((label) => {
        const token = String(label)
        if (allMode) return !excludeSet.has(token)
        if (includeMode) return includeSet.has(token)
        return !excludeSet.has(token)
      })
    }
    return {
      ids: [idA, idB] as [string, string],
      domains: [buildDomain(selectorA), buildDomain(selectorB)] as [Array<string | number>, Array<string | number>],
    }
  }

  if (!split.groups || typeof split.groups !== 'object') return null
  const entries = Object.entries(split.groups).filter((entry) => Array.isArray(entry[1]))
  if (entries.length === 0) return null

  const [idA, listA] = entries[0]
  const hasExplicitSecondGroup = entries.length >= 2
  const idB = entries[1]?.[0] ?? split.restTo ?? 'B'
  const listB = entries[1]?.[1] ?? []
  const setA = new Set((listA ?? []).map(String))
  const setB = new Set((listB ?? []).map(String))

  const domainA: Array<string | number> = []
  const domainB: Array<string | number> = []
  categoryDomain.forEach((label) => {
    const key = String(label)
    if (setA.has(key)) domainA.push(label)
    else if (setB.has(key)) domainB.push(label)
    else if (!hasExplicitSecondGroup) domainB.push(label)
  })

  return {
    ids: [idA, idB] as [string, string],
    domains: [domainA, domainB] as [Array<string | number>, Array<string | number>],
  }
}

function splitValueSet(split: DrawSplitSpec) {
  const values = new Set<string>()
  Object.values(split.selectors ?? {}).forEach((selector) => {
    if (!selector || typeof selector !== 'object') return
    const include = (selector as { include?: Array<string | number> }).include
    const exclude = (selector as { exclude?: Array<string | number> }).exclude
    if (Array.isArray(include)) include.forEach((item) => values.add(String(item)))
    if (Array.isArray(exclude)) exclude.forEach((item) => values.add(String(item)))
  })
  Object.values(split.groups ?? {}).forEach((items) => {
    if (!Array.isArray(items)) return
    items.forEach((item) => values.add(String(item)))
  })
  return values
}

function resolveFacetField(spec: GroupedSpec): string | null {
  const facet = (spec as { facet?: { column?: { field?: string }; row?: { field?: string } } }).facet
  const candidates = [
    spec.encoding.column?.field,
    spec.encoding.row?.field,
    facet?.column?.field,
    facet?.row?.field,
  ]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate
    }
  }
  return null
}

function resolveSplitField(spec: GroupedSpec, rows: RawDatum[], split: DrawSplitSpec) {
  const splitValues = splitValueSet(split)
  const fallback = spec.encoding.x.field
  if (splitValues.size === 0) return fallback

  const facetField = resolveFacetField(spec)
  if (facetField) {
    const facetDomain = new Set(collectDomain(rows, facetField).map(String))
    const overlap = Array.from(splitValues).filter((value) => facetDomain.has(value)).length
    const required = Math.min(2, splitValues.size)
    if (overlap >= required || overlap / splitValues.size >= 0.5) {
      return facetField
    }
  }
  return fallback
}

function aggregateGroupedRows(
  rows: RawDatum[],
  categoryField: string,
  seriesField: string,
  valueField: string,
): GroupedBarPoint[] {
  const map = new Map<string, GroupedBarPoint>()
  rows.forEach((row) => {
    const categoryRaw = row[categoryField]
    const seriesRaw = row[seriesField]
    const value = Number(row[valueField])
    if (categoryRaw == null || seriesRaw == null || !Number.isFinite(value)) return
    const category = categoryRaw as string | number
    const series = seriesRaw as string | number
    const key = `${String(category)}__${String(series)}`
    const prev = map.get(key)
    if (!prev) {
      map.set(key, { category, series, value })
      return
    }
    prev.value += value
  })
  return Array.from(map.values())
}

function resolveSeriesColors(rows: RawDatum[], seriesField: string): SeriesColorMap {
  const map: SeriesColorMap = new Map()
  rows.forEach((row) => {
    const seriesRaw = row[seriesField]
    const fillRaw = row.__fill
    if (seriesRaw == null || typeof fillRaw !== 'string') return
    const fill = fillRaw.trim()
    if (!fill || fill === 'none') return
    const series = String(seriesRaw)
    if (!map.has(series)) {
      map.set(series, fill)
    }
  })
  return map
}

function writeDatasetAttrs(
  svg: d3.Selection<SVGSVGElement, unknown, d3.BaseType, unknown>,
  spec: GroupedSpec,
  margin: { top: number; right: number; bottom: number; left: number },
  plotW: number,
  plotH: number,
) {
  const { x, y, color } = spec.encoding
  svg
    .attr(DataAttributes.MarginLeft, margin.left)
    .attr(DataAttributes.MarginTop, margin.top)
    .attr(DataAttributes.PlotWidth, plotW)
    .attr(DataAttributes.PlotHeight, plotH)
    .attr(DataAttributes.XField, x.field)
    .attr(DataAttributes.YField, y.field)
    .attr(DataAttributes.ColorField, color?.field ?? null)
}

/** @deprecated SurfaceManager.splitSurface() + renderGroupedBarChart() 조합으로 대체됨. */
export async function renderSplitGroupedBarChart(container: HTMLElement, spec: GroupedSpec, split: DrawSplitSpec) {
  const renderEpoch = bumpRenderEpoch(container)
  const data = localDataStore.get(container) || []
  const xField = spec.encoding.x.field
  const yField = spec.encoding.y.field
  const colorField = spec.encoding.color?.field
  if (!data.length) {
    console.warn('draw:split skipped: grouped chart has no data')
    return
  }

  const splitField = resolveSplitField(spec, data, split)
  const categoryField = splitField
  const seriesField = colorField && colorField !== categoryField ? colorField : xField
  const categoryDomain = collectDomain(data, categoryField)
  const seriesDomain = collectDomain(data, seriesField)
  if (categoryDomain.length === 0) {
    console.warn('draw:split skipped: could not resolve grouped split category domain')
    return
  }
  if (seriesDomain.length === 0) {
    console.warn('draw:split skipped: could not resolve grouped split series domain')
    return
  }

  const splitGroups = normalizeSplitGroups(split, categoryDomain)
  if (!splitGroups) {
    console.warn('draw:split invalid split.groups for grouped bar')
    return
  }

  const aggregatedAll = aggregateGroupedRows(data, categoryField, seriesField, yField)
  const yValues = aggregatedAll.map((d) => d.value).filter(Number.isFinite)
  const minY = d3.min(yValues)
  const maxY = d3.max(yValues)
  let domainMin = Math.min(0, Number.isFinite(minY) ? (minY as number) : 0)
  let domainMax = Math.max(0, Number.isFinite(maxY) ? (maxY as number) : 0)
  if (domainMin === domainMax) domainMax = domainMin + 1

  const margin = { top: 36, right: 24, bottom: 90, left: 60 }
  const width = 760
  const height = 380
  const plotW = width - margin.left - margin.right
  const plotH = height - margin.top - margin.bottom
  const gap = 22

  const orientation = split.orientation ?? 'vertical'
  const subW = orientation === 'horizontal' ? (plotW - gap) / 2 : plotW
  const subH = orientation === 'vertical' ? (plotH - gap) / 2 : plotH

  const containerSelection = d3.select(container)
  containerSelection.selectAll('*').remove()

  const svg = containerSelection
    .append(SvgElements.Svg)
    .attr(SvgAttributes.ViewBox, `0 0 ${width} ${height}`)
    .attr(DataAttributes.RenderEpoch, renderEpoch)
    .style('overflow', 'visible')

  writeDatasetAttrs(svg, spec, margin, plotW, plotH)

  const [idA, idB] = splitGroups.ids
  const [domainA, domainB] = splitGroups.domains
  splitStateStore.set(container, {
    field: categoryField,
    domains: {
      [idA]: new Set(domainA.map(String)),
      [idB]: new Set(domainB.map(String)),
    },
  })

  const defaultColorScale = d3.scaleOrdinal<string, string>(d3.schemeTableau10).domain(seriesDomain.map(String))
  const seriesColors = resolveSeriesColors(data, seriesField)
  const colorForSeries = (series: string | number) => {
    const key = String(series)
    return seriesColors.get(key) ?? defaultColorScale(key) ?? '#69b3a2'
  }
  const panels: Array<{ id: string; domain: Array<string | number>; offsetX: number; offsetY: number }> = [
    { id: idA, domain: domainA, offsetX: 0, offsetY: 0 },
    {
      id: idB,
      domain: domainB,
      offsetX: orientation === 'horizontal' ? subW + gap : 0,
      offsetY: orientation === 'vertical' ? subH + gap : 0,
    },
  ]

  const yScale = d3.scaleLinear().domain([domainMin, domainMax]).nice().range([subH, 0])
  const zeroY = yScale(0)

  panels.forEach(({ id, domain, offsetX, offsetY }) => {
    const panel = svg
      .append(SvgElements.Group)
      .attr(DataAttributes.ChartId, id)
      .attr(DataAttributes.ChartPanel, 'true')
      .attr(DataAttributes.PanelPlotX, 0)
      .attr(DataAttributes.PanelPlotY, 0)
      .attr(DataAttributes.PanelPlotWidth, subW)
      .attr(DataAttributes.PanelPlotHeight, subH)
      .attr(SvgAttributes.Transform, `translate(${margin.left + offsetX},${margin.top + offsetY})`)

    const xScale = d3.scaleBand<string | number>().domain(domain).range([0, subW]).paddingInner(0.18).paddingOuter(0.08)
    const groupScale = d3.scaleBand<string | number>().domain(seriesDomain).range([0, xScale.bandwidth()]).padding(0.08)

    panel
      .append(SvgElements.Text)
      .attr('x', subW / 2)
      .attr('y', -10)
      .attr(SvgAttributes.TextAnchor, 'middle')
      .attr(SvgAttributes.FontSize, 12)
      .attr('font-weight', 600)
      .text(id)

    panel
      .append(SvgElements.Group)
      .attr(SvgAttributes.Class, SvgClassNames.XAxis)
      .attr(SvgAttributes.Transform, `translate(0,${subH})`)
      .call(d3.axisBottom(xScale))
    wrapAxisTickLabels(panel.select(`.${SvgClassNames.XAxis}`).selectAll<SVGTextElement, unknown>(SvgElements.Text))

    panel.append(SvgElements.Group).attr(SvgAttributes.Class, SvgClassNames.YAxis).call(d3.axisLeft(yScale).ticks(5))

    const domainSet = new Set(domain.map(String))
    const rows = data.filter((row) => domainSet.has(String(row[categoryField])))
    const aggregatedRows = aggregateGroupedRows(rows, categoryField, seriesField, yField)

    panel
      .selectAll<SVGRectElement, GroupedBarPoint>(SvgElements.Rect)
      .data(aggregatedRows)
      .join(SvgElements.Rect)
      .attr(SvgAttributes.Class, SvgClassNames.MainBar)
      .attr(SvgAttributes.X, (d) => {
        const x = xScale(d.category)
        const offset = groupScale(d.series)
        return (x ?? 0) + (offset ?? 0)
      })
      .attr(SvgAttributes.Width, groupScale.bandwidth())
      .attr(SvgAttributes.Y, (d) => {
        const value = Number(d.value)
        return value >= 0 ? yScale(value) : zeroY
      })
      .attr(SvgAttributes.Height, (d) => Math.abs(yScale(Number(d.value)) - zeroY))
      .attr(SvgAttributes.Fill, (d) => colorForSeries(d.series))
      .attr(DataAttributes.Id, (d) => `${id}|${String(d.category)}|${String(d.series)}`)
      .attr(DataAttributes.Target, (d) => String(d.category))
      .attr(DataAttributes.Value, (d) => Number(d.value))
      .attr(DataAttributes.Series, (d) => String(d.series))
      .attr(DataAttributes.ChartId, id)
  })
}

function resolveDatum(raw: unknown, el: SVGGraphicsElement): RawDatum {
  const wrapped =
    raw && typeof raw === 'object' && 'datum' in raw ? (raw as { datum?: unknown }).datum : undefined
  const candidates = [wrapped, raw, (el as SVGGraphicsElement & { __data__?: unknown }).__data__]
  for (const candidate of candidates) {
    if (candidate && typeof candidate === 'object') return candidate as RawDatum
  }
  return {}
}

async function tagBarMarks(
  container: HTMLElement,
  xField: string,
  yField: string,
  colorField?: string,
  facetField?: string,
) {
  for (let i = 0; i < 5; i += 1) {
    const markCount = d3
      .select(container)
      .select(SvgElements.Svg)
      .selectAll<SVGGraphicsElement, unknown>('rect,path')
      .size()
    if (markCount > 0) break
    await new Promise((resolve) => requestAnimationFrame(resolve))
  }
  const svg = d3.select(container).select(SvgElements.Svg)
  svg
    .attr(DataAttributes.XField, xField)
    .attr(DataAttributes.YField, yField)
    .attr(DataAttributes.ColorField, colorField ?? null)
    .attr(DataAttributes.FacetField, facetField ?? null)
  const rows: RawDatum[] = []
  svg.selectAll<SVGGraphicsElement, unknown>('rect,path').each(function (this: SVGGraphicsElement, _d: unknown) {
    const datum = resolveDatum(_d, this)
    const xVal = datum?.[xField] ?? datum?.[xField?.toLowerCase?.()] ?? datum?.x ?? null
    const yVal = datum?.[yField] ?? datum?.[yField?.toLowerCase?.()] ?? datum?.y ?? null
    const colorVal = colorField ? datum?.[colorField] ?? datum?.[colorField?.toLowerCase?.()] : null
    const facetVal = facetField ? datum?.[facetField] ?? datum?.[facetField?.toLowerCase?.()] : null
    if (xVal == null || yVal == null) return
    const fill = d3.select(this as Element).attr(SvgAttributes.Fill)
    const keyParts = [facetVal, xVal, colorVal]
      .map((value) => (value == null ? '' : String(value).trim()))
      .filter((value) => value.length > 0)
    const uniqueParts = keyParts.filter((value, index) => keyParts.indexOf(value) === index)
    const uniqueId = uniqueParts.length > 0 ? uniqueParts.join('|') : String(xVal)
    d3.select(this as Element)
      .attr(DataAttributes.Target, String(xVal))
      .attr(DataAttributes.Id, uniqueId)
      .attr(DataAttributes.Value, String(yVal))
      .attr(DataAttributes.Series, colorVal != null ? String(colorVal) : null)
    const numY = Number(yVal)
    if (!Number.isFinite(numY)) return
    const row: RawDatum = {
      ...datum,
      __fill: typeof fill === 'string' ? fill : null,
      [xField]: xVal,
      [yField]: numY,
    }
    if (colorField) {
      row[colorField] = colorVal != null ? String(colorVal) : null
    }
    rows.push(row)
  })
  return rows
}

function fitSvgToHost(container: HTMLElement) {
  const svgSel = d3.select(container).select(SvgElements.Svg)
  if (svgSel.empty()) return
  const node = svgSel.node() as SVGSVGElement | null
  if (!node || typeof node.getBBox !== 'function') return
  const bbox = node.getBBox()
  if (!bbox || !Number.isFinite(bbox.width) || bbox.width <= 0 || !Number.isFinite(bbox.height)) return
  const hostWidth = Math.max(1, Math.min(container.clientWidth || bbox.width, 880))
  const scale = hostWidth / bbox.width
  const newHeight = Math.max(1, bbox.height * scale)
  node.setAttribute(SvgAttributes.ViewBox, `${bbox.x} ${bbox.y} ${bbox.width} ${bbox.height}`)
  node.setAttribute('width', String(hostWidth))
  node.setAttribute('height', String(newHeight))
}

export function getGroupedBarStoredData(container: HTMLElement) {
  return cloneRows(localDataStore.get(container) || [])
}

export function getGroupedBarOriginalData(container: HTMLElement) {
  return cloneRows(originalDataStore.get(container) || [])
}

export function clearGroupedBarSplitState(container: HTMLElement) {
  splitStateStore.delete(container)
}

export function getGroupedBarSplitDomain(container: HTMLElement, chartId: string | undefined) {
  const state = getGroupedBarSplitState(container)
  if (!state || !chartId) return null
  return state.domains[chartId] ?? null
}

export function getGroupedBarSplitState(container: HTMLElement): SplitState | null {
  const state = splitStateStore.get(container)
  if (!state) return null
  const clonedDomains: Record<string, Set<string>> = {}
  Object.entries(state.domains).forEach(([chartId, domain]) => {
    clonedDomains[chartId] = new Set(domain)
  })
  return { field: state.field, domains: clonedDomains }
}

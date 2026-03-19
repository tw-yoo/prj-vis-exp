import * as d3 from 'd3'
import { bumpRenderEpoch, renderVegaLiteChart, type VegaLiteSpec } from '../chartRenderer'
import type { JsonValue } from '../../types'
import { type DrawSplitSpec } from '../draw/types'
import { DataAttributes, SvgAttributes, SvgClassNames, SvgElements } from '../interfaces'
import { ensureXAxisLabelClearance } from '../common/d3Helpers'
import { buildCategoricalDisplayLabelMap, categoricalTickFormatter } from '../common/displayLabels'
import { wrapAxisTickLabels } from '../common/wrapAxisTickLabels'

type RawDatum = Record<string, JsonValue>

const localDataStore: WeakMap<HTMLElement, RawDatum[]> = new WeakMap()
const originalDataStore: WeakMap<HTMLElement, RawDatum[]> = new WeakMap()
const splitDomainStore: WeakMap<HTMLElement, Record<string, Set<string>>> = new WeakMap()

const cloneRows = (rows: RawDatum[]) => rows.map((row) => ({ ...row }))

function rowsFromSpecData(spec: StackedSpec): RawDatum[] {
  const xField = spec.encoding.x.field
  const yField = spec.encoding.y.field
  const colorField = spec.encoding.color?.field
  const values = (spec.data as { values?: unknown })?.values
  if (!Array.isArray(values)) return []
  return values
    .filter((row): row is RawDatum => !!row && typeof row === 'object' && !Array.isArray(row))
    .map((row) => {
      const xVal = row[xField]
      const yVal = Number(row[yField])
      if (xVal == null || !Number.isFinite(yVal)) return null
      const next: RawDatum = { [xField]: xVal, [yField]: yVal }
      if (colorField) {
        const colorVal = row[colorField]
        next[colorField] = colorVal == null ? null : String(colorVal)
      }
      return next
    })
    .filter((row): row is RawDatum => row !== null)
}

export type StackedSpec = VegaLiteSpec & {
  encoding: {
    x: { field: string; type: string; stack?: string | null }
    y: { field: string; type: string; stack?: string | null }
    color?: { field?: string; type?: string; scale?: JsonValue; legend?: JsonValue }
  }
}

// Ops runner functions are in `src/renderer/bar/stackedBarOps.ts`.

export async function renderStackedBarChart(
  container: HTMLElement,
  spec: StackedSpec,
  options?: { preserveOriginal?: boolean },
) {
  clearStackedBarSplitState(container)
  const result = await renderVegaLiteChart(container, spec)
  const taggedRows = await tagBarMarks(container, spec.encoding.x.field, spec.encoding.y.field, spec.encoding.color?.field)
  const specRows = rowsFromSpecData(spec)
  const rows = specRows.length ? specRows : taggedRows
  localDataStore.set(container, rows)
  if (!options?.preserveOriginal || !originalDataStore.has(container)) {
    originalDataStore.set(container, cloneRows(rows))
  }
  fitSvgToHost(container)
  ensureXAxisLabelClearance(container.id || 'chart', { attempts: 5, minGap: 14, maxShift: 120 })
  return result
}

export async function renderSumStackedBarChart(
  container: HTMLElement,
  spec: StackedSpec,
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
    await renderStackedBarChart(container, {
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
  const values = Array.from(bySeries.entries()).map(([series, value], _index, list) => {
    const scaledValue = canScale
      ? (value / computedTotal) * requestedTotal
      : fallbackEven
        ? requestedTotal / Math.max(1, list.length)
        : value
    return {
    [xField]: label,
      [yField]: scaledValue,
    [colorField]: series,
    }
  })
  await renderStackedBarChart(container, {
    ...spec,
    data: { values },
  })
}

function normalizeSplitGroups(split: DrawSplitSpec, xDomain: Array<string | number>) {
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
      return xDomain.filter((label) => {
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
  xDomain.forEach((label) => {
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

function resolveDomains(rows: RawDatum[], xField: string, colorField: string) {
  const xDomain: Array<string | number> = []
  const colorDomain: Array<string | number> = []
  const seenX = new Set<string>()
  const seenColor = new Set<string>()
  rows.forEach((row) => {
    const xVal = row[xField]
    const colorVal = row[colorField]
    if (xVal != null) {
      const xKey = String(xVal)
      if (!seenX.has(xKey)) {
        seenX.add(xKey)
        xDomain.push(xVal as string | number)
      }
    }
    if (colorVal != null) {
      const colorKey = String(colorVal)
      if (!seenColor.has(colorKey)) {
        seenColor.add(colorKey)
        colorDomain.push(colorVal as string | number)
      }
    }
  })
  return { xDomain, colorDomain }
}

type StackedSegment = {
  target: string | number
  series: string | number
  value: number
  y0: number
  y1: number
}

function buildStackedSegments(
  rows: RawDatum[],
  xField: string,
  yField: string,
  colorField: string,
  xDomain: Array<string | number>,
  colorDomain: Array<string | number>,
) {
  const valueMap = new Map<string, Map<string, number>>()
  rows.forEach((row) => {
    const target = row[xField]
    const series = row[colorField]
    const numeric = Number(row[yField])
    if (target == null || series == null || !Number.isFinite(numeric)) return
    const targetKey = String(target)
    const seriesKey = String(series)
    if (!valueMap.has(targetKey)) valueMap.set(targetKey, new Map<string, number>())
    const bucket = valueMap.get(targetKey)!
    bucket.set(seriesKey, (bucket.get(seriesKey) ?? 0) + numeric)
  })

  const segments: StackedSegment[] = []
  let minY = 0
  let maxY = 0

  xDomain.forEach((target) => {
    const targetKey = String(target)
    const bucket = valueMap.get(targetKey) ?? new Map<string, number>()
    let positive = 0
    let negative = 0
    colorDomain.forEach((series) => {
      const seriesKey = String(series)
      const value = bucket.get(seriesKey) ?? 0
      if (!Number.isFinite(value) || value === 0) return
      if (value >= 0) {
        const y0 = positive
        const y1 = positive + value
        positive = y1
        segments.push({ target, series, value, y0, y1 })
      } else {
        const y0 = negative
        const y1 = negative + value
        negative = y1
        segments.push({ target, series, value, y0, y1 })
      }
    })
    if (positive > maxY) maxY = positive
    if (negative < minY) minY = negative
  })

  return { segments, minY: Math.min(0, minY), maxY: Math.max(0, maxY) }
}

function writeDatasetAttrs(
  svg: d3.Selection<SVGSVGElement, unknown, d3.BaseType, unknown>,
  spec: StackedSpec,
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

/** @deprecated SurfaceManager.splitSurface() + renderStackedBarChart() 조합으로 대체됨. */
export async function renderSplitStackedBarChart(container: HTMLElement, spec: StackedSpec, split: DrawSplitSpec) {
  const renderEpoch = bumpRenderEpoch(container)
  const data = localDataStore.get(container) || []
  const xField = spec.encoding.x.field
  const yField = spec.encoding.y.field
  const colorField = spec.encoding.color?.field
  if (!colorField) {
    console.warn('draw:split requires stacked chart color field')
    return
  }
  if (!data.length) {
    console.warn('draw:split skipped: stacked chart has no data')
    return
  }

  const { xDomain, colorDomain } = resolveDomains(data, xField, colorField)
  const splitGroups = normalizeSplitGroups(split, xDomain)
  if (!splitGroups) {
    console.warn('draw:split invalid split.groups for stacked bar')
    return
  }

  const stacked = buildStackedSegments(data, xField, yField, colorField, xDomain, colorDomain)
  let domainMin = stacked.minY
  let domainMax = stacked.maxY
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
  splitDomainStore.set(container, {
    [idA]: new Set(domainA.map(String)),
    [idB]: new Set(domainB.map(String)),
  })

  const colorScale = d3.scaleOrdinal<string, string>(d3.schemeTableau10).domain(colorDomain.map(String))
  const panels: Array<{ id: string; domain: Array<string | number>; offsetX: number; offsetY: number }> = [
    { id: idA, domain: domainA, offsetX: 0, offsetY: 0 },
    {
      id: idB,
      domain: domainB,
      offsetX: orientation === 'horizontal' ? subW + gap : 0,
      offsetY: orientation === 'vertical' ? subH + gap : 0,
    },
  ]

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

    const xScale = d3.scaleBand<string | number>().domain(domain).range([0, subW]).padding(0.2)
    const xLabelMap = buildCategoricalDisplayLabelMap(data, xField)
    const yScale = d3.scaleLinear().domain([domainMin, domainMax]).nice().range([subH, 0])

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
      .call(d3.axisBottom(xScale).tickFormat(categoricalTickFormatter(xLabelMap)))
    wrapAxisTickLabels(panel.select(`.${SvgClassNames.XAxis}`).selectAll<SVGTextElement, unknown>(SvgElements.Text))

    panel.append(SvgElements.Group).attr(SvgAttributes.Class, SvgClassNames.YAxis).call(d3.axisLeft(yScale).ticks(5))

    const domainSet = new Set(domain.map(String))
    const panelSegments = stacked.segments.filter((segment) => domainSet.has(String(segment.target)))

    panel
      .selectAll<SVGRectElement, StackedSegment>(SvgElements.Rect)
      .data(panelSegments)
      .join(SvgElements.Rect)
      .attr(SvgAttributes.Class, SvgClassNames.MainBar)
      .attr(SvgAttributes.X, (d) => xScale(d.target) ?? 0)
      .attr(SvgAttributes.Width, xScale.bandwidth())
      .attr(SvgAttributes.Y, (d) => yScale(Math.max(d.y0, d.y1)))
      .attr(SvgAttributes.Height, (d) => Math.abs(yScale(d.y0) - yScale(d.y1)))
      .attr(SvgAttributes.Fill, (d) => colorScale(String(d.series)) || '#69b3a2')
      .attr(DataAttributes.Id, (d) => `${id}|${String(d.target)}|${String(d.series)}`)
      .attr(DataAttributes.Target, (d) => String(d.target))
      .attr(DataAttributes.Value, (d) => d.value)
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

async function tagBarMarks(container: HTMLElement, xField: string, yField: string, colorField?: string) {
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
  const rows: RawDatum[] = []
  svg.selectAll<SVGGraphicsElement, unknown>('rect,path').each(function (this: SVGGraphicsElement, _d: unknown) {
    const datum = resolveDatum(_d, this)
    const xVal = datum?.[xField] ?? datum?.[xField?.toLowerCase?.()] ?? datum?.x ?? null
    const yVal = datum?.[yField] ?? datum?.[yField?.toLowerCase?.()] ?? datum?.y ?? null
    const colorVal = colorField ? datum?.[colorField] ?? datum?.[colorField?.toLowerCase?.()] : null
    if (xVal == null || yVal == null) return
    const fill = d3.select(this as Element).attr(SvgAttributes.Fill)
    const keyParts = [xVal, colorVal]
      .map((value) => (value == null ? '' : String(value).trim()))
      .filter((value) => value.length > 0)
    const uniqueId = keyParts.length > 0 ? keyParts.join('|') : String(xVal)
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

export function getStackedBarStoredData(container: HTMLElement) {
  const rows = localDataStore.get(container) || []
  return cloneRows(rows)
}

export function getStackedBarOriginalData(container: HTMLElement) {
  const rows = originalDataStore.get(container) || []
  return cloneRows(rows)
}

export function clearStackedBarSplitState(container: HTMLElement) {
  splitDomainStore.delete(container)
}

export function getStackedBarSplitDomain(container: HTMLElement, chartId: string | undefined) {
  if (!chartId) return null
  const domains = splitDomainStore.get(container)
  if (!domains) return null
  return domains[chartId] ?? null
}

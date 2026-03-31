import * as d3 from 'd3'
import { ChartType, type ChartSpec } from '../../domain/chart'
import type { JsonValue } from '../../types'
import { type DrawSplitSpec } from '../draw/types'
import { DataAttributes, SvgAttributes, SvgClassNames, SvgElements } from '../interfaces'
import { applyAxisTickLabelSize } from '../common/d3Helpers'
import { attachChartHoverTooltip, formatTooltipValue, writeTooltipRootAttrs } from '../common/chartHoverTooltip'
import { buildCategoricalDisplayLabelMap, categoricalTickFormatter } from '../common/displayLabels'
import { wrapAxisTickLabels } from '../common/wrapAxisTickLabels'
import {
  isLegendVisible,
  renderColorLegend,
  resolveColorLegendTitle,
  resolveTopLevelColorChannel,
} from '../common/colorLegend'
import { resolveLayoutModel } from '../common/chartLayout'
import { renderWithMeasuredLayout } from '../common/renderWithMeasuredLayout'
import { CHART_TEXT_SIZE } from '../config/chartTextConfig'
import { bumpRenderEpoch } from '../common/renderEpoch'
import { storeRuntimeChartState } from '../utils/runtimeChartState'
import {
  buildBarColorResolver,
  cloneRows,
  loadBarRows,
  resolveCategoricalDomain,
  resolveDiscreteDomainFromScale,
  resolveScaleDomain,
  type RawDatum,
} from './barRuntime'

const localDataStore: WeakMap<HTMLElement, RawDatum[]> = new WeakMap()
const originalDataStore: WeakMap<HTMLElement, RawDatum[]> = new WeakMap()
const splitDomainStore: WeakMap<HTMLElement, Record<string, Set<string>>> = new WeakMap()

export type StackedSpec = ChartSpec & {
  encoding: {
    x: { field: string; type: string; stack?: string | null; sort?: JsonValue }
    y: { field: string; type: string; stack?: string | null; scale?: JsonValue }
    color?: { field?: string; type?: string; scale?: JsonValue; legend?: JsonValue; condition?: JsonValue }
  }
}

type StackedRuntime = {
  renderSpec: ChartSpec
  xField: string
  yField: string
  xSort?: JsonValue
  colorField?: string
  stackMode: string
}

type StackedSegment = {
  target: string | number
  series: string | number
  value: number
  y0: number
  y1: number
  rows: RawDatum[]
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function extractField(channel: unknown): string | undefined {
  const field = asRecord(channel).field
  return typeof field === 'string' && field.trim().length > 0 ? field.trim() : undefined
}

function normalizeOptionalLabel(value: JsonValue | undefined) {
  if (value === undefined) return undefined
  if (value === null) return null
  const str = String(value).trim()
  return str.length > 0 ? str : null
}

function resolveAxisLabels(spec: StackedSpec, xField: string, yField: string) {
  const axisLabelsMeta = (spec as { meta?: { axisLabels?: { x?: JsonValue; y?: JsonValue } } }).meta?.axisLabels ?? {}
  const xAxisLabelOverride = normalizeOptionalLabel(axisLabelsMeta.x)
  const yAxisLabelOverride = normalizeOptionalLabel(axisLabelsMeta.y)
  return {
    xAxisLabel: xAxisLabelOverride === undefined ? xField : xAxisLabelOverride,
    yAxisLabel: yAxisLabelOverride === undefined ? yField : yAxisLabelOverride,
  }
}

function resolveStackedRuntimeSpec(spec: StackedSpec): StackedRuntime | null {
  const encoding = asRecord(spec.encoding)
  const xField = extractField(encoding.x)
  const yField = extractField(encoding.y)
  if (!xField || !yField) return null
  const yChannel = asRecord(encoding.y)
  const xChannel = asRecord(encoding.x)
  const stackModeRaw = yChannel.stack ?? xChannel.stack
  const stackMode = typeof stackModeRaw === 'string' && stackModeRaw.trim().length > 0 ? stackModeRaw : 'zero'
  return {
    renderSpec: spec,
    xField,
    yField,
    xSort: xChannel.sort as JsonValue | undefined,
    colorField: extractField(encoding.color),
    stackMode,
  }
}

function buildStackedSegments(
  rows: RawDatum[],
  xField: string,
  yField: string,
  colorField: string,
  xDomain: Array<string | number>,
  colorDomain: Array<string | number>,
  stackMode: string,
) {
  const valueMap = new Map<string, Map<string, { value: number; rows: RawDatum[] }>>()
  rows.forEach((row) => {
    const target = row[xField]
    const series = row[colorField]
    const numeric = Number(row[yField])
    if (target == null || series == null || !Number.isFinite(numeric)) return
    const targetKey = String(target)
    const seriesKey = String(series)
    if (!valueMap.has(targetKey)) valueMap.set(targetKey, new Map<string, { value: number; rows: RawDatum[] }>())
    const bucket = valueMap.get(targetKey)!
    const existing = bucket.get(seriesKey)
    if (!existing) {
      bucket.set(seriesKey, { value: numeric, rows: [{ ...row }] })
      return
    }
    existing.value += numeric
    existing.rows.push({ ...row })
  })

  const segments: StackedSegment[] = []
  let minY = 0
  let maxY = 0

  xDomain.forEach((target) => {
    const targetKey = String(target)
    const bucket = valueMap.get(targetKey) ?? new Map<string, { value: number; rows: RawDatum[] }>()

    if (stackMode === 'center') {
      const total = colorDomain.reduce((sum, series) => Number(sum) + Number(bucket.get(String(series))?.value ?? 0), 0)
      let cursor = -total / 2
      colorDomain.forEach((series) => {
        const entry = bucket.get(String(series))
        const value = entry?.value ?? 0
        if (!Number.isFinite(value) || value === 0) return
        const y0 = Number(cursor)
        const y1 = y0 + Number(value)
        cursor = y1
        segments.push({ target, series, value, y0, y1, rows: cloneRows(entry?.rows ?? []) })
        minY = Math.min(minY, y0, y1)
        maxY = Math.max(maxY, y0, y1)
      })
      return
    }

    let positive = 0
    let negative = 0
    colorDomain.forEach((series) => {
      const entry = bucket.get(String(series))
      const value = entry?.value ?? 0
      if (!Number.isFinite(value) || value === 0) return
      if (value >= 0) {
        const y0 = positive
        const y1 = positive + value
        positive = y1
        segments.push({ target, series, value, y0, y1, rows: cloneRows(entry?.rows ?? []) })
      } else {
        const y0 = negative
        const y1 = negative + value
        negative = y1
        segments.push({ target, series, value, y0, y1, rows: cloneRows(entry?.rows ?? []) })
      }
    })
    minY = Math.min(minY, negative)
    maxY = Math.max(maxY, positive)
  })

  return { segments, minY, maxY }
}

function writeDatasetAttrs(
  svg: d3.Selection<SVGSVGElement, unknown, d3.BaseType, unknown>,
  runtime: StackedRuntime,
  margin: { top: number; right: number; bottom: number; left: number },
  explanation: { top: number; height: number; bottom: number; annotationTopClearance: number },
  plotW: number,
  plotH: number,
) {
  svg
    .attr(DataAttributes.MarginLeft, margin.left)
    .attr(DataAttributes.MarginTop, margin.top)
    .attr(DataAttributes.ExplanationTop, explanation.top)
    .attr(DataAttributes.ExplanationHeight, explanation.height)
    .attr(DataAttributes.ExplanationBottom, explanation.bottom)
    .attr(DataAttributes.AnnotationTopClearance, explanation.annotationTopClearance)
    .attr(DataAttributes.PlotWidth, plotW)
    .attr(DataAttributes.PlotHeight, plotH)
    .attr(DataAttributes.XField, runtime.xField)
    .attr(DataAttributes.YField, runtime.yField)
    .attr(DataAttributes.ColorField, runtime.colorField ?? null)
}

function resolveLegendItems(
  rows: RawDatum[],
  colorDomain: Array<string | number>,
  colorField: string,
  resolveFill: (rows: RawDatum[], colorKey: string | number | null) => string,
) {
  return colorDomain.map((key) => {
    const matchingRows = rows.filter((row) => String(row[colorField]) === String(key))
    return {
      label: String(key),
      color: resolveFill(matchingRows, key),
    }
  })
}

export async function renderStackedBarChart(
  container: HTMLElement,
  spec: StackedSpec,
  options?: { preserveOriginal?: boolean },
) {
  clearStackedBarSplitState(container)

  const runtime = resolveStackedRuntimeSpec(spec)
  if (!runtime) {
    console.warn('renderStackedBarChart: missing stacked bar encoding')
    return null
  }

  const renderEpoch = bumpRenderEpoch(container)
  const rawRows = await loadBarRows(runtime.renderSpec)
  const normalizedRows = rawRows
    .map((row) => {
      const xValue = row[runtime.xField]
      const yValue = Number(row[runtime.yField])
      if (xValue == null || !Number.isFinite(yValue)) return null
      const next: RawDatum = { ...row, [runtime.xField]: xValue, [runtime.yField]: yValue }
      if (runtime.colorField) {
        const colorValue = row[runtime.colorField]
        next[runtime.colorField] = colorValue == null ? null : String(colorValue)
      }
      return next
    })
    .filter((row): row is RawDatum => row !== null)

  localDataStore.set(container, normalizedRows)
  if (!options?.preserveOriginal || !originalDataStore.has(container)) {
    originalDataStore.set(container, cloneRows(normalizedRows))
  }
  storeRuntimeChartState(container, { chartType: ChartType.STACKED_BAR, spec, renderer: 'd3' })

  const xDomain = resolveCategoricalDomain(normalizedRows, runtime.xField, runtime.xSort, runtime.yField)
  const colorDomain = runtime.colorField
    ? resolveDiscreteDomainFromScale(
        normalizedRows,
        runtime.colorField,
        asRecord(asRecord(asRecord(runtime.renderSpec.encoding).color).scale),
        runtime.colorField,
      )
    : ['__single__']
  const colorForBar = buildBarColorResolver(runtime.renderSpec, runtime.colorField, colorDomain)
  const colorChannel = resolveTopLevelColorChannel(runtime.renderSpec)
  const showLegend = Boolean(runtime.colorField) && colorDomain.length > 1 && isLegendVisible(colorChannel)
  const legendTitle = showLegend ? resolveColorLegendTitle(colorChannel, runtime.colorField ?? null) : null
  normalizedRows.forEach((row) => {
    const colorKey =
      runtime.colorField && row[runtime.colorField] != null
        ? (row[runtime.colorField] as string | number)
        : (row[runtime.xField] as string | number)
    row.__fill = colorForBar([row], colorKey)
  })

  const effectiveColorField = runtime.colorField ?? '__series'
  const stackedRows =
    runtime.colorField == null
      ? normalizedRows.map((row) => ({ ...row, [effectiveColorField]: '__series' }))
      : normalizedRows
  const effectiveColorDomain = runtime.colorField ? colorDomain : ['__series']
  const stacked = buildStackedSegments(
    stackedRows,
    runtime.xField,
    runtime.yField,
    effectiveColorField,
    xDomain,
    effectiveColorDomain,
    runtime.stackMode,
  )
  const explicitScale = asRecord(asRecord(asRecord(runtime.renderSpec.encoding).y).scale)
  const [domainMin, domainMax] = resolveScaleDomain(
    [stacked.minY, stacked.maxY, ...stacked.segments.flatMap((segment) => [segment.y0, segment.y1])],
    explicitScale,
  )

  const { xAxisLabel, yAxisLabel } = resolveAxisLabels(spec, runtime.xField, runtime.yField)
  const layout = resolveLayoutModel({
    container,
    chartType: ChartType.STACKED_BAR,
    spec: runtime.renderSpec,
    legend: { visible: showLegend },
  })
  const xLabelMap = buildCategoricalDisplayLabelMap(normalizedRows, runtime.xField)
  const svg = renderWithMeasuredLayout(
    container,
    layout,
    (resolvedLayout) => {
      const margin = resolvedLayout.padding
      const width = resolvedLayout.canvas.width
      const height = resolvedLayout.canvas.height
      const plotW = resolvedLayout.plot.width
      const plotH = resolvedLayout.plot.height

      const containerSelection = d3.select(container)
      containerSelection.selectAll('*').remove()

      const nextSvg = containerSelection
        .append(SvgElements.Svg)
        .attr(SvgAttributes.ViewBox, `0 0 ${width} ${height}`)
        .attr(DataAttributes.RenderEpoch, renderEpoch)
        .style('overflow', 'visible')

      writeDatasetAttrs(nextSvg, runtime, margin, layout.explanation, plotW, plotH)
      writeTooltipRootAttrs(nextSvg, {
        xLabel: xAxisLabel ?? runtime.xField,
        yLabel: yAxisLabel ?? runtime.yField,
        groupLabel: runtime.colorField ? legendTitle ?? runtime.colorField : null,
      })

      const g = nextSvg.append(SvgElements.Group).attr(SvgAttributes.Transform, `translate(${margin.left},${margin.top})`)
      const xScale = d3.scaleBand<string | number>().domain(xDomain).range([0, plotW]).padding(0.2)
      const yScale = d3.scaleLinear().domain([domainMin, domainMax]).nice().range([plotH, 0])

      g.append(SvgElements.Group)
        .attr(SvgAttributes.Class, SvgClassNames.XAxis)
        .attr(SvgAttributes.Transform, `translate(0,${plotH})`)
        .call(d3.axisBottom(xScale).tickFormat(categoricalTickFormatter(xLabelMap)))
      applyAxisTickLabelSize(g.select<SVGGElement>(`.${SvgClassNames.XAxis}`))
      const xTicks = Array.from(g.select(`.${SvgClassNames.XAxis}`).selectAll<SVGGElement, unknown>('.tick').nodes())
      const axisLayout = wrapAxisTickLabels(g.select(`.${SvgClassNames.XAxis}`).selectAll<SVGTextElement, unknown>(SvgElements.Text), {
        showAllTicksByDefault: resolvedLayout.tickLayout.showAllTicksByDefault,
        rotationReferencePolicy: resolvedLayout.tickLayout.rotationReferencePolicy,
        maxCharsPerLine: resolvedLayout.tickLayout.maxCharsPerLine,
        maxLines: resolvedLayout.tickLayout.maxLines,
        allowDensityReduction: resolvedLayout.tickLayout.allowDensityReduction,
        maxDensityStep: resolvedLayout.tickLayout.maxDensityStep,
        overlapTolerancePx: resolvedLayout.tickLayout.overlapTolerancePx,
        maxUnrotatedLabelLength: resolvedLayout.tickLayout.maxUnrotatedLabelLength,
        candidateAngles: resolvedLayout.tickLayout.candidateAngles,
        rotatedAnchor: resolvedLayout.tickLayout.rotatedAnchor,
        tickElements: xTicks,
      })
      nextSvg.attr(DataAttributes.AxisRotation, String(Math.abs(axisLayout.angleDeg)))
      nextSvg.attr(DataAttributes.TickDensityStep, String(axisLayout.densityStep))

      g.append(SvgElements.Group).attr(SvgAttributes.Class, SvgClassNames.YAxis).call(d3.axisLeft(yScale).ticks(5))
      applyAxisTickLabelSize(g.select<SVGGElement>(`.${SvgClassNames.YAxis}`))

      g.selectAll<SVGRectElement, StackedSegment>(SvgElements.Rect)
        .data(stacked.segments)
        .join(SvgElements.Rect)
        .attr(SvgAttributes.Class, SvgClassNames.MainBar)
        .attr(SvgAttributes.X, (segment) => xScale(segment.target) ?? 0)
        .attr(SvgAttributes.Width, xScale.bandwidth())
        .attr(SvgAttributes.Y, (segment) => yScale(Math.max(segment.y0, segment.y1)))
        .attr(SvgAttributes.Height, (segment) => Math.abs(yScale(segment.y0) - yScale(segment.y1)))
        .attr(SvgAttributes.Fill, (segment) => colorForBar(segment.rows, segment.series))
        .attr(DataAttributes.Id, (segment) => `${String(segment.target)}|${String(segment.series)}`)
        .attr(DataAttributes.Target, (segment) => String(segment.target))
        .attr(DataAttributes.Value, (segment) => segment.value)
        .attr(DataAttributes.Series, (segment) => (segment.series == null ? null : String(segment.series)))
        .attr(DataAttributes.XValue, (segment) => xLabelMap.get(String(segment.target)) ?? String(segment.target))
        .attr(DataAttributes.YValue, (segment) => formatTooltipValue(segment.value))
        .attr(DataAttributes.GroupValue, (segment) => (segment.series == null ? null : String(segment.series)))

      if (xAxisLabel) {
        nextSvg
          .append(SvgElements.Text)
          .attr(SvgAttributes.Class, SvgClassNames.XAxisLabel)
          .attr(SvgAttributes.X, resolvedLayout.axisTitles.x.x)
          .attr(SvgAttributes.Y, resolvedLayout.axisTitles.x.y)
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
          .attr(SvgAttributes.X, resolvedLayout.axisTitles.y.x)
          .attr(SvgAttributes.Y, resolvedLayout.axisTitles.y.y)
          .attr(SvgAttributes.TextAnchor, 'middle')
          .attr(SvgAttributes.FontSize, CHART_TEXT_SIZE.axisTitle)
          .attr(SvgAttributes.FontWeight, 'bold')
          .text(yAxisLabel)
      }

      if (showLegend && runtime.colorField) {
        renderColorLegend({
          svg: nextSvg,
          layout: resolvedLayout,
          margin,
          plotWidth: plotW,
          title: legendTitle,
          items: resolveLegendItems(normalizedRows, colorDomain, runtime.colorField, colorForBar),
        })
      }

      return nextSvg
    },
    { maxPasses: 4 },
  )
  attachChartHoverTooltip(container)
  return svg
}

export async function renderSumStackedBarChart(
  container: HTMLElement,
  spec: StackedSpec,
  config?: { label?: string; value?: number },
) {
  const runtime = resolveStackedRuntimeSpec(spec)
  if (!runtime) return

  const rows = localDataStore.get(container) || []
  const label = config?.label ?? 'Sum'
  const requestedTotal = Number(config?.value)
  const hasRequestedTotal = Number.isFinite(requestedTotal)
  if (!rows.length) return

  if (!runtime.colorField) {
    const computed = rows
      .map((row) => Number(row[runtime.yField]))
      .filter(Number.isFinite)
      .reduce((acc, value) => acc + value, 0)
    const total = hasRequestedTotal ? requestedTotal : computed
    if (!Number.isFinite(total)) return
    await renderStackedBarChart(container, {
      ...spec,
      data: { values: [{ [runtime.xField]: label, [runtime.yField]: total }] },
    })
    return
  }

  const bySeries = new Map<string, number>()
  rows.forEach((row) => {
    const seriesRaw = row[runtime.colorField!]
    const value = Number(row[runtime.yField])
    if (seriesRaw == null || !Number.isFinite(value)) return
    const series = String(seriesRaw)
    bySeries.set(series, (bySeries.get(series) ?? 0) + value)
  })
  if (!bySeries.size) return

  const computedTotal = Array.from(bySeries.values()).reduce((acc, value) => acc + value, 0)
  const canScale = hasRequestedTotal && Number.isFinite(computedTotal) && Math.abs(computedTotal) > Number.EPSILON
  const fallbackEven = hasRequestedTotal && (!Number.isFinite(computedTotal) || Math.abs(computedTotal) <= Number.EPSILON)
  const values = Array.from(bySeries.entries()).map(([series, value], _index, list) => ({
    [runtime.xField]: label,
    [runtime.yField]: canScale
      ? (value / computedTotal) * requestedTotal
      : fallbackEven
        ? requestedTotal / Math.max(1, list.length)
        : value,
    [runtime.colorField!]: series,
  }))
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

/** @deprecated SurfaceManager.splitSurface() + renderStackedBarChart() 조합으로 대체됨. */
export async function renderSplitStackedBarChart(container: HTMLElement, spec: StackedSpec, split: DrawSplitSpec) {
  const runtime = resolveStackedRuntimeSpec(spec)
  if (!runtime || !runtime.colorField) {
    console.warn('draw:split requires stacked chart color field')
    return
  }

  const renderEpoch = bumpRenderEpoch(container)
  const data = localDataStore.get(container) || []
  if (!data.length) {
    console.warn('draw:split skipped: stacked chart has no data')
    return
  }

  const { xDomain, colorDomain } = resolveDomains(data, runtime.xField, runtime.colorField)
  const splitGroups = normalizeSplitGroups(split, xDomain)
  if (!splitGroups) {
    console.warn('draw:split invalid split.groups for stacked bar')
    return
  }

  const stacked = buildStackedSegments(data, runtime.xField, runtime.yField, runtime.colorField, xDomain, colorDomain, runtime.stackMode)
  const [domainMin, domainMax] = resolveScaleDomain(
    [stacked.minY, stacked.maxY, ...stacked.segments.flatMap((segment) => [segment.y0, segment.y1])],
    asRecord(asRecord(asRecord(runtime.renderSpec.encoding).y).scale),
  )

  const layout = resolveLayoutModel({
    container,
    chartType: ChartType.STACKED_BAR,
    spec: runtime.renderSpec,
    split: { enabled: true, orientation: split.orientation },
  })

  const [idA, idB] = splitGroups.ids
  const [domainA, domainB] = splitGroups.domains
  splitDomainStore.set(container, {
    [idA]: new Set(domainA.map(String)),
    [idB]: new Set(domainB.map(String)),
  })

  const colorScale = d3.scaleOrdinal<string, string>(d3.schemeTableau10).domain(colorDomain.map(String))
  const svg = renderWithMeasuredLayout(
    container,
    layout,
    (resolvedLayout) => {
      const margin = resolvedLayout.padding
      const width = resolvedLayout.canvas.width
      const height = resolvedLayout.canvas.height
      const plotW = resolvedLayout.plot.width
      const plotH = resolvedLayout.plot.height
      const gap = resolvedLayout.splitPanels.gap
      const orientation = resolvedLayout.splitPanels.orientation
      const subW = resolvedLayout.splitPanels.panelWidth
      const subH = resolvedLayout.splitPanels.panelHeight

      const containerSelection = d3.select(container)
      containerSelection.selectAll('*').remove()

      const nextSvg = containerSelection
        .append(SvgElements.Svg)
        .attr(SvgAttributes.ViewBox, `0 0 ${width} ${height}`)
        .attr(DataAttributes.RenderEpoch, renderEpoch)
        .style('overflow', 'visible')

      writeDatasetAttrs(nextSvg, runtime, margin, layout.explanation, plotW, plotH)

      const panels: Array<{ id: string; domain: Array<string | number>; offsetX: number; offsetY: number }> = [
        { id: idA, domain: domainA, offsetX: 0, offsetY: 0 },
        {
          id: idB,
          domain: domainB,
          offsetX: orientation === 'horizontal' ? subW + gap : 0,
          offsetY: orientation === 'vertical' ? subH + gap : 0,
        },
      ]

      let maxAxisRotation = 0
      let maxDensityStep = 1
      panels.forEach(({ id, domain, offsetX, offsetY }) => {
        const panel = nextSvg
          .append(SvgElements.Group)
          .attr(DataAttributes.ChartId, id)
          .attr(DataAttributes.ChartPanel, 'true')
          .attr(DataAttributes.PanelPlotX, 0)
          .attr(DataAttributes.PanelPlotY, 0)
          .attr(DataAttributes.PanelPlotWidth, subW)
          .attr(DataAttributes.PanelPlotHeight, subH)
          .attr(SvgAttributes.Transform, `translate(${margin.left + offsetX},${margin.top + offsetY})`)

        const xScale = d3.scaleBand<string | number>().domain(domain).range([0, subW]).padding(0.2)
        const xLabelMap = buildCategoricalDisplayLabelMap(data, runtime.xField)
        const yScale = d3.scaleLinear().domain([domainMin, domainMax]).nice().range([subH, 0])

        panel
          .append(SvgElements.Text)
          .attr('x', subW / 2)
          .attr('y', -resolvedLayout.splitPanels.titleOffsetY)
          .attr(SvgAttributes.TextAnchor, 'middle')
          .attr(SvgAttributes.FontSize, CHART_TEXT_SIZE.splitPanelTitle)
          .attr('font-weight', 600)
          .text(id)

        panel
          .append(SvgElements.Group)
          .attr(SvgAttributes.Class, SvgClassNames.XAxis)
          .attr(SvgAttributes.Transform, `translate(0,${subH})`)
          .call(d3.axisBottom(xScale).tickFormat(categoricalTickFormatter(xLabelMap)))
        applyAxisTickLabelSize(panel.select<SVGGElement>(`.${SvgClassNames.XAxis}`))
        const xTicks = Array.from(panel.select(`.${SvgClassNames.XAxis}`).selectAll<SVGGElement, unknown>('.tick').nodes())
        const axisLayout = wrapAxisTickLabels(panel.select(`.${SvgClassNames.XAxis}`).selectAll<SVGTextElement, unknown>(SvgElements.Text), {
          showAllTicksByDefault: resolvedLayout.tickLayout.showAllTicksByDefault,
          rotationReferencePolicy: resolvedLayout.tickLayout.rotationReferencePolicy,
          maxCharsPerLine: resolvedLayout.tickLayout.maxCharsPerLine,
          maxLines: resolvedLayout.tickLayout.maxLines,
          allowDensityReduction: resolvedLayout.tickLayout.allowDensityReduction,
          maxDensityStep: resolvedLayout.tickLayout.maxDensityStep,
          overlapTolerancePx: resolvedLayout.tickLayout.overlapTolerancePx,
          maxUnrotatedLabelLength: resolvedLayout.tickLayout.maxUnrotatedLabelLength,
          candidateAngles: resolvedLayout.tickLayout.candidateAngles,
          rotatedAnchor: resolvedLayout.tickLayout.rotatedAnchor,
          tickElements: xTicks,
        })
        maxAxisRotation = Math.max(maxAxisRotation, Math.abs(axisLayout.angleDeg))
        maxDensityStep = Math.max(maxDensityStep, axisLayout.densityStep)

        panel.append(SvgElements.Group).attr(SvgAttributes.Class, SvgClassNames.YAxis).call(d3.axisLeft(yScale).ticks(5))
        applyAxisTickLabelSize(panel.select<SVGGElement>(`.${SvgClassNames.YAxis}`))

        const domainSet = new Set(domain.map(String))
        const panelSegments = stacked.segments.filter((segment) => domainSet.has(String(segment.target)))

        panel
          .selectAll<SVGRectElement, StackedSegment>(SvgElements.Rect)
          .data(panelSegments)
          .join(SvgElements.Rect)
          .attr(SvgAttributes.Class, SvgClassNames.MainBar)
          .attr(SvgAttributes.X, (segment) => xScale(segment.target) ?? 0)
          .attr(SvgAttributes.Width, xScale.bandwidth())
          .attr(SvgAttributes.Y, (segment) => yScale(Math.max(segment.y0, segment.y1)))
          .attr(SvgAttributes.Height, (segment) => Math.abs(yScale(segment.y0) - yScale(segment.y1)))
          .attr(SvgAttributes.Fill, (segment) => colorScale(String(segment.series)) || '#69b3a2')
          .attr(DataAttributes.Id, (segment) => `${id}|${String(segment.target)}|${String(segment.series)}`)
          .attr(DataAttributes.Target, (segment) => String(segment.target))
          .attr(DataAttributes.Value, (segment) => segment.value)
          .attr(DataAttributes.Series, (segment) => String(segment.series))
          .attr(DataAttributes.ChartId, id)
      })

      nextSvg.attr(DataAttributes.AxisRotation, String(maxAxisRotation))
      nextSvg.attr(DataAttributes.TickDensityStep, String(maxDensityStep))
      return nextSvg
    },
    { maxPasses: 4 },
  )
  return svg
}

export function getStackedBarStoredData(container: HTMLElement) {
  return cloneRows(localDataStore.get(container) || [])
}

export function getStackedBarOriginalData(container: HTMLElement) {
  return cloneRows(originalDataStore.get(container) || [])
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

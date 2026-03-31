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

type SplitState = { field: string; domains: Record<string, Set<string>> }
type SplitGroupResult = {
  ids: [string, string]
  domains: [Array<string | number>, Array<string | number>]
}

type GroupedBarPoint = {
  category: string | number
  series: string | number | null
  value: number
  rows: RawDatum[]
}

type GroupedFacetConfig = {
  field: string
  orientation: 'column' | 'row'
  title: string | null
  sort?: JsonValue
}

type ResolvedGroupedRuntime = {
  renderSpec: ChartSpec
  xField: string
  yField: string
  xSort?: JsonValue
  xOffsetField?: string
  colorField?: string
  facet?: GroupedFacetConfig | null
}

const localDataStore: WeakMap<HTMLElement, RawDatum[]> = new WeakMap()
const originalDataStore: WeakMap<HTMLElement, RawDatum[]> = new WeakMap()
const splitStateStore: WeakMap<HTMLElement, SplitState> = new WeakMap()

export type GroupedSpec = ChartSpec & {
  encoding: {
    x: { field: string; type: string; sort?: JsonValue }
    y: { field: string; type: string; stack?: string | null; scale?: JsonValue }
    color?: { field?: string; type?: string; scale?: JsonValue; legend?: JsonValue; condition?: JsonValue }
    column?: { field?: string; type?: string; sort?: JsonValue; header?: JsonValue }
    row?: { field?: string; type?: string; sort?: JsonValue; header?: JsonValue }
    xOffset?: { field?: string; type?: string; sort?: JsonValue }
  }
  facet?: {
    column?: { field?: string; type?: string; sort?: JsonValue; header?: JsonValue }
    row?: { field?: string; type?: string; sort?: JsonValue; header?: JsonValue }
  }
  spec?: ChartSpec
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function extractField(channel: unknown): string | undefined {
  const field = asRecord(channel).field
  return typeof field === 'string' && field.trim().length > 0 ? field.trim() : undefined
}

function extractHeaderTitle(value: unknown) {
  const header = asRecord(value)
  if (typeof header.title === 'string') return header.title.trim()
  if (header.title === null) return null
  return undefined
}

function normalizeOptionalLabel(value: JsonValue | undefined) {
  if (value === undefined) return undefined
  if (value === null) return null
  const str = String(value).trim()
  return str.length > 0 ? str : null
}

function resolveAxisLabels(spec: GroupedSpec, xField: string, yField: string) {
  const axisLabelsMeta = (spec as { meta?: { axisLabels?: { x?: JsonValue; y?: JsonValue } } }).meta?.axisLabels ?? {}
  const xAxisLabelOverride = normalizeOptionalLabel(axisLabelsMeta.x)
  const yAxisLabelOverride = normalizeOptionalLabel(axisLabelsMeta.y)
  return {
    xAxisLabel: xAxisLabelOverride === undefined ? xField : xAxisLabelOverride,
    yAxisLabel: yAxisLabelOverride === undefined ? yField : yAxisLabelOverride,
  }
}

function resolveGroupedRuntimeSpec(spec: GroupedSpec): ResolvedGroupedRuntime | null {
  const topEncoding = asRecord(spec.encoding)
  const nestedSpec = asRecord(spec.spec) as ChartSpec
  const nestedEncoding = asRecord(nestedSpec.encoding)
  const mergedEncoding = { ...topEncoding, ...nestedEncoding }

  const xField = extractField(mergedEncoding.x)
  const yField = extractField(mergedEncoding.y)
  if (!xField || !yField) return null

  const facetRec = asRecord(spec.facet)
  const encodingColumn = asRecord(mergedEncoding.column)
  const encodingRow = asRecord(mergedEncoding.row)
  const facetColumn = asRecord(facetRec.column)
  const facetRow = asRecord(facetRec.row)

  let facet: GroupedFacetConfig | null = null
  const facetField =
    extractField(encodingColumn) || extractField(encodingRow) || extractField(facetColumn) || extractField(facetRow)
  if (facetField) {
    const columnLike = extractField(encodingColumn) || extractField(facetColumn)
    const channel = columnLike ? (columnLike === facetField ? encodingColumn : facetColumn) : extractField(encodingRow) ? encodingRow : facetRow
    facet = {
      field: facetField,
      orientation: columnLike ? 'column' : 'row',
      sort: channel.sort as JsonValue | undefined,
      title: extractHeaderTitle(channel.header) ?? facetField,
    }
  }

  const mergedTransforms = [
    ...((Array.isArray(spec.transform) ? spec.transform : []) as JsonValue[]),
    ...((Array.isArray(nestedSpec.transform) ? nestedSpec.transform : []) as JsonValue[]),
  ]

  const renderSpec: ChartSpec = {
    ...spec,
    ...nestedSpec,
    data: spec.data ?? nestedSpec.data,
    mark: nestedSpec.mark ?? spec.mark,
    encoding: mergedEncoding as ChartSpec['encoding'],
    config: { ...asRecord(spec.config), ...asRecord(nestedSpec.config) } as ChartSpec['config'],
  }
  if (mergedTransforms.length > 0) renderSpec.transform = mergedTransforms

  return {
    renderSpec,
    xField,
    yField,
    xSort: asRecord(mergedEncoding.x).sort as JsonValue | undefined,
    xOffsetField: extractField(mergedEncoding.xOffset),
    colorField: extractField(mergedEncoding.color),
    facet,
  }
}

function aggregateGroupedRows(
  rows: RawDatum[],
  categoryField: string,
  valueField: string,
  seriesField?: string | null,
): GroupedBarPoint[] {
  const map = new Map<string, GroupedBarPoint>()
  rows.forEach((row) => {
    const categoryRaw = row[categoryField]
    const value = Number(row[valueField])
    if (categoryRaw == null || !Number.isFinite(value)) return
    const seriesRaw = seriesField ? row[seriesField] ?? null : null
    const category = categoryRaw as string | number
    const series = seriesRaw == null ? null : (seriesRaw as string | number)
    const key = `${String(category)}__${series == null ? '' : String(series)}`
    const prev = map.get(key)
    if (!prev) {
      map.set(key, { category, series, value, rows: [{ ...row }] })
      return
    }
    prev.value += value
    prev.rows.push({ ...row })
  })
  return Array.from(map.values())
}

function resolveFacetRows(rows: RawDatum[], facet: GroupedFacetConfig | null, facetValue: string | number | null) {
  if (!facet || facetValue == null) return rows
  return rows.filter((row) => String(row[facet.field]) === String(facetValue))
}

function resolveSeriesField(runtime: ResolvedGroupedRuntime) {
  if (runtime.xOffsetField && runtime.xOffsetField !== runtime.xField) return runtime.xOffsetField
  if (runtime.colorField && runtime.colorField !== runtime.xField) return runtime.colorField
  return null
}

function writeDatasetAttrs(
  svg: d3.Selection<SVGSVGElement, unknown, d3.BaseType, unknown>,
  runtime: ResolvedGroupedRuntime,
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
    .attr(DataAttributes.FacetField, runtime.facet?.field ?? null)
}

function resolveLegendColorMap(
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

export async function renderGroupedBarChart(
  container: HTMLElement,
  spec: GroupedSpec,
  options?: { preserveOriginal?: boolean },
) {
  clearGroupedBarSplitState(container)

  const runtime = resolveGroupedRuntimeSpec(spec)
  if (!runtime) {
    console.warn('renderGroupedBarChart: missing grouped bar encoding')
    return null
  }

  const renderEpoch = bumpRenderEpoch(container)
  const rawRows = await loadBarRows(runtime.renderSpec)
  const seriesField = resolveSeriesField(runtime)
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
      if (seriesField) {
        const seriesValue = row[seriesField]
        next[seriesField] = seriesValue == null ? null : String(seriesValue)
      }
      if (runtime.facet) {
        const facetValue = row[runtime.facet.field]
        next[runtime.facet.field] = facetValue == null ? null : String(facetValue)
      }
      return next
    })
    .filter((row): row is RawDatum => row !== null)

  const colorDomain = runtime.colorField
    ? resolveDiscreteDomainFromScale(
        normalizedRows,
        runtime.colorField,
        asRecord(asRecord(asRecord(runtime.renderSpec.encoding).color).scale),
        runtime.colorField,
      )
    : []
  const colorForBar = buildBarColorResolver(runtime.renderSpec, runtime.colorField, colorDomain)
  const colorChannel = resolveTopLevelColorChannel(runtime.renderSpec)
  const showLegend = Boolean(runtime.colorField) && colorDomain.length > 1 && isLegendVisible(colorChannel)
  const legendTitle = showLegend ? resolveColorLegendTitle(colorChannel, runtime.colorField ?? null) : null

  normalizedRows.forEach((row) => {
    const colorKey =
      runtime.colorField && row[runtime.colorField] != null
        ? (row[runtime.colorField] as string | number)
        : seriesField && row[seriesField] != null
          ? (row[seriesField] as string | number)
          : row[runtime.xField] != null
            ? (row[runtime.xField] as string | number)
            : null
    row.__fill = colorForBar([row], colorKey)
  })

  localDataStore.set(container, normalizedRows)
  if (!options?.preserveOriginal || !originalDataStore.has(container)) {
    originalDataStore.set(container, cloneRows(normalizedRows))
  }
  storeRuntimeChartState(container, { chartType: ChartType.GROUPED_BAR, spec, renderer: 'd3' })

  const facetDomain = runtime.facet
    ? resolveCategoricalDomain(normalizedRows, runtime.facet.field, runtime.facet.sort, runtime.yField)
    : [null]
  const allAggregated = facetDomain.flatMap((facetValue) =>
    aggregateGroupedRows(
      resolveFacetRows(normalizedRows, runtime.facet ?? null, facetValue),
      runtime.xField,
      runtime.yField,
      seriesField,
    ),
  )
  const yDomain = resolveScaleDomain(
    allAggregated.map((entry) => entry.value),
    asRecord(asRecord(asRecord(runtime.renderSpec.encoding).y).scale),
  )

  const { xAxisLabel, yAxisLabel } = resolveAxisLabels(spec, runtime.xField, runtime.yField)
  const layout = resolveLayoutModel({
    container,
    chartType: ChartType.GROUPED_BAR,
    spec: runtime.renderSpec,
    legend: { visible: showLegend },
    facet: {
      enabled: Boolean(runtime.facet),
      orientation: runtime.facet?.orientation ?? null,
      count: facetDomain.length,
    },
  })
  const panelIndex = new Map(facetDomain.map((value, index) => [String(value ?? '__single__'), index]))
  const xLabelMap = buildCategoricalDisplayLabelMap(normalizedRows, runtime.xField)
  const svg = renderWithMeasuredLayout(
    container,
    layout,
    (resolvedLayout) => {
      const margin = resolvedLayout.padding
      const gap = resolvedLayout.facet.gap
      const width = resolvedLayout.canvas.width
      const height = resolvedLayout.canvas.height
      const plotW = resolvedLayout.plot.width
      const plotH = resolvedLayout.plot.height
      const panelW = resolvedLayout.facet.panelWidth
      const panelH = resolvedLayout.facet.panelHeight

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
        groupLabel: seriesField
          ? runtime.colorField && seriesField === runtime.colorField
            ? legendTitle ?? seriesField
            : seriesField
          : null,
      })

      let maxAxisRotation = 0
      let maxDensityStep = 1
      facetDomain.forEach((facetValue) => {
        const panelKey = String(facetValue ?? '__single__')
        const index = panelIndex.get(panelKey) ?? 0
        const panelRows = resolveFacetRows(normalizedRows, runtime.facet ?? null, facetValue)
        const aggregatedRows = aggregateGroupedRows(panelRows, runtime.xField, runtime.yField, seriesField)
        const xDomain = resolveCategoricalDomain(panelRows, runtime.xField, runtime.xSort, runtime.yField)
        const seriesDomain = seriesField
          ? resolveDiscreteDomainFromScale(
              panelRows,
              seriesField,
              seriesField === runtime.colorField ? asRecord(asRecord(asRecord(runtime.renderSpec.encoding).color).scale) : {},
              seriesField,
            )
          : ['__single__']

        const panel = nextSvg
          .append(SvgElements.Group)
          .attr(DataAttributes.ChartId, panelKey)
          .attr(DataAttributes.ChartPanel, runtime.facet ? 'true' : 'false')
          .attr(DataAttributes.PanelPlotX, 0)
          .attr(DataAttributes.PanelPlotY, 0)
          .attr(DataAttributes.PanelPlotWidth, panelW)
          .attr(DataAttributes.PanelPlotHeight, panelH)
          .attr(
            SvgAttributes.Transform,
            `translate(${margin.left + (runtime.facet?.orientation === 'column' ? index * (panelW + gap) : 0)},${margin.top + (runtime.facet?.orientation === 'row' ? index * (panelH + gap) : 0)})`,
          )

        if (runtime.facet && facetValue != null) {
          panel
            .append(SvgElements.Text)
            .attr(SvgAttributes.Class, 'panel-title')
            .attr('x', panelW / 2)
            .attr('y', -resolvedLayout.facet.titleOffsetY)
            .attr(SvgAttributes.TextAnchor, 'middle')
            .attr(SvgAttributes.FontSize, CHART_TEXT_SIZE.splitPanelTitle)
            .attr(SvgAttributes.FontWeight, 'bold')
            .text(String(facetValue))
        }

        const xScale = d3.scaleBand<string | number>().domain(xDomain).range([0, panelW]).paddingInner(0.18).paddingOuter(0.08)
        const innerScale = d3
          .scaleBand<string | number>()
          .domain(seriesDomain)
          .range([0, Math.max(xScale.bandwidth(), 1)])
          .padding(seriesField ? 0.08 : 0)
        const yScale = d3.scaleLinear().domain(yDomain).nice().range([panelH, 0])
        const zeroY = yScale(0)

        panel
          .append(SvgElements.Group)
          .attr(SvgAttributes.Class, SvgClassNames.XAxis)
          .attr(SvgAttributes.Transform, `translate(0,${panelH})`)
          .call(d3.axisBottom(xScale).tickFormat(categoricalTickFormatter(xLabelMap)))
        applyAxisTickLabelSize(panel.select<SVGGElement>(`.${SvgClassNames.XAxis}`))
        const panelTicks = Array.from(panel.select(`.${SvgClassNames.XAxis}`).selectAll<SVGGElement, unknown>('.tick').nodes())
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
          tickElements: panelTicks,
        })
        maxAxisRotation = Math.max(maxAxisRotation, Math.abs(axisLayout.angleDeg))
        maxDensityStep = Math.max(maxDensityStep, axisLayout.densityStep)

        panel.append(SvgElements.Group).attr(SvgAttributes.Class, SvgClassNames.YAxis).call(d3.axisLeft(yScale).ticks(5))
        applyAxisTickLabelSize(panel.select<SVGGElement>(`.${SvgClassNames.YAxis}`))

        panel
          .selectAll<SVGRectElement, GroupedBarPoint>(SvgElements.Rect)
          .data(aggregatedRows)
          .join(SvgElements.Rect)
          .attr(SvgAttributes.Class, SvgClassNames.MainBar)
          .attr(SvgAttributes.X, (datum) => {
            const groupX = xScale(datum.category) ?? 0
            if (!seriesField || datum.series == null) return groupX
            return groupX + (innerScale(datum.series) ?? 0)
          })
          .attr(SvgAttributes.Width, () => (seriesField ? innerScale.bandwidth() : xScale.bandwidth()))
          .attr(SvgAttributes.Y, (datum) => (datum.value >= 0 ? yScale(datum.value) : zeroY))
          .attr(SvgAttributes.Height, (datum) => Math.abs(yScale(datum.value) - zeroY))
          .attr(SvgAttributes.Fill, (datum) => {
            const colorKey =
              runtime.colorField && datum.rows[0]?.[runtime.colorField] != null
                ? (datum.rows[0][runtime.colorField] as string | number)
                : datum.series ?? datum.category
            return colorForBar(datum.rows, colorKey)
          })
          .attr(DataAttributes.Id, (datum) => `${panelKey}|${String(datum.category)}|${String(datum.series ?? 'all')}`)
          .attr(DataAttributes.Target, (datum) => String(datum.category))
          .attr(DataAttributes.Value, (datum) => Number(datum.value))
          .attr(DataAttributes.Series, (datum) => {
            const value =
              runtime.colorField && datum.rows[0]?.[runtime.colorField] != null
                ? datum.rows[0][runtime.colorField]
                : datum.series
            return value == null ? null : String(value)
          })
          .attr(DataAttributes.XValue, (datum) => xLabelMap.get(String(datum.category)) ?? String(datum.category))
          .attr(DataAttributes.YValue, (datum) => formatTooltipValue(Number(datum.value)))
          .attr(DataAttributes.GroupValue, (datum) => {
            const value =
              runtime.colorField && datum.rows[0]?.[runtime.colorField] != null
                ? datum.rows[0][runtime.colorField]
                : datum.series
            return value == null ? null : String(value)
          })
          .attr(DataAttributes.ChartId, panelKey)
      })

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
          items: resolveLegendColorMap(normalizedRows, colorDomain, runtime.colorField, colorForBar),
        })
      }

      nextSvg.attr(DataAttributes.AxisRotation, String(maxAxisRotation))
      nextSvg.attr(DataAttributes.TickDensityStep, String(maxDensityStep))
      return nextSvg
    },
    { maxPasses: 4 },
  )
  attachChartHoverTooltip(container)
  return svg
}

export async function renderSumGroupedBarChart(
  container: HTMLElement,
  spec: GroupedSpec,
  config?: { label?: string; value?: number },
) {
  const runtime = resolveGroupedRuntimeSpec(spec)
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
    await renderGroupedBarChart(container, {
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
    [runtime.yField]: canScale ? (value / computedTotal) * requestedTotal : fallbackEven ? requestedTotal / Math.max(1, list.length) : value,
    [runtime.colorField!]: series,
  }))

  await renderGroupedBarChart(container, {
    ...spec,
    data: { values },
  })
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
  const runtime = resolveGroupedRuntimeSpec(spec)
  return runtime?.facet?.field ?? null
}

function resolveSplitField(spec: GroupedSpec, rows: RawDatum[], split: DrawSplitSpec) {
  const splitValues = splitValueSet(split)
  const runtime = resolveGroupedRuntimeSpec(spec)
  const fallback = runtime?.xField ?? 'x'
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

function resolveSeriesColors(rows: RawDatum[], seriesField: string) {
  const map = new Map<string, string>()
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

/** @deprecated SurfaceManager.splitSurface() + renderGroupedBarChart() 조합으로 대체됨. */
export async function renderSplitGroupedBarChart(container: HTMLElement, spec: GroupedSpec, split: DrawSplitSpec) {
  const runtime = resolveGroupedRuntimeSpec(spec)
  if (!runtime) return

  const renderEpoch = bumpRenderEpoch(container)
  const data = localDataStore.get(container) || []
  if (!data.length) {
    console.warn('draw:split skipped: grouped chart has no data')
    return
  }

  const splitField = resolveSplitField(spec, data, split)
  const categoryField = splitField
  const seriesField = runtime.colorField && runtime.colorField !== categoryField ? runtime.colorField : runtime.xField
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

  const aggregatedAll = aggregateGroupedRows(data, categoryField, runtime.yField, seriesField)
  const [domainMin, domainMax] = resolveScaleDomain(
    aggregatedAll.map((datum) => datum.value),
    asRecord(asRecord(asRecord(runtime.renderSpec.encoding).y).scale),
  )

  const layout = resolveLayoutModel({
    container,
    chartType: ChartType.GROUPED_BAR,
    spec: runtime.renderSpec,
    split: { enabled: true, orientation: split.orientation },
  })

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

      const yScale = d3.scaleLinear().domain([domainMin, domainMax]).nice().range([subH, 0])
      const zeroY = yScale(0)
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

        const xScale = d3.scaleBand<string | number>().domain(domain).range([0, subW]).paddingInner(0.18).paddingOuter(0.08)
        const groupScale = d3.scaleBand<string | number>().domain(seriesDomain).range([0, xScale.bandwidth()]).padding(0.08)
        const xLabelMap = buildCategoricalDisplayLabelMap(data, categoryField)

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
        const rows = data.filter((row) => domainSet.has(String(row[categoryField])))
        const aggregatedRows = aggregateGroupedRows(rows, categoryField, runtime.yField, seriesField)

        panel
          .selectAll<SVGRectElement, GroupedBarPoint>(SvgElements.Rect)
          .data(aggregatedRows)
          .join(SvgElements.Rect)
          .attr(SvgAttributes.Class, SvgClassNames.MainBar)
          .attr(SvgAttributes.X, (datum) => {
            const x = xScale(datum.category)
            const offset = datum.series == null ? 0 : groupScale(datum.series)
            return (x ?? 0) + (offset ?? 0)
          })
          .attr(SvgAttributes.Width, groupScale.bandwidth())
          .attr(SvgAttributes.Y, (datum) => (datum.value >= 0 ? yScale(Number(datum.value)) : zeroY))
          .attr(SvgAttributes.Height, (datum) => Math.abs(yScale(Number(datum.value)) - zeroY))
          .attr(SvgAttributes.Fill, (datum) => colorForSeries(datum.series ?? datum.category))
          .attr(DataAttributes.Id, (datum) => `${id}|${String(datum.category)}|${String(datum.series)}`)
          .attr(DataAttributes.Target, (datum) => String(datum.category))
          .attr(DataAttributes.Value, (datum) => Number(datum.value))
          .attr(DataAttributes.Series, (datum) => (datum.series == null ? null : String(datum.series)))
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

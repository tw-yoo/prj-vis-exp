import * as d3 from 'd3'
import { ChartType } from '../../domain/chart'
import { averageData, diffData, filterData, findExtremum, lagDiffData, nthData, pairDiffData, retrieveValue } from '../../domain/operation/dataOps'
import { OperationOp, type DatumValue, type JsonValue, type OperationSpec, type TargetSelector } from '../../domain/operation/types'
import { toDatumValuesFromRaw, type RawRow } from '../../domain/data/datum'
import { getMultipleLineStoredData, resolveMultiLineEncoding, type MultiLineSpec } from '../../rendering/line/multipleLineRenderer'
import { DataAttributes, SvgAttributes, SvgClassNames, SvgElements } from '../../rendering/interfaces'
import type { ParsedOperationRun } from '../types'
import { getSupportedOperationsForChart, runStubChartOperationRenderer } from './shared'
import { placeOperationTextLabel } from '../textPlacement'
import { COLORS, DURATIONS, EASINGS, OPACITIES } from '../../rendering/common/d3Helpers'
import { clearGroupBoundary, type ChainState, type ScaleRecord } from '../chainState'
import { formatOperationValue, formatSignedOperationValue } from '../primitives/formatValue'
import {
  ANNOTATION_LAYER_CLASS,
  ensureAnnotationLayer,
  resolveAnnotationViewport,
  readNumberAttr,
  applyAnnotationContextTransitions,
} from '../primitives/annotationLayer'
import { drawReferenceLine } from '../primitives/drawReferenceLine'
import { drawDirectionalArrow, drawVerticalComparisonArrow } from '../primitives/drawDifferenceArrow'
import { applyMarkSalience } from '../primitives/markSalience'
import {
  buildOperationNextRunOutcome,
  restoreChainState,
  stateWithOperationDependencies,
  storeOperationRuntimeResult,
} from '../executionState'
import {
  RESULT_REF_ATTRIBUTE,
  diffEndpointSelectors,
  isOperationResultReferenced,
  operationResultRef,
  resolveDerivedDiffEndpoint,
} from '../diffEndpoint'
import { isTerminalBadgeOperation, runTerminalBadgeOperation } from './terminalShared'

export const MULTIPLE_LINE_SUPPORTED_OPERATIONS = getSupportedOperationsForChart(ChartType.MULTI_LINE)

const RETRIEVE_ANNOTATION_CLASS = 'operation-next-multiple-line-retrieve-value'
const FILTER_ANNOTATION_CLASS = 'operation-next-multiple-line-filter'
const FILTER_LINE_LAYER_CLASS = 'operation-next-multiple-line-filter-segments'
const DIFF_ANNOTATION_CLASS = 'operation-next-multiple-line-diff'
const PAIR_DIFF_ANNOTATION_CLASS = 'operation-next-multiple-line-pair-diff'
const AVERAGE_ANNOTATION_CLASS = 'operation-next-multiple-line-average'
const EXTREMUM_ANNOTATION_CLASS = 'operation-next-multiple-line-extremum'
const NTH_ANNOTATION_CLASS = 'operation-next-multiple-line-nth'
const LAG_DIFF_ANNOTATION_CLASS = 'operation-next-multiple-line-lag-diff'
const DEBUG_PREFIX = '[operation-next-debug]'

function scalarReferenceLineForResultRef(
  layer: d3.Selection<SVGGElement, unknown, null, undefined>,
  resultRef: string | null | undefined,
) {
  if (!resultRef) return null
  let y: number | null = null
  layer
    .selectAll<SVGLineElement, unknown>(`line[${RESULT_REF_ATTRIBUTE}]`)
    .each(function () {
      if (y != null) return
      if (this.getAttribute(RESULT_REF_ATTRIBUTE) === resultRef) {
        y = readNumberAttr(this, SvgAttributes.Y1)
      }
    })
  return y == null ? null : { y }
}

type PointMetrics = {
  point: SVGCircleElement
  x: number
  y: number
  plotX: number
  plotY: number
  value: number
  target: string
  id: string
  series: string | null
}

function isOperationNextDebugEnabled() {
  return Boolean((globalThis as typeof globalThis & { __OPERATION_NEXT_DEBUG__?: boolean }).__OPERATION_NEXT_DEBUG__)
}

function debugNow() {
  return typeof performance === 'undefined' ? Date.now() : Number(performance.now().toFixed(1))
}

function debugLog(label: string, payload: unknown) {
  if (!isOperationNextDebugEnabled()) return
  try {
    console.info(DEBUG_PREFIX, label, JSON.stringify(payload))
  } catch {
    console.info(DEBUG_PREFIX, label, payload)
  }
}

function summarizeMultipleLineDom(container: HTMLElement) {
  const svg = container.querySelector('svg')
  const seriesValues = Array.from(container.querySelectorAll<SVGElement>('[data-series]'))
    .map((node) => node.getAttribute('data-series') ?? '')
    .filter((series) => series.length > 0)
  return {
    focusState: container.dataset.operationNextFocusState ?? null,
    svgCount: container.querySelectorAll('svg').length,
    renderEpoch: svg?.getAttribute('data-render-epoch') ?? null,
    dataPathCount: container.querySelectorAll('path[data-series]').length,
    circleCount: container.querySelectorAll('circle[data-series]').length,
    annotationTextCount: container.querySelectorAll('text.text-annotation').length,
    series: Array.from(new Set(seriesValues)).sort(),
  }
}

function isRetrieveValueOperation(operation: OperationSpec): operation is OperationSpec & { op: typeof OperationOp.RetrieveValue } {
  return operation.op === OperationOp.RetrieveValue
}

function isFilterOperation(operation: OperationSpec): operation is OperationSpec & { op: typeof OperationOp.Filter } {
  return operation.op === OperationOp.Filter
}

function isDiffOperation(operation: OperationSpec): operation is OperationSpec & { op: typeof OperationOp.Diff } {
  return operation.op === OperationOp.Diff
}

function isAverageOperation(operation: OperationSpec): operation is OperationSpec & { op: typeof OperationOp.Average } {
  return operation.op === OperationOp.Average
}

function isNthOperation(operation: OperationSpec): operation is OperationSpec & { op: typeof OperationOp.Nth } {
  return operation.op === OperationOp.Nth
}

function isFindExtremumOperation(operation: OperationSpec): operation is OperationSpec & { op: typeof OperationOp.FindExtremum } {
  return operation.op === OperationOp.FindExtremum
}

function isLagDiffOperation(operation: OperationSpec): operation is OperationSpec & { op: typeof OperationOp.LagDiff } {
  return operation.op === OperationOp.LagDiff
}

function isPairDiffOperation(operation: OperationSpec): operation is OperationSpec & { op: typeof OperationOp.PairDiff } {
  return operation.op === OperationOp.PairDiff
}

function getInlineRows(spec: MultiLineSpec): RawRow[] {
  const values = (spec.data as { values?: JsonValue[] } | undefined)?.values
  if (!Array.isArray(values)) return []
  return values.filter((value): value is RawRow => !!value && typeof value === 'object' && !Array.isArray(value))
}

function getWorkingData(run: ParsedOperationRun): DatumValue[] {
  const spec = run.runtimeSpec as MultiLineSpec
  const resolved = resolveMultiLineEncoding(spec)
  if (!resolved) return []
  const storedRows = getMultipleLineStoredData(run.container) as RawRow[]
  const rows = storedRows.length > 0 ? storedRows : getInlineRows(spec)
  return toDatumValuesFromRaw(rows, {
    xField: resolved.xField,
    yField: resolved.yField,
    groupField: resolved.colorField ?? undefined,
  })
}



function selectorTargetKey(selector: TargetSelector | TargetSelector[] | undefined) {
  const entry = Array.isArray(selector) ? selector[0] : selector
  if (entry == null) return null
  if (typeof entry === 'string' || typeof entry === 'number') return String(entry)
  const target = entry.target ?? entry.category ?? entry.id
  return target == null ? null : String(target)
}

function selectorSeriesKey(selector: TargetSelector | TargetSelector[] | undefined) {
  const entry = Array.isArray(selector) ? selector[0] : selector
  if (!entry || typeof entry !== 'object') return null
  return entry.series == null ? null : String(entry.series)
}

function normalizedDateTarget(value: string) {
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString().slice(0, 10)
}

function targetMatches(nodeValue: string | null | undefined, requested: string) {
  if (!nodeValue) return false
  if (nodeValue === requested) return true
  if (nodeValue.endsWith(`::${requested}`)) return true
  const normalizedRequested = normalizedDateTarget(requested)
  if (normalizedRequested && nodeValue === normalizedRequested) return true
  if (/^\d{4}$/.test(requested) && nodeValue.startsWith(`${requested}-`)) return true
  return false
}

function pointMatchesDatum(point: SVGCircleElement, datum: DatumValue) {
  const target = String(datum.target)
  const id = datum.id == null ? null : String(datum.id)
  const nodeTarget = point.getAttribute(DataAttributes.Target)
  const nodeId = point.getAttribute(DataAttributes.Id)
  const nodeXValue = point.getAttribute(DataAttributes.XValue)
  const targetMatch =
    targetMatches(nodeTarget, target) ||
    targetMatches(nodeId, target) ||
    targetMatches(nodeXValue, target) ||
    (id != null && (targetMatches(nodeTarget, id) || targetMatches(nodeId, id) || targetMatches(nodeXValue, id)))
  if (!targetMatch) return false
  if (datum.group == null) return true
  return point.getAttribute(DataAttributes.Series) === String(datum.group) || point.getAttribute(DataAttributes.GroupValue) === String(datum.group)
}

function findPointByDatum(svg: d3.Selection<SVGSVGElement, unknown, null, undefined>, datum: DatumValue) {
  return svg
    .selectAll<SVGCircleElement, unknown>(`${SvgElements.Circle}[${DataAttributes.Target}], ${SvgElements.Circle}[${DataAttributes.Id}]`)
    .filter(function () {
      return pointMatchesDatum(this as SVGCircleElement, datum)
    })
}

function findPointByTarget(
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
  target: string,
  series: string | null = null,
) {
  return svg
    .selectAll<SVGCircleElement, unknown>(`${SvgElements.Circle}[${DataAttributes.Target}], ${SvgElements.Circle}[${DataAttributes.Id}]`)
    .filter(function () {
      const node = this as SVGCircleElement
      const targetMatch =
        targetMatches(node.getAttribute(DataAttributes.Target), target) ||
        targetMatches(node.getAttribute(DataAttributes.Id), target) ||
        targetMatches(node.getAttribute(DataAttributes.XValue), target)
      if (!targetMatch) return false
      if (series == null) return true
      return node.getAttribute(DataAttributes.Series) === series || node.getAttribute(DataAttributes.GroupValue) === series
    })
}

function findPoint(svg: d3.Selection<SVGSVGElement, unknown, null, undefined>, selector: TargetSelector | TargetSelector[] | undefined) {
  const key = selectorTargetKey(selector)
  if (!key) return null
  return findPointByTarget(svg, key, selectorSeriesKey(selector)).nodes()[0] ?? null
}

function pointRootMetrics(point: SVGCircleElement, marginLeft: number, marginTop: number): PointMetrics {
  const plotX = readNumberAttr(point, SvgAttributes.CX) ?? 0
  const plotY = readNumberAttr(point, SvgAttributes.CY) ?? 0
  return {
    point,
    plotX,
    plotY,
    x: marginLeft + plotX,
    y: marginTop + plotY,
    value: Number(point.getAttribute(DataAttributes.Value)),
    target: point.getAttribute(DataAttributes.Target) ?? point.getAttribute(DataAttributes.Id) ?? '',
    id: point.getAttribute(DataAttributes.Id) ?? '',
    series: point.getAttribute(DataAttributes.Series) ?? point.getAttribute(DataAttributes.GroupValue),
  }
}

function allPointMetrics(svg: d3.Selection<SVGSVGElement, unknown, null, undefined>) {
  const marginLeft = Number(svg.attr(DataAttributes.MarginLeft) ?? 0)
  const marginTop = Number(svg.attr(DataAttributes.MarginTop) ?? 0)
  return svg
    .selectAll<SVGCircleElement, unknown>(`${SvgElements.Circle}[${DataAttributes.Target}], ${SvgElements.Circle}[${DataAttributes.Id}]`)
    .nodes()
    .map((point) => pointRootMetrics(point, marginLeft, marginTop))
    .filter((entry) => Number.isFinite(entry.value) && Number.isFinite(entry.y))
}

function inferYForValue(svg: d3.Selection<SVGSVGElement, unknown, null, undefined>, value: number) {
  const points = allPointMetrics(svg)
  const exact = points.find((point) => point.value === value)
  if (exact) return exact.y
  const a = points[0]
  const b = points.find((point) => point.value !== a?.value)
  if (!a || !b) return null
  const pixelsPerValue = (b.y - a.y) / (b.value - a.value)
  if (!Number.isFinite(pixelsPerValue)) return null
  return a.y + (value - a.value) * pixelsPerValue
}

function resolveNumericThreshold(operation: OperationSpec, workingData: DatumValue[]) {
  const rawValue = operation.value
  const numeric = Number(rawValue)
  if (Number.isFinite(numeric)) return numeric

  if (typeof rawValue === 'string' || typeof rawValue === 'number') {
    const match = workingData.find((datum) => String(datum.target) === String(rawValue) || String(datum.id) === String(rawValue))
    if (match && Number.isFinite(Number(match.value))) return Number(match.value)
  }

  return null
}

function appendValueLabel(params: {
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>
  layer: d3.Selection<SVGGElement, unknown, d3.BaseType, unknown>
  className: string
  x: number
  y: number
  value: number
  color?: string
  anchorElement?: Element | null
}) {
  const labelNode = params.layer
    .append(SvgElements.Text)
    .attr(SvgAttributes.Class, `${SvgClassNames.TextAnnotation} ${params.className}`)
    .attr(SvgAttributes.X, params.x)
    .attr(SvgAttributes.Y, Math.max(12, params.y))
    .attr(SvgAttributes.TextAnchor, 'middle')
    .attr(SvgAttributes.FontSize, 12)
    .attr(SvgAttributes.FontWeight, 700)
    .attr(SvgAttributes.Fill, params.color ?? COLORS.TEXT_DARK)
    .style(SvgAttributes.Opacity, 0)
    .text(formatOperationValue(params.value))

  placeOperationTextLabel({
    svg: params.svg,
    text: labelNode,
    preferred: { x: params.x, y: Math.max(12, params.y) },
    anchorElement: params.anchorElement,
    viewport: resolveAnnotationViewport(params.svg),
  })

  return labelNode.transition().duration(DURATIONS.LABEL_FADE_IN).style(SvgAttributes.Opacity, 1)
}

function mainLinePath(svg: d3.Selection<SVGSVGElement, unknown, null, undefined>) {
  return svg
    .selectAll<SVGPathElement, unknown>(SvgElements.Path)
    .filter(function () {
      const path = this as SVGPathElement
      if (path.classList.contains(SvgClassNames.Annotation) || path.classList.contains(SvgClassNames.LineAnnotation)) return false
      if (path.classList.contains('domain')) return false
      if (path.closest(`.${SvgClassNames.XAxis}, .${SvgClassNames.YAxis}`)) return false
      if (path.closest(`.${ANNOTATION_LAYER_CLASS}, .${FILTER_LINE_LAYER_CLASS}`)) return false
      return path.getAttribute(SvgAttributes.Fill) === 'none' && path.hasAttribute(SvgAttributes.Stroke)
    })
}

function drawFilterLineSegments(svg: d3.Selection<SVGSVGElement, unknown, null, undefined>, remainingKeys: Set<string>) {
  svg.selectAll(`.${FILTER_LINE_LAYER_CLASS}`).interrupt().remove()
  let hasSegments = false

  mainLinePath(svg).each(function () {
    const linePath = this as SVGPathElement
    const lineParent = linePath.parentElement
    if (!lineParent) return
    const series = linePath.getAttribute(DataAttributes.Series)
    const points = d3
      .select(lineParent)
      .selectAll<SVGCircleElement, unknown>(`${SvgElements.Circle}[${DataAttributes.Target}], ${SvgElements.Circle}[${DataAttributes.Id}]`)
      .filter(function () {
        return (this as SVGCircleElement).getAttribute(DataAttributes.Series) === series
      })
      .nodes()
      .map((point) => ({
        x: readNumberAttr(point, SvgAttributes.CX) ?? 0,
        y: readNumberAttr(point, SvgAttributes.CY) ?? 0,
        target: point.getAttribute(DataAttributes.Target) ?? point.getAttribute(DataAttributes.Id) ?? '',
        id: point.getAttribute(DataAttributes.Id) ?? '',
        series: point.getAttribute(DataAttributes.Series) ?? point.getAttribute(DataAttributes.GroupValue) ?? '',
      }))
      .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
    if (points.length < 2) return

    const outsideSegments: Array<{ x1: number; y1: number; x2: number; y2: number }> = []
    for (let index = 1; index < points.length; index += 1) {
      const prev = points[index - 1]
      const current = points[index]
      if (!prev || !current) continue
      const prevIncluded = remainingKeys.has(pointKey(prev.target, prev.series)) || remainingKeys.has(pointKey(prev.id, prev.series))
      const currentIncluded = remainingKeys.has(pointKey(current.target, current.series)) || remainingKeys.has(pointKey(current.id, current.series))
      if (prevIncluded && currentIncluded) continue
      outsideSegments.push({ x1: prev.x, y1: prev.y, x2: current.x, y2: current.y })
    }
    if (outsideSegments.length === 0) return

    const stroke = linePath.getAttribute(SvgAttributes.Stroke) || COLORS.SERIES_DEFAULT
    const rawStrokeWidth = Number(linePath.getAttribute(SvgAttributes.StrokeWidth))
    const strokeWidth = Number.isFinite(rawStrokeWidth) ? rawStrokeWidth : 2
    const segmentLayer = d3.select(lineParent).insert(SvgElements.Group, SvgElements.Circle).attr(SvgAttributes.Class, FILTER_LINE_LAYER_CLASS)

    segmentLayer
      .selectAll<SVGLineElement, (typeof outsideSegments)[number]>('line.filter-line-cover')
      .data(outsideSegments)
      .enter()
      .append(SvgElements.Line)
      .attr(SvgAttributes.Class, 'filter-line-cover')
      .attr(SvgAttributes.X1, (segment) => segment.x1)
      .attr(SvgAttributes.Y1, (segment) => segment.y1)
      .attr(SvgAttributes.X2, (segment) => segment.x2)
      .attr(SvgAttributes.Y2, (segment) => segment.y2)
      .attr(SvgAttributes.Stroke, COLORS.LABEL_STROKE)
      .attr(SvgAttributes.StrokeWidth, strokeWidth + 2)

    segmentLayer
      .selectAll<SVGLineElement, (typeof outsideSegments)[number]>('line.filter-line-segment')
      .data(outsideSegments)
      .enter()
      .append(SvgElements.Line)
      .attr(SvgAttributes.Class, 'filter-line-segment')
      .attr(SvgAttributes.X1, (segment) => segment.x1)
      .attr(SvgAttributes.Y1, (segment) => segment.y1)
      .attr(SvgAttributes.X2, (segment) => segment.x2)
      .attr(SvgAttributes.Y2, (segment) => segment.y2)
      .attr(SvgAttributes.Stroke, stroke)
      .attr(SvgAttributes.StrokeWidth, strokeWidth)
      .style(SvgAttributes.Opacity, 0.25)
    hasSegments = true
  })

  return hasSegments
}

/**
 * Map a pairDiff op's groupA/groupB (which are `seriesField` values, e.g.
 * "Russia favorability in US") to the chart's rendered `data-series` values
 * (the COLOR-field values, e.g. "Russia"). When the chart colors by a field
 * derived from the data (a Vega `calculate`, case 2eiyyw562tcvjypp where
 * Country is derived from Favorability_Direction), the two diverge — and the
 * raw groups match no `data-series`, so the focus transform would fade every
 * line to 0 (blank chart — audit multiLine-45-blankchart). When seriesField ==
 * colorField (or either is unknown) the groups pass through unchanged.
 */
function resolvePairDiffColorGroups(
  container: HTMLElement,
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
  operation: OperationSpec,
  groupA: string,
  groupB: string,
): { colorA: string; colorB: string } {
  const colorField = svg.attr(DataAttributes.ColorField) || null
  const seriesFieldRaw = (operation as { seriesField?: unknown }).seriesField
  const seriesField = seriesFieldRaw == null ? null : String(seriesFieldRaw)
  if (!seriesField || !colorField || seriesField === colorField) {
    return { colorA: groupA, colorB: groupB }
  }
  const rows = getMultipleLineStoredData(container) as Array<Record<string, unknown>>
  const map = new Map<string, string>()
  for (const row of rows) {
    const sv = row?.[seriesField]
    const cv = row?.[colorField]
    if (sv != null && cv != null && !map.has(String(sv))) map.set(String(sv), String(cv))
  }
  return { colorA: map.get(groupA) ?? groupA, colorB: map.get(groupB) ?? groupB }
}

async function applyPairDiffFocusTransform(
  container: HTMLElement,
  operation: OperationSpec,
  state?: ChainState,
): Promise<ScaleRecord | null> {
  const groupA = operation.groupA == null ? null : String(operation.groupA)
  const groupB = operation.groupB == null ? null : String(operation.groupB)
  if (!groupA || !groupB) return null

  // In-scope predicate for domain/path computation. A prior filter narrowed
  // workingData (e.g. to the last five years) and drove the excluded circles
  // to opacity 0 — but they are still in the DOM with their original
  // data-value. Without this scope, those stale circles stretch the recomputed
  // y domain and the rebound line paths regrow through the filtered-out years
  // (the "stray point" / rise-from-the-bottom morph).
  const scopeTargets =
    state && state.workingData.length > 0
      ? new Set(
          state.workingData.flatMap((d) => {
            const out: string[] = [String(d.target)]
            if (d.id != null) out.push(String(d.id))
            return out
          }),
        )
      : null
  const circleInScope = (node: SVGCircleElement): boolean => {
    if (scopeTargets) {
      const target = node.getAttribute(DataAttributes.Target) ?? ''
      const id = node.getAttribute(DataAttributes.Id) ?? ''
      if (!scopeTargets.has(target) && !scopeTargets.has(id)) return false
    }
    // Never let an invisible mark steer the focus domain or the rebound paths.
    const styleOpacity = node.style.opacity
    if (styleOpacity !== '' && Number(styleOpacity) === 0) return false
    return true
  }

  const svg = d3.select(container).select<SVGSVGElement>(SvgElements.Svg)
  if (svg.empty()) return null
  container.dataset.operationNextFocusState = 'pairDiff'
  svg.attr('data-operation-next-focus-state', 'pairDiff')
  const { colorA, colorB } = resolvePairDiffColorGroups(container, svg, operation, groupA, groupB)
  const keptGroups = new Set([colorA, colorB])
  const plotHeight = Number(svg.attr(DataAttributes.PlotHeight) ?? 0)
  if (!Number.isFinite(plotHeight) || plotHeight <= 0) return null

  debugLog('pairDiff-focus-start', {
    t: debugNow(),
    groupA,
    groupB,
    domBefore: summarizeMultipleLineDom(container),
  })

  // M6: fade the filter's ghost-segment overlay out instead of a synchronous
  // pop at the new→legacy seam (audit shared-mlpairdiff-sum-noteworthy-1).
  svg
    .selectAll(`.${FILTER_LINE_LAYER_CLASS}`)
    .interrupt()
    .transition()
    .duration(DURATIONS.REMOVE)
    .style(SvgAttributes.Opacity, 0)
    .remove()
  const transformDuration = DURATIONS.AXIS_RESCALE
  const fadeDuration = DURATIONS.REMOVE
  const transitions: Promise<void>[] = []
  const unrelatedPaths = mainLinePath(svg)
    .filter(function () {
      const series = (this as SVGPathElement).getAttribute(DataAttributes.Series) ?? ''
      return !keptGroups.has(series)
    })
  const unrelatedPointGroups = svg
    .selectAll<SVGGElement, unknown>(`${SvgElements.Group}[${DataAttributes.Series}]`)
    .filter(function () {
      const series = (this as SVGGElement).getAttribute(DataAttributes.Series) ?? ''
      return !keptGroups.has(series)
    })

  // Compute the kept points BEFORE fading anything: if the groups resolve to no
  // rendered series, bail with the chart intact instead of leaving every line
  // faded to 0 (audit multiLine-45-blankchart).
  const keptPoints = svg
    .selectAll<SVGCircleElement, unknown>(`${SvgElements.Circle}[${DataAttributes.Series}]`)
    .filter(function () {
      const node = this as SVGCircleElement
      const series = node.getAttribute(DataAttributes.Series) ?? ''
      return keptGroups.has(series) && circleInScope(node)
    })
  const values = keptPoints
    .nodes()
    .map((point) => Number(point.getAttribute(DataAttributes.Value)))
    .filter(Number.isFinite)
  if (values.length === 0) {
    debugLog('pairDiff-focus-abort-empty', { t: debugNow(), keptGroups: [...keptGroups] })
    return null
  }

  debugLog('pairDiff-focus-targets', {
    t: debugNow(),
    unrelatedPathCount: unrelatedPaths.size(),
    unrelatedPointGroupCount: unrelatedPointGroups.size(),
    keptPathCount: mainLinePath(svg).size() - unrelatedPaths.size(),
  })

  if (!unrelatedPaths.empty()) {
    transitions.push(
      unrelatedPaths.interrupt().transition().duration(fadeDuration).style(SvgAttributes.Opacity, 0).end(),
    )
  }

  if (!unrelatedPointGroups.empty()) {
    transitions.push(
      unrelatedPointGroups.interrupt().transition().duration(fadeDuration).style(SvgAttributes.Opacity, 0).end(),
    )
  }

  // Capture original domain (from current IN-SCOPE circle values) before
  // rescaling, so subsequent operations can detect the pairDiff rescale via
  // scaleState. Out-of-scope (filtered/hidden) circles are excluded — their
  // stale values would misrepresent the chart the viewer actually sees.
  const allValues = svg
    .selectAll<SVGCircleElement, unknown>(`${SvgElements.Circle}[${DataAttributes.Value}]`)
    .nodes()
    .filter((n) => circleInScope(n))
    .map((n) => Number(n.getAttribute(DataAttributes.Value)))
    .filter(Number.isFinite)
  const originalMin = d3.min(allValues) ?? 0
  const originalMax = d3.max(allValues) ?? 1
  const originalDomain: [number, number] = [originalMin, originalMax]

  let domainMin = d3.min(values) ?? 0
  let domainMax = d3.max(values) ?? 1
  if (domainMin === domainMax) domainMax = domainMin + 1
  const yScale = d3.scaleLinear().domain([domainMin, domainMax]).nice().range([plotHeight, 0])
  const currentDomain = yScale.domain() as [number, number]

  debugLog('pairDiff-focus-scale', {
    t: debugNow(),
    keptPointCount: keptPoints.size(),
    rawDomain: [domainMin, domainMax],
    niceDomain: yScale.domain(),
  })

  const yAxis = svg.select<SVGGElement>(`.${SvgClassNames.YAxis}`)
  if (!yAxis.empty()) {
    transitions.push(
      yAxis
        .interrupt()
        .transition()
        .duration(transformDuration)
        .call(d3.axisLeft(yScale).ticks(6) as any)
        .end()
        .then(() => {
          yAxis.selectAll<SVGTextElement, unknown>(SvgElements.Text).attr(SvgAttributes.FontSize, 15)
        }),
    )
  }

  transitions.push(
    keptPoints
      .interrupt()
      .transition()
      .duration(transformDuration)
      .attr(SvgAttributes.CY, function () {
        const value = Number((this as SVGCircleElement).getAttribute(DataAttributes.Value))
        return yScale(value)
      })
      .end(),
  )

  mainLinePath(svg).each(function () {
    const path = this as SVGPathElement
    const series = path.getAttribute(DataAttributes.Series) ?? ''
    if (!keptGroups.has(series)) return
    const points = svg
      .selectAll<SVGCircleElement, unknown>(`${SvgElements.Circle}[${DataAttributes.Series}]`)
      .filter(function () {
        const node = this as SVGCircleElement
        return node.getAttribute(DataAttributes.Series) === series && circleInScope(node)
      })
      .nodes()
      .map((point) => ({
        x: readNumberAttr(point, SvgAttributes.CX) ?? 0,
        value: Number(point.getAttribute(DataAttributes.Value)),
      }))
      .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.value))
      .sort((a, b) => a.x - b.x)
    if (points.length === 0) return
    const line = d3
      .line<(typeof points)[number]>()
      .x((point) => point.x)
      .y((point) => yScale(point.value))
    const nextPath = line(points)
    if (!nextPath) return
    transitions.push(
      d3
        .select(path)
        .interrupt()
        .transition()
        .duration(transformDuration)
        .attr(SvgAttributes.D, nextPath)
        .style(SvgAttributes.Opacity, 1)
        .end(),
    )
  })

  await Promise.all(transitions)
  debugLog('pairDiff-focus-end', {
    t: debugNow(),
    domAfter: summarizeMultipleLineDom(container),
  })
  return { originalDomain, currentDomain, rescaledBy: 'pairDiff' }
}

function pointKey(target: string, series: string | null | undefined) {
  return `${series ?? ''}::${target}`
}

function resultPointKeys(result: DatumValue[]) {
  const keys = new Set<string>()
  result.forEach((datum) => {
    const series = datum.group ?? ''
    keys.add(pointKey(String(datum.target), series))
    if (datum.id != null) keys.add(pointKey(String(datum.id), series))
    const normalized = normalizedDateTarget(String(datum.target))
    if (normalized) keys.add(pointKey(normalized, series))
  })
  return keys
}

async function annotateRetrievedValues(container: HTMLElement, values: DatumValue[]) {
  const svg = d3.select(container).select<SVGSVGElement>(SvgElements.Svg)
  if (svg.empty() || values.length === 0) return
  const layer = ensureAnnotationLayer(svg)
  layer.selectAll(`.${RETRIEVE_ANNOTATION_CLASS}`).remove()
  const marginLeft = Number(svg.attr(DataAttributes.MarginLeft) ?? 0)
  const marginTop = Number(svg.attr(DataAttributes.MarginTop) ?? 0)
  const transitions: Promise<void>[] = []

  values.forEach((datum, index) => {
    const points = findPointByDatum(svg, datum)
    const point = points.nodes()[0]
    if (!point) return
    const metrics = pointRootMetrics(point, marginLeft, marginTop)
    transitions.push(
      points
        .interrupt()
        .transition()
        .duration(DURATIONS.HIGHLIGHT)
        .attr(SvgAttributes.Fill, COLORS.ANNOTATION_RED)
        .attr(SvgAttributes.R, 6)
        .end()
        .catch(() => { /* interrupted */ }),
    )
    transitions.push(
      appendValueLabel({
        svg,
        layer,
        className: RETRIEVE_ANNOTATION_CLASS,
        x: metrics.x,
        y: metrics.y - 10 - index * 16,
        value: metrics.value,
        color: COLORS.TEXT_DARK,
        anchorElement: point,
      })
        .end()
        .catch(() => { /* interrupted */ }),
    )
  })

  await Promise.all(transitions)
}

async function annotateFilter(container: HTMLElement, result: DatumValue[], operation: OperationSpec, workingData: DatumValue[], state: ChainState) {
  const svg = d3.select(container).select<SVGSVGElement>(SvgElements.Svg)
  if (svg.empty()) return
  const layer = ensureAnnotationLayer(svg)

  // Fade prior persistent annotations (average ref lines, pairDiff arrows, etc.) to
  // context style before the filter visual takes over. Mirrors the same call in
  // annotateDiff / annotateAverage / annotateFindExtremum.
  applyAnnotationContextTransitions(layer, state.annotationRecords, FILTER_ANNOTATION_CLASS)

  layer.selectAll(`.${FILTER_ANNOTATION_CLASS}`).interrupt().remove()
  svg.selectAll(`.${FILTER_LINE_LAYER_CLASS}`).interrupt().remove()

  const marginLeft = Number(svg.attr(DataAttributes.MarginLeft) ?? 0)
  const plotWidth = Number(svg.attr(DataAttributes.PlotWidth) ?? 0)
  const threshold = resolveNumericThreshold(operation, workingData)
  const remainingKeys = resultPointKeys(result)

  // Phase 1a — dim out-of-scope points first to establish the visual scope
  // before the threshold line is drawn. The predicate checks both target+series
  // and id+series to match how multipleLine tracks data-point identity.
  const points = svg.selectAll<SVGCircleElement, unknown>(`${SvgElements.Circle}[${DataAttributes.Target}]`)
  await applyMarkSalience({
    marks: points as unknown as d3.Selection<SVGElement, unknown, d3.BaseType, unknown>,
    isInScope: (node) => {
      const target = node.getAttribute(DataAttributes.Target) ?? ''
      const id     = node.getAttribute(DataAttributes.Id) ?? ''
      const series = node.getAttribute(DataAttributes.Series) ?? ''
      return remainingKeys.has(pointKey(target, series)) || remainingKeys.has(pointKey(id, series))
    },
  })

  // Phase 1b — draw the line segment overlay (highlights in-scope portions).
  drawFilterLineSegments(svg, remainingKeys)
  mainLinePath(svg).interrupt().style(SvgAttributes.Opacity, 1)

  // Phase 2 — threshold reference line + label (only when a numeric threshold
  // exists). drawReferenceLine handles animation, placement, and label fade-in.
  if (threshold == null) {
    // Non-numeric filters have no visual line but still need a record so that
    // subsequent operations can transition the filter scope to context style.
    state.annotationRecords.push({ cssClass: FILTER_ANNOTATION_CLASS, role: 'anchor', persistent: true })
    return
  }
  const thresholdY = inferYForValue(svg, threshold)
  if (thresholdY == null) {
    state.annotationRecords.push({ cssClass: FILTER_ANNOTATION_CLASS, role: 'anchor', persistent: true })
    return
  }

  const x1 = marginLeft
  const x2 = marginLeft + plotWidth

  await drawReferenceLine({
    layer,
    cssClass: FILTER_ANNOTATION_CLASS,
    x1,
    x2,
    y: thresholdY,
    label: String(threshold),
    svg,
    viewport: resolveAnnotationViewport(svg),
  })

  // Record as a persistent anchor so subsequent operations can transition
  // this threshold line to guideline style without removing it.
  state.annotationRecords.push({ cssClass: FILTER_ANNOTATION_CLASS, role: 'anchor', persistent: true })
}

async function annotateDiff(
  container: HTMLElement,
  result: DatumValue[],
  operation: OperationSpec,
  state: ChainState,
) {
  const svg = d3.select(container).select<SVGSVGElement>(SvgElements.Svg)
  if (svg.empty()) return
  const selectors = diffEndpointSelectors(operation)
  const aggregateHint = typeof operation.aggregate === 'string' ? operation.aggregate : undefined
  const derivedA = resolveDerivedDiffEndpoint(selectors.targetA, aggregateHint)
  const derivedB = resolveDerivedDiffEndpoint(selectors.targetB, aggregateHint)
  const pointA = derivedA ? null : findPoint(svg, selectors.targetA)
  const pointB = derivedB ? null : findPoint(svg, selectors.targetB)
  const marginLeft = Number(svg.attr(DataAttributes.MarginLeft) ?? 0)
  const marginTop = Number(svg.attr(DataAttributes.MarginTop) ?? 0)
  const plotWidth = Number(svg.attr(DataAttributes.PlotWidth) ?? 0)
  const arrowX = marginLeft + plotWidth + 18
  const layer = ensureAnnotationLayer(svg)

  // Transition prior annotations (filter lines, etc.) to context style
  // before drawing diff. Mirrors the same call in annotateAverage / annotateFindExtremum.
  applyAnnotationContextTransitions(layer, state.annotationRecords, FILTER_ANNOTATION_CLASS)

  const markA = pointA ? pointRootMetrics(pointA, marginLeft, marginTop) : null
  const markB = pointB ? pointRootMetrics(pointB, marginLeft, marginTop) : null
  const existingA = derivedA ? scalarReferenceLineForResultRef(layer, derivedA.refKey) : null
  const existingB = derivedB ? scalarReferenceLineForResultRef(layer, derivedB.refKey) : null
  const derivedAY = derivedA ? existingA?.y ?? inferYForValue(svg, derivedA.value) : null
  const derivedBY = derivedB ? existingB?.y ?? inferYForValue(svg, derivedB.value) : null
  const a = derivedA && derivedAY != null
    ? { kind: 'derived' as const, value: derivedA.value, y: derivedAY, x: marginLeft + plotWidth, usesExistingReference: Boolean(existingA) }
    : markA
      ? { kind: 'mark' as const, value: markA.value, y: markA.y, x: markA.x, anchorElement: pointA, usesExistingReference: false }
      : null
  const b = derivedB && derivedBY != null
    ? { kind: 'derived' as const, value: derivedB.value, y: derivedBY, x: marginLeft + plotWidth, usesExistingReference: Boolean(existingB) }
    : markB
      ? { kind: 'mark' as const, value: markB.value, y: markB.y, x: markB.x, anchorElement: pointB, usesExistingReference: false }
      : null
  if (!a || !b) {
    console.warn('[operation-next] multiple-line diff: targetA or targetB could not be resolved for annotation.', { operation })
    return
  }

  layer.selectAll(`.${DIFF_ANNOTATION_CLASS}`).interrupt().remove()
  const topY = Math.min(a.y, b.y)
  const bottomY = Math.max(a.y, b.y)
  const differenceValue = Number(result[0]?.value)
  const differenceText = `Difference: ${formatOperationValue(differenceValue)}`

  // Value labels fade in concurrently with the horizontal ref lines (Phase 1).
  const markEndpoints = [a, b].filter((endpoint) => endpoint?.kind === 'mark')
  const labelPromises = markEndpoints.map((endpoint) =>
    appendValueLabel({
      svg,
      layer,
      className: `${DIFF_ANNOTATION_CLASS} point-value`,
      x: endpoint.x,
      y: endpoint.y - 8,
      value: endpoint.value,
      color: COLORS.ANNOTATION_RED,
      anchorElement: endpoint.anchorElement,
    }).end().catch(() => {}),
  )

  // Phase 1: ref lines grow marginLeft→arrowX while value labels fade in.
  // Phase 2: vertical shaft expands from midpoint.
  // Phase 3: arrowheads appear + difference label is placed.
  await drawVerticalComparisonArrow({
    layer,
    cssClass: DIFF_ANNOTATION_CLASS,
    x: arrowX,
    topY,
    bottomY,
    refLines: [
      a.usesExistingReference ? null : { startX: marginLeft, y: a.y },
      b.usesExistingReference ? null : { startX: marginLeft, y: b.y },
    ].filter((line): line is { startX: number; y: number } => line != null),
    phaseOnePromises: labelPromises,
    color: COLORS.ANNOTATION_RED,
    label: differenceText,
    svg,
    viewport: resolveAnnotationViewport(svg),
  })

  // Record as a persistent anchor so subsequent operations (average, findExtremum)
  // can transition diff lines to context style via applyAnnotationContextTransitions.
  state.annotationRecords.push({ cssClass: DIFF_ANNOTATION_CLASS, role: 'anchor', persistent: true })
}

async function annotateAverage(
  container: HTMLElement,
  result: DatumValue[],
  state: ChainState,
  operation: OperationSpec,
  referencedResultIds?: string[],
) {
  const svg = d3.select(container).select<SVGSVGElement>(SvgElements.Svg)
  if (svg.empty()) return

  // Determine data source and label based on what preceded this operation.
  const isPairDiff = state.derivedData !== null && state.scaleState !== null
  const isFiltered = state.salienceMap.size > 0

  let averageValue: number
  let labelText: string

  if (isPairDiff) {
    // After pairDiff: average of the pairwise differences.
    // Circles have already been repositioned to the rescaled axis, so
    // inferYForValue will interpolate correctly for the new domain.
    averageValue = d3.mean(state.derivedData!, (d) => Number(d.value)) ?? 0
    labelText = `Avg diff: ${formatOperationValue(averageValue)}`
  } else {
    averageValue = Number(result[0]?.value)
    labelText = isFiltered
      ? `Avg (filtered): ${formatOperationValue(averageValue)}`
      : `Average: ${formatOperationValue(averageValue)}`
  }

  if (!Number.isFinite(averageValue)) return
  const averageY = inferYForValue(svg, averageValue)
  if (averageY == null) return

  const layer = ensureAnnotationLayer(svg)

  // Transition prior annotations to context style before drawing the new one.
  applyAnnotationContextTransitions(layer, state.annotationRecords, FILTER_ANNOTATION_CLASS)

  const persistent = isOperationResultReferenced(operation, referencedResultIds)
  if (!persistent) {
    layer.selectAll(`.${AVERAGE_ANNOTATION_CLASS}`).interrupt().remove()
  } else {
    const refs = new Set((referencedResultIds ?? []).map((id) => String(id).replace(/^ref:/, '')))
    layer
      .selectAll<SVGElement, unknown>(`.${AVERAGE_ANNOTATION_CLASS}`)
      .filter(function () {
        const ref = this.getAttribute(RESULT_REF_ATTRIBUTE)
        return !ref || !refs.has(ref)
      })
      .interrupt()
      .remove()
  }
  const marginLeft = Number(svg.attr(DataAttributes.MarginLeft) ?? 0)
  const plotWidth = Number(svg.attr(DataAttributes.PlotWidth) ?? 0)
  const x1 = marginLeft
  const x2 = marginLeft + plotWidth

  // drawReferenceLine handles: line draw-out animation, label placement, label fade-in.
  const resultRef = operationResultRef(operation)
  await drawReferenceLine({
    layer,
    cssClass: AVERAGE_ANNOTATION_CLASS,
    x1,
    x2,
    y: averageY,
    label: labelText,
    svg,
    viewport: resolveAnnotationViewport(svg),
  })
  if (resultRef) {
    layer
      .selectAll<SVGElement, unknown>(`.${AVERAGE_ANNOTATION_CLASS}`)
      .filter(function () {
        return !this.getAttribute(RESULT_REF_ATTRIBUTE)
      })
      .attr(RESULT_REF_ATTRIBUTE, resultRef)
  }

  state.annotationRecords.push({
    cssClass: AVERAGE_ANNOTATION_CLASS,
    role: persistent ? 'anchor' : 'result',
    persistent,
    operationId: resultRef == null ? undefined : String(resultRef),
    resultRef: resultRef == null ? undefined : String(resultRef),
  })
}

async function annotatePairDiff(container: HTMLElement, result: DatumValue[], operation: OperationSpec, state: ChainState) {
  const groupA = operation.groupA == null ? null : String(operation.groupA)
  const groupB = operation.groupB == null ? null : String(operation.groupB)
  if (!groupA || !groupB || result.length === 0) return

  debugLog('pairDiff-annotate-start', {
    t: debugNow(),
    resultCount: result.length,
    groupA,
    groupB,
    domBefore: summarizeMultipleLineDom(container),
  })

  const svg = d3.select(container).select<SVGSVGElement>(SvgElements.Svg)
  if (svg.empty()) return
  const layer = ensureAnnotationLayer(svg)
  layer.selectAll(`.${PAIR_DIFF_ANNOTATION_CLASS}`).interrupt().remove()
  // Resolve the op's groups to rendered data-series (color-field) values so the
  // endpoints are found when the chart colors by a derived field (#45).
  const { colorA, colorB } = resolvePairDiffColorGroups(container, svg, operation, groupA, groupB)
  const marginLeft = Number(svg.attr(DataAttributes.MarginLeft) ?? 0)
  const marginTop = Number(svg.attr(DataAttributes.MarginTop) ?? 0)
  const viewport = resolveAnnotationViewport(svg)
  const transitions: Promise<void>[] = []
  const highlightedPoints = new Set<SVGCircleElement>()

  result.forEach((entry) => {
    const target = String(entry.target)
    const pointA = findPointByTarget(svg, target, colorA).nodes()[0]
    const pointB = findPointByTarget(svg, target, colorB).nodes()[0]
    if (!pointA || !pointB) {
      console.error('[operation-next] multiple-line pairDiff: pair endpoint was not found in rendered points.', {
        target,
        groupA,
        groupB,
        entry,
      })
      return
    }

    const a = pointRootMetrics(pointA, marginLeft, marginTop)
    const b = pointRootMetrics(pointB, marginLeft, marginTop)
    highlightedPoints.add(pointA)
    highlightedPoints.add(pointB)

    const value = Number(entry.value)
    const labelText = operation.absolute ? `Difference: ${formatOperationValue(Math.abs(value))}` : formatSignedOperationValue(value)

    // drawDirectionalArrow handles: unit-vector geometry, endpoint padding,
    // shaft animation, arrowhead fade-in, and label placement.
    // Arrow direction: b (groupB) → a (groupA).
    transitions.push(...drawDirectionalArrow({
      layer,
      cssClass: PAIR_DIFF_ANNOTATION_CLASS,
      fromX: b.x,
      fromY: b.y,
      toX: a.x,
      toY: a.y,
      color: COLORS.ANNOTATION_RED,
      targetKey: target,
      label: labelText,
      svg,
      viewport,
    }))
  })

  if (highlightedPoints.size > 0) {
    transitions.push(
      d3
        .selectAll<SVGCircleElement, unknown>(Array.from(highlightedPoints))
        .interrupt()
        .transition()
        .duration(DURATIONS.HIGHLIGHT)
        .attr(SvgAttributes.Fill, COLORS.ANNOTATION_RED)
        .attr(SvgAttributes.R, 6)
        .style(SvgAttributes.Opacity, 1)
        .end(),
    )
  }

  await Promise.all(transitions)
  debugLog('pairDiff-annotate-end', {
    t: debugNow(),
    highlightedPointCount: highlightedPoints.size,
    domAfter: summarizeMultipleLineDom(container),
  })

  // pairDiff arrows are persistent anchors — the subsequent findExtremum
  // strengthen step selects them by data-target.
  state.annotationRecords.push({ cssClass: PAIR_DIFF_ANNOTATION_CLASS, role: 'anchor', persistent: true })
}

async function annotateFindExtremum(container: HTMLElement, result: DatumValue[], state: ChainState) {
  const svg = d3.select(container).select<SVGSVGElement>(SvgElements.Svg)
  if (svg.empty() || result.length === 0) return
  const layer = ensureAnnotationLayer(svg)

  // Transition prior annotations to context style before drawing the new one.
  applyAnnotationContextTransitions(layer, state.annotationRecords, FILTER_ANNOTATION_CLASS)

  layer.selectAll(`.${EXTREMUM_ANNOTATION_CLASS}`).interrupt().remove()
  const marginLeft = Number(svg.attr(DataAttributes.MarginLeft) ?? 0)
  const marginTop = Number(svg.attr(DataAttributes.MarginTop) ?? 0)
  const transitions: Promise<void>[] = []

  result.forEach((datum) => {
    const points = findPointByDatum(svg, datum)
    const point = points.nodes()[0]
    if (!point) return
    const metrics = pointRootMetrics(point, marginLeft, marginTop)
    transitions.push(points.interrupt().transition().duration(DURATIONS.HIGHLIGHT).attr(SvgAttributes.Fill, COLORS.ANNOTATION_RED).attr(SvgAttributes.R, 6).end().catch(() => {}))
    transitions.push(
      appendValueLabel({
        svg,
        layer,
        className: EXTREMUM_ANNOTATION_CLASS,
        x: metrics.x,
        y: metrics.y - 10,
        value: metrics.value,
        color: COLORS.TEXT_DARK,
        anchorElement: point,
      }).end().catch(() => {}),
    )
  })

  await Promise.all(transitions)

  state.annotationRecords.push({ cssClass: EXTREMUM_ANNOTATION_CLASS, role: 'result', persistent: false })
}

async function annotateNth(container: HTMLElement, result: DatumValue[], state: ChainState) {
  const svg = d3.select(container).select<SVGSVGElement>(SvgElements.Svg)
  if (svg.empty() || result.length === 0) return
  const layer = ensureAnnotationLayer(svg)

  applyAnnotationContextTransitions(layer, state.annotationRecords, FILTER_ANNOTATION_CLASS)

  layer.selectAll(`.${NTH_ANNOTATION_CLASS}`).interrupt().remove()
  const marginLeft = Number(svg.attr(DataAttributes.MarginLeft) ?? 0)
  const marginTop = Number(svg.attr(DataAttributes.MarginTop) ?? 0)
  const transitions: Promise<void>[] = []

  result.forEach((datum) => {
    const points = findPointByDatum(svg, datum)
    const point = points.nodes()[0]
    if (!point) return
    const metrics = pointRootMetrics(point, marginLeft, marginTop)
    transitions.push(
      points
        .interrupt()
        .transition()
        .duration(DURATIONS.HIGHLIGHT)
        .attr(SvgAttributes.Fill, COLORS.ANNOTATION_RED)
        .attr(SvgAttributes.R, 6)
        .end()
        .catch(() => {}),
    )
    transitions.push(
      appendValueLabel({
        svg,
        layer,
        className: NTH_ANNOTATION_CLASS,
        x: metrics.x,
        y: metrics.y - 10,
        value: metrics.value,
        color: COLORS.TEXT_DARK,
        anchorElement: point,
      })
        .end()
        .catch(() => {}),
    )
  })

  await Promise.all(transitions)
  state.annotationRecords.push({ cssClass: NTH_ANNOTATION_CLASS, role: 'result', persistent: false })
}

async function annotateLagDiff(container: HTMLElement, result: DatumValue[], state: ChainState) {
  const svg = d3.select(container).select<SVGSVGElement>(SvgElements.Svg)
  if (svg.empty() || result.length === 0) return
  const layer = ensureAnnotationLayer(svg)
  layer.selectAll(`.${LAG_DIFF_ANNOTATION_CLASS}`).interrupt().remove()
  const marginLeft = Number(svg.attr(DataAttributes.MarginLeft) ?? 0)
  const marginTop = Number(svg.attr(DataAttributes.MarginTop) ?? 0)
  const viewport = resolveAnnotationViewport(svg)
  const transitions: Promise<void>[] = []
  const highlightedPoints = new Set<SVGCircleElement>()

  result.forEach((datum) => {
    if (!datum.prevTarget) return
    const series = datum.group == null ? null : String(datum.group)
    const prevPoint = findPointByTarget(svg, String(datum.prevTarget), series).nodes()[0]
    const currentPoint = findPointByDatum(svg, datum).nodes()[0] ?? findPointByTarget(svg, String(datum.target), series).nodes()[0]
    if (!prevPoint || !currentPoint) {
      console.error('[operation-next] multiple-line lagDiff: adjacent point was not found in rendered points.', { datum })
      return
    }

    const prev = pointRootMetrics(prevPoint, marginLeft, marginTop)
    const current = pointRootMetrics(currentPoint, marginLeft, marginTop)
    highlightedPoints.add(prevPoint)
    highlightedPoints.add(currentPoint)

    // drawDirectionalArrow handles: unit-vector geometry, endpoint padding,
    // shaft animation, arrowhead fade-in, and label placement.
    transitions.push(...drawDirectionalArrow({
      layer,
      cssClass: LAG_DIFF_ANNOTATION_CLASS,
      fromX: prev.x,
      fromY: prev.y,
      toX: current.x,
      toY: current.y,
      color: COLORS.ANNOTATION_BLUE,
      targetKey: String(datum.target),
      prevTargetKey: String(datum.prevTarget),
      label: formatSignedOperationValue(Number(datum.value)),
      svg,
      viewport,
    }))
  })

  if (highlightedPoints.size > 0) {
    transitions.push(
      d3
        .selectAll<SVGCircleElement, unknown>(Array.from(highlightedPoints))
        .interrupt()
        .transition()
        .duration(DURATIONS.HIGHLIGHT)
        .attr(SvgAttributes.Fill, COLORS.ANNOTATION_BLUE)
        .attr(SvgAttributes.R, 6)
        .style(SvgAttributes.Opacity, 1)
        .end(),
    )
  }

  await Promise.all(transitions)

  // lagDiff arrows are persistent anchors — strengthen selects them by data-target.
  state.annotationRecords.push({ cssClass: LAG_DIFF_ANNOTATION_CLASS, role: 'anchor', persistent: true })
}

// ---------------------------------------------------------------------------
// Strengthen helpers — emphasise an existing arrow for a specific target
// by fattening its stroke and shifting to a deeper colour.
// ---------------------------------------------------------------------------

function containerHasAnnotationLine(container: HTMLElement, cssClass: string, escapedTargetKey: string) {
  return container.querySelector(`svg line.${cssClass}[data-target="${escapedTargetKey}"]`) != null
}

async function strengthenPairDiffArrow(container: HTMLElement, targetKey: string): Promise<void> {
  const svg = d3.select(container).select<SVGSVGElement>(SvgElements.Svg)
  if (svg.empty()) return
  const layer = ensureAnnotationLayer(svg)
  const arrowLines = layer.selectAll<SVGLineElement, unknown>(
    `line.${PAIR_DIFF_ANNOTATION_CLASS}[data-target="${CSS.escape(targetKey)}"]`,
  )
  const arrowLabels = layer.selectAll<SVGTextElement, unknown>(
    `text.${PAIR_DIFF_ANNOTATION_CLASS}[data-target="${CSS.escape(targetKey)}"]`,
  )
  if (arrowLines.empty() && arrowLabels.empty()) return
  arrowLines.interrupt()
  arrowLabels.interrupt()
  try {
    await Promise.all([
      arrowLines
        .transition()
        .duration(DURATIONS.HIGHLIGHT)
        .ease(EASINGS.SMOOTH)
        .attr(SvgAttributes.StrokeWidth, 4)
        .attr(SvgAttributes.Stroke, COLORS.ANNOTATION_STRONG_RED)
        .style(SvgAttributes.Opacity, 1)
        .end()
        .catch(() => undefined),
      arrowLabels
        .transition()
        .duration(DURATIONS.HIGHLIGHT)
        .ease(EASINGS.SMOOTH)
        .attr(SvgAttributes.FontSize, 14)
        .attr(SvgAttributes.FontWeight, 800)
        .attr(SvgAttributes.Fill, COLORS.ANNOTATION_STRONG_RED)
        .style(SvgAttributes.Opacity, 1)
        .end()
        .catch(() => undefined),
    ])
  } catch { /* interrupted */ }
}

async function strengthenLagDiffArrow(container: HTMLElement, targetKey: string): Promise<void> {
  const svg = d3.select(container).select<SVGSVGElement>(SvgElements.Svg)
  if (svg.empty()) return
  const layer = ensureAnnotationLayer(svg)
  const arrowLines = layer.selectAll<SVGLineElement, unknown>(
    `line.${LAG_DIFF_ANNOTATION_CLASS}[data-target="${CSS.escape(targetKey)}"]`,
  )
  if (arrowLines.empty()) return
  arrowLines.interrupt()
  try {
    await arrowLines
      .transition()
      .duration(DURATIONS.HIGHLIGHT)
      .ease(EASINGS.SMOOTH)
      .attr(SvgAttributes.StrokeWidth, 4)
      .attr(SvgAttributes.Stroke, COLORS.ANNOTATION_STRONG_RED)
      .end()
  } catch { /* interrupted */ }
}

function findDerivedExtremumData(rows: DatumValue[], operation: OperationSpec): DatumValue[] {
  const candidates = rows.filter((datum) => Number.isFinite(Number(datum.value)))
  if (candidates.length === 0) return []
  const sorted = candidates.slice().sort((left, right) => Number(left.value) - Number(right.value))
  const chosen = operation.which === 'min' ? sorted[0] : sorted[sorted.length - 1]
  return chosen ? [{ ...chosen, value: Number(chosen.value) }] : []
}

function derivedDiffSource(state: ChainState): DatumValue[] | null {
  if (state.derivedData !== null) return state.derivedData
  const workingDataIsDerivedDiff = state.workingData.some((datum) => {
    const semanticMeasure = datum.semanticMeasure ?? ''
    return semanticMeasure.startsWith('Δ')
  })
  return workingDataIsDerivedDiff ? state.workingData : null
}

async function annotateDerivedExtremumResult(
  container: HTMLElement,
  result: DatumValue[],
  operation: OperationSpec,
  state: ChainState,
) {
  const datum = result[0]
  if (!datum) return
  const targetKey = String(datum.target)
  const value = Number(datum.value)
  if (!Number.isFinite(value)) return

  const svg = d3.select(container).select<SVGSVGElement>(SvgElements.Svg)
  if (svg.empty()) return
  const layer = ensureAnnotationLayer(svg)
  applyAnnotationContextTransitions(layer, state.annotationRecords, FILTER_ANNOTATION_CLASS)
  layer.selectAll(`.${EXTREMUM_ANNOTATION_CLASS}`).interrupt().remove()

  const anchorLine = layer
    .selectAll<SVGLineElement, unknown>(
      `line.${PAIR_DIFF_ANNOTATION_CLASS}[data-target="${CSS.escape(targetKey)}"]:not(.arrow-head), line.${LAG_DIFF_ANNOTATION_CLASS}[data-target="${CSS.escape(targetKey)}"]:not(.arrow-head)`,
    )
    .nodes()[0]

  const viewport = resolveAnnotationViewport(svg)
  let preferred = { x: viewport.x + viewport.width - 4, y: Math.max(12, viewport.y + 16) }
  let textAnchor: 'middle' | 'end' = 'end'
  if (anchorLine) {
    const x1 = readNumberAttr(anchorLine, SvgAttributes.X1)
    const y1 = readNumberAttr(anchorLine, SvgAttributes.Y1)
    const x2 = readNumberAttr(anchorLine, SvgAttributes.X2)
    const y2 = readNumberAttr(anchorLine, SvgAttributes.Y2)
    if (x1 != null && y1 != null && x2 != null && y2 != null) {
      preferred = {
        x: (x1 + x2) / 2,
        y: Math.max(12, Math.min(y1, y2) - 14),
      }
      textAnchor = 'middle'
    }
  }

  const labelPrefix = operation.which === 'min' ? 'Min diff' : 'Max diff'
  const labelNode = layer
    .append(SvgElements.Text)
    .attr(SvgAttributes.Class, `${SvgClassNames.TextAnnotation} ${EXTREMUM_ANNOTATION_CLASS} derived-extremum-label`)
    .attr('data-target', targetKey)
    .attr(SvgAttributes.X, preferred.x)
    .attr(SvgAttributes.Y, preferred.y)
    .attr(SvgAttributes.TextAnchor, textAnchor)
    .attr(SvgAttributes.FontSize, 16)
    .attr(SvgAttributes.FontWeight, 800)
    .attr(SvgAttributes.Fill, COLORS.ANNOTATION_STRONG_RED)
    .style(SvgAttributes.Opacity, 0)
    .text(`${labelPrefix}: ${formatOperationValue(value)}`)

  placeOperationTextLabel({
    svg,
    text: labelNode,
    preferred,
    anchorElement: anchorLine,
    viewport,
  })

  labelNode
    .transition()
    .duration(DURATIONS.LABEL_FADE_IN)
    .ease(EASINGS.SMOOTH)
    .style(SvgAttributes.Opacity, 1)
    .end()
    .catch(() => undefined)

  state.annotationRecords.push({ cssClass: EXTREMUM_ANNOTATION_CLASS, role: 'result', persistent: false })
}

// ---------------------------------------------------------------------------
// Operation runners — each accepts ChainState and returns nextState
// ---------------------------------------------------------------------------

async function runRetrieveValueOperation(
  run: ParsedOperationRun,
  operation: OperationSpec,
  operationIndex: number,
  state: ChainState,
): Promise<{ result: DatumValue[]; nextState: ChainState }> {
  // Guard: this legacy runner does not support `targetAxis: 'y'` (its
  // annotation logic only knows the forward x→y case). The operation-new
  // dispatcher should own retrieveValue for multi-line, so reaching here
  // with reverse lookup means dispatcher routing regressed. Fail loudly
  // rather than rendering forward annotation with reverse data.
  if (operation.targetAxis === 'y') {
    console.error(
      '[operation-next] legacy multi-line runRetrieveValueOperation reached with targetAxis="y" — operation-new applier should have handled this. Dispatcher routing likely regressed.',
      { operation },
    )
    throw new Error(
      'operation-next multi-line runRetrieveValueOperation cannot render targetAxis="y"; route to src/operation-new/appliers/multipleLine/retrieveValue.ts instead.',
    )
  }
  await run.options?.onOperationReady?.({ operation, operationIndex })
  const result = retrieveValue(state.workingData, operation)
  await annotateRetrievedValues(run.container, result)
  await run.options?.onOperationCompleted?.({ operation, operationIndex, result })
  console.log('[operation-next] multiple-line retrieveValue', { operationIndex, operation, result })
  return { result, nextState: { ...state, lastResult: result } }
}

async function runFilterOperation(
  run: ParsedOperationRun,
  operation: OperationSpec,
  operationIndex: number,
  state: ChainState,
): Promise<{ result: DatumValue[]; nextState: ChainState }> {
  await run.options?.onOperationReady?.({ operation, operationIndex })
  const result = filterData(state.workingData, operation)
  await annotateFilter(run.container, result, operation, state.workingData, state)
  await run.options?.onOperationCompleted?.({ operation, operationIndex, result })
  console.log('[operation-next] multiple-line filter', { operationIndex, operation, result })
  const nextSalienceMap = new Map(result.map((d) => [pointKey(String(d.target), String(d.group ?? d.series ?? '')), OPACITIES.FULL]))
  return {
    result,
    nextState: { ...state, workingData: result, salienceMap: nextSalienceMap, lastResult: result },
  }
}

async function runDiffOperation(
  run: ParsedOperationRun,
  operation: OperationSpec,
  operationIndex: number,
  state: ChainState,
): Promise<{ result: DatumValue[]; nextState: ChainState }> {
  await run.options?.onOperationReady?.({ operation, operationIndex })
  const result = diffData(state.workingData, operation)
  await annotateDiff(run.container, result, operation, state)
  await run.options?.onOperationCompleted?.({ operation, operationIndex, result })
  console.log('[operation-next] multiple-line diff', { operationIndex, operation, result })
  return { result, nextState: { ...state, lastResult: result } }
}

async function runAverageOperation(
  run: ParsedOperationRun,
  operation: OperationSpec,
  operationIndex: number,
  state: ChainState,
): Promise<{ result: DatumValue[]; nextState: ChainState }> {
  await run.options?.onOperationReady?.({ operation, operationIndex })
  // When pairDiff ran, derive the average from the diff dataset; otherwise
  // use workingData so filter → average also works correctly.
  const dataSource = state.derivedData !== null && state.scaleState !== null
    ? state.derivedData
    : state.workingData
  const result = averageData(dataSource, operation)
  await annotateAverage(run.container, result, state, operation, run.options?.referencedResultIds)
  await run.options?.onOperationCompleted?.({ operation, operationIndex, result })
  console.log('[operation-next] multiple-line average', { operationIndex, operation, result })
  return { result, nextState: { ...state, lastResult: result } }
}

async function runFindExtremumOperation(
  run: ParsedOperationRun,
  operation: OperationSpec,
  operationIndex: number,
  state: ChainState,
): Promise<{ result: DatumValue[]; nextState: ChainState }> {
  await run.options?.onOperationReady?.({ operation, operationIndex })

  const derivedSource = derivedDiffSource(state)
  if (derivedSource !== null) {
    // A compute operation (lagDiff or pairDiff) ran before us.
    // Find the extremum among the derived values and strengthen the
    // corresponding arrow instead of drawing a new annotation.
    const result = findDerivedExtremumData(derivedSource, operation)
    const targetKey = result[0]?.target
    if (targetKey != null) {
      const escapedTarget = CSS.escape(String(targetKey))
      const hasPairDiffAnchor =
        state.annotationRecords.some((record) => record.cssClass === PAIR_DIFF_ANNOTATION_CLASS) ||
        containerHasAnnotationLine(run.container, PAIR_DIFF_ANNOTATION_CLASS, escapedTarget)
      if (hasPairDiffAnchor) {
        // pairDiff context
        await strengthenPairDiffArrow(run.container, String(targetKey))
      } else {
        // lagDiff context
        await strengthenLagDiffArrow(run.container, String(targetKey))
      }
    }
    await annotateDerivedExtremumResult(run.container, result, operation, state)
    await run.options?.onOperationCompleted?.({ operation, operationIndex, result })
    console.log('[operation-next] multiple-line findExtremum (strengthen)', { operationIndex, operation, result })
    return { result, nextState: { ...state, lastResult: result } }
  }

  // Standard path: find extremum in workingData and draw a new annotation.
  const result = findExtremum(state.workingData, operation)
  await annotateFindExtremum(run.container, result, state)
  await run.options?.onOperationCompleted?.({ operation, operationIndex, result })
  console.log('[operation-next] multiple-line findExtremum', { operationIndex, operation, result })
  return { result, nextState: { ...state, lastResult: result } }
}

async function runNthOperation(
  run: ParsedOperationRun,
  operation: OperationSpec,
  operationIndex: number,
  state: ChainState,
): Promise<{ result: DatumValue[]; nextState: ChainState }> {
  await run.options?.onOperationReady?.({ operation, operationIndex })
  const result = nthData(state.workingData, operation)
  await annotateNth(run.container, result, state)
  await run.options?.onOperationCompleted?.({ operation, operationIndex, result })
  console.log('[operation-next] multiple-line nth', { operationIndex, operation, result })
  return { result, nextState: { ...state, lastResult: result } }
}

async function runLagDiffOperation(
  run: ParsedOperationRun,
  operation: OperationSpec,
  operationIndex: number,
  state: ChainState,
): Promise<{ result: DatumValue[]; nextState: ChainState }> {
  await run.options?.onOperationReady?.({ operation, operationIndex })
  const result = lagDiffData(state.workingData, operation)
  await annotateLagDiff(run.container, result, state)
  await run.options?.onOperationCompleted?.({ operation, operationIndex, result })
  console.log('[operation-next] multiple-line lagDiff', { operationIndex, operation, result })
  return {
    result,
    nextState: { ...state, derivedData: result, lastResult: result },
  }
}

export async function runPairDiffOperation(
  run: ParsedOperationRun,
  operation: OperationSpec,
  operationIndex: number,
  state: ChainState,
): Promise<{ result: DatumValue[]; nextState: ChainState }> {
  await run.options?.onOperationReady?.({ operation, operationIndex })
  const result = pairDiffData(state.workingData, operation)
  debugLog('pairDiff-run-before-focus', {
    t: debugNow(),
    operationIndex,
    operation,
    workingDataCount: state.workingData.length,
    resultCount: result.length,
    dom: summarizeMultipleLineDom(run.container),
  })
  const shouldRescale = run.options?.tensionPolicy?.rescaleAfterIsolation.default ?? true
  const scaleState = shouldRescale
    ? await applyPairDiffFocusTransform(run.container, operation, state)
    : null
  await annotatePairDiff(run.container, result, operation, state)
  await run.options?.onOperationCompleted?.({ operation, operationIndex, result })
  console.log('[operation-next] multiple-line pairDiff', { operationIndex, operation, result })
  return {
    result,
    nextState: { ...state, derivedData: result, scaleState: scaleState ?? null, lastResult: result },
  }
}

export async function runMultipleLineOperations(run: ParsedOperationRun) {
  let nextIndex = run.options?.operationIndexStart ?? 0
  let lastResult: DatumValue[] | null = null

  // Initialise state once from the raw data; each operation threads it forward.
  let state = restoreChainState(getWorkingData(run), run.options?.initialChainState)

  for (const group of run.groups) {
    state = clearGroupBoundary(state)

    for (const operation of group.ops) {
      const operationIndex = nextIndex
      nextIndex += 1
      let opResult: { result: DatumValue[]; nextState: ChainState }
      const operationState = stateWithOperationDependencies(operation, state)

      if (isRetrieveValueOperation(operation)) {
        opResult = await runRetrieveValueOperation(run, operation, operationIndex, operationState)
      } else if (isFilterOperation(operation)) {
        opResult = await runFilterOperation(run, operation, operationIndex, operationState)
      } else if (isDiffOperation(operation)) {
        opResult = await runDiffOperation(run, operation, operationIndex, operationState)
      } else if (isAverageOperation(operation)) {
        opResult = await runAverageOperation(run, operation, operationIndex, operationState)
      } else if (isFindExtremumOperation(operation)) {
        opResult = await runFindExtremumOperation(run, operation, operationIndex, operationState)
      } else if (isLagDiffOperation(operation)) {
        opResult = await runLagDiffOperation(run, operation, operationIndex, operationState)
      } else if (isPairDiffOperation(operation)) {
        opResult = await runPairDiffOperation(run, operation, operationIndex, operationState)
      } else if (isNthOperation(operation)) {
        opResult = await runNthOperation(run, operation, operationIndex, operationState)
      } else if (isTerminalBadgeOperation(operation)) {
        opResult = await runTerminalBadgeOperation(run.container, operation, operationState, {
          chartType: ChartType.MULTI_LINE,
          // Per-op badge class so two terminal badges in one chain (e.g. two
          // counts then add, #22 16aphfabldrpgcmd) don't delete each other —
          // the shared class made the second count wipe the first (audit
          // multiLine-22-count-badge-collision).
          cssClassPrefix: `operation-next-terminal-badge-${String(operation.id ?? operation.meta?.nodeId ?? operationIndex)}`,
        })
      } else {
        continue
      }

      lastResult = opResult.result
      state = opResult.nextState
      storeOperationRuntimeResult(operation, operationIndex, opResult.result, run.options?.runtimeScope)
    }
  }

  if (!lastResult) {
    const stub = await runStubChartOperationRenderer(run, ChartType.MULTI_LINE, 'multiple-line')
    lastResult = Array.isArray(stub) ? stub : null
  }
  return buildOperationNextRunOutcome(lastResult, state)
}

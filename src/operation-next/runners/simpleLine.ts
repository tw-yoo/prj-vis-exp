import * as d3 from 'd3'
import { ChartType } from '../../domain/chart'
import { averageData, diffData, filterData, findExtremum, lagDiffData, retrieveValue } from '../../domain/operation/dataOps'
import { OperationOp, type DatumValue, type JsonValue, type OperationSpec, type TargetSelector } from '../../domain/operation/types'
import { toDatumValuesFromRaw, type RawRow } from '../../domain/data/datum'
import { getSimpleLineStoredData, resolveSimpleLineEncoding, type LineSpec } from '../../rendering/line/simpleLineRenderer'
import { DataAttributes, SvgAttributes, SvgClassNames, SvgElements } from '../../rendering/interfaces'
import type { ParsedOperationRun } from '../types'
import { getSupportedOperationsForChart, runStubChartOperationRenderer } from './shared'
import { placeOperationTextLabel } from '../textPlacement'
import { COLORS, DURATIONS, EASINGS, OPACITIES } from '../../rendering/common/d3Helpers'
import { createChainState, clearGroupBoundary, type ChainState } from '../chainState'
import { formatOperationValue, formatSignedOperationValue } from '../primitives/formatValue'
import {
  ANNOTATION_LAYER_CLASS,
  ensureAnnotationLayer,
  resolveAnnotationViewport,
  readNumberAttr,
  applyAnnotationContextTransitions,
} from '../primitives/annotationLayer'
import { applyMarkSalience } from '../primitives/markSalience'
import { drawReferenceLine } from '../primitives/drawReferenceLine'
import { drawDirectionalArrow } from '../primitives/drawDifferenceArrow'

export const SIMPLE_LINE_SUPPORTED_OPERATIONS = getSupportedOperationsForChart(ChartType.SIMPLE_LINE)

const RETRIEVE_ANNOTATION_CLASS = 'operation-next-line-retrieve-value'
const FILTER_ANNOTATION_CLASS = 'operation-next-line-filter'
const FILTER_LINE_LAYER_CLASS = 'operation-next-line-filter-segments'
const DIFF_ANNOTATION_CLASS = 'operation-next-line-diff'
const AVERAGE_ANNOTATION_CLASS = 'operation-next-line-average'
const EXTREMUM_ANNOTATION_CLASS = 'operation-next-line-extremum'
const LAG_DIFF_ANNOTATION_CLASS = 'operation-next-line-lag-diff'

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

function isFindExtremumOperation(operation: OperationSpec): operation is OperationSpec & { op: typeof OperationOp.FindExtremum } {
  return operation.op === OperationOp.FindExtremum
}

function isLagDiffOperation(operation: OperationSpec): operation is OperationSpec & { op: typeof OperationOp.LagDiff } {
  return operation.op === OperationOp.LagDiff
}

function getInlineRows(spec: LineSpec): RawRow[] {
  const values = (spec.data as { values?: JsonValue[] } | undefined)?.values
  if (!Array.isArray(values)) return []
  return values.filter((value): value is RawRow => !!value && typeof value === 'object' && !Array.isArray(value))
}

function getWorkingData(run: ParsedOperationRun): DatumValue[] {
  const spec = run.runtimeSpec as LineSpec
  const resolved = resolveSimpleLineEncoding(spec)
  if (!resolved) return []
  const storedRows = getSimpleLineStoredData(run.container) as RawRow[]
  const rows = storedRows.length > 0 ? storedRows : getInlineRows(spec)
  return toDatumValuesFromRaw(rows, {
    xField: resolved.xField,
    yField: resolved.yField,
  })
}


function selectorTargetKey(selector: TargetSelector | TargetSelector[] | undefined) {
  const entry = Array.isArray(selector) ? selector[0] : selector
  if (entry == null) return null
  if (typeof entry === 'string' || typeof entry === 'number') return String(entry)
  const target = entry.target ?? entry.category ?? entry.id
  return target == null ? null : String(target)
}

function findPointByTarget(svg: d3.Selection<SVGSVGElement, unknown, null, undefined>, target: string) {
  return svg
    .selectAll<SVGCircleElement, unknown>(`${SvgElements.Circle}[${DataAttributes.Target}], ${SvgElements.Circle}[${DataAttributes.Id}]`)
    .filter(function () {
      const node = this as SVGCircleElement
      return node.getAttribute(DataAttributes.Target) === target || node.getAttribute(DataAttributes.Id) === target
    })
}

function findPoint(svg: d3.Selection<SVGSVGElement, unknown, null, undefined>, selector: TargetSelector | TargetSelector[] | undefined) {
  const key = selectorTargetKey(selector)
  if (!key) return null
  return findPointByTarget(svg, key).nodes()[0] ?? null
}

function pointRootMetrics(point: SVGCircleElement, marginLeft: number, marginTop: number) {
  const cx = readNumberAttr(point, SvgAttributes.CX) ?? 0
  const cy = readNumberAttr(point, SvgAttributes.CY) ?? 0
  return {
    x: marginLeft + cx,
    y: marginTop + cy,
    value: Number(point.getAttribute(DataAttributes.Value)),
    target: point.getAttribute(DataAttributes.Target) ?? point.getAttribute(DataAttributes.Id) ?? '',
  }
}

function allPointMetrics(svg: d3.Selection<SVGSVGElement, unknown, null, undefined>) {
  const marginLeft = Number(svg.attr(DataAttributes.MarginLeft) ?? 0)
  const marginTop = Number(svg.attr(DataAttributes.MarginTop) ?? 0)
  return svg
    .selectAll<SVGCircleElement, unknown>(`${SvgElements.Circle}[${DataAttributes.Target}], ${SvgElements.Circle}[${DataAttributes.Id}]`)
    .nodes()
    .map((point) => ({ point, ...pointRootMetrics(point, marginLeft, marginTop) }))
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
      if (path.classList.contains(SvgClassNames.Annotation) || path.classList.contains(SvgClassNames.LineAnnotation)) {
        return false
      }
      if (path.classList.contains('domain')) return false
      if (path.closest(`.${SvgClassNames.XAxis}, .${SvgClassNames.YAxis}`)) return false
      if (path.closest(`.${ANNOTATION_LAYER_CLASS}, .${FILTER_LINE_LAYER_CLASS}`)) return false
      return path.getAttribute(SvgAttributes.Fill) === 'none' && path.hasAttribute(SvgAttributes.Stroke)
    })
}

async function drawFilterLineSegments(
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
  remainingTargets: Set<string>,
) {
  svg.selectAll(`.${FILTER_LINE_LAYER_CLASS}`).interrupt().remove()

  const linePath = mainLinePath(svg).nodes()[0]
  const lineParent = linePath?.parentElement
  if (!linePath || !lineParent) return false

  const points = d3
    .select(lineParent)
    .selectAll<SVGCircleElement, unknown>(`${SvgElements.Circle}[${DataAttributes.Target}], ${SvgElements.Circle}[${DataAttributes.Id}]`)
    .nodes()
    .map((point) => ({
      x: readNumberAttr(point, SvgAttributes.CX) ?? 0,
      y: readNumberAttr(point, SvgAttributes.CY) ?? 0,
      target: point.getAttribute(DataAttributes.Target) ?? point.getAttribute(DataAttributes.Id) ?? '',
    }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
  if (points.length < 2) return false

  const outsideSegments: Array<{ x1: number; y1: number; x2: number; y2: number }> = []
  for (let index = 1; index < points.length; index += 1) {
    const prev = points[index - 1]
    const current = points[index]
    if (!prev || !current) continue
    const isIncludedSegment = remainingTargets.has(String(prev.target)) && remainingTargets.has(String(current.target))
    if (isIncludedSegment) continue
    outsideSegments.push({
      x1: prev.x,
      y1: prev.y,
      x2: current.x,
      y2: current.y,
    })
  }
  if (outsideSegments.length === 0) return false

  const stroke = linePath?.getAttribute(SvgAttributes.Stroke) || COLORS.SERIES_DEFAULT
  const rawStrokeWidth = Number(linePath?.getAttribute(SvgAttributes.StrokeWidth))
  const strokeWidth = Number.isFinite(rawStrokeWidth) ? rawStrokeWidth : 2
  const backgroundStroke = (() => {
    const node = svg.node()
    if (!node || typeof window === 'undefined') return COLORS.LABEL_STROKE
    const computed = window.getComputedStyle(node).backgroundColor
    return computed && computed !== 'rgba(0, 0, 0, 0)' ? computed : COLORS.LABEL_STROKE
  })()
  const segmentLayer = d3
    .select(lineParent)
    .insert(SvgElements.Group, SvgElements.Circle)
    .attr(SvgAttributes.Class, FILTER_LINE_LAYER_CLASS)

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
    .attr(SvgAttributes.Stroke, backgroundStroke)
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

  return true
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
    const points = findPointByTarget(svg, String(datum.target))
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
  layer.selectAll(`.${FILTER_ANNOTATION_CLASS}`).interrupt().remove()
  svg.selectAll(`.${FILTER_LINE_LAYER_CLASS}`).interrupt().remove()

  const marginLeft = Number(svg.attr(DataAttributes.MarginLeft) ?? 0)
  const plotWidth = Number(svg.attr(DataAttributes.PlotWidth) ?? 0)
  const threshold = resolveNumericThreshold(operation, workingData)
  const remainingTargets = new Set(result.map((datum) => String(datum.target)))

  // Phase 1a — dim out-of-scope points first to establish the visual scope
  // before the threshold line is drawn.
  const points = svg.selectAll<SVGCircleElement, unknown>(`${SvgElements.Circle}[${DataAttributes.Target}]`)
  await applyMarkSalience({
    marks: points as unknown as d3.Selection<SVGElement, unknown, d3.BaseType, unknown>,
    isInScope: (node) => {
      const target = node.getAttribute(DataAttributes.Target)
      return target != null && remainingTargets.has(target)
    },
  })

  // Phase 1b — draw line segment overlay and normalise the main line path.
  const hasFilterLineSegments = await drawFilterLineSegments(svg, remainingTargets)
  const lineSelection = mainLinePath(svg).interrupt()
  if (hasFilterLineSegments) {
    lineSelection.style(SvgAttributes.Opacity, 1)
  } else {
    try {
      await lineSelection
        .transition()
        .duration(DURATIONS.DIM)
        .ease(EASINGS.SMOOTH)
        .style(SvgAttributes.Opacity, result.length === 0 ? 0.35 : 1)
        .end()
    } catch { /* interrupted */ }
  }

  // Phase 2 — threshold reference line + label (only when a numeric threshold
  // exists). drawReferenceLine handles animation, placement, and label fade-in.
  if (threshold == null) return
  const thresholdY = inferYForValue(svg, threshold)
  if (thresholdY == null) return

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

  // Record this as a persistent anchor so subsequent operations can transition
  // this threshold line to guideline style without removing it.
  state.annotationRecords.push({ cssClass: FILTER_ANNOTATION_CLASS, role: 'anchor', persistent: true })
}

async function annotateDiff(container: HTMLElement, result: DatumValue[], operation: OperationSpec) {
  const svg = d3.select(container).select<SVGSVGElement>(SvgElements.Svg)
  if (svg.empty()) return
  const pointA = findPoint(svg, operation.targetA)
  const pointB = findPoint(svg, operation.targetB)
  if (!pointA || !pointB) {
    console.error('[operation-next] simple-line diff: targetA or targetB was not found in rendered points.', { operation })
    return
  }

  const layer = ensureAnnotationLayer(svg)
  layer.selectAll(`.${DIFF_ANNOTATION_CLASS}`).interrupt().remove()
  const marginLeft = Number(svg.attr(DataAttributes.MarginLeft) ?? 0)
  const marginTop = Number(svg.attr(DataAttributes.MarginTop) ?? 0)
  const plotWidth = Number(svg.attr(DataAttributes.PlotWidth) ?? 0)
  const arrowX = marginLeft + plotWidth + 18
  const arrowHeadSize = 8
  const a = pointRootMetrics(pointA, marginLeft, marginTop)
  const b = pointRootMetrics(pointB, marginLeft, marginTop)
  const topY = Math.min(a.y, b.y)
  const bottomY = Math.max(a.y, b.y)
  const differenceValue = Number(result[0]?.value)
  const differenceText = `Difference: ${formatOperationValue(differenceValue)}`

  const referenceLines = layer
    .selectAll<SVGLineElement, { y: number }>(`line.${DIFF_ANNOTATION_CLASS}`)
    .data([{ y: a.y }, { y: b.y }])
    .enter()
    .append(SvgElements.Line)
    .attr(SvgAttributes.Class, `${SvgClassNames.LineAnnotation} ${DIFF_ANNOTATION_CLASS}`)
    .attr(SvgAttributes.X1, marginLeft)
    .attr(SvgAttributes.X2, marginLeft)
    .attr(SvgAttributes.Y1, (datum) => datum.y)
    .attr(SvgAttributes.Y2, (datum) => datum.y)
    .attr(SvgAttributes.Stroke, COLORS.ANNOTATION_RED)
    .attr(SvgAttributes.StrokeWidth, 2)

  const labelA = appendValueLabel({ svg, layer, className: `${DIFF_ANNOTATION_CLASS} bar-value`, x: a.x, y: a.y - 8, value: a.value, color: COLORS.ANNOTATION_RED, anchorElement: pointA })
  const labelB = appendValueLabel({ svg, layer, className: `${DIFF_ANNOTATION_CLASS} bar-value`, x: b.x, y: b.y - 8, value: b.value, color: COLORS.ANNOTATION_RED, anchorElement: pointB })

  await Promise.all([
    referenceLines.transition().duration(DURATIONS.HIGHLIGHT).attr(SvgAttributes.X2, arrowX).end(),
    labelA.end(),
    labelB.end(),
  ])

  const compareArrow = layer
    .append(SvgElements.Line)
    .attr(SvgAttributes.Class, `${SvgClassNames.LineAnnotation} ${DIFF_ANNOTATION_CLASS}`)
    .attr(SvgAttributes.X1, arrowX)
    .attr(SvgAttributes.X2, arrowX)
    .attr(SvgAttributes.Y1, a.y)
    .attr(SvgAttributes.Y2, a.y)
    .attr(SvgAttributes.Stroke, COLORS.ANNOTATION_RED)
    .attr(SvgAttributes.StrokeWidth, 2)

  await compareArrow.transition().duration(DURATIONS.HIGHLIGHT).attr(SvgAttributes.Y1, topY).attr(SvgAttributes.Y2, bottomY).end()

  const arrowHeads = [
    { x1: arrowX, y1: topY, x2: arrowX - arrowHeadSize, y2: topY + arrowHeadSize },
    { x1: arrowX, y1: topY, x2: arrowX + arrowHeadSize, y2: topY + arrowHeadSize },
    { x1: arrowX, y1: bottomY, x2: arrowX - arrowHeadSize, y2: bottomY - arrowHeadSize },
    { x1: arrowX, y1: bottomY, x2: arrowX + arrowHeadSize, y2: bottomY - arrowHeadSize },
  ]

  layer
    .selectAll<SVGLineElement, (typeof arrowHeads)[number]>(`line.${DIFF_ANNOTATION_CLASS}.arrow-head`)
    .data(arrowHeads)
    .enter()
    .append(SvgElements.Line)
    .attr(SvgAttributes.Class, `${SvgClassNames.LineAnnotation} ${DIFF_ANNOTATION_CLASS} arrow-head`)
    .attr(SvgAttributes.X1, (datum) => datum.x1)
    .attr(SvgAttributes.Y1, (datum) => datum.y1)
    .attr(SvgAttributes.X2, (datum) => datum.x2)
    .attr(SvgAttributes.Y2, (datum) => datum.y2)
    .attr(SvgAttributes.Stroke, COLORS.ANNOTATION_RED)
    .attr(SvgAttributes.StrokeWidth, 2)

  const differenceLabel = layer
    .append(SvgElements.Text)
    .attr(SvgAttributes.Class, `${SvgClassNames.TextAnnotation} ${DIFF_ANNOTATION_CLASS} difference-label`)
    .attr(SvgAttributes.X, arrowX + 12)
    .attr(SvgAttributes.Y, (topY + bottomY) / 2)
    .attr(SvgAttributes.DominantBaseline, 'middle')
    .attr(SvgAttributes.FontSize, 12)
    .attr(SvgAttributes.FontWeight, 700)
    .attr(SvgAttributes.Fill, COLORS.ANNOTATION_RED)
    .text(differenceText)

  placeOperationTextLabel({
    svg,
    text: differenceLabel,
    preferred: { x: arrowX + 12, y: (topY + bottomY) / 2 },
    viewport: resolveAnnotationViewport(svg),
  })
}

async function annotateAverage(container: HTMLElement, result: DatumValue[], state: ChainState) {
  const average = Number(result[0]?.value)
  if (!Number.isFinite(average)) return
  const svg = d3.select(container).select<SVGSVGElement>(SvgElements.Svg)
  if (svg.empty()) return
  const averageY = inferYForValue(svg, average)
  if (averageY == null) return
  const layer = ensureAnnotationLayer(svg)

  // Transition prior annotations to context style before drawing the new one.
  applyAnnotationContextTransitions(layer, state.annotationRecords, FILTER_ANNOTATION_CLASS)

  layer.selectAll(`.${AVERAGE_ANNOTATION_CLASS}`).interrupt().remove()
  const marginLeft = Number(svg.attr(DataAttributes.MarginLeft) ?? 0)
  const plotWidth = Number(svg.attr(DataAttributes.PlotWidth) ?? 0)
  const x1 = marginLeft
  const x2 = marginLeft + plotWidth

  // When a filter ran before us, clarify in the label that this is the
  // average over the filtered subset, not the full dataset.
  const isFiltered = state.salienceMap.size > 0
  const labelText = isFiltered
    ? `Avg (filtered): ${formatOperationValue(average)}`
    : `Average: ${formatOperationValue(average)}`

  // drawReferenceLine handles: line draw-out animation, label placement, label fade-in.
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

  state.annotationRecords.push({ cssClass: AVERAGE_ANNOTATION_CLASS, role: 'result', persistent: false })
}

async function annotateFindExtremum(container: HTMLElement, result: DatumValue[], state: ChainState) {
  const target = result[0]?.target
  if (target == null) return
  const svg = d3.select(container).select<SVGSVGElement>(SvgElements.Svg)
  if (svg.empty()) return
  const layer = ensureAnnotationLayer(svg)

  // Transition prior annotations to context style before drawing the new one.
  applyAnnotationContextTransitions(layer, state.annotationRecords, FILTER_ANNOTATION_CLASS)

  layer.selectAll(`.${EXTREMUM_ANNOTATION_CLASS}`).interrupt().remove()
  const marginLeft = Number(svg.attr(DataAttributes.MarginLeft) ?? 0)
  const marginTop = Number(svg.attr(DataAttributes.MarginTop) ?? 0)
  const points = findPointByTarget(svg, String(target))
  const point = points.nodes()[0]
  if (!point) return
  const metrics = pointRootMetrics(point, marginLeft, marginTop)
  points.interrupt().transition().duration(DURATIONS.HIGHLIGHT).attr(SvgAttributes.Fill, COLORS.ANNOTATION_RED).attr(SvgAttributes.R, 6)
  await appendValueLabel({
    svg,
    layer,
    className: EXTREMUM_ANNOTATION_CLASS,
    x: metrics.x,
    y: metrics.y - 10,
    value: metrics.value,
    color: COLORS.TEXT_DARK,
    anchorElement: point,
  }).end()

  state.annotationRecords.push({ cssClass: EXTREMUM_ANNOTATION_CLASS, role: 'result', persistent: false })
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
    const prevPoint = findPointByTarget(svg, String(datum.prevTarget)).nodes()[0]
    const currentPoint = findPointByTarget(svg, String(datum.target)).nodes()[0]
    if (!prevPoint || !currentPoint) {
      console.error('[operation-next] simple-line lagDiff: adjacent point was not found in rendered points.', { datum })
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

  // lagDiff arrows are persistent anchors — the subsequent findExtremum
  // strengthen step selects them by data-target rather than redrawing.
  state.annotationRecords.push({ cssClass: LAG_DIFF_ANNOTATION_CLASS, role: 'anchor', persistent: true })
}

// ---------------------------------------------------------------------------
// Strengthen helper — visually emphasises the arrow for a specific target
// by fattening its stroke and shifting to a deeper red. Called by
// runFindExtremumOperation when lagDiff has already drawn arrows.
// ---------------------------------------------------------------------------

async function strengthenLagDiffArrow(container: HTMLElement, targetKey: string): Promise<void> {
  const svg = d3.select(container).select<SVGSVGElement>(SvgElements.Svg)
  if (svg.empty()) return
  const layer = ensureAnnotationLayer(svg)
  // Select the shaft and any arrow-head lines tagged with this target.
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

// ---------------------------------------------------------------------------
// Operation runners — each accepts ChainState and returns nextState
// ---------------------------------------------------------------------------

async function runRetrieveValueOperation(
  run: ParsedOperationRun,
  operation: OperationSpec,
  operationIndex: number,
  state: ChainState,
): Promise<{ result: DatumValue[]; nextState: ChainState }> {
  await run.options?.onOperationReady?.({ operation, operationIndex })
  const result = retrieveValue(state.workingData, operation)
  await annotateRetrievedValues(run.container, result)
  await run.options?.onOperationCompleted?.({ operation, operationIndex, result })
  console.log('[operation-next] simple-line retrieveValue', { operationIndex, operation, result })
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
  console.log('[operation-next] simple-line filter', { operationIndex, operation, result })
  const nextSalienceMap = new Map(result.map((d) => [String(d.target), OPACITIES.FULL]))
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
  await annotateDiff(run.container, result, operation)
  await run.options?.onOperationCompleted?.({ operation, operationIndex, result })
  console.log('[operation-next] simple-line diff', { operationIndex, operation, result })
  return { result, nextState: { ...state, lastResult: result } }
}

async function runAverageOperation(
  run: ParsedOperationRun,
  operation: OperationSpec,
  operationIndex: number,
  state: ChainState,
): Promise<{ result: DatumValue[]; nextState: ChainState }> {
  await run.options?.onOperationReady?.({ operation, operationIndex })
  const result = averageData(state.workingData, operation)
  await annotateAverage(run.container, result, state)
  await run.options?.onOperationCompleted?.({ operation, operationIndex, result })
  console.log('[operation-next] simple-line average', { operationIndex, operation, result })
  return { result, nextState: { ...state, lastResult: result } }
}

async function runFindExtremumOperation(
  run: ParsedOperationRun,
  operation: OperationSpec,
  operationIndex: number,
  state: ChainState,
): Promise<{ result: DatumValue[]; nextState: ChainState }> {
  await run.options?.onOperationReady?.({ operation, operationIndex })

  if (state.derivedData !== null) {
    // lagDiff ran before us: find the extremum among the delta values and
    // strengthen the existing arrow rather than drawing a new annotation.
    const result = findExtremum(state.derivedData, operation)
    const targetKey = result[0]?.target
    if (targetKey != null) {
      await strengthenLagDiffArrow(run.container, String(targetKey))
    }
    await run.options?.onOperationCompleted?.({ operation, operationIndex, result })
    console.log('[operation-next] simple-line findExtremum (lagDiff strengthen)', { operationIndex, operation, result })
    return { result, nextState: { ...state, lastResult: result } }
  }

  // Standard path: find extremum in workingData and draw a new annotation.
  const result = findExtremum(state.workingData, operation)
  await annotateFindExtremum(run.container, result, state)
  await run.options?.onOperationCompleted?.({ operation, operationIndex, result })
  console.log('[operation-next] simple-line findExtremum', { operationIndex, operation, result })
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
  console.log('[operation-next] simple-line lagDiff', { operationIndex, operation, result })
  // Store delta values in derivedData so a subsequent findExtremum knows
  // to operate on delta magnitudes rather than raw point values.
  return {
    result,
    nextState: { ...state, derivedData: result, lastResult: result },
  }
}

export async function runSimpleLineOperations(run: ParsedOperationRun) {
  let nextIndex = run.options?.operationIndexStart ?? 0
  let lastResult: DatumValue[] | null = null

  // Initialise state once from the raw data; each operation threads it forward.
  let state = createChainState(getWorkingData(run))

  for (const group of run.groups) {
    state = clearGroupBoundary(state)

    for (const operation of group.ops) {
      const operationIndex = nextIndex
      nextIndex += 1
      let opResult: { result: DatumValue[]; nextState: ChainState }

      if (isRetrieveValueOperation(operation)) {
        opResult = await runRetrieveValueOperation(run, operation, operationIndex, state)
      } else if (isFilterOperation(operation)) {
        opResult = await runFilterOperation(run, operation, operationIndex, state)
      } else if (isDiffOperation(operation)) {
        opResult = await runDiffOperation(run, operation, operationIndex, state)
      } else if (isAverageOperation(operation)) {
        opResult = await runAverageOperation(run, operation, operationIndex, state)
      } else if (isFindExtremumOperation(operation)) {
        opResult = await runFindExtremumOperation(run, operation, operationIndex, state)
      } else if (isLagDiffOperation(operation)) {
        opResult = await runLagDiffOperation(run, operation, operationIndex, state)
      } else {
        continue
      }

      lastResult = opResult.result
      state = opResult.nextState
    }
  }

  if (lastResult) return lastResult
  return runStubChartOperationRenderer(run, ChartType.SIMPLE_LINE, 'simple-line')
}

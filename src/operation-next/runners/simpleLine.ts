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

export const SIMPLE_LINE_SUPPORTED_OPERATIONS = getSupportedOperationsForChart(ChartType.SIMPLE_LINE)

const ANNOTATION_LAYER_CLASS = 'operation-next-annotation-layer'
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

function ensureAnnotationLayer(svg: d3.Selection<SVGSVGElement, unknown, null, undefined>) {
  const existing = svg.select<SVGGElement>(`g.${ANNOTATION_LAYER_CLASS}`)
  if (!existing.empty()) return existing.raise()
  return svg.append(SvgElements.Group).attr(SvgAttributes.Class, `${SvgClassNames.AnnotationLayer} ${ANNOTATION_LAYER_CLASS}`)
}

function resolveAnnotationViewport(svg: d3.Selection<SVGSVGElement, unknown, null, undefined>, extraRight = 96) {
  const marginLeft = Number(svg.attr(DataAttributes.MarginLeft) ?? 0)
  const marginTop = Number(svg.attr(DataAttributes.MarginTop) ?? 0)
  const plotWidth = Number(svg.attr(DataAttributes.PlotWidth) ?? 0)
  const plotHeight = Number(svg.attr(DataAttributes.PlotHeight) ?? 0)
  return {
    x: marginLeft,
    y: marginTop,
    width: plotWidth + extraRight,
    height: plotHeight,
  }
}

function readNumberAttr(node: Element, attr: string) {
  const value = Number(node.getAttribute(attr))
  return Number.isFinite(value) ? value : null
}

function formatOperationValue(value: number) {
  if (!Number.isFinite(value)) return String(value)
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)))
}

function formatSignedOperationValue(value: number) {
  if (!Number.isFinite(value)) return String(value)
  const magnitude = formatOperationValue(Math.abs(value))
  if (value > 0) return `+${magnitude}`
  if (value < 0) return `-${magnitude}`
  return magnitude
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
    .attr(SvgAttributes.Fill, params.color ?? '#111827')
    .style(SvgAttributes.Opacity, 0)
    .text(formatOperationValue(params.value))

  placeOperationTextLabel({
    svg: params.svg,
    text: labelNode,
    preferred: { x: params.x, y: Math.max(12, params.y) },
    anchorElement: params.anchorElement,
    viewport: resolveAnnotationViewport(params.svg),
  })

  return labelNode.transition().duration(800).style(SvgAttributes.Opacity, 1)
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

  const stroke = linePath?.getAttribute(SvgAttributes.Stroke) || '#4f46e5'
  const rawStrokeWidth = Number(linePath?.getAttribute(SvgAttributes.StrokeWidth))
  const strokeWidth = Number.isFinite(rawStrokeWidth) ? rawStrokeWidth : 2
  const backgroundStroke = (() => {
    const node = svg.node()
    if (!node || typeof window === 'undefined') return '#ffffff'
    const computed = window.getComputedStyle(node).backgroundColor
    return computed && computed !== 'rgba(0, 0, 0, 0)' ? computed : '#ffffff'
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

function annotateRetrievedValues(container: HTMLElement, values: DatumValue[]) {
  const svg = d3.select(container).select<SVGSVGElement>(SvgElements.Svg)
  if (svg.empty() || values.length === 0) return
  const layer = ensureAnnotationLayer(svg)
  layer.selectAll(`.${RETRIEVE_ANNOTATION_CLASS}`).remove()
  const marginLeft = Number(svg.attr(DataAttributes.MarginLeft) ?? 0)
  const marginTop = Number(svg.attr(DataAttributes.MarginTop) ?? 0)

  values.forEach((datum, index) => {
    const points = findPointByTarget(svg, String(datum.target))
    const point = points.nodes()[0]
    if (!point) return
    const metrics = pointRootMetrics(point, marginLeft, marginTop)
    points.interrupt().transition().duration(800).attr(SvgAttributes.Fill, 'red').attr(SvgAttributes.R, 6)
    appendValueLabel({
      svg,
      layer,
      className: RETRIEVE_ANNOTATION_CLASS,
      x: metrics.x,
      y: metrics.y - 10 - index * 16,
      value: metrics.value,
      color: '#111827',
      anchorElement: point,
    })
  })
}

async function annotateFilter(container: HTMLElement, result: DatumValue[], operation: OperationSpec, workingData: DatumValue[]) {
  const svg = d3.select(container).select<SVGSVGElement>(SvgElements.Svg)
  if (svg.empty()) return
  const layer = ensureAnnotationLayer(svg)
  layer.selectAll(`.${FILTER_ANNOTATION_CLASS}`).interrupt().remove()
  svg.selectAll(`.${FILTER_LINE_LAYER_CLASS}`).interrupt().remove()

  const marginLeft = Number(svg.attr(DataAttributes.MarginLeft) ?? 0)
  const plotWidth = Number(svg.attr(DataAttributes.PlotWidth) ?? 0)
  const threshold = resolveNumericThreshold(operation, workingData)
  const remainingTargets = new Set(result.map((datum) => String(datum.target)))

  if (threshold != null) {
    const thresholdY = inferYForValue(svg, threshold)
    if (thresholdY != null) {
      const x1 = marginLeft
      const x2 = marginLeft + plotWidth
      const line = layer
        .append(SvgElements.Line)
        .attr(SvgAttributes.Class, `${SvgClassNames.LineAnnotation} ${FILTER_ANNOTATION_CLASS}`)
        .attr(SvgAttributes.X1, x1)
        .attr(SvgAttributes.X2, x1)
        .attr(SvgAttributes.Y1, thresholdY)
        .attr(SvgAttributes.Y2, thresholdY)
        .attr(SvgAttributes.Stroke, '#ef4444')
        .attr(SvgAttributes.StrokeWidth, 2)
        .style(SvgAttributes.Opacity, 1)

      await line.transition().duration(800).attr(SvgAttributes.X2, x2).end()

      const labelNode = layer
        .append(SvgElements.Text)
        .attr(SvgAttributes.Class, `${SvgClassNames.TextAnnotation} ${FILTER_ANNOTATION_CLASS}`)
        .attr(SvgAttributes.X, x2 - 4)
        .attr(SvgAttributes.Y, Math.max(12, thresholdY - 8))
        .attr(SvgAttributes.TextAnchor, 'end')
        .attr(SvgAttributes.FontSize, 12)
        .attr(SvgAttributes.FontWeight, 700)
        .attr(SvgAttributes.Fill, '#ef4444')
        .style(SvgAttributes.Opacity, 0)
        .text(String(threshold))

      placeOperationTextLabel({
        svg,
        text: labelNode,
        preferred: { x: x2 - 4, y: Math.max(12, thresholdY - 8) },
        viewport: resolveAnnotationViewport(svg),
      })

      labelNode.transition().delay(500).duration(300).style(SvgAttributes.Opacity, 1)
    }
  }

  const pointTransition = svg
    .selectAll<SVGCircleElement, unknown>(`${SvgElements.Circle}[${DataAttributes.Target}]`)
    .interrupt()
    .transition()
    .duration(800)
    .style(SvgAttributes.Opacity, function () {
      const target = this.getAttribute(DataAttributes.Target)
      return target != null && remainingTargets.has(String(target)) ? 1 : 0.25
    })
  const pointPromise = pointTransition.end()

  const hasFilterLineSegments = await drawFilterLineSegments(svg, remainingTargets)
  const lineSelection = mainLinePath(svg).interrupt()
  const linePromise = hasFilterLineSegments
    ? Promise.resolve(lineSelection.style(SvgAttributes.Opacity, 1))
    : lineSelection
        .transition()
        .duration(800)
        .style(SvgAttributes.Opacity, result.length === 0 ? 0.35 : 1)
        .end()
  await Promise.all([pointPromise, linePromise])
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
    .attr(SvgAttributes.Stroke, '#ef4444')
    .attr(SvgAttributes.StrokeWidth, 2)

  const labelA = appendValueLabel({ svg, layer, className: `${DIFF_ANNOTATION_CLASS} bar-value`, x: a.x, y: a.y - 8, value: a.value, color: '#ef4444', anchorElement: pointA })
  const labelB = appendValueLabel({ svg, layer, className: `${DIFF_ANNOTATION_CLASS} bar-value`, x: b.x, y: b.y - 8, value: b.value, color: '#ef4444', anchorElement: pointB })

  await Promise.all([
    referenceLines.transition().duration(800).attr(SvgAttributes.X2, arrowX).end(),
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
    .attr(SvgAttributes.Stroke, '#ef4444')
    .attr(SvgAttributes.StrokeWidth, 2)

  await compareArrow.transition().duration(600).attr(SvgAttributes.Y1, topY).attr(SvgAttributes.Y2, bottomY).end()

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
    .attr(SvgAttributes.Stroke, '#ef4444')
    .attr(SvgAttributes.StrokeWidth, 2)

  const differenceLabel = layer
    .append(SvgElements.Text)
    .attr(SvgAttributes.Class, `${SvgClassNames.TextAnnotation} ${DIFF_ANNOTATION_CLASS} difference-label`)
    .attr(SvgAttributes.X, arrowX + 12)
    .attr(SvgAttributes.Y, (topY + bottomY) / 2)
    .attr(SvgAttributes.DominantBaseline, 'middle')
    .attr(SvgAttributes.FontSize, 12)
    .attr(SvgAttributes.FontWeight, 700)
    .attr(SvgAttributes.Fill, '#ef4444')
    .text(differenceText)

  placeOperationTextLabel({
    svg,
    text: differenceLabel,
    preferred: { x: arrowX + 12, y: (topY + bottomY) / 2 },
    viewport: resolveAnnotationViewport(svg),
  })
}

async function annotateAverage(container: HTMLElement, result: DatumValue[]) {
  const average = Number(result[0]?.value)
  if (!Number.isFinite(average)) return
  const svg = d3.select(container).select<SVGSVGElement>(SvgElements.Svg)
  if (svg.empty()) return
  const averageY = inferYForValue(svg, average)
  if (averageY == null) return
  const layer = ensureAnnotationLayer(svg)
  layer.selectAll(`.${AVERAGE_ANNOTATION_CLASS}`).interrupt().remove()
  const marginLeft = Number(svg.attr(DataAttributes.MarginLeft) ?? 0)
  const plotWidth = Number(svg.attr(DataAttributes.PlotWidth) ?? 0)
  const x1 = marginLeft
  const x2 = marginLeft + plotWidth
  const line = layer
    .append(SvgElements.Line)
    .attr(SvgAttributes.Class, `${SvgClassNames.LineAnnotation} ${AVERAGE_ANNOTATION_CLASS}`)
    .attr(SvgAttributes.X1, x1)
    .attr(SvgAttributes.X2, x1)
    .attr(SvgAttributes.Y1, averageY)
    .attr(SvgAttributes.Y2, averageY)
    .attr(SvgAttributes.Stroke, '#ef4444')
    .attr(SvgAttributes.StrokeWidth, 2)

  await line.transition().duration(800).attr(SvgAttributes.X2, x2).end()

  const labelNode = layer
    .append(SvgElements.Text)
    .attr(SvgAttributes.Class, `${SvgClassNames.TextAnnotation} ${AVERAGE_ANNOTATION_CLASS}`)
    .attr(SvgAttributes.X, x2 - 4)
    .attr(SvgAttributes.Y, Math.max(12, averageY - 8))
    .attr(SvgAttributes.TextAnchor, 'end')
    .attr(SvgAttributes.FontSize, 12)
    .attr(SvgAttributes.FontWeight, 700)
    .attr(SvgAttributes.Fill, '#ef4444')
    .style(SvgAttributes.Opacity, 0)
    .text(`Average: ${formatOperationValue(average)}`)

  placeOperationTextLabel({
    svg,
    text: labelNode,
    preferred: { x: x2 - 4, y: Math.max(12, averageY - 8) },
    viewport: resolveAnnotationViewport(svg),
  })

  await labelNode.transition().duration(400).style(SvgAttributes.Opacity, 1).end()
}

async function annotateFindExtremum(container: HTMLElement, result: DatumValue[]) {
  const target = result[0]?.target
  if (target == null) return
  const svg = d3.select(container).select<SVGSVGElement>(SvgElements.Svg)
  if (svg.empty()) return
  const layer = ensureAnnotationLayer(svg)
  layer.selectAll(`.${EXTREMUM_ANNOTATION_CLASS}`).interrupt().remove()
  const marginLeft = Number(svg.attr(DataAttributes.MarginLeft) ?? 0)
  const marginTop = Number(svg.attr(DataAttributes.MarginTop) ?? 0)
  const points = findPointByTarget(svg, String(target))
  const point = points.nodes()[0]
  if (!point) return
  const metrics = pointRootMetrics(point, marginLeft, marginTop)
  points.interrupt().transition().duration(800).attr(SvgAttributes.Fill, 'red').attr(SvgAttributes.R, 6)
  await appendValueLabel({
    svg,
    layer,
    className: EXTREMUM_ANNOTATION_CLASS,
    x: metrics.x,
    y: metrics.y - 10,
    value: metrics.value,
    color: '#111827',
    anchorElement: point,
  }).end()
}

async function annotateLagDiff(container: HTMLElement, result: DatumValue[]) {
  const svg = d3.select(container).select<SVGSVGElement>(SvgElements.Svg)
  if (svg.empty() || result.length === 0) return
  const layer = ensureAnnotationLayer(svg)
  layer.selectAll(`.${LAG_DIFF_ANNOTATION_CLASS}`).interrupt().remove()
  const marginLeft = Number(svg.attr(DataAttributes.MarginLeft) ?? 0)
  const marginTop = Number(svg.attr(DataAttributes.MarginTop) ?? 0)
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
    const dx = current.x - prev.x
    const dy = current.y - prev.y
    const distance = Math.hypot(dx, dy)
    if (distance < 1) return

    const ux = dx / distance
    const uy = dy / distance
    const px = -uy
    const py = ux
    const endpointPadding = 8
    const headLength = 10
    const headHalfWidth = 5
    const startX = prev.x + ux * endpointPadding
    const startY = prev.y + uy * endpointPadding
    const endX = current.x - ux * endpointPadding
    const endY = current.y - uy * endpointPadding
    const headBaseX = endX - ux * headLength
    const headBaseY = endY - uy * headLength
    const headA = {
      x: headBaseX + px * headHalfWidth,
      y: headBaseY + py * headHalfWidth,
    }
    const headB = {
      x: headBaseX - px * headHalfWidth,
      y: headBaseY - py * headHalfWidth,
    }
    highlightedPoints.add(prevPoint)
    highlightedPoints.add(currentPoint)

    const arrow = layer
      .append(SvgElements.Line)
      .attr(SvgAttributes.Class, `${SvgClassNames.LineAnnotation} ${LAG_DIFF_ANNOTATION_CLASS}`)
      .attr(SvgAttributes.X1, startX)
      .attr(SvgAttributes.Y1, startY)
      .attr(SvgAttributes.X2, startX)
      .attr(SvgAttributes.Y2, startY)
      .attr(SvgAttributes.Stroke, '#0ea5e9')
      .attr(SvgAttributes.StrokeWidth, 2)
      .style(SvgAttributes.Opacity, 0.9)

    const arrowTransition = arrow.transition().duration(800).attr(SvgAttributes.X2, endX).attr(SvgAttributes.Y2, endY).end()
    transitions.push(arrowTransition)

    const arrowHeads = [
      { x1: endX, y1: endY, x2: headA.x, y2: headA.y },
      { x1: endX, y1: endY, x2: headB.x, y2: headB.y },
    ]
    arrowHeads.forEach((entry) => {
      transitions.push(
        layer
          .append(SvgElements.Line)
          .attr(SvgAttributes.Class, `${SvgClassNames.LineAnnotation} ${LAG_DIFF_ANNOTATION_CLASS} arrow-head`)
          .attr(SvgAttributes.X1, entry.x1)
          .attr(SvgAttributes.Y1, entry.y1)
          .attr(SvgAttributes.X2, entry.x2)
          .attr(SvgAttributes.Y2, entry.y2)
          .attr(SvgAttributes.Stroke, '#0ea5e9')
          .attr(SvgAttributes.StrokeWidth, 2)
          .style(SvgAttributes.Opacity, 0)
          .transition()
          .delay(700)
          .duration(200)
          .style(SvgAttributes.Opacity, 0.9)
          .end(),
      )
    })

    const labelX = (prev.x + current.x) / 2 + px * 18
    const labelY = (prev.y + current.y) / 2 + py * 18
    const labelNode = layer
      .append(SvgElements.Text)
      .attr(SvgAttributes.Class, `${SvgClassNames.TextAnnotation} ${LAG_DIFF_ANNOTATION_CLASS}`)
      .attr(SvgAttributes.X, labelX)
      .attr(SvgAttributes.Y, Math.max(12, labelY))
      .attr(SvgAttributes.TextAnchor, 'middle')
      .attr(SvgAttributes.DominantBaseline, 'middle')
      .attr(SvgAttributes.FontSize, 12)
      .attr(SvgAttributes.FontWeight, 700)
      .attr(SvgAttributes.Fill, '#0ea5e9')
      .style(SvgAttributes.Opacity, 0)
      .text(formatSignedOperationValue(Number(datum.value)))

    placeOperationTextLabel({
      svg,
      text: labelNode,
      preferred: { x: labelX, y: Math.max(12, labelY) },
      viewport: resolveAnnotationViewport(svg),
    })

    transitions.push(labelNode.transition().delay(500).duration(300).style(SvgAttributes.Opacity, 1).end())
  })

  if (highlightedPoints.size > 0) {
    transitions.push(
      d3
        .selectAll<SVGCircleElement, unknown>(Array.from(highlightedPoints))
        .interrupt()
        .transition()
        .duration(800)
        .attr(SvgAttributes.Fill, '#0ea5e9')
        .attr(SvgAttributes.R, 6)
        .style(SvgAttributes.Opacity, 1)
        .end(),
    )
  }

  await Promise.all(transitions)
}

async function runRetrieveValueOperation(run: ParsedOperationRun, operation: OperationSpec, operationIndex: number) {
  const workingData = getWorkingData(run)
  await run.options?.onOperationReady?.({ operation, operationIndex })
  const result = retrieveValue(workingData, operation)
  annotateRetrievedValues(run.container, result)
  await run.options?.onOperationCompleted?.({ operation, operationIndex, result })
  console.log('[operation-next] simple-line retrieveValue', { operationIndex, operation, result })
  return result
}

async function runFilterOperation(run: ParsedOperationRun, operation: OperationSpec, operationIndex: number) {
  const workingData = getWorkingData(run)
  await run.options?.onOperationReady?.({ operation, operationIndex })
  const result = filterData(workingData, operation)
  await annotateFilter(run.container, result, operation, workingData)
  await run.options?.onOperationCompleted?.({ operation, operationIndex, result })
  console.log('[operation-next] simple-line filter', { operationIndex, operation, result })
  return result
}

async function runDiffOperation(run: ParsedOperationRun, operation: OperationSpec, operationIndex: number) {
  const workingData = getWorkingData(run)
  await run.options?.onOperationReady?.({ operation, operationIndex })
  const result = diffData(workingData, operation)
  await annotateDiff(run.container, result, operation)
  await run.options?.onOperationCompleted?.({ operation, operationIndex, result })
  console.log('[operation-next] simple-line diff', { operationIndex, operation, result })
  return result
}

async function runAverageOperation(run: ParsedOperationRun, operation: OperationSpec, operationIndex: number) {
  const workingData = getWorkingData(run)
  await run.options?.onOperationReady?.({ operation, operationIndex })
  const result = averageData(workingData, operation)
  await annotateAverage(run.container, result)
  await run.options?.onOperationCompleted?.({ operation, operationIndex, result })
  console.log('[operation-next] simple-line average', { operationIndex, operation, result })
  return result
}

async function runFindExtremumOperation(run: ParsedOperationRun, operation: OperationSpec, operationIndex: number) {
  const workingData = getWorkingData(run)
  await run.options?.onOperationReady?.({ operation, operationIndex })
  const result = findExtremum(workingData, operation)
  await annotateFindExtremum(run.container, result)
  await run.options?.onOperationCompleted?.({ operation, operationIndex, result })
  console.log('[operation-next] simple-line findExtremum', { operationIndex, operation, result })
  return result
}

async function runLagDiffOperation(run: ParsedOperationRun, operation: OperationSpec, operationIndex: number) {
  const workingData = getWorkingData(run)
  await run.options?.onOperationReady?.({ operation, operationIndex })
  const result = lagDiffData(workingData, operation)
  await annotateLagDiff(run.container, result)
  await run.options?.onOperationCompleted?.({ operation, operationIndex, result })
  console.log('[operation-next] simple-line lagDiff', { operationIndex, operation, result })
  return result
}

export async function runSimpleLineOperations(run: ParsedOperationRun) {
  let nextIndex = run.options?.operationIndexStart ?? 0
  let lastResult: DatumValue[] | null = null

  for (const group of run.groups) {
    for (const operation of group.ops) {
      const operationIndex = nextIndex
      nextIndex += 1
      if (isRetrieveValueOperation(operation)) {
        lastResult = await runRetrieveValueOperation(run, operation, operationIndex)
        continue
      }
      if (isFilterOperation(operation)) {
        lastResult = await runFilterOperation(run, operation, operationIndex)
        continue
      }
      if (isDiffOperation(operation)) {
        lastResult = await runDiffOperation(run, operation, operationIndex)
        continue
      }
      if (isAverageOperation(operation)) {
        lastResult = await runAverageOperation(run, operation, operationIndex)
        continue
      }
      if (isFindExtremumOperation(operation)) {
        lastResult = await runFindExtremumOperation(run, operation, operationIndex)
        continue
      }
      if (isLagDiffOperation(operation)) {
        lastResult = await runLagDiffOperation(run, operation, operationIndex)
      }
    }
  }

  if (lastResult) return lastResult
  return runStubChartOperationRenderer(run, ChartType.SIMPLE_LINE, 'simple-line')
}

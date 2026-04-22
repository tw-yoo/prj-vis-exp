import * as d3 from 'd3'
import { ChartType } from '../../domain/chart'
import { averageData, diffData, filterData, findExtremum, retrieveValue, sortData } from '../../domain/operation/dataOps'
import { OperationOp, type DatumValue, type JsonValue, type OperationSpec, type TargetSelector } from '../../domain/operation/types'
import { getSimpleBarStoredData, type SimpleBarSpec } from '../../rendering/bar/simpleBarRenderer'
import type { SurfaceManager } from '../../runtime/surfaceManager'
import { toDatumValuesFromRaw, type RawRow } from '../../domain/data/datum'
import { DataAttributes, SvgAttributes, SvgClassNames, SvgElements } from '../../rendering/interfaces'
import type { ParsedOperationRun } from '../types'
import { getSupportedOperationsForChart, runStubChartOperationRenderer } from './shared'
import { placeOperationTextLabel } from '../textPlacement'
import { COLORS, DURATIONS, OPACITIES } from '../../rendering/common/d3Helpers'
import { clearGroupBoundary, type ChainState } from '../chainState'
import { formatOperationValue } from '../primitives/formatValue'
import {
  ANNOTATION_LAYER_CLASS,
  ensureAnnotationLayer,
  resolveAnnotationViewport,
  readNumberAttr,
  applyAnnotationContextTransitions,
} from '../primitives/annotationLayer'
import { applyMarkSalience } from '../primitives/markSalience'
import { drawReferenceLine } from '../primitives/drawReferenceLine'
import { drawVerticalComparisonArrow } from '../primitives/drawDifferenceArrow'
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
import { tryDrawSplitScalarDiffAnnotation } from '../splitSurfaceVisuals'

export const SIMPLE_BAR_SUPPORTED_OPERATIONS = getSupportedOperationsForChart(ChartType.SIMPLE_BAR)

const SPLIT_DEBUG_PREFIX = '[split-simple-bar-debug]'

function isSplitDebugEnabled() {
  return Boolean((globalThis as typeof globalThis & { __OPERATION_NEXT_DEBUG__?: unknown }).__OPERATION_NEXT_DEBUG__)
}

function splitDebug(label: string, payload: Record<string, unknown>) {
  if (!isSplitDebugEnabled()) return
  try {
    console.info(SPLIT_DEBUG_PREFIX, label, JSON.stringify(payload))
  } catch {
    console.info(SPLIT_DEBUG_PREFIX, label, payload)
  }
}

const RETRIEVE_ANNOTATION_CLASS = 'operation-next-retrieve-value'
const FILTER_ANNOTATION_CLASS = 'operation-next-filter'
const DIFF_ANNOTATION_CLASS = 'operation-next-diff'
const AVERAGE_ANNOTATION_CLASS = 'operation-next-average'
const EXTREMUM_ANNOTATION_CLASS = 'operation-next-extremum'

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

function isRetrieveValueOperation(operation: OperationSpec): operation is OperationSpec & {
  op: typeof OperationOp.RetrieveValue
} {
  return operation.op === OperationOp.RetrieveValue
}

function isFilterOperation(operation: OperationSpec): operation is OperationSpec & {
  op: typeof OperationOp.Filter
} {
  return operation.op === OperationOp.Filter
}

function isDiffOperation(operation: OperationSpec): operation is OperationSpec & {
  op: typeof OperationOp.Diff
} {
  return operation.op === OperationOp.Diff
}

function isAverageOperation(operation: OperationSpec): operation is OperationSpec & {
  op: typeof OperationOp.Average
} {
  return operation.op === OperationOp.Average
}

function isFindExtremumOperation(operation: OperationSpec): operation is OperationSpec & {
  op: typeof OperationOp.FindExtremum
} {
  return operation.op === OperationOp.FindExtremum
}

function isSortOperation(operation: OperationSpec): operation is OperationSpec & {
  op: typeof OperationOp.Sort
} {
  return operation.op === OperationOp.Sort
}

function getInlineRows(spec: SimpleBarSpec): RawRow[] {
  const values = (spec.data as { values?: JsonValue[] } | undefined)?.values
  if (!Array.isArray(values)) return []
  return values.filter((value): value is RawRow => !!value && typeof value === 'object' && !Array.isArray(value))
}

function getWorkingData(run: ParsedOperationRun): DatumValue[] {
  const spec = run.runtimeSpec as SimpleBarSpec
  const storedRows = getSimpleBarStoredData(run.container) as RawRow[]
  const rows = storedRows.length > 0 ? storedRows : getInlineRows(spec)
  return toDatumValuesFromRaw(rows, {
    xField: spec.encoding.x.field,
    yField: spec.encoding.y.field,
  })
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
    const target = String(datum.target)
    const filteredBars = svg
      .selectAll<SVGRectElement, unknown>(`rect.${SvgClassNames.MainBar}`)
      .filter(function () {
        const node = this as SVGRectElement
        return node.getAttribute(DataAttributes.Target) === target || node.getAttribute(DataAttributes.Id) === target
      })
    const rect = filteredBars.nodes()[0]

    if (!rect) return

    const rectX = Number(rect.getAttribute(SvgAttributes.X) ?? 0)
    const rectY = Number(rect.getAttribute(SvgAttributes.Y) ?? 0)
    const rectWidth = Number(rect.getAttribute(SvgAttributes.Width) ?? 0)
    const rectHeight = Number(rect.getAttribute(SvgAttributes.Height) ?? 0)
    const barTopY = rectY + Math.min(0, rectHeight)
    const labelX = marginLeft + rectX + rectWidth / 2
    const labelY = marginTop + barTopY - 10
    const value = Number(datum.value)
    const label = String(Number.isFinite(value) ? value : datum.value)

    filteredBars.interrupt()
    transitions.push(
      filteredBars
        .transition()
        .duration(DURATIONS.HIGHLIGHT)
        .style(SvgAttributes.Fill, COLORS.ANNOTATION_RED)
        .end()
        .catch(() => { /* interrupted */ }),
    )

    const labelNode = layer
      .append(SvgElements.Text)
      .attr(SvgAttributes.Class, `${SvgClassNames.TextAnnotation} ${RETRIEVE_ANNOTATION_CLASS}`)
      .attr(SvgAttributes.X, labelX)
      .attr(SvgAttributes.Y, Math.max(12, labelY - index * 16))
      .attr(SvgAttributes.TextAnchor, 'middle')
      .attr(SvgAttributes.FontSize, 12)
      .attr(SvgAttributes.FontWeight, 700)
      .attr(SvgAttributes.Fill, COLORS.TEXT_DARK)
      .style(SvgAttributes.Opacity, 0)
      .text(label)

    placeOperationTextLabel({
      svg,
      text: labelNode,
      preferred: { x: labelX, y: Math.max(12, labelY - index * 16) },
      anchorElement: rect,
      viewport: resolveAnnotationViewport(svg),
    })

    transitions.push(
      labelNode
        .transition()
        .duration(DURATIONS.LABEL_FADE_IN)
        .style(SvgAttributes.Opacity, 1)
        .end()
        .catch(() => { /* interrupted */ }),
    )
  })

  await Promise.all(transitions)
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


function selectorTargetKey(selector: TargetSelector | TargetSelector[] | undefined) {
  const entry = Array.isArray(selector) ? selector[0] : selector
  if (entry == null) return null
  if (typeof entry === 'string' || typeof entry === 'number') return String(entry)
  const target = entry.target ?? entry.category ?? entry.id
  return target == null ? null : String(target)
}

function findMainBar(svg: d3.Selection<SVGSVGElement, unknown, null, undefined>, selector: TargetSelector | TargetSelector[] | undefined) {
  const key = selectorTargetKey(selector)
  if (!key) return null
  return svg
    .selectAll<SVGRectElement, unknown>(`rect.${SvgClassNames.MainBar}`)
    .filter(function () {
      const node = this as SVGRectElement
      return node.getAttribute(DataAttributes.Target) === key || node.getAttribute(DataAttributes.Id) === key
    })
    .nodes()[0] ?? null
}

function findMainBarByTarget(svg: d3.Selection<SVGSVGElement, unknown, null, undefined>, target: string) {
  return svg
    .selectAll<SVGRectElement, unknown>(`rect.${SvgClassNames.MainBar}`)
    .filter(function () {
      const node = this as SVGRectElement
      return node.getAttribute(DataAttributes.Target) === target || node.getAttribute(DataAttributes.Id) === target
    })
}

function barRootMetrics(rect: SVGRectElement, marginLeft: number, marginTop: number) {
  const x = readNumberAttr(rect, SvgAttributes.X) ?? 0
  const y = readNumberAttr(rect, SvgAttributes.Y) ?? 0
  const width = readNumberAttr(rect, SvgAttributes.Width) ?? 0
  return {
    centerX: marginLeft + x + width / 2,
    topY: marginTop + y,
    value: Number(rect.getAttribute(DataAttributes.Value)),
  }
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

  return labelNode
    .transition()
    .duration(DURATIONS.LABEL_FADE_IN)
    .style(SvgAttributes.Opacity, 1)
}

function resolveThresholdY(params: {
  bars: d3.Selection<SVGRectElement, unknown, SVGSVGElement, unknown>
  marginTop: number
  threshold: number
}) {
  const nodes = params.bars.nodes()
  const exact = nodes.find((node) => Number(node.getAttribute(DataAttributes.Value)) === params.threshold)
  if (exact) {
    const y = readNumberAttr(exact, SvgAttributes.Y)
    if (y != null) return params.marginTop + y
  }

  const reference = nodes.find((node) => {
    const value = Number(node.getAttribute(DataAttributes.Value))
    const y = readNumberAttr(node, SvgAttributes.Y)
    const height = readNumberAttr(node, SvgAttributes.Height)
    return Number.isFinite(value) && value !== 0 && y != null && height != null
  })
  if (!reference) return null

  const value = Number(reference.getAttribute(DataAttributes.Value))
  const y = readNumberAttr(reference, SvgAttributes.Y)
  const height = readNumberAttr(reference, SvgAttributes.Height)
  if (y == null || height == null || !Number.isFinite(value) || value === 0) return null

  const zeroY = y + height
  const pixelsPerValue = height / Math.abs(value)
  const thresholdY = value >= 0
    ? zeroY - params.threshold * pixelsPerValue
    : zeroY + params.threshold * pixelsPerValue
  return params.marginTop + thresholdY
}

async function annotateFilter(container: HTMLElement, result: DatumValue[], operation: OperationSpec, workingData: DatumValue[], state: ChainState) {
  const threshold = resolveNumericThreshold(operation, workingData)
  if (threshold == null) return

  const svg = d3.select(container).select<SVGSVGElement>(SvgElements.Svg)
  if (svg.empty()) return

  const layer = ensureAnnotationLayer(svg)
  layer.selectAll(`.${FILTER_ANNOTATION_CLASS}`).interrupt().remove()

  const marginLeft = Number(svg.attr(DataAttributes.MarginLeft) ?? 0)
  const marginTop = Number(svg.attr(DataAttributes.MarginTop) ?? 0)
  const plotWidth = Number(svg.attr(DataAttributes.PlotWidth) ?? 0)
  const x1 = marginLeft
  const x2 = marginLeft + plotWidth
  const bars = svg.selectAll<SVGRectElement, unknown>(`rect.${SvgClassNames.MainBar}`)
  const remainingTargets = new Set(result.map((datum) => String(datum.target)))

  // Phase 1a — dim out-of-scope bars first so the scope is established
  // before the threshold line is drawn. Awaiting ensures the reference line
  // is placed against stable, settled bar geometry.
  await applyMarkSalience({
    marks: bars as unknown as d3.Selection<SVGElement, unknown, d3.BaseType, unknown>,
    isInScope: (node) => {
      const target = node.getAttribute(DataAttributes.Target)
      return target != null && remainingTargets.has(target)
    },
  })

  // Phase 1b — threshold line + label drawn after bars are at their final opacity.
  const thresholdY = resolveThresholdY({ bars, marginTop, threshold })
  if (thresholdY == null) return

  // drawReferenceLine handles: line draw-out animation, label placement, label fade-in.
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

  // Record this annotation as a persistent anchor so subsequent operations
  // (average, findExtremum) know the filter context is present and can
  // transition this threshold line to a guideline style rather than clearing it.
  state.annotationRecords.push({ cssClass: FILTER_ANNOTATION_CLASS, role: 'anchor', persistent: true })
}

async function annotateDiff(
  container: HTMLElement,
  result: DatumValue[],
  operation: OperationSpec,
  state: ChainState,
  surfaceManager?: SurfaceManager,
) {
  const operationId = (operation as OperationSpec & { id?: unknown }).id
  splitDebug('simpleBar.annotateDiff-start', {
    operation: {
      op: operation.op,
      id: typeof operationId === 'string' ? operationId : null,
      targetA: operation.targetA ?? null,
      targetB: operation.targetB ?? null,
      inputs: operation.meta?.inputs ?? [],
    },
    resultCount: result.length,
    hasSurfaceManager: Boolean(surfaceManager),
    layoutType: surfaceManager?.getLayout()?.type ?? null,
    containerSvgCount: container.querySelectorAll(SvgElements.Svg).length,
  })
  if (
    await tryDrawSplitScalarDiffAnnotation({
      container,
      surfaceManager,
      operation,
      result,
    })
  ) {
    splitDebug('simpleBar.annotateDiff-split-overlay-used', {
      operationId: typeof operationId === 'string' ? operationId : null,
      layoutType: surfaceManager?.getLayout()?.type ?? null,
    })
    state.annotationRecords.push({ cssClass: DIFF_ANNOTATION_CLASS, role: 'anchor', persistent: true })
    return
  }

  splitDebug('simpleBar.annotateDiff-fallback-chart-local', {
    operationId: typeof operationId === 'string' ? operationId : null,
    layoutType: surfaceManager?.getLayout()?.type ?? null,
  })
  const svg = d3.select(container).select<SVGSVGElement>(SvgElements.Svg)
  if (svg.empty()) return

  const selectors = diffEndpointSelectors(operation)
  const aggregateHint = typeof operation.aggregate === 'string' ? operation.aggregate : undefined
  const derivedA = resolveDerivedDiffEndpoint(selectors.targetA, aggregateHint)
  const derivedB = resolveDerivedDiffEndpoint(selectors.targetB, aggregateHint)
  const marginLeft = Number(svg.attr(DataAttributes.MarginLeft) ?? 0)
  const marginTop = Number(svg.attr(DataAttributes.MarginTop) ?? 0)
  const plotWidth = Number(svg.attr(DataAttributes.PlotWidth) ?? 0)
  const arrowX = marginLeft + plotWidth + 18
  const bars = svg.selectAll<SVGRectElement, unknown>(`rect.${SvgClassNames.MainBar}`)
  const layer = ensureAnnotationLayer(svg)
  const rectA = derivedA ? null : findMainBar(svg, selectors.targetA)
  const rectB = derivedB ? null : findMainBar(svg, selectors.targetB)
  const markA = rectA ? barRootMetrics(rectA, marginLeft, marginTop) : null
  const markB = rectB ? barRootMetrics(rectB, marginLeft, marginTop) : null
  const existingA = derivedA ? scalarReferenceLineForResultRef(layer, derivedA.refKey) : null
  const existingB = derivedB ? scalarReferenceLineForResultRef(layer, derivedB.refKey) : null
  const derivedAY = derivedA ? existingA?.y ?? resolveThresholdY({ bars, marginTop, threshold: derivedA.value }) : null
  const derivedBY = derivedB ? existingB?.y ?? resolveThresholdY({ bars, marginTop, threshold: derivedB.value }) : null
  const a = derivedA && derivedAY != null
    ? { kind: 'derived' as const, value: derivedA.value, y: derivedAY, x: marginLeft + plotWidth, usesExistingReference: Boolean(existingA) }
    : markA
      ? { kind: 'mark' as const, value: markA.value, y: markA.topY, x: markA.centerX, anchorElement: rectA, usesExistingReference: false }
      : null
  const b = derivedB && derivedBY != null
    ? { kind: 'derived' as const, value: derivedB.value, y: derivedBY, x: marginLeft + plotWidth, usesExistingReference: Boolean(existingB) }
    : markB
      ? { kind: 'mark' as const, value: markB.value, y: markB.topY, x: markB.centerX, anchorElement: rectB, usesExistingReference: false }
      : null
  if (!a || !b) {
    console.warn('[operation-next] simple-bar diff: targetA or targetB could not be resolved for annotation.', { operation })
    return
  }

  layer.selectAll(`.${DIFF_ANNOTATION_CLASS}`).interrupt().remove()

  const topY = Math.min(a.y, b.y)
  const bottomY = Math.max(a.y, b.y)
  const differenceValue = Number(result[0]?.value)
  const differenceText = `Difference: ${formatOperationValue(differenceValue)}`

  // Value labels: positioned above each bar top, fade-in concurrently with ref lines (Phase 1).
  const markLabelData = [a, b].filter((endpoint): endpoint is Extract<typeof endpoint, { kind: 'mark' }> => endpoint?.kind === 'mark')
  const valueLabels = layer
    .selectAll<SVGTextElement, { x: number; y: number; value: number }>(`text.${DIFF_ANNOTATION_CLASS}.bar-value`)
    .data(markLabelData.map((endpoint) => ({ x: endpoint.x, y: endpoint.y, value: endpoint.value })))
    .enter()
    .append(SvgElements.Text)
    .attr(SvgAttributes.Class, `${SvgClassNames.TextAnnotation} ${DIFF_ANNOTATION_CLASS} bar-value`)
    .attr(SvgAttributes.X, (datum) => datum.x)
    .attr(SvgAttributes.Y, (datum) => Math.max(12, datum.y - 8))
    .attr(SvgAttributes.TextAnchor, 'middle')
    .attr(SvgAttributes.FontSize, 12)
    .attr(SvgAttributes.FontWeight, 700)
    .attr(SvgAttributes.Fill, COLORS.ANNOTATION_RED)
    .style(SvgAttributes.Opacity, 0)
    .text((datum) => formatOperationValue(datum.value))

  valueLabels.each(function (datum) {
    const anchorElement = markLabelData.find((endpoint) => endpoint.x === datum.x)?.anchorElement ?? null
    placeOperationTextLabel({
      svg,
      text: d3.select(this),
      preferred: { x: datum.x, y: Math.max(12, datum.y - 8) },
      anchorElement,
      viewport: resolveAnnotationViewport(svg),
    })
  })

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
    phaseOnePromises: [
      valueLabels.transition().duration(DURATIONS.LABEL_FADE_IN).style(SvgAttributes.Opacity, 1).end().catch(() => {}),
    ],
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
  const average = Number(result[0]?.value)
  if (!Number.isFinite(average)) return

  const svg = d3.select(container).select<SVGSVGElement>(SvgElements.Svg)
  if (svg.empty()) return
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
  const marginTop = Number(svg.attr(DataAttributes.MarginTop) ?? 0)
  const plotWidth = Number(svg.attr(DataAttributes.PlotWidth) ?? 0)
  const bars = svg.selectAll<SVGRectElement, unknown>(`rect.${SvgClassNames.MainBar}`)
  const averageY = resolveThresholdY({ bars, marginTop, threshold: average })
  if (averageY == null) return

  const x1 = marginLeft
  const x2 = marginLeft + plotWidth

  // When a filter ran before us, clarify in the label that this is the
  // average over the filtered subset, not the full dataset.
  const isFiltered = state.salienceMap.size > 0
  const labelText = isFiltered
    ? `Avg (filtered): ${formatOperationValue(average)}`
    : `Average: ${formatOperationValue(average)}`

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
  const bars = findMainBarByTarget(svg, String(target))
  const rect = bars.nodes()[0]
  if (!rect) return

  const metrics = barRootMetrics(rect, marginLeft, marginTop)
  bars.interrupt().transition().duration(DURATIONS.HIGHLIGHT).style(SvgAttributes.Fill, COLORS.ANNOTATION_RED)
  try {
    await appendValueLabel({
      svg,
      layer,
      className: EXTREMUM_ANNOTATION_CLASS,
      x: metrics.centerX,
      y: metrics.topY - 10,
      value: metrics.value,
      color: COLORS.TEXT_DARK,
      anchorElement: rect,
    }).end()
  } catch { /* interrupted */ }

  state.annotationRecords.push({ cssClass: EXTREMUM_ANNOTATION_CLASS, role: 'result', persistent: false })
}

async function annotateSort(container: HTMLElement, result: DatumValue[], operation: OperationSpec) {
  const svg = d3.select(container).select<SVGSVGElement>(SvgElements.Svg)
  if (svg.empty() || result.length === 0) return

  const bars = svg.selectAll<SVGRectElement, unknown>(`rect.${SvgClassNames.MainBar}`)
  const entries = bars.nodes().map((node) => ({
    node,
    target: node.getAttribute(DataAttributes.Target) ?? node.getAttribute(DataAttributes.Id) ?? '',
    x: readNumberAttr(node, SvgAttributes.X) ?? 0,
    width: readNumberAttr(node, SvgAttributes.Width) ?? 0,
  }))
  if (entries.length === 0) return

  const xPositions = entries.slice().sort((a, b) => a.x - b.x).map((entry) => entry.x)
  const targetToX = new Map<string, number>()
  result.forEach((datum, index) => {
    const nextX = xPositions[index]
    if (nextX == null) return
    targetToX.set(String(datum.target), nextX)
  })

  const barTransitions: Array<Promise<unknown>> = []
  entries.forEach((entry) => {
    const nextX = targetToX.get(entry.target)
    if (nextX == null) return
    barTransitions.push(
      d3.select(entry.node)
        .interrupt()
        .transition()
        .duration(DURATIONS.REPOSITION)
        .attr(SvgAttributes.X, nextX)
        .end(),
    )
  })

  const tickTransitions: Array<Promise<unknown>> = []
  const ticks = svg.selectAll<SVGGElement, unknown>(`.${SvgClassNames.XAxis} .tick`)
  ticks.each(function () {
    const tick = d3.select(this)
    const label = tick.select(SvgElements.Text).text().trim()
    const nextX = targetToX.get(label)
    const width = entries.find((entry) => entry.target === label)?.width ?? entries[0]?.width ?? 0
    if (nextX == null) return
    tickTransitions.push(
      tick.interrupt()
        .transition()
        .duration(DURATIONS.REPOSITION)
        .attr(SvgAttributes.Transform, `translate(${nextX + width / 2},0)`)
        .end(),
    )
  })

  console.log('[operation-next] simple-bar sort annotation', {
    field: operation.field,
    order: operation.order,
    orderTargets: result.map((datum) => datum.target),
  })
  await Promise.all([...barTransitions, ...tickTransitions])
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
  console.log('[operation-next] simple-bar retrieveValue', { operationIndex, operation, result })
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
  console.log('[operation-next] simple-bar filter', { operationIndex, operation, result })
  // Record which targets remain in scope so subsequent operations (e.g.
  // average) know that a filter has been applied.
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
  await annotateDiff(run.container, result, operation, state, run.options?.surfaceManager)
  await run.options?.onOperationCompleted?.({ operation, operationIndex, result })
  console.log('[operation-next] simple-bar diff', { operationIndex, operation, result })
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
  await annotateAverage(run.container, result, state, operation, run.options?.referencedResultIds)
  await run.options?.onOperationCompleted?.({ operation, operationIndex, result })
  console.log('[operation-next] simple-bar average', { operationIndex, operation, result })
  return { result, nextState: { ...state, lastResult: result } }
}

async function runFindExtremumOperation(
  run: ParsedOperationRun,
  operation: OperationSpec,
  operationIndex: number,
  state: ChainState,
): Promise<{ result: DatumValue[]; nextState: ChainState }> {
  await run.options?.onOperationReady?.({ operation, operationIndex })
  const result = findExtremum(state.workingData, operation)
  await annotateFindExtremum(run.container, result, state)
  await run.options?.onOperationCompleted?.({ operation, operationIndex, result })
  console.log('[operation-next] simple-bar findExtremum', { operationIndex, operation, result })
  return { result, nextState: { ...state, lastResult: result } }
}

async function runSortOperation(
  run: ParsedOperationRun,
  operation: OperationSpec,
  operationIndex: number,
  state: ChainState,
): Promise<{ result: DatumValue[]; nextState: ChainState }> {
  await run.options?.onOperationReady?.({ operation, operationIndex })
  const result = sortData(state.workingData, operation)
  await annotateSort(run.container, result, operation)
  await run.options?.onOperationCompleted?.({ operation, operationIndex, result })
  console.log('[operation-next] simple-bar sort', { operationIndex, operation, result })
  return { result, nextState: { ...state, lastResult: result } }
}

export async function runSimpleBarOperations(run: ParsedOperationRun) {
  let nextIndex = run.options?.operationIndexStart ?? 0
  let lastResult: DatumValue[] | null = null

  // Initialise state once from the raw data; each operation threads it forward.
  let state = restoreChainState(getWorkingData(run), run.options?.initialChainState)

  for (const group of run.groups) {
    // Reset transient visual/derived state at group boundaries while keeping
    // workingData so multi-group plans can build on prior scope reductions.
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
      } else if (isSortOperation(operation)) {
        opResult = await runSortOperation(run, operation, operationIndex, operationState)
      } else {
        continue
      }

      lastResult = opResult.result
      state = opResult.nextState
      storeOperationRuntimeResult(operation, operationIndex, opResult.result, run.options?.runtimeScope)
    }
  }

  if (!lastResult) {
    const stub = await runStubChartOperationRenderer(run, ChartType.SIMPLE_BAR, 'simple-bar')
    lastResult = Array.isArray(stub) ? stub : null
  }
  return buildOperationNextRunOutcome(lastResult, state)
}

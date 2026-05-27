import * as d3 from 'd3'
import { ChartType, type ChartSpec, type ChartTypeValue } from '../../domain/chart'
import { toDatumValuesFromRaw, type RawRow } from '../../domain/data/datum'
import { averageData, diffData, filterData, findExtremum, nthData, retrieveValue, storeRuntimeResult } from '../../domain/operation/dataOps'
import { OperationOp, type DatumValue, type OperationSpec, type JsonValue, type TargetSelector } from '../../domain/operation/types'
import { COLORS, DURATIONS, EASINGS, OPACITIES } from '../../rendering/common/d3Helpers'
import {
  getGroupedBarStoredData,
  type GroupedSpec,
} from '../../rendering/bar/groupedBarRenderer'
import {
  getStackedBarStoredData,
  type StackedSpec,
} from '../../rendering/bar/stackedBarRenderer'
import {
  getSimpleBarStoredData,
  renderSimpleBarChart,
  setSimpleBarStoredData,
  type SimpleBarSpec,
} from '../../rendering/bar/simpleBarRenderer'
import {
  convertGroupedToSimple,
  convertStackedToSimple,
} from '../../rendering/bar/toSimpleTransforms'
import {
  convertGroupedToStacked,
  convertStackedToDiverging,
  convertStackedToGrouped,
  type StackGroupTransformResult,
} from '../../rendering/bar/stackGroupTransforms'
import { getRuntimeChartState, storeRuntimeChartState } from '../../rendering/utils/runtimeChartState'
import { DrawAction, type DrawOp } from '../../rendering/draw/types'
import { DataAttributes, SvgAttributes, SvgClassNames, SvgElements } from '../../rendering/interfaces'
import { resolveEncodingFields } from '../../rendering/ops/common/resolveEncodingFields'
import { createChainState, type ChainState } from '../chainState'
import {
  applyAnnotationContextTransitions,
  ensureAnnotationLayer,
  readNumberAttr,
  resolveAnnotationViewport,
} from '../primitives/annotationLayer'
import { drawVerticalComparisonArrow } from '../primitives/drawDifferenceArrow'
import { drawReferenceLine } from '../primitives/drawReferenceLine'
import { applyMarkSalience } from '../primitives/markSalience'
import { formatOperationValue } from '../primitives/formatValue'
import { placeOperationTextLabel } from '../textPlacement'
import type { SurfaceManager } from '../../runtime/surfaceManager'
import { tryDrawSplitScalarDiffAnnotation } from '../splitSurfaceVisuals'
import {
  OPERATION_ROLE_ATTRIBUTE,
  RESULT_REF_ATTRIBUTE,
  diffEndpointSelectors,
  isOperationResultReferenced,
  operationResultRef,
  resolveDerivedDiffEndpoint,
} from '../diffEndpoint'

const FILTER_ANNOTATION_CLASS = 'operation-next-grouped-bar-filter'
const AVERAGE_ANNOTATION_CLASS = 'operation-next-grouped-bar-average'
const DIFF_ANNOTATION_CLASS = 'operation-next-grouped-bar-diff'

/**
 * Phase 4 — Group-scoped average on a stacked/grouped chart converts the chart
 * to a simple bar showing only that group. Subsequent group-scoped averages on
 * the same host need to convert FROM the original stacked/grouped spec (not
 * the current simple-bar spec), so we remember the source spec the first time
 * a conversion happens. Reset whenever a non-stacked/grouped chart is rendered
 * via `renderChart` (handled implicitly: the next group-average sees current
 * runtime as the original stacked/grouped again).
 */
const groupAverageSourceSpec = new WeakMap<
  HTMLElement,
  { type: ChartTypeValue; spec: ChartSpec }
>()

export type ActiveBarChartState = {
  chartType: ChartTypeValue
  spec: ChartSpec
  chainState: ChainState
}

type FilterRunResult = {
  result: DatumValue[]
  nextState: ChainState
}

type OperationRunResult = {
  result: DatumValue[]
  nextState: ChainState
}

type PlotScope = {
  key: string
  group: SVGGElement | null
  x1: number
  x2: number
}

type SvgViewBoxBounds = {
  x1: number
  x2: number
  y1: number
  y2: number
  width: number
  height: number
}

type GroupedDiffAnnotationGeometry = {
  arrowX: number
  labelPreferred: { x: number; y: number }
  labelAnchor: 'start' | 'end'
  labelViewport: { x: number; y: number; width: number; height: number }
  annotationRightBound: number
  legendX: number | null
}

function isRecord(value: JsonValue): value is RawRow {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function storedRowsToDatumValues(rows: JsonValue[], spec: ChartSpec): DatumValue[] {
  const fields = resolveEncodingFields(spec)
  if (!fields) return []
  return toDatumValuesFromRaw(rows.filter(isRecord), {
    xField: fields.xField,
    yField: fields.yField,
    groupField: fields.groupField,
  }, {
    panelField: fields.panelField,
  })
}

export function getGroupedBarDatumValues(container: HTMLElement, spec: ChartSpec): DatumValue[] {
  return storedRowsToDatumValues(getGroupedBarStoredData(container) as JsonValue[], spec)
}

export function getStackedBarDatumValues(container: HTMLElement, spec: ChartSpec): DatumValue[] {
  return storedRowsToDatumValues(getStackedBarStoredData(container) as JsonValue[], spec)
}

export function getBarDatumValues(container: HTMLElement, chartType: ChartTypeValue, spec: ChartSpec): DatumValue[] {
  if (chartType === ChartType.STACKED_BAR) return getStackedBarDatumValues(container, spec)
  if (chartType === ChartType.SIMPLE_BAR) {
    return storedRowsToDatumValues(getSimpleBarStoredData(container) as JsonValue[], spec)
  }
  return getGroupedBarDatumValues(container, spec)
}

export function createBarChartState(
  container: HTMLElement,
  chartType: ChartTypeValue,
  spec: ChartSpec,
): ActiveBarChartState {
  return {
    chartType,
    spec,
    chainState: createChainState(getBarDatumValues(container, chartType, spec)),
  }
}

export function isFilterOperation(operation: OperationSpec) {
  return operation.op === OperationOp.Filter
}

export function isBarTransformDrawOperation(operation: OperationSpec): operation is DrawOp {
  if (operation.op !== OperationOp.Draw) return false
  const action = (operation as DrawOp).action
  return (
    action === DrawAction.StackedToGrouped ||
    action === DrawAction.GroupedToStacked ||
    action === DrawAction.StackedToSimple ||
    action === DrawAction.GroupedToSimple ||
    action === DrawAction.StackedToDiverging
  )
}

function parseTranslate(transform: string | null) {
  const match = /translate\(\s*([-+\d.]+)(?:[,\s]+([-+\d.]+))?\s*\)/.exec(transform ?? '')
  if (!match) return { x: 0, y: 0 }
  return {
    x: Number(match[1]) || 0,
    y: Number(match[2]) || 0,
  }
}

function accumulatedTranslate(node: Element) {
  let x = 0
  let y = 0
  let current: Element | null = node
  while (current && current.tagName.toLowerCase() !== SvgElements.Svg) {
    const translated = parseTranslate(current.getAttribute(SvgAttributes.Transform))
    x += translated.x
    y += translated.y
    current = current.parentElement
  }
  return { x, y }
}

function panelKeyFromDatum(datum: DatumValue) {
  return datum.panel ?? 'root'
}

function groupKeyFromDatum(datum: DatumValue) {
  return datum.group ?? datum.series ?? ''
}

function markKey(panel: string, target: string, group: string) {
  return `${panel}|${target}|${group}`
}

function datumMarkKey(datum: DatumValue) {
  return markKey(panelKeyFromDatum(datum), String(datum.target), String(groupKeyFromDatum(datum)))
}

function nodeMarkKey(node: SVGElement) {
  const panel = node.getAttribute(DataAttributes.ChartId) ?? 'root'
  const target = node.getAttribute(DataAttributes.Target) ?? ''
  const group =
    node.getAttribute(DataAttributes.Series) ??
    node.getAttribute(DataAttributes.GroupValue) ??
    ''
  return markKey(panel, target, group)
}

function selectorTargetKey(selector: TargetSelector | TargetSelector[] | undefined) {
  const entry = Array.isArray(selector) ? selector[0] : selector
  if (entry == null) return null
  if (typeof entry === 'string' || typeof entry === 'number') return String(entry)
  const target = entry.target ?? entry.category ?? entry.id
  return target == null ? null : String(target)
}

function selectorGroupKey(selector: TargetSelector | TargetSelector[] | undefined) {
  const entry = Array.isArray(selector) ? selector[0] : selector
  if (!entry || typeof entry !== 'object') return null
  const group = entry.series
  return group == null ? null : String(group)
}

function findBarBySelector(svg: d3.Selection<SVGSVGElement, unknown, null, undefined>, selector: TargetSelector | TargetSelector[] | undefined) {
  const target = selectorTargetKey(selector)
  const group = selectorGroupKey(selector)
  if (!target) return null
  return svg
    .selectAll<SVGRectElement, unknown>(`rect.${SvgClassNames.MainBar}`)
    .filter(function () {
      const node = this as SVGRectElement
      const targetMatch =
        node.getAttribute(DataAttributes.Target) === target ||
        node.getAttribute(DataAttributes.Id) === target
      if (!targetMatch) return false
      if (group == null) return true
      return node.getAttribute(DataAttributes.Series) === group || node.getAttribute(DataAttributes.GroupValue) === group
    })
    .nodes()[0] ?? null
}

function barRootMetrics(rect: SVGRectElement) {
  const offset = accumulatedTranslate(rect)
  const x = readNumberAttr(rect, SvgAttributes.X) ?? 0
  const y = readNumberAttr(rect, SvgAttributes.Y) ?? 0
  const width = readNumberAttr(rect, SvgAttributes.Width) ?? 0
  return {
    x: offset.x + x + width / 2,
    y: offset.y + y,
    value: Number(rect.getAttribute(DataAttributes.Value)),
  }
}

function operationIdentityKeys(operation: OperationSpec, operationIndex?: number) {
  const keys = new Set<string>()
  const raw = operation as OperationSpec & { id?: string | number; key?: string | number }
  if (raw.id != null) keys.add(String(raw.id))
  if (raw.key != null) keys.add(String(raw.key))
  const nodeId = operation.meta?.nodeId
  if (typeof nodeId === 'string' || typeof nodeId === 'number') keys.add(String(nodeId))
  if (operationIndex != null) keys.add(`${raw.id ?? raw.key ?? operation.op ?? 'step'}_${operationIndex}`)
  return Array.from(keys).filter((key) => key.trim().length > 0)
}

export function storeGroupedBarOperationResult(
  operation: OperationSpec,
  operationIndex: number,
  result: DatumValue[],
) {
  for (const key of operationIdentityKeys(operation, operationIndex)) {
    storeRuntimeResult(key, result)
  }
}

function datumMatchesAverageScope(datum: DatumValue, operation: OperationSpec) {
  if (operation.group != null && String(groupKeyFromDatum(datum)) !== String(operation.group)) return false
  if (operation.field && operation.field !== 'value' && datum.measure !== operation.field) return false
  return true
}

function scopedAverageDatumKeys(state: ChainState, operation: OperationSpec) {
  return new Set(state.workingData.filter((datum) => datumMatchesAverageScope(datum, operation)).map(datumMarkKey))
}

function resolveNumericThreshold(operation: OperationSpec, workingData: DatumValue[]) {
  const rawValue = operation.value
  const numeric = Number(rawValue)
  if (Number.isFinite(numeric)) return numeric

  if (typeof rawValue === 'string' || typeof rawValue === 'number') {
    const preferredGroup = operation.group == null ? null : String(operation.group)
    const match = workingData.find((datum) => {
      const targetMatches = String(datum.target) === String(rawValue) || String(datum.id) === String(rawValue)
      if (!targetMatches) return false
      if (!preferredGroup) return true
      return String(groupKeyFromDatum(datum)) === preferredGroup
    })
    if (match && Number.isFinite(Number(match.value))) return Number(match.value)
  }

  return null
}

function resolveThresholdY(params: {
  bars: SVGRectElement[]
  threshold: number
}) {
  const exact = params.bars.find((node) => Number(node.getAttribute(DataAttributes.Value)) === params.threshold)
  if (exact) {
    const exactY = readNumberAttr(exact, SvgAttributes.Y)
    const exactH = readNumberAttr(exact, SvgAttributes.Height)
    const exactVal = Number(exact.getAttribute(DataAttributes.Value))
    if (exactY != null) {
      // Positive bars: the value level is at the rect's top (y).
      // Negative bars: D3 places y at the zero-line and extends height downward,
      // so the value level is at y + height.
      const valueY = exactVal >= 0 ? exactY : exactY + (exactH ?? 0)
      return accumulatedTranslate(exact).y + valueY
    }
  }

  const reference = params.bars.find((node) => {
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

  // zeroY = y + height (bar bottom in SVG coords).
  // For positive bars: y is the bar top (value level), y + height = zero line → zeroLineY = zeroY.
  // For negative bars: D3 sets y = zero line, height goes down → zeroLineY = y (not zeroY).
  // Unified: thresholdY = zeroLineY - threshold * pixelsPerValue always gives yScale(threshold).
  const zeroY = y + height
  const pixelsPerValue = height / Math.abs(value)
  const zeroLineY = value >= 0 ? zeroY : y
  const thresholdY = zeroLineY - params.threshold * pixelsPerValue
  return accumulatedTranslate(reference).y + thresholdY
}

function resolvePlotScopes(svg: d3.Selection<SVGSVGElement, unknown, null, undefined>): PlotScope[] {
  const svgNode = svg.node()
  if (!svgNode) return []

  const panels = Array.from(svgNode.querySelectorAll<SVGGElement>(`g[${DataAttributes.ChartId}]`))
  if (panels.length > 0) {
    return panels.map((group) => {
      const offset = accumulatedTranslate(group)
      const plotX = Number(group.getAttribute(DataAttributes.PanelPlotX) ?? 0)
      const plotWidth = Number(group.getAttribute(DataAttributes.PanelPlotWidth) ?? 0)
      return {
        key: group.getAttribute(DataAttributes.ChartId) ?? 'root',
        group,
        x1: offset.x + plotX,
        x2: offset.x + plotX + plotWidth,
      }
    })
  }

  const marginLeft = Number(svg.attr(DataAttributes.MarginLeft) ?? 0)
  const plotWidth = Number(svg.attr(DataAttributes.PlotWidth) ?? 0)
  return [{ key: 'root', group: null, x1: marginLeft, x2: marginLeft + plotWidth }]
}

function barsForScope(svgNode: SVGSVGElement, scope: PlotScope) {
  const root = scope.group ?? svgNode
  return Array.from(root.querySelectorAll<SVGRectElement>(`rect.${SvgClassNames.MainBar}`))
}

// Phase 4: the "Filtered: …" scope label was removed across all chart types.
// The chart itself (bar dim/remove, narrowed x-axis) communicates the active
// scope, so the redundant text label is no longer drawn. The helpers below are
// kept as no-ops so existing call sites in legacy runners compile unchanged.
function formatScopeLabel(_operation: OperationSpec, _result: DatumValue[]) {
  return ''
}

async function drawFilterScopeLabel(_params: {
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>
  label: string
}) {
  // intentionally empty — scope label is no longer rendered
}

async function drawFilterReferenceLines(params: {
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>
  threshold: number
}) {
  const svgNode = params.svg.node()
  if (!svgNode) return false

  const layer = ensureAnnotationLayer(params.svg)
  const viewport = resolveAnnotationViewport(params.svg)
  const scopes = resolvePlotScopes(params.svg)
  let drewLine = false

  for (const scope of scopes) {
    const bars = barsForScope(svgNode, scope)
    const y = resolveThresholdY({ bars, threshold: params.threshold })
    if (y == null) continue
    drewLine = true
    await drawReferenceLine({
      layer,
      cssClass: FILTER_ANNOTATION_CLASS,
      x1: scope.x1,
      x2: scope.x2,
      y,
      label: formatOperationValue(params.threshold),
      svg: params.svg,
      viewport,
    })
  }

  return drewLine
}

function plotBounds(scopes: PlotScope[]) {
  if (!scopes.length) return null
  return {
    x1: Math.min(...scopes.map((scope) => scope.x1)),
    x2: Math.max(...scopes.map((scope) => scope.x2)),
  }
}

function clampToRange(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min
  if (min > max) return (min + max) / 2
  return Math.max(min, Math.min(max, value))
}

function resolveSvgViewBoxBounds(svg: d3.Selection<SVGSVGElement, unknown, null, undefined>): SvgViewBoxBounds | null {
  const node = svg.node()
  if (!node) return null
  const viewBox = node.viewBox?.baseVal
  if (viewBox && Number.isFinite(viewBox.width) && viewBox.width > 0 && Number.isFinite(viewBox.height) && viewBox.height > 0) {
    return {
      x1: viewBox.x,
      x2: viewBox.x + viewBox.width,
      y1: viewBox.y,
      y2: viewBox.y + viewBox.height,
      width: viewBox.width,
      height: viewBox.height,
    }
  }

  const rawViewBox = svg.attr(SvgAttributes.ViewBox)?.trim()
  const parts = rawViewBox?.split(/\s+/).map(Number) ?? []
  if (parts.length === 4 && parts.every(Number.isFinite) && parts[2] > 0 && parts[3] > 0) {
    return {
      x1: parts[0],
      x2: parts[0] + parts[2],
      y1: parts[1],
      y2: parts[1] + parts[3],
      width: parts[2],
      height: parts[3],
    }
  }

  return null
}

function estimateAnnotationTextWidth(label: string) {
  return clampToRange(label.length * 7.2, 72, 168)
}

function resolveLegendX(svg: d3.Selection<SVGSVGElement, unknown, null, undefined>) {
  const legend = svg.select<SVGGElement>(`.${SvgClassNames.ColorLegend}`).node()
  if (!legend) return null
  const translated = parseTranslate(legend.getAttribute(SvgAttributes.Transform))
  return Number.isFinite(translated.x) ? translated.x : null
}

function resolveGroupedDiffAnnotationGeometry(params: {
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>
  bounds: { x1: number; x2: number }
  label: string
  midY: number
}): GroupedDiffAnnotationGeometry | null {
  const viewBox = resolveSvgViewBoxBounds(params.svg)
  if (!viewBox) return null

  const labelWidth = estimateAnnotationTextWidth(params.label)
  const edgePadding = 8
  const labelGap = 12
  const arrowHeadPadding = 12
  const legendPadding = 12
  const legendX = resolveLegendX(params.svg)
  const plotRightBound = Math.min(
    params.bounds.x2,
    viewBox.x2 - edgePadding,
    legendX == null ? viewBox.x2 - edgePadding : legendX - legendPadding,
  )
  const plotWidth = Math.max(0, params.bounds.x2 - params.bounds.x1)
  const laneInset = clampToRange(plotWidth * 0.04, 36, 72)
  const desiredArrowX = params.bounds.x2 - laneInset
  const minArrowX = Math.max(
    viewBox.x1 + edgePadding + labelWidth + labelGap,
    params.bounds.x1 + labelWidth + labelGap,
  )
  const maxArrowX = plotRightBound - arrowHeadPadding
  const arrowX = clampToRange(
    desiredArrowX,
    minArrowX,
    maxArrowX,
  )
  const labelViewportX = Math.max(viewBox.x1 + edgePadding, params.bounds.x1)
  return {
    arrowX,
    labelPreferred: { x: arrowX - labelGap, y: params.midY },
    labelAnchor: 'end',
    labelViewport: {
      x: labelViewportX,
      y: viewBox.y1 + edgePadding,
      width: Math.max(0, plotRightBound - labelViewportX),
      height: Math.max(0, viewBox.height - edgePadding * 2),
    },
    annotationRightBound: plotRightBound,
    legendX,
  }
}

function operationNextDebugEnabled() {
  return Boolean((globalThis as { __OPERATION_NEXT_DEBUG__?: unknown }).__OPERATION_NEXT_DEBUG__)
}

function roundedNumber(value: number) {
  return Number.isFinite(value) ? Number(value.toFixed(2)) : value
}

type RectLike = {
  x: number
  y: number
  width: number
  height: number
  left?: number
  right?: number
  top?: number
  bottom?: number
}

function summarizeRect(rect: RectLike | null | undefined) {
  if (!rect) return null
  const left = typeof rect.left === 'number' ? rect.left : rect.x
  const right = typeof rect.right === 'number' ? rect.right : rect.x + rect.width
  const top = typeof rect.top === 'number' ? rect.top : rect.y
  const bottom = typeof rect.bottom === 'number' ? rect.bottom : rect.y + rect.height
  return {
    x: roundedNumber(rect.x),
    y: roundedNumber(rect.y),
    width: roundedNumber(rect.width),
    height: roundedNumber(rect.height),
    left: roundedNumber(left),
    right: roundedNumber(right),
    top: roundedNumber(top),
    bottom: roundedNumber(bottom),
  }
}

function summarizeSvgBBox(node: SVGGraphicsElement | null | undefined) {
  if (!node) return null
  try {
    return summarizeRect(node.getBBox())
  } catch {
    return null
  }
}

function summarizeSvgScreenRect(node: SVGGraphicsElement | SVGSVGElement | null | undefined) {
  if (!node) return null
  return summarizeRect(node.getBoundingClientRect())
}

function logGroupedDiffDebug(label: string, payload: Record<string, unknown>) {
  try {
    console.info('[grouped-diff-debug]', label, JSON.stringify(payload))
  } catch {
    console.info('[grouped-diff-debug]', label, payload)
  }
}

function groupedDiffLayoutSnapshot(
  container: HTMLElement,
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
  layer?: d3.Selection<SVGGElement, unknown, null, undefined>,
) {
  const svgNode = svg.node()
  if (!svgNode) return null
  const layerNode = layer?.node()
  const legendNode = svg.select<SVGGElement>(`.${SvgClassNames.ColorLegend}`).node()
  const diffLabelNode = layer?.select<SVGTextElement>(`.${DIFF_ANNOTATION_CLASS}.difference-label`).node()
  const diffArrowNodes = layer?.selectAll<SVGLineElement, unknown>(`line.${DIFF_ANNOTATION_CLASS}`).nodes() ?? []
  const viewBox = svgNode.viewBox?.baseVal
  return {
    viewBox: svgNode.getAttribute(SvgAttributes.ViewBox),
    viewBoxBounds: viewBox
      ? {
          x1: roundedNumber(viewBox.x),
          x2: roundedNumber(viewBox.x + viewBox.width),
          y1: roundedNumber(viewBox.y),
          y2: roundedNumber(viewBox.y + viewBox.height),
          width: roundedNumber(viewBox.width),
          height: roundedNumber(viewBox.height),
        }
      : null,
    svgRect: summarizeSvgScreenRect(svgNode),
    host: {
      clientWidth: container.clientWidth,
      scrollWidth: container.scrollWidth,
      offsetWidth: container.offsetWidth,
    },
    attrs: {
      width: svgNode.getAttribute(SvgAttributes.Width),
      height: svgNode.getAttribute(SvgAttributes.Height),
      lockWidth: svgNode.getAttribute('data-workbench-svg-lock-width'),
      lockHeight: svgNode.getAttribute('data-workbench-svg-lock-height'),
      styleWidth: svgNode.style.width || null,
      styleHeight: svgNode.style.height || null,
      styleMinWidth: svgNode.style.minWidth || null,
      styleMaxWidth: svgNode.style.maxWidth || null,
      marginLeft: svgNode.getAttribute(DataAttributes.MarginLeft),
      plotWidth: svgNode.getAttribute(DataAttributes.PlotWidth),
      xField: svgNode.getAttribute(DataAttributes.XField),
      yField: svgNode.getAttribute(DataAttributes.YField),
    },
    legend: {
      transform: legendNode?.getAttribute(SvgAttributes.Transform) ?? null,
      bbox: summarizeSvgBBox(legendNode),
      screenRect: summarizeSvgScreenRect(legendNode),
      resolvedX: resolveLegendX(svg),
    },
    annotation: {
      bbox: summarizeSvgBBox(layerNode),
      screenRect: summarizeSvgScreenRect(layerNode),
      childCount: layerNode?.childElementCount ?? 0,
    },
    diffLabel: {
      attrs: diffLabelNode
        ? {
            x: diffLabelNode.getAttribute(SvgAttributes.X),
            y: diffLabelNode.getAttribute(SvgAttributes.Y),
            anchor: diffLabelNode.getAttribute(SvgAttributes.TextAnchor),
            text: diffLabelNode.textContent,
          }
        : null,
      bbox: summarizeSvgBBox(diffLabelNode),
      screenRect: summarizeSvgScreenRect(diffLabelNode),
    },
    diffArrowCount: diffArrowNodes.length,
  }
}

async function drawGroupedDiffLabel(params: {
  layer: d3.Selection<SVGGElement, unknown, null, undefined>
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>
  label: string
  geometry: GroupedDiffAnnotationGeometry
}) {
  const labelNode = params.layer
    .append(SvgElements.Text)
    .attr(SvgAttributes.Class, `${SvgClassNames.TextAnnotation} ${DIFF_ANNOTATION_CLASS} difference-label`)
    .attr(SvgAttributes.X, params.geometry.labelPreferred.x)
    .attr(SvgAttributes.Y, params.geometry.labelPreferred.y)
    .attr(SvgAttributes.TextAnchor, params.geometry.labelAnchor)
    .attr(SvgAttributes.DominantBaseline, 'middle')
    .attr(SvgAttributes.FontSize, 12)
    .attr(SvgAttributes.FontWeight, 700)
    .attr(SvgAttributes.Fill, COLORS.ANNOTATION_RED)
    .style(SvgAttributes.Opacity, 0)
    .text(params.label)

  placeOperationTextLabel({
    svg: params.svg,
    text: labelNode,
    preferred: params.geometry.labelPreferred,
    viewport: params.geometry.labelViewport,
  })

  try {
    await labelNode
      .transition()
      .duration(DURATIONS.LABEL_FADE_IN)
      .ease(EASINGS.SMOOTH)
      .style(SvgAttributes.Opacity, 1)
      .end()
  } catch {
    // interrupted
  }
}

function resolveReferenceLineSegments(params: {
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>
  value: number
}) {
  const svgNode = params.svg.node()
  if (!svgNode) return []
  return resolvePlotScopes(params.svg)
    .map((scope) => {
      const y = resolveThresholdY({
        bars: barsForScope(svgNode, scope),
        threshold: params.value,
      })
      return y == null ? null : { scope, y }
    })
    .filter((segment): segment is { scope: PlotScope; y: number } => segment != null)
}

function referenceLineForResultRef(
  layer: d3.Selection<SVGGElement, unknown, null, undefined>,
  resultRef: string | null | undefined,
) {
  if (!resultRef) return null
  const found = layer
    .selectAll<SVGLineElement, unknown>(`line[${RESULT_REF_ATTRIBUTE}]`)
    .nodes()
    .find((node) => node.getAttribute(RESULT_REF_ATTRIBUTE) === resultRef) ?? null
  if (!found) return null

  const y = readNumberAttr(found, SvgAttributes.Y1)
  if (y == null) return null
  return {
    node: found,
    y,
  }
}

async function drawGlobalReferenceLine(params: {
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>
  layer: d3.Selection<SVGGElement, unknown, null, undefined>
  cssClass: string
  value: number
  label?: string
  resultRef?: string | null
  role: 'average-reference' | 'diff-reference'
}) {
  const viewport = resolveAnnotationViewport(params.svg)
  const segments = resolveReferenceLineSegments({ svg: params.svg, value: params.value })
  if (!segments.length) return null
  const bounds = plotBounds(segments.map((segment) => segment.scope))
  if (!bounds) return null

  const y = segments[0].y
  await drawReferenceLine({
    layer: params.layer,
    cssClass: params.cssClass,
    x1: bounds.x1,
    x2: bounds.x2,
    y,
    label: params.label,
    svg: params.svg,
    viewport,
  })

  params.layer
    .selectAll<SVGElement, unknown>(`.${params.cssClass}`)
    .filter(function () {
      return this.getAttribute(OPERATION_ROLE_ATTRIBUTE) == null
    })
    .attr(OPERATION_ROLE_ATTRIBUTE, params.role)

  if (params.resultRef) {
    params.layer
      .selectAll<SVGElement, unknown>(`.${params.cssClass}`)
      .filter(function () {
        return this.getAttribute(RESULT_REF_ATTRIBUTE) == null
      })
      .attr(RESULT_REF_ATTRIBUTE, params.resultRef)
  }

  return {
    y,
  }
}

async function annotateGroupedBarAverage(
  container: HTMLElement,
  result: DatumValue[],
  operation: OperationSpec,
  state: ChainState,
  referencedResultIds?: string[],
) {
  const average = Number(result[0]?.value)
  if (!Number.isFinite(average)) return

  const svg = d3.select(container).select<SVGSVGElement>(SvgElements.Svg)
  if (svg.empty()) return
  const layer = ensureAnnotationLayer(svg)
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

  const bars = svg.selectAll<SVGElement, unknown>(`rect.${SvgClassNames.MainBar}`)
  const shouldApplyScopeSalience = operation.group != null || state.salienceMap.size > 0
  let nextSalienceMap = state.salienceMap
  if (shouldApplyScopeSalience) {
    const scopedKeys = scopedAverageDatumKeys(state, operation)
    await applyMarkSalience({
      marks: bars,
      isInScope: (node) => {
        const key = nodeMarkKey(node)
        if (operation.group != null) return scopedKeys.has(key)
        return (state.salienceMap.get(key) ?? OPACITIES.FULL) >= OPACITIES.FULL
      },
    })
    nextSalienceMap = new Map<string, number>()
    bars.each(function () {
      const key = nodeMarkKey(this as SVGElement)
      const inScope = operation.group != null
        ? scopedKeys.has(key)
        : (state.salienceMap.get(key) ?? OPACITIES.FULL) >= OPACITIES.FULL
      nextSalienceMap.set(key, inScope ? OPACITIES.FULL : OPACITIES.DIM)
    })
  }

  const labelText = state.salienceMap.size > 0
    ? `Avg (filtered): ${formatOperationValue(average)}`
    : `Average: ${formatOperationValue(average)}`

  const resultRef = operationResultRef(operation)
  const existingReference = referenceLineForResultRef(layer, resultRef)
  if (!existingReference) {
    await drawGlobalReferenceLine({
      svg,
      layer,
      cssClass: AVERAGE_ANNOTATION_CLASS,
      value: average,
      label: labelText,
      resultRef,
      role: 'average-reference',
    })
  }

  state.salienceMap = nextSalienceMap
  state.annotationRecords.push({
    cssClass: AVERAGE_ANNOTATION_CLASS,
    role: persistent ? 'anchor' : 'result',
    persistent,
    operationId: resultRef == null ? undefined : String(resultRef),
    resultRef: resultRef == null ? undefined : String(resultRef),
  })
}

async function annotateGroupedBarDiff(
  container: HTMLElement,
  result: DatumValue[],
  operation: OperationSpec,
  state: ChainState,
  surfaceManager?: SurfaceManager,
) {
  const differenceValue = Number(result[0]?.value)
  if (!Number.isFinite(differenceValue)) return

  if (
    await tryDrawSplitScalarDiffAnnotation({
      container,
      surfaceManager,
      operation,
      result,
    })
  ) {
    state.annotationRecords.push({ cssClass: DIFF_ANNOTATION_CLASS, role: 'anchor', persistent: true })
    return
  }

  const selectors = diffEndpointSelectors(operation)
  const aggregateHint = typeof operation.aggregate === 'string' ? operation.aggregate : undefined
  const svg = d3.select(container).select<SVGSVGElement>(SvgElements.Svg)
  if (svg.empty()) return
  const layer = ensureAnnotationLayer(svg)
  const debugBefore = groupedDiffLayoutSnapshot(container, svg, layer)
  applyAnnotationContextTransitions(layer, state.annotationRecords, FILTER_ANNOTATION_CLASS)

  // diff → diff (merge policy): when a prior persistent diff annotation exists AND
  // both endpoints are derived ref keys, we are in a "diff of diffs" sequence.
  // Keep the prior bracket as context (fade its lines) rather than removing it.
  const hasPriorDiff = state.annotationRecords.some(
    (r) => r.cssClass === DIFF_ANNOTATION_CLASS && r.persistent,
  )
  const derivedA = resolveDerivedDiffEndpoint(selectors.targetA, aggregateHint)
  const derivedB = resolveDerivedDiffEndpoint(selectors.targetB, aggregateHint)
  const isDiffOfDiffs = hasPriorDiff && derivedA != null && derivedB != null
  if (isDiffOfDiffs) {
    // Fade prior diff lines to context opacity — mirrors how filter lines are handled.
    layer
      .selectAll<SVGLineElement, unknown>(`line.${DIFF_ANNOTATION_CLASS}`)
      .interrupt()
      .transition()
      .duration(200)
      .style(SvgAttributes.Opacity, 0.3)
  } else {
    layer.selectAll(`.${DIFF_ANNOTATION_CLASS}`).interrupt().remove()
  }

  const bounds = plotBounds(resolvePlotScopes(svg))
  if (!bounds) return
  const markA = derivedA ? null : findBarBySelector(svg, selectors.targetA)
  const markB = derivedB ? null : findBarBySelector(svg, selectors.targetB)
  const existingA = derivedA ? referenceLineForResultRef(layer, derivedA.refKey) : null
  const existingB = derivedB ? referenceLineForResultRef(layer, derivedB.refKey) : null
  const referenceA = derivedA
    ? existingA ?? await drawGlobalReferenceLine({
        svg,
        layer,
        cssClass: DIFF_ANNOTATION_CLASS,
        value: derivedA.value,
        resultRef: derivedA.refKey,
        role: 'diff-reference',
      })
    : null
  const referenceB = derivedB
    ? existingB ?? await drawGlobalReferenceLine({
        svg,
        layer,
        cssClass: DIFF_ANNOTATION_CLASS,
        value: derivedB.value,
        resultRef: derivedB.refKey,
        role: 'diff-reference',
      })
    : null
  const markMetricsA = markA ? barRootMetrics(markA) : null
  const markMetricsB = markB ? barRootMetrics(markB) : null
  const a = derivedA && referenceA
    ? { value: derivedA.value, y: referenceA.y, fromExistingReference: Boolean(existingA) }
    : markMetricsA
      ? { value: markMetricsA.value, y: markMetricsA.y, fromExistingReference: false }
      : null
  const b = derivedB && referenceB
    ? { value: derivedB.value, y: referenceB.y, fromExistingReference: Boolean(existingB) }
    : markMetricsB
      ? { value: markMetricsB.value, y: markMetricsB.y, fromExistingReference: false }
      : null
  if (!a || !b) {
    console.warn('[operation-next] grouped/stacked-bar diff: targetA or targetB could not be resolved for annotation.', { operation })
    return
  }
  const topY = Math.min(a.y, b.y)
  const bottomY = Math.max(a.y, b.y)
  const label = `Difference: ${formatOperationValue(differenceValue)}`
  const geometry = resolveGroupedDiffAnnotationGeometry({
    svg,
    bounds,
    label,
    midY: (topY + bottomY) / 2,
  })
  if (!geometry) return
  logGroupedDiffDebug('before-draw', {
    before: debugBefore,
    bounds,
    endpoints: {
      a: {
        value: a.value,
        y: a.y,
        fromExistingReference: a.fromExistingReference,
        derivedRef: derivedA?.refKey ?? null,
      },
      b: {
        value: b.value,
        y: b.y,
        fromExistingReference: b.fromExistingReference,
        derivedRef: derivedB?.refKey ?? null,
      },
    },
    label,
    geometry,
    viewBox: resolveSvgViewBoxBounds(svg),
  })

  await drawVerticalComparisonArrow({
    layer,
    cssClass: DIFF_ANNOTATION_CLASS,
    x: geometry.arrowX,
    topY,
    bottomY,
    refLines: [
      a.fromExistingReference ? null : { startX: bounds.x1, y: a.y },
      b.fromExistingReference ? null : { startX: bounds.x1, y: b.y },
    ].filter((line): line is { startX: number; y: number } => line != null),
    color: COLORS.ANNOTATION_RED,
  })
  await drawGroupedDiffLabel({ layer, svg, label, geometry })
  logGroupedDiffDebug('after-label', {
    after: groupedDiffLayoutSnapshot(container, svg, layer),
    geometry,
    label,
  })

  layer
    .selectAll<SVGElement, unknown>(`.${DIFF_ANNOTATION_CLASS}`)
    .filter(function () {
      return this.getAttribute(OPERATION_ROLE_ATTRIBUTE) == null
    })
    .attr(OPERATION_ROLE_ATTRIBUTE, 'diff-arrow')
  const resultRef = operationResultRef(operation)
  if (resultRef) {
    layer
      .selectAll<SVGElement, unknown>(`.${DIFF_ANNOTATION_CLASS}`)
      .filter(function () {
        return this.getAttribute(RESULT_REF_ATTRIBUTE) == null
      })
      .attr(RESULT_REF_ATTRIBUTE, resultRef)
  }

  if (operationNextDebugEnabled()) {
    console.log('[operation-next-debug] grouped-diff-layout', {
      before: debugBefore,
      after: groupedDiffLayoutSnapshot(container, svg, layer),
      geometry,
    })
  }

  state.annotationRecords.push({ cssClass: DIFF_ANNOTATION_CLASS, role: 'anchor', persistent: true })
}

export async function runGroupedBarFilterOperation(
  container: HTMLElement,
  operation: OperationSpec,
  state: ChainState,
): Promise<FilterRunResult> {
  const result = filterData(state.workingData, operation)
  const svg = d3.select(container).select<SVGSVGElement>(SvgElements.Svg)
  if (svg.empty()) {
    return { result, nextState: { ...state, workingData: result, lastResult: result } }
  }

  const layer = ensureAnnotationLayer(svg)

  // Fade prior persistent annotations (average ref lines, diff brackets, etc.) to
  // context style before the filter visual takes over. Mirrors annotateFilter in
  // simpleBar / simpleLine / multipleLine.
  applyAnnotationContextTransitions(layer, state.annotationRecords, FILTER_ANNOTATION_CLASS)

  layer.selectAll(`.${FILTER_ANNOTATION_CLASS}`).interrupt().remove()

  const resultKeys = new Set(result.map(datumMarkKey))
  const bars = svg.selectAll<SVGElement, unknown>(`rect.${SvgClassNames.MainBar}`)
  await applyMarkSalience({
    marks: bars,
    isInScope: (node) => resultKeys.has(nodeMarkKey(node)),
  })

  const threshold = resolveNumericThreshold(operation, state.workingData)
  let hasAnchor = false
  if (threshold != null) {
    hasAnchor = await drawFilterReferenceLines({ svg, threshold })
  }
  if (!hasAnchor) {
    await drawFilterScopeLabel({ svg, label: formatScopeLabel(operation, result) })
  }

  const nextSalienceMap = new Map<string, number>()
  bars.each(function () {
    const key = nodeMarkKey(this as SVGElement)
    nextSalienceMap.set(key, resultKeys.has(key) ? 1 : 0.2)
  })

  const nextState: ChainState = {
    ...state,
    workingData: result,
    derivedData: null,
    lastResult: result,
    salienceMap: nextSalienceMap,
  }
  nextState.annotationRecords.push({ cssClass: FILTER_ANNOTATION_CLASS, role: 'anchor', persistent: true })

  return { result, nextState }
}

export async function runGroupedBarAverageOperation(
  container: HTMLElement,
  operation: OperationSpec,
  state: ChainState,
  referencedResultIds?: string[],
): Promise<OperationRunResult> {
  const result = averageData(state.workingData, operation)

  // Phase 4: group-scoped average on a stacked or grouped chart converts the
  // chart to a simple bar showing only that group's segments, then draws the
  // average reference line on the simple bar.
  const group = operation.group
  const groupStr = group == null ? '' : String(group).trim()
  if (groupStr) {
    const runtimeState = getRuntimeChartState(container)
    let source = groupAverageSourceSpec.get(container)
    if (
      !source &&
      runtimeState &&
      (runtimeState.chartType === ChartType.STACKED_BAR ||
        runtimeState.chartType === ChartType.GROUPED_BAR)
    ) {
      source = { type: runtimeState.chartType, spec: runtimeState.spec }
      groupAverageSourceSpec.set(container, source)
    }
    if (source) {
      // Build a simple-bar spec from the source whose data.values are NARROWED
      // to (a) the retained targets (post-filter) and (b) only the rows for
      // this group. Then render it directly. This is robust across:
      //   - first conversion from stacked/grouped → simple-bar (animation-free)
      //   - subsequent conversions where the live chart is already simple-bar
      //     (convertStackedToSimple's stacked-segment animation would no-op).
      const convertedSpec = buildSimpleBarFromGroup(source, groupStr, state.workingData)
      if (convertedSpec) {
        const rows = (convertedSpec.data as { values?: Record<string, unknown>[] } | undefined)?.values ?? []
        // Update simple-bar stored data so subsequent simple-bar runs see the
        // narrowed group rows rather than the original stacked dataset.
        setSimpleBarStoredData(container, rows as Record<string, JsonValue>[])
        await renderSimpleBarChart(container, convertedSpec)
        storeRuntimeChartState(container, {
          chartType: ChartType.SIMPLE_BAR,
          spec: convertedSpec,
          renderer: 'd3',
        })
        console.info('[operation-next] grouped-bar average: converted to simple-bar', {
          group: groupStr,
          sourceType: source.type,
          rowsAfterFilter: rows.length,
          rowSample: rows.slice(0, 3),
          opId: (operation as { id?: string }).id ?? null,
        })
        await annotateConvertedGroupAverage(container, result, operation, state, referencedResultIds, groupStr)
        return {
          result,
          nextState: {
            ...state,
            derivedData: null,
            lastResult: result,
            // After conversion the simple-bar has no dim marks — salience map
            // is no longer meaningful; reset to empty so downstream ops don't
            // try to re-apply stacked-era opacities.
            salienceMap: new Map(),
          },
        }
      }
    }
  }

  await annotateGroupedBarAverage(container, result, operation, state, referencedResultIds)
  return {
    result,
    nextState: {
      ...state,
      derivedData: null,
      lastResult: result,
      salienceMap: state.salienceMap,
    },
  }
}

/**
 * Build a SimpleBarSpec containing only rows where the color/group field
 * matches `groupStr` AND whose x-axis target is in the retained set
 * (post-filter). Returns null if the source spec's encoding is incomplete or
 * the resulting filter would leave no rows.
 */
function buildSimpleBarFromGroup(
  source: { type: ChartTypeValue; spec: ChartSpec },
  groupStr: string,
  workingData: DatumValue[],
): SimpleBarSpec | null {
  const spec = source.spec as ChartSpec & {
    encoding: {
      x?: { field?: string; type?: string; sort?: JsonValue; axis?: JsonValue }
      y?: { field?: string; type?: string; scale?: JsonValue }
      color?: { field?: string }
      xOffset?: { field?: string }
    }
  }
  const xField = spec.encoding?.x?.field
  const yField = spec.encoding?.y?.field
  const xType = spec.encoding?.x?.type ?? 'nominal'
  const yType = spec.encoding?.y?.type ?? 'quantitative'
  if (!xField || !yField) return null
  // For stacked, series is `color.field`. For grouped, it's either `xOffset.field`
  // or `color.field` (some authoring shapes keep the encoding on color).
  const seriesField =
    source.type === ChartType.GROUPED_BAR && spec.encoding?.xOffset?.field
      ? spec.encoding.xOffset.field
      : spec.encoding?.color?.field
  if (!seriesField) return null

  const sourceValues = Array.isArray((spec.data as { values?: unknown[] } | undefined)?.values)
    ? ((spec.data as { values: unknown[] }).values as Record<string, JsonValue>[])
    : []
  if (sourceValues.length === 0) return null

  const retained = new Set(workingData.map((d) => String(d.target)))
  const usefulRetained = retained.size > 0

  const rows = sourceValues.filter((row) => {
    if (String(row[seriesField]) !== groupStr) return false
    if (usefulRetained && !retained.has(String(row[xField]))) return false
    return true
  })
  if (rows.length === 0) return null

  // Strip the series column from the final simple-bar rows — it's no longer
  // an encoded dimension, just a left-over key from the stacked dataset.
  const cleanedRows = rows.map((row) => {
    const next: Record<string, JsonValue> = {}
    for (const key of Object.keys(row)) {
      if (key === seriesField) continue
      next[key] = row[key]
    }
    return next
  })

  return {
    $schema: spec.$schema,
    data: { values: cleanedRows },
    mark: 'bar',
    encoding: {
      x: { field: xField, type: xType, sort: spec.encoding?.x?.sort ?? null, axis: spec.encoding?.x?.axis },
      y: { field: yField, type: yType, scale: spec.encoding?.y?.scale },
    },
  } as unknown as SimpleBarSpec
}

/**
 * Average annotation drawn on a chart that was just converted from
 * stacked/grouped → simple-bar via `buildSimpleBarFromGroup` +
 * `renderSimpleBarChart`. Differs from `annotateGroupedBarAverage` in that it
 * skips the scope-salience step (the simple-bar already contains only the
 * in-scope group's bars, so there's nothing to dim).
 */
async function annotateConvertedGroupAverage(
  container: HTMLElement,
  result: DatumValue[],
  operation: OperationSpec,
  state: ChainState,
  referencedResultIds: string[] | undefined,
  groupLabel: string,
) {
  const average = Number(result[0]?.value)
  if (!Number.isFinite(average)) return

  const svg = d3.select(container).select<SVGSVGElement>(SvgElements.Svg)
  if (svg.empty()) return
  const layer = ensureAnnotationLayer(svg)
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

  const labelText = `Avg (${groupLabel}): ${formatOperationValue(average)}`
  const resultRef = operationResultRef(operation)
  const existingReference = referenceLineForResultRef(layer, resultRef)
  if (!existingReference) {
    await drawGlobalReferenceLine({
      svg,
      layer,
      cssClass: AVERAGE_ANNOTATION_CLASS,
      value: average,
      label: labelText,
      resultRef,
      role: 'average-reference',
    })
  }

  state.annotationRecords.push({
    cssClass: AVERAGE_ANNOTATION_CLASS,
    role: persistent ? 'anchor' : 'result',
    persistent,
    operationId: resultRef == null ? undefined : String(resultRef),
    resultRef: resultRef == null ? undefined : String(resultRef),
  })
}

export async function runGroupedBarDiffOperation(
  container: HTMLElement,
  operation: OperationSpec,
  state: ChainState,
  surfaceManager?: SurfaceManager,
): Promise<OperationRunResult> {
  let result: DatumValue[] = []
  try {
    result = diffData(state.workingData, operation)
  } catch (error) {
    console.warn('[operation-next] grouped-bar diff: unable to compute diff.', { operation, error })
    return { result, nextState: { ...state, lastResult: result } }
  }

  await annotateGroupedBarDiff(container, result, operation, state, surfaceManager)
  return {
    result,
    nextState: {
      ...state,
      derivedData: null,
      lastResult: result,
    },
  }
}

export async function runStackedBarFilterOperation(
  container: HTMLElement,
  spec: ChartSpec,
  operation: OperationSpec,
): Promise<{ active: ActiveBarChartState; result: DatumValue[] }> {
  const active = createBarChartState(container, ChartType.STACKED_BAR, spec)
  const filtered = await runGroupedBarFilterOperation(container, operation, active.chainState)
  return {
    active: {
      ...active,
      chainState: filtered.nextState,
    },
    result: filtered.result,
  }
}

export async function runBarTransformOperation(
  container: HTMLElement,
  active: ActiveBarChartState,
  operation: DrawOp,
): Promise<ActiveBarChartState> {
  let transformed: StackGroupTransformResult | null = null
  if (operation.action === DrawAction.StackedToGrouped && active.chartType === ChartType.STACKED_BAR) {
    transformed = await convertStackedToGrouped(container, active.spec as StackedSpec, operation.stackGroup)
  } else if (operation.action === DrawAction.GroupedToStacked && active.chartType === ChartType.GROUPED_BAR) {
    transformed = await convertGroupedToStacked(container, active.spec as GroupedSpec, operation.stackGroup)
  } else if (operation.action === DrawAction.StackedToDiverging && active.chartType === ChartType.STACKED_BAR) {
    // Centered (diverging) stacked bar. Conversion mutates the chart in-place;
    // chart type stays STACKED_BAR but spec.encoding.y.stack becomes 'center'.
    await convertStackedToDiverging(container, active.spec as StackedSpec)
    const next = getRuntimeChartState(container)
    if (next) {
      return createBarChartState(container, next.chartType, next.spec)
    }
    return active
  }

  if (operation.action === DrawAction.StackedToSimple && active.chartType === ChartType.STACKED_BAR && operation.toSimple) {
    const simple = await convertStackedToSimple(container, active.spec as StackedSpec, operation.toSimple)
    return simple
      ? {
          chartType: ChartType.SIMPLE_BAR,
          spec: simple,
          chainState: createChainState(getBarDatumValues(container, ChartType.SIMPLE_BAR, simple)),
        }
      : active
  }

  if (operation.action === DrawAction.GroupedToSimple && active.chartType === ChartType.GROUPED_BAR && operation.toSimple) {
    const simple = await convertGroupedToSimple(container, active.spec as GroupedSpec, operation.toSimple)
    return simple
      ? {
          chartType: ChartType.SIMPLE_BAR,
          spec: simple,
          chainState: createChainState(getBarDatumValues(container, ChartType.SIMPLE_BAR, simple)),
        }
      : active
  }

  if (!transformed) return active
  return createBarChartState(container, transformed.chartType, transformed.spec)
}

// ---------------------------------------------------------------------------
// findExtremum / retrieveValue / nth — shared for grouped + stacked bars.
//
// All three ops select one or more bars from the dataset and visualize them
// identically: color the bar red and append a value label above. Difference
// between the three is purely in the data-selection function used
// (findExtremum / retrieveValue / nthData) — the annotation layer is shared.
// ---------------------------------------------------------------------------

const GROUPED_BAR_EXTREMUM_CLASS = 'operation-next-grouped-bar-extremum'
const GROUPED_BAR_RETRIEVE_CLASS = 'operation-next-grouped-bar-retrieve-value'
const GROUPED_BAR_NTH_CLASS = 'operation-next-grouped-bar-nth'
const STACKED_BAR_EXTREMUM_CLASS = 'operation-next-stacked-bar-extremum'
const STACKED_BAR_RETRIEVE_CLASS = 'operation-next-stacked-bar-retrieve-value'
const STACKED_BAR_NTH_CLASS = 'operation-next-stacked-bar-nth'

function findBarsByDatum(
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
  datum: DatumValue,
): d3.Selection<SVGRectElement, unknown, null, undefined> {
  const target = datum.target == null ? null : String(datum.target)
  const group = datum.group == null ? null : String(datum.group)
  return svg
    .selectAll<SVGRectElement, unknown>(`rect.${SvgClassNames.MainBar}`)
    .filter(function () {
      const node = this as SVGRectElement
      if (target != null) {
        const tMatch =
          node.getAttribute(DataAttributes.Target) === target ||
          node.getAttribute(DataAttributes.Id) === target
        if (!tMatch) return false
      }
      if (group != null) {
        const gMatch =
          node.getAttribute(DataAttributes.Series) === group ||
          node.getAttribute(DataAttributes.GroupValue) === group
        if (!gMatch) return false
      }
      return true
    })
}

async function annotateBarSelection(
  container: HTMLElement,
  result: DatumValue[],
  state: ChainState,
  cssClass: string,
): Promise<void> {
  if (result.length === 0) return
  const svg = d3.select(container).select<SVGSVGElement>(SvgElements.Svg)
  if (svg.empty()) return
  const layer = ensureAnnotationLayer(svg)

  applyAnnotationContextTransitions(layer, state.annotationRecords, FILTER_ANNOTATION_CLASS)
  layer.selectAll(`.${cssClass}`).interrupt().remove()

  for (const datum of result) {
    const bars = findBarsByDatum(svg, datum)
    const rect = bars.nodes()[0]
    if (!rect) continue
    const metrics = barRootMetrics(rect)
    bars
      .interrupt()
      .transition()
      .duration(DURATIONS.HIGHLIGHT)
      .style(SvgAttributes.Fill, COLORS.ANNOTATION_RED)

    const labelText = formatOperationValue(metrics.value)
    const labelY = Math.max(12, metrics.y - 10)
    const labelNode = layer
      .append(SvgElements.Text)
      .attr(SvgAttributes.Class, `${SvgClassNames.TextAnnotation} ${cssClass}`)
      .attr(SvgAttributes.X, metrics.x)
      .attr(SvgAttributes.Y, labelY)
      .attr(SvgAttributes.TextAnchor, 'middle')
      .attr(SvgAttributes.FontSize, 12)
      .attr(SvgAttributes.FontWeight, 700)
      .attr(SvgAttributes.Fill, COLORS.TEXT_DARK)
      .style(SvgAttributes.Opacity, 0)
      .text(labelText)
    try {
      await labelNode
        .transition()
        .duration(DURATIONS.LABEL_FADE_IN)
        .ease(EASINGS.SMOOTH)
        .style(SvgAttributes.Opacity, 1)
        .end()
    } catch {
      /* interrupted */
    }
  }

  state.annotationRecords.push({ cssClass, role: 'result', persistent: false })
}

export async function runGroupedBarFindExtremumOperation(
  container: HTMLElement,
  operation: OperationSpec,
  state: ChainState,
): Promise<OperationRunResult> {
  const result = findExtremum(state.workingData, operation)
  await annotateBarSelection(container, result, state, GROUPED_BAR_EXTREMUM_CLASS)
  return { result, nextState: { ...state, lastResult: result } }
}

export async function runGroupedBarRetrieveValueOperation(
  container: HTMLElement,
  operation: OperationSpec,
  state: ChainState,
): Promise<OperationRunResult> {
  const result = retrieveValue(state.workingData, operation)
  await annotateBarSelection(container, result, state, GROUPED_BAR_RETRIEVE_CLASS)
  return { result, nextState: { ...state, lastResult: result } }
}

export async function runGroupedBarNthOperation(
  container: HTMLElement,
  operation: OperationSpec,
  state: ChainState,
): Promise<OperationRunResult> {
  const result = nthData(state.workingData, operation)
  await annotateBarSelection(container, result, state, GROUPED_BAR_NTH_CLASS)
  return { result, nextState: { ...state, lastResult: result } }
}

export async function runStackedBarFindExtremumOperation(
  container: HTMLElement,
  operation: OperationSpec,
  state: ChainState,
): Promise<OperationRunResult> {
  const result = findExtremum(state.workingData, operation)
  await annotateBarSelection(container, result, state, STACKED_BAR_EXTREMUM_CLASS)
  return { result, nextState: { ...state, lastResult: result } }
}

export async function runStackedBarRetrieveValueOperation(
  container: HTMLElement,
  operation: OperationSpec,
  state: ChainState,
): Promise<OperationRunResult> {
  const result = retrieveValue(state.workingData, operation)
  await annotateBarSelection(container, result, state, STACKED_BAR_RETRIEVE_CLASS)
  return { result, nextState: { ...state, lastResult: result } }
}

export async function runStackedBarNthOperation(
  container: HTMLElement,
  operation: OperationSpec,
  state: ChainState,
): Promise<OperationRunResult> {
  const result = nthData(state.workingData, operation)
  await annotateBarSelection(container, result, state, STACKED_BAR_NTH_CLASS)
  return { result, nextState: { ...state, lastResult: result } }
}

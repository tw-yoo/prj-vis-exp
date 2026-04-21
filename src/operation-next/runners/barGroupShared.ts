import * as d3 from 'd3'
import { ChartType, type ChartSpec, type ChartTypeValue } from '../../domain/chart'
import { toDatumValuesFromRaw, type RawRow } from '../../domain/data/datum'
import { filterData } from '../../domain/operation/dataOps'
import { OperationOp, type DatumValue, type OperationSpec, type JsonValue } from '../../domain/operation/types'
import { COLORS, DURATIONS, EASINGS } from '../../rendering/common/d3Helpers'
import {
  getGroupedBarStoredData,
  type GroupedSpec,
} from '../../rendering/bar/groupedBarRenderer'
import {
  getStackedBarStoredData,
  type StackedSpec,
} from '../../rendering/bar/stackedBarRenderer'
import {
  convertGroupedToStacked,
  convertStackedToGrouped,
  type StackGroupTransformResult,
} from '../../rendering/bar/stackGroupTransforms'
import { DrawAction, type DrawOp } from '../../rendering/draw/types'
import { DataAttributes, SvgAttributes, SvgClassNames, SvgElements } from '../../rendering/interfaces'
import { resolveEncodingFields } from '../../rendering/ops/common/resolveEncodingFields'
import { createChainState, type ChainState } from '../chainState'
import {
  ensureAnnotationLayer,
  readNumberAttr,
  resolveAnnotationViewport,
} from '../primitives/annotationLayer'
import { drawReferenceLine } from '../primitives/drawReferenceLine'
import { applyMarkSalience } from '../primitives/markSalience'
import { formatOperationValue } from '../primitives/formatValue'
import { placeOperationTextLabel } from '../textPlacement'

const FILTER_ANNOTATION_CLASS = 'operation-next-grouped-bar-filter'

export type ActiveBarChartState = {
  chartType: ChartTypeValue
  spec: ChartSpec
  chainState: ChainState
}

type FilterRunResult = {
  result: DatumValue[]
  nextState: ChainState
}

type PlotScope = {
  key: string
  group: SVGGElement | null
  x1: number
  x2: number
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
  return chartType === ChartType.STACKED_BAR
    ? getStackedBarDatumValues(container, spec)
    : getGroupedBarDatumValues(container, spec)
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
  return action === DrawAction.StackedToGrouped || action === DrawAction.GroupedToStacked
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
    const y = readNumberAttr(exact, SvgAttributes.Y)
    if (y != null) return accumulatedTranslate(exact).y + y
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

  const zeroY = y + height
  const pixelsPerValue = height / Math.abs(value)
  const thresholdY = value >= 0
    ? zeroY - params.threshold * pixelsPerValue
    : zeroY + params.threshold * pixelsPerValue
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

function formatScopeLabel(operation: OperationSpec, result: DatumValue[]) {
  if (operation.group != null && String(operation.group).trim() !== '') {
    return `Filtered: ${String(operation.group)}`
  }
  if (Array.isArray(operation.value) && operation.value.length > 0) {
    return `Filtered: ${operation.value.map(String).join(', ')}`
  }
  if (Array.isArray(operation.include) && operation.include.length > 0) {
    return `Filtered: ${operation.include.map(String).join(', ')}`
  }
  if (Array.isArray(operation.exclude) && operation.exclude.length > 0) {
    return `Excluded: ${operation.exclude.map(String).join(', ')}`
  }
  return `Filtered: ${result.length} values`
}

async function drawFilterScopeLabel(params: {
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>
  label: string
}) {
  const layer = ensureAnnotationLayer(params.svg)
  const viewport = resolveAnnotationViewport(params.svg)
  const preferred = {
    x: viewport.x + viewport.width - 4,
    y: Math.max(12, viewport.y + 16),
  }
  const labelNode = layer
    .append(SvgElements.Text)
    .attr(SvgAttributes.Class, `${SvgClassNames.TextAnnotation} ${FILTER_ANNOTATION_CLASS} scope-label`)
    .attr(SvgAttributes.X, preferred.x)
    .attr(SvgAttributes.Y, preferred.y)
    .attr(SvgAttributes.TextAnchor, 'end')
    .attr(SvgAttributes.FontSize, 12)
    .attr(SvgAttributes.FontWeight, 700)
    .attr(SvgAttributes.Fill, COLORS.TEXT_DARK)
    .style(SvgAttributes.Opacity, 0)
    .text(params.label)

  placeOperationTextLabel({
    svg: params.svg,
    text: labelNode,
    preferred,
    viewport,
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

export async function runStackedBarFilterOperation(
  container: HTMLElement,
  spec: ChartSpec,
  operation: OperationSpec,
): Promise<{ active: ActiveBarChartState; result: DatumValue[] }> {
  const transformed = await convertStackedToGrouped(container, spec as StackedSpec)
  if (!transformed) {
    const state = createBarChartState(container, ChartType.STACKED_BAR, spec)
    return { active: state, result: [] }
  }

  const active = createBarChartState(container, transformed.chartType, transformed.spec)
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
  }

  if (!transformed) return active
  return createBarChartState(container, transformed.chartType, transformed.spec)
}

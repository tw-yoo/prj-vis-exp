import { OperationOp, type DatumValue, type OperationSpec } from '../../../types'
import { draw, ops } from '../../../operation/build/authoring'
import { DrawAction, DrawLineModes, DrawMark, type DrawOp } from '../../draw/types.ts'
import type { AutoDrawPlanContext } from '../common/executeDataOp'
import { CHART_TEXT_SIZE } from '../../config/chartTextConfig'
import { DataAttributes, SvgAttributes } from '../../interfaces'

const DEFAULT_HIGHLIGHT_COLOR = '#ef4444'
const DEFAULT_TEXT_COLOR = '#111827'
export const AVERAGE_LINE_COLOR = '#ef4444'
export const AUTO_DRAW_TEXT_FONT_SIZE = CHART_TEXT_SIZE.autoDraw
export const AUTO_DRAW_TEXT_MINOR_FONT_SIZE = CHART_TEXT_SIZE.autoDrawMinor
export const COMPARISON_RAIL_X = 0.97

type AutoDrawChartKind = 'simple-bar' | 'stacked-bar' | 'grouped-bar' | 'simple-line' | 'multi-line'

type AutoDrawPlanBuilder = (
  result: DatumValue[],
  op: OperationSpec,
  context: AutoDrawPlanContext,
) => unknown[] | null

type AutoDrawPlanRegistry = Record<string, AutoDrawPlanBuilder>

export function formatDrawNumber(value: number, precision?: number) {
  if (!Number.isFinite(value)) return ''
  const digits = typeof precision === 'number' && Number.isFinite(precision)
    ? Math.max(0, Math.min(2, Math.trunc(precision)))
    : 2
  let text = value.toFixed(digits)
  text = text.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '')
  if (text === '-0') return '0'
  return text
}

function chartScopeToken(chartId: string | undefined) {
  return chartId && chartId.trim().length > 0 ? chartId.trim() : '__root__'
}

export function withAnnotationSlot(op: DrawOp, slot: string): DrawOp {
  return {
    ...op,
    annotation: {
      ...(op.annotation ?? {}),
      slot,
    },
  }
}

export function makeValueLabelSlot(chartId: string | undefined, target: string, series?: string | null) {
  return `value-label:${chartScopeToken(chartId)}:${target}:${series ?? '__all__'}`
}

export function makeAggregateLineSlot(chartId: string | undefined, metric: string) {
  return `aggregate-line:${chartScopeToken(chartId)}:${metric}`
}

export function makeAggregateTextSlot(chartId: string | undefined, metric: string) {
  return `aggregate-text:${chartScopeToken(chartId)}:${metric}`
}

export function makeComparisonRailSlot(chartId: string | undefined, value: number) {
  return `comparison-rail:${chartScopeToken(chartId)}:${formatDrawNumber(value, 4)}`
}

export function makeComparisonBracketSlot(chartId: string | undefined) {
  return `comparison-bracket:${chartScopeToken(chartId)}`
}

export function makeComparisonSummarySlot(chartId: string | undefined) {
  return `comparison-summary:${chartScopeToken(chartId)}`
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

function selectSvgForChart(container: HTMLElement, chartId?: string) {
  const svgs = Array.from(container.querySelectorAll('svg'))
  if (!svgs.length) return null
  if (svgs.length === 1) return svgs[0] as SVGSVGElement
  if (!chartId) return svgs[0] as SVGSVGElement
  const matched = svgs.find((svg) => {
    if (svg.getAttribute('data-chart-id') === chartId) return true
    const nodes = svg.querySelectorAll('[data-chart-id]')
    for (const node of Array.from(nodes)) {
      if (node.getAttribute('data-chart-id') === chartId) return true
    }
    return false
  })
  return (matched ?? svgs[0]) as SVGSVGElement
}

function resolveNodeChartId(node: Element) {
  const direct = node.getAttribute('data-chart-id')
  if (direct && direct.trim().length > 0) return direct.trim()
  const scopedParent = node.closest('[data-chart-id]')
  if (!scopedParent) return null
  const inherited = scopedParent.getAttribute('data-chart-id')
  return inherited && inherited.trim().length > 0 ? inherited.trim() : null
}

function resolvePlotFrame(svg: SVGSVGElement) {
  const viewBox = svg.viewBox?.baseVal
  const fallbackWidth = viewBox && Number.isFinite(viewBox.width) ? viewBox.width : svg.getBoundingClientRect().width
  const fallbackHeight = viewBox && Number.isFinite(viewBox.height) ? viewBox.height : svg.getBoundingClientRect().height
  const plotXRaw = Number(svg.getAttribute(DataAttributes.MarginLeft))
  const plotYRaw = Number(svg.getAttribute(DataAttributes.MarginTop))
  const plotWidthRaw = Number(svg.getAttribute(DataAttributes.PlotWidth))
  const plotHeightRaw = Number(svg.getAttribute(DataAttributes.PlotHeight))
  return {
    x: Number.isFinite(plotXRaw) ? plotXRaw : 0,
    y: Number.isFinite(plotYRaw) ? plotYRaw : 0,
    width: Number.isFinite(plotWidthRaw) && plotWidthRaw > 0 ? plotWidthRaw : fallbackWidth,
    height: Number.isFinite(plotHeightRaw) && plotHeightRaw > 0 ? plotHeightRaw : fallbackHeight,
  }
}

function resolveSvgPointFromNode(svg: SVGSVGElement, node: Element) {
  if (node instanceof SVGCircleElement) {
    const cx = Number(node.getAttribute(SvgAttributes.CX))
    const cy = Number(node.getAttribute(SvgAttributes.CY))
    if (Number.isFinite(cx) && Number.isFinite(cy)) return { x: cx, y: cy }
  }

  const rect = node.getBoundingClientRect()
  const svgRect = svg.getBoundingClientRect()
  const viewBox = svg.viewBox?.baseVal
  const scaleX = viewBox && svgRect.width > 0 ? viewBox.width / svgRect.width : 1
  const scaleY = viewBox && svgRect.height > 0 ? viewBox.height / svgRect.height : 1
  if (!(Number.isFinite(scaleX) && Number.isFinite(scaleY) && rect.width >= 0 && rect.height >= 0)) return null
  return {
    x: (rect.left - svgRect.left + rect.width / 2) * scaleX + (viewBox?.x ?? 0),
    y: (rect.top - svgRect.top + rect.height / 2) * scaleY + (viewBox?.y ?? 0),
  }
}

export function inferNormalizedPointForTarget(
  chartId: string | undefined,
  target: string,
  context: AutoDrawPlanContext,
  series?: string,
) {
  const svg = selectSvgForChart(context.container, chartId)
  if (!svg) return null
  const plot = resolvePlotFrame(svg)
  if (!(plot.width > 0 && plot.height > 0)) return null

  const candidates = Array.from(svg.querySelectorAll<SVGElement>('[data-target], [data-id]')).filter((node) => {
    if (node.classList.contains('annotation')) return false
    const nodeChartId = resolveNodeChartId(node)
    if (chartId && nodeChartId !== chartId) return false
    if (series != null) {
      const nodeSeries = (node.getAttribute(DataAttributes.Series) ?? '').trim()
      if (nodeSeries !== String(series)) return false
    }
    const nodeTarget = (node.getAttribute(DataAttributes.Target) ?? '').trim()
    const nodeId = (node.getAttribute(DataAttributes.Id) ?? '').trim()
    return nodeTarget === target || nodeId === target
  })
  if (!candidates.length) return null

  const chosen = candidates.find((node) => node.tagName.toLowerCase() === 'circle') ?? candidates[0]
  const point = resolveSvgPointFromNode(svg, chosen)
  if (!point) return null
  return {
    x: clamp01((point.x - plot.x) / plot.width),
    y: clamp01(1 - (point.y - plot.y) / plot.height),
  }
}

function inferAverageLabelYFromChart(container: HTMLElement, chartId: string | undefined, value: number) {
  const svg = selectSvgForChart(container, chartId)
  if (!svg) return null
  const svgRect = svg.getBoundingClientRect()
  if (!(svgRect.height > 0)) return null

  const points: Array<{ value: number; y: number }> = []
  const nodes = Array.from(svg.querySelectorAll<SVGGraphicsElement>('[data-value]'))
  nodes.forEach((node) => {
    const nodeChartId = resolveNodeChartId(node)
    if (chartId && nodeChartId !== chartId) return
    if (node.classList.contains('annotation')) return
    const raw = node.getAttribute('data-value')
    const numeric = raw != null ? Number(raw) : NaN
    if (!Number.isFinite(numeric)) return
    const rect = node.getBoundingClientRect()
    if (!(rect.height >= 0)) return
    // For bars, lineAt(y=value) aligns with the bar top. For points/paths, center is a better anchor.
    const rawY = node.tagName.toLowerCase() === 'rect'
      ? rect.top - svgRect.top
      : rect.top - svgRect.top + rect.height / 2
    if (!Number.isFinite(rawY)) return
    points.push({ value: numeric, y: clamp01(1 - rawY / svgRect.height) })
  })
  if (!points.length) return null

  points.sort((a, b) => a.value - b.value)
  if (points.length === 1) return points[0].y
  if (value <= points[0].value) return points[0].y
  if (value >= points[points.length - 1].value) return points[points.length - 1].y

  for (let i = 0; i < points.length - 1; i += 1) {
    const left = points[i]
    const right = points[i + 1]
    if (value < left.value || value > right.value) continue
    const span = right.value - left.value
    if (!(span > 0)) return (left.y + right.y) / 2
    const t = (value - left.value) / span
    return clamp01(left.y + t * (right.y - left.y))
  }
  return points[points.length - 1].y
}

function inferAverageLabelYFromData(value: number, data: DatumValue[]) {
  const numeric = data.map((row) => Number(row.value)).filter(Number.isFinite)
  if (!numeric.length) return null
  const lo = Math.min(...numeric)
  const hi = Math.max(...numeric)
  if (!(hi > lo)) return 0.5
  return clamp01((value - lo) / (hi - lo))
}

export function makeAverageTextOp(
  chartId: string | undefined,
  value: number,
  context: AutoDrawPlanContext,
  x = 0.92,
): DrawOp {
  const inferredY =
    inferAverageLabelYFromChart(context.container, chartId, value) ??
    inferAverageLabelYFromData(value, context.prevWorking) ??
    0.5
  return withAnnotationSlot(
    ops.draw.text(
      chartId,
      undefined,
      draw.textSpec.normalized(
        `Average: ${formatDrawNumber(value)}`,
        x,
        clamp01(inferredY),
        draw.style.text(DEFAULT_TEXT_COLOR, AUTO_DRAW_TEXT_FONT_SIZE, 'bold'),
        0,
        -5,
      ),
    ),
    makeAggregateTextSlot(chartId, 'average'),
  )
}

export function buildSelectedPointGuideOps(args: {
  chartId: string | undefined
  result: DatumValue[]
  context: AutoDrawPlanContext
  color?: string
}) {
  const color = args.color ?? DEFAULT_HIGHLIGHT_COLOR
  const seen = new Set<string>()
  const plan: DrawOp[] = []
  args.result.forEach((datum) => {
    const target = String(datum.target ?? '').trim()
    if (!target || seen.has(target)) return
    seen.add(target)
    const point = inferNormalizedPointForTarget(args.chartId, target, args.context, datum.group != null ? String(datum.group) : undefined)
    if (!point) return
    plan.push(
      ops.draw.line(
        args.chartId,
        draw.lineSpec.normalized(0, point.y, point.x, point.y, draw.style.line(color, 1.5, 0.75)),
      ),
    )
    plan.push(
      ops.draw.line(
        args.chartId,
        draw.lineSpec.normalized(point.x, point.y, point.x, 0, draw.style.line(color, 1.5, 0.75)),
      ),
    )
  })
  return plan
}

export function buildPointValueLabelOps(args: {
  chartId: string | undefined
  result: DatumValue[]
  context: AutoDrawPlanContext
  precision?: number
  color?: string
}) {
  const color = args.color ?? DEFAULT_TEXT_COLOR
  const seen = new Set<string>()
  const plan: DrawOp[] = []
  args.result.forEach((datum) => {
    const target = String(datum.target ?? '').trim()
    const value = Number(datum.value)
    if (!target || !Number.isFinite(value) || seen.has(target)) return
    seen.add(target)
    const point = inferNormalizedPointForTarget(args.chartId, target, args.context, datum.group != null ? String(datum.group) : undefined)
    if (!point) return
    plan.push(
      withAnnotationSlot(
        ops.draw.text(
          args.chartId,
          undefined,
          draw.textSpec.normalized(
            formatDrawNumber(value, args.precision),
            point.x,
            point.y,
            draw.style.text(color, AUTO_DRAW_TEXT_FONT_SIZE, 'bold', undefined, 1),
            0,
            -12,
          ),
        ),
        makeValueLabelSlot(args.chartId, target, datum.group != null ? String(datum.group) : null),
      ),
    )
  })
  return plan
}

export function buildBinaryComparisonBracketOp(
  chartId: string | undefined,
  startY: number,
  endY: number,
  normalizedX: number,
  color = DEFAULT_HIGHLIGHT_COLOR,
): DrawOp {
  return withAnnotationSlot(
    ops.draw.line(
      chartId,
      draw.lineSpec.diffBracket(
        startY,
        endY,
        draw.style.line(color, 2, 1),
        draw.arrow.both(),
        Math.max(0.02, Math.min(0.98, normalizedX)),
      ),
    ),
    makeComparisonBracketSlot(chartId),
  )
}

export function resolveBinaryComparisonBracketX(xs: number[], offset = 0.04) {
  if (!xs.length) return 0.94
  const maxX = Math.max(...xs.filter((value) => Number.isFinite(value)))
  if (!Number.isFinite(maxX)) return 0.94
  return Math.max(0.02, Math.min(0.98, maxX + offset))
}

export function makeComparisonGuideLineOp(
  chartId: string | undefined,
  value: number,
  color = DEFAULT_HIGHLIGHT_COLOR,
  railX = COMPARISON_RAIL_X,
): DrawOp {
  return withAnnotationSlot(
    ops.draw.line(
      chartId,
      draw.lineSpec.horizontalFromY(
        value,
        draw.style.line(color, 2, 1),
        undefined,
        { extent: 'plot', endNormalizedX: railX },
      ),
    ),
    makeComparisonRailSlot(chartId, value),
  )
}

export function inferNormalizedYForValue(
  chartId: string | undefined,
  value: number,
  context: AutoDrawPlanContext,
) {
  return inferAverageLabelYFromChart(context.container, chartId, value)
    ?? inferAverageLabelYFromData(value, context.prevWorking)
    ?? null
}

export function buildBinaryScaleComparisonRailPlan(args: {
  chartId: string | undefined
  color?: string
  precision?: number
  valueA: number | null
  valueB: number | null
  normalizedYA: number | null
  normalizedYB: number | null
  highlightOps?: DrawOp[]
  valueLabelOps?: DrawOp[]
  deltaTextLabel?: string
  deltaValue?: number | null
  railX?: number
}) {
  const color = args.color ?? DEFAULT_HIGHLIGHT_COLOR
  const railX = args.railX ?? COMPARISON_RAIL_X
  const plan: DrawOp[] = [...(args.highlightOps ?? []), ...(args.valueLabelOps ?? [])]

  if (Number.isFinite(args.valueA ?? NaN)) {
    plan.push(makeComparisonGuideLineOp(args.chartId, Number(args.valueA), color, railX))
  }
  if (Number.isFinite(args.valueB ?? NaN)) {
    plan.push(makeComparisonGuideLineOp(args.chartId, Number(args.valueB), color, railX))
  }

  const yA = Number(args.normalizedYA)
  const yB = Number(args.normalizedYB)
  if (Number.isFinite(yA) && Number.isFinite(yB) && yA !== yB) {
    plan.push(
      buildBinaryComparisonBracketOp(
        args.chartId,
        Math.min(yA, yB),
        Math.max(yA, yB),
        railX,
        color,
      ),
    )
  }

  const deltaValue = Number(args.deltaValue)
  if (Number.isFinite(deltaValue) && Number.isFinite(yA) && Number.isFinite(yB)) {
    plan.push(
      withAnnotationSlot(
        ops.draw.text(
          args.chartId,
          undefined,
          draw.textSpec.normalized(
            `${args.deltaTextLabel ?? 'Difference'}: ${formatDrawNumber(deltaValue, args.precision)}`,
            Math.max(0.08, railX - 0.09),
            clamp01((yA + yB) / 2),
            draw.style.text(DEFAULT_TEXT_COLOR, AUTO_DRAW_TEXT_FONT_SIZE, 'bold', undefined, 1),
            0,
            -5,
          ),
        ),
        makeComparisonSummarySlot(args.chartId),
      ),
    )
  }
  return plan
}

export function buildBinaryGeometryComparisonPlan(args: {
  chartId: string | undefined
  color?: string
  precision?: number
  valueA: number | null
  valueB: number | null
  normalizedYA: number | null
  normalizedYB: number | null
  highlightOps?: DrawOp[]
  valueLabelOps?: DrawOp[]
  deltaTextLabel?: string
  deltaValue?: number | null
  railX?: number
}) {
  const color = args.color ?? DEFAULT_HIGHLIGHT_COLOR
  const railX = args.railX ?? COMPARISON_RAIL_X
  const summaryX = Math.max(0.08, railX - 0.09)
  const plan: DrawOp[] = [...(args.highlightOps ?? []), ...(args.valueLabelOps ?? [])]
  const yA = Number(args.normalizedYA)
  const yB = Number(args.normalizedYB)
  const valueA = Number(args.valueA)
  const valueB = Number(args.valueB)

  if (Number.isFinite(yA) && Number.isFinite(valueA)) {
    plan.push(
      withAnnotationSlot(
        ops.draw.line(
          args.chartId,
          draw.lineSpec.normalized(0, clamp01(yA), railX, clamp01(yA), draw.style.line(color, 2, 1)),
        ),
        makeComparisonRailSlot(args.chartId, valueA),
      ),
    )
  }
  if (Number.isFinite(yB) && Number.isFinite(valueB)) {
    plan.push(
      withAnnotationSlot(
        ops.draw.line(
          args.chartId,
          draw.lineSpec.normalized(0, clamp01(yB), railX, clamp01(yB), draw.style.line(color, 2, 1)),
        ),
        makeComparisonRailSlot(args.chartId, valueB),
      ),
    )
  }

  if (Number.isFinite(yA) && Number.isFinite(yB) && yA !== yB) {
    plan.push(
      withAnnotationSlot(
        ops.draw.line(
          args.chartId,
          draw.lineSpec.normalized(
            railX,
            clamp01(yA),
            railX,
            clamp01(yB),
            draw.style.line(color, 2, 1),
            draw.arrow.both(),
          ),
        ),
        makeComparisonBracketSlot(args.chartId),
      ),
    )
  }

  const deltaValue = Number(args.deltaValue)
  if (Number.isFinite(deltaValue) && Number.isFinite(yA) && Number.isFinite(yB)) {
    plan.push(
      withAnnotationSlot(
        ops.draw.text(
          args.chartId,
          undefined,
          draw.textSpec.normalized(
            `${args.deltaTextLabel ?? 'Difference'}: ${formatDrawNumber(deltaValue, args.precision)}`,
            summaryX,
            clamp01((yA + yB) / 2),
            draw.style.text(DEFAULT_TEXT_COLOR, AUTO_DRAW_TEXT_FONT_SIZE, 'bold', undefined, 1),
            0,
            -5,
          ),
        ),
        makeComparisonSummarySlot(args.chartId),
      ),
    )
  }

  return plan
}

export function makeHighlightOp(target: string, color?: string, selectField = 'target'): DrawOp {
  const select = selectField
    ? draw.select.markFieldKeys(DrawMark.Rect, selectField, target)
    : draw.select.markKeys(DrawMark.Rect, target)
  return ops.draw.highlight(undefined, select, color ?? DEFAULT_HIGHLIGHT_COLOR)
}

export function makeTextOp(
  target: string,
  value: number,
  color?: string,
  precision?: number,
  selectField = 'target',
  chartId?: string,
  series?: string | null,
): DrawOp {
  const text = formatDrawNumber(value, precision)
  if (!text) return makeHighlightOp(target, color, selectField)
  const select = selectField
    ? draw.select.markFieldKeys(DrawMark.Rect, selectField, target)
    : draw.select.markKeys(DrawMark.Rect, target)
  return withAnnotationSlot(
    ops.draw.text(
      chartId,
      select,
      draw.textSpec.anchor(
        text,
        draw.style.text(color ?? DEFAULT_TEXT_COLOR, AUTO_DRAW_TEXT_FONT_SIZE, 'bold'),
      ),
    ),
    makeValueLabelSlot(chartId, target, series),
  )
}

export function buildHighlightPlan(targets: string[], color?: string, selectField = 'target'): DrawOp[] {
  return targets.map((target) => makeHighlightOp(target, color, selectField))
}

export function buildTextPlan(
  result: Array<{ target: string; value: number }>,
  color?: string,
  precision?: number,
  selectField = 'target',
  chartId?: string,
): DrawOp[] {
  return result.map((entry) => makeTextOp(entry.target, entry.value, color, precision, selectField, chartId))
}

function isDrawOp(value: unknown): value is DrawOp {
  if (!value || typeof value !== 'object') return false
  const candidate = value as { op?: unknown; action?: unknown }
  return candidate.op === OperationOp.Draw && typeof candidate.action === 'string'
}

function buildScalarPanelDiffStages(drawOps: DrawOp[]) {
  const scalarIndices = drawOps
    .map((drawOp, index) => ({ drawOp, index }))
    .filter((entry) => entry.drawOp.action === DrawAction.ScalarPanel)
  const indexToStage = new Map<number, number>()
  if (!scalarIndices.length) return indexToStage

  let fallbackOrder = 0
  scalarIndices.forEach(({ drawOp, index }) => {
    const mode = drawOp.scalarPanel?.mode
    if (mode === 'base') {
      indexToStage.set(index, 0)
      return
    }
    if (mode === 'diff') {
      indexToStage.set(index, 1)
      return
    }
    indexToStage.set(index, Math.min(1, fallbackOrder))
    fallbackOrder += 1
  })
  return indexToStage
}

function resolveStagesByOperation(dataOp: OperationSpec, drawOps: DrawOp[], chartKind: AutoDrawChartKind) {
  const opName = String(dataOp.op ?? '')
  const hasStructuralSum = drawOps.some((drawOp) => drawOp.action === DrawAction.Sum)
  const isLineChart = chartKind === 'simple-line' || chartKind === 'multi-line'

  switch (opName) {
    case OperationOp.RetrieveValue:
    case OperationOp.FindExtremum:
      return drawOps.map((drawOp) => {
        if (drawOp.action === DrawAction.Highlight || drawOp.action === DrawAction.Dim) return 0
        if (drawOp.action === DrawAction.Line) return 1
        if (drawOp.action === DrawAction.Text) return 2
        return 0
      })
    case OperationOp.Nth:
      return drawOps.map((drawOp) => (drawOp.action === DrawAction.Text ? 1 : 0))
    case OperationOp.Filter:
      if (drawOps.some((drawOp) => drawOp.action === DrawAction.LineToBar)) {
        return drawOps.map((drawOp) => {
          if (drawOp.action === DrawAction.LineToBar) return 0
          if (drawOp.action === DrawAction.Filter) return 2
          return 1
        })
      }
      return drawOps.map((drawOp) => (drawOp.action === DrawAction.Filter ? 1 : 0))
    case OperationOp.Sort:
      return drawOps.map((drawOp) => (drawOp.action === DrawAction.Sort ? 1 : 0))
    case OperationOp.DetermineRange:
      return drawOps.map(() => 0)
    case OperationOp.Compare:
      return drawOps.map((drawOp) => {
        const slot = typeof drawOp.annotation?.slot === 'string' ? drawOp.annotation.slot : ''
        if (drawOp.action === DrawAction.Highlight || drawOp.action === DrawAction.Dim) return 0
        if (drawOp.action === DrawAction.Text && drawOp.select) return 0
        if (drawOp.action === DrawAction.Line && slot.startsWith('comparison-rail:')) return 1
        if (drawOp.action === DrawAction.Line && slot.startsWith('comparison-bracket:')) return 2
        if (drawOp.action === DrawAction.Text && slot.startsWith('comparison-summary:')) return 2
        if (drawOp.action === DrawAction.Line && drawOp.line?.mode === DrawLineModes.HorizontalFromY) return 1
        if (drawOp.action === DrawAction.Line && drawOp.line?.mode === DrawLineModes.DiffBracket) return 2
        if (drawOp.action === DrawAction.Text) return 2
        return 2
      })
    case OperationOp.CompareBool:
      return drawOps.map((drawOp) => {
        const slot = typeof drawOp.annotation?.slot === 'string' ? drawOp.annotation.slot : ''
        if (drawOp.action === DrawAction.Highlight || drawOp.action === DrawAction.Dim) return 0
        if (drawOp.action === DrawAction.Text && drawOp.select) return 0
        if (drawOp.action === DrawAction.Line && slot.startsWith('comparison-rail:')) return 1
        if (drawOp.action === DrawAction.Line && slot.startsWith('comparison-bracket:')) return 2
        if (drawOp.action === DrawAction.Text && slot.startsWith('comparison-summary:')) return 2
        if (drawOp.action === DrawAction.Line && drawOp.line?.mode === DrawLineModes.HorizontalFromY) return 1
        if (drawOp.action === DrawAction.Line && drawOp.line?.mode === DrawLineModes.DiffBracket) return 2
        if (drawOp.action === DrawAction.Text) return 2
        return 2
      })
    case OperationOp.Sum:
      if (hasStructuralSum) return drawOps.map(() => 0)
      if (!isLineChart) return drawOps.map(() => 0)
      return drawOps.map((drawOp) => {
        if (drawOp.action === DrawAction.Line) return 0
        if (drawOp.action === DrawAction.Text) return 1
        return 1
      })
    case OperationOp.Average:
    case OperationOp.Add:
    case OperationOp.Scale:
      return drawOps.map((drawOp) => {
        if (drawOp.action === DrawAction.Line) return 0
        if (drawOp.action === DrawAction.Text) return 1
        return 1
      })
    case OperationOp.Diff: {
      const scalarStages = buildScalarPanelDiffStages(drawOps)
      if (scalarStages.size > 0) {
        return drawOps.map((drawOp, index) => {
          if (scalarStages.has(index)) return scalarStages.get(index) ?? 0
          if (drawOp.action === DrawAction.Highlight) return 0
          return 1
        })
      }
      return drawOps.map((drawOp) => {
        const slot = typeof drawOp.annotation?.slot === 'string' ? drawOp.annotation.slot : ''
        if (drawOp.action === DrawAction.Highlight || drawOp.action === DrawAction.Dim) return 0
        if (drawOp.action === DrawAction.Text && drawOp.select) return 0
        if (drawOp.action === DrawAction.Line && slot.startsWith('comparison-rail:')) return 1
        if (drawOp.action === DrawAction.Line && slot.startsWith('comparison-bracket:')) return 2
        if (drawOp.action === DrawAction.Text && slot.startsWith('comparison-summary:')) return 2
        if (drawOp.action === DrawAction.Line && drawOp.line?.mode === DrawLineModes.HorizontalFromY) return 1
        if (drawOp.action === DrawAction.Line && drawOp.line?.mode === DrawLineModes.DiffBracket) return 2
        if (drawOp.action === DrawAction.Line) return 2
        if (drawOp.action === DrawAction.Text) return 2
        return 2
      })
    }
    case OperationOp.LagDiff:
      return drawOps.map(() => 0)
    case OperationOp.PairDiff:
      return drawOps.map((drawOp) => {
        const slot = typeof drawOp.annotation?.slot === 'string' ? drawOp.annotation.slot : ''
        if (drawOp.action === DrawAction.Highlight || drawOp.action === DrawAction.Dim) return 0
        if (drawOp.action === DrawAction.Text && drawOp.select) return 0
        if (drawOp.action === DrawAction.Line && slot.startsWith('comparison-rail:')) return 1
        if (drawOp.action === DrawAction.Line && slot.startsWith('comparison-bracket:')) return 2
        if (drawOp.action === DrawAction.Text && slot.startsWith('comparison-summary:')) return 2
        if (drawOp.action === DrawAction.Line && drawOp.line?.mode === DrawLineModes.HorizontalFromY) return 1
        if (drawOp.action === DrawAction.Line && drawOp.line?.mode === DrawLineModes.DiffBracket) return 2
        if (drawOp.action === DrawAction.Line) return 2
        if (drawOp.action === DrawAction.Text) return 2
        return 2
      })
    case OperationOp.Count:
      return drawOps.map(() => 0)
    case OperationOp.SetOp:
      return drawOps.map((drawOp) => {
        if (drawOp.action === DrawAction.Highlight || drawOp.action === DrawAction.Dim) return 0
        if (drawOp.action === DrawAction.Band) return 1
        if (drawOp.action === DrawAction.Text) return 2
        return 2
      })
    default:
      return drawOps.map((_drawOp, index) => index)
  }
}

function withStageMetadata(drawOps: DrawOp[], dataOp: OperationSpec, chartKind: AutoDrawChartKind): DrawOp[] {
  if (!drawOps.length) return drawOps

  const stages = resolveStagesByOperation(dataOp, drawOps, chartKind)
  const nodePrefix =
    typeof dataOp.meta?.nodeId === 'string' && dataOp.meta.nodeId.trim().length > 0
      ? dataOp.meta.nodeId
      : `${String(dataOp.op ?? 'draw')}:${chartKind}`
  const sentenceIndex = typeof dataOp.meta?.sentenceIndex === 'number' ? dataOp.meta.sentenceIndex : undefined

  const nodeIds = drawOps.map((drawOp, index) => {
    const existingNodeId = typeof drawOp.meta?.nodeId === 'string' ? drawOp.meta.nodeId : null
    if (existingNodeId && existingNodeId.trim().length > 0) return existingNodeId
    const stage = stages[index] ?? index
    return `${nodePrefix}:draw:${stage}:${index}`
  })

  const idsByStage = new Map<number, string[]>()
  stages.forEach((stage, index) => {
    const id = nodeIds[index]
    const bucket = idsByStage.get(stage)
    if (bucket) {
      bucket.push(id)
      return
    }
    idsByStage.set(stage, [id])
  })

  const sortedStages = Array.from(idsByStage.keys()).sort((a, b) => a - b)
  const prevStageByStage = new Map<number, number | null>()
  sortedStages.forEach((stage, index) => {
    prevStageByStage.set(stage, index === 0 ? null : sortedStages[index - 1])
  })

  return drawOps.map((drawOp, index) => {
    const stage = stages[index] ?? index
    const prevStage = prevStageByStage.get(stage) ?? null
    const inputs = prevStage == null ? [] : [...(idsByStage.get(prevStage) ?? [])]
    const nextMeta: NonNullable<OperationSpec['meta']> = {
      ...(drawOp.meta ?? {}),
      nodeId: nodeIds[index],
      inputs,
    }
    if (sentenceIndex != null && nextMeta.sentenceIndex == null) {
      nextMeta.sentenceIndex = sentenceIndex
    }
    return {
      ...drawOp,
      meta: nextMeta,
    }
  })
}

export function withStagedAutoDrawPlanRegistry<T extends AutoDrawPlanRegistry>(
  chartKind: AutoDrawChartKind,
  registry: T,
): T {
  const wrapped = {} as T
  for (const [key, builder] of Object.entries(registry)) {
    wrapped[key as keyof T] = ((result: DatumValue[], op: OperationSpec, context: AutoDrawPlanContext) => {
      const plan = builder(result, op, context)
      if (!Array.isArray(plan) || plan.length === 0) return plan
      if (!plan.every(isDrawOp)) return plan
      return withStageMetadata(plan as DrawOp[], op, chartKind)
    }) as T[keyof T]
  }
  return wrapped
}

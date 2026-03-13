import { OperationOp, type DatumValue, type OperationSpec } from '../../../types'
import { draw, ops } from '../../../operation/build/authoring'
import { DrawAction, DrawLineModes, DrawMark, type DrawOp } from '../../draw/types.ts'
import type { AutoDrawPlanContext } from '../common/executeDataOp'

const DEFAULT_HIGHLIGHT_COLOR = '#ef4444'
const DEFAULT_TEXT_COLOR = '#111827'
export const AVERAGE_LINE_COLOR = '#ef4444'

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

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

function selectSvgForChart(container: HTMLElement, chartId?: string) {
  const svgs = Array.from(container.querySelectorAll('svg'))
  if (!svgs.length) return null
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
  return ops.draw.text(
    chartId,
    undefined,
    draw.textSpec.normalized(
      `avg: ${formatDrawNumber(value)}`,
      x,
      clamp01(inferredY),
      draw.style.text(DEFAULT_TEXT_COLOR, 12, 'bold'),
      0,
      -5,
    ),
  )
}

export function makeHighlightOp(target: string, color?: string): DrawOp {
  return ops.draw.highlight(undefined, draw.select.markKeys(DrawMark.Rect, target), color ?? DEFAULT_HIGHLIGHT_COLOR)
}

export function makeTextOp(target: string, value: number, color?: string, precision?: number): DrawOp {
  const text = formatDrawNumber(value, precision)
  if (!text) return makeHighlightOp(target, color)
  return ops.draw.text(
    undefined,
    draw.select.markKeys(DrawMark.Rect, target),
    draw.textSpec.anchor(
      text,
      draw.style.text(color ?? DEFAULT_TEXT_COLOR, 12, 'bold'),
    ),
  )
}

export function buildHighlightPlan(targets: string[], color?: string): DrawOp[] {
  return targets.map((target) => makeHighlightOp(target, color))
}

export function buildTextPlan(
  result: Array<{ target: string; value: number }>,
  color?: string,
  precision?: number,
): DrawOp[] {
  return result.map((entry) => makeTextOp(entry.target, entry.value, color, precision))
}

function isDrawOp(value: unknown): value is DrawOp {
  if (!value || typeof value !== 'object') return false
  const candidate = value as { op?: unknown; action?: unknown }
  return candidate.op === OperationOp.Draw && typeof candidate.action === 'string'
}

function isConnectorLine(op: DrawOp) {
  if (op.action !== DrawAction.Line) return false
  const line = op.line
  if (!line) return false
  if (line.connectBy) return true
  if (line.pair?.x?.length === 2) return true
  return line.mode === DrawLineModes.Connect
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
    case OperationOp.Nth:
      return drawOps.map((drawOp) => (drawOp.action === DrawAction.Text ? 1 : 0))
    case OperationOp.Filter:
      return drawOps.map((drawOp) => (drawOp.action === DrawAction.Filter ? 1 : 0))
    case OperationOp.Sort:
      return drawOps.map((drawOp) => (drawOp.action === DrawAction.Sort ? 1 : 0))
    case OperationOp.DetermineRange:
      return drawOps.map(() => 0)
    case OperationOp.Compare:
      return drawOps.map((drawOp) => {
        if (drawOp.action === DrawAction.Highlight || drawOp.action === DrawAction.Dim) return 0
        if (isConnectorLine(drawOp)) return 1
        if (drawOp.action === DrawAction.Line || drawOp.action === DrawAction.Text) return 2
        return 2
      })
    case OperationOp.CompareBool:
      return drawOps.map(() => 0)
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
        if (drawOp.action === DrawAction.Highlight || drawOp.action === DrawAction.Dim) return 0
        if (drawOp.action === DrawAction.Line) return isConnectorLine(drawOp) ? 1 : 2
        if (drawOp.action === DrawAction.Text) return 2
        return 2
      })
    }
    case OperationOp.LagDiff:
      return drawOps.map((drawOp) => {
        if (isConnectorLine(drawOp)) return 0
        return 1
      })
    case OperationOp.PairDiff:
      return (() => {
        const hasConnector = drawOps.some((drawOp) => isConnectorLine(drawOp))
        return drawOps.map((drawOp) => {
          if (isConnectorLine(drawOp)) return 0
          if (drawOp.action === DrawAction.Highlight || drawOp.action === DrawAction.Dim) {
            return hasConnector ? 1 : 0
          }
          if (drawOp.action === DrawAction.Text) return 1
          return hasConnector ? 1 : 0
        })
      })()
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

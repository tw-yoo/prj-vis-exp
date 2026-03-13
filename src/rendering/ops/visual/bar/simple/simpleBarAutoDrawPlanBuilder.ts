import type { DatumValue, OperationSpec, TargetSelector } from '../../../../../types'
import { OperationOp } from '../../../../../types'
import type { AutoDrawPlanContext } from '../../../common/executeDataOp'
import { draw, ops } from '../../../../../operation/build/authoring'
import { getRuntimeResultsById, resolveBinaryInputsFromMeta } from '../../../../../domain/operation/dataOps'
import { AVERAGE_LINE_COLOR, formatDrawNumber, makeAverageTextOp } from '../../helpers'
import { withStagedAutoDrawPlanRegistry } from '../../helpers'
import { getSimpleBarSplitDomain } from '../../../../bar/simpleBarRenderer'

type TargetPoint = { target: string; series?: string }
type ScalarRefValue = { refKey: string; label: string; value: number; target: string | null }
type TargetMetric = { value: number; x: number; y: number }

const EMPHASIS_RED = '#ef4444'

function lineAt(value: number, color = '#0ea5e9') {
  return draw.lineSpec.horizontalFromY(value, draw.style.line(color, 2, 0.85))
}

function textScore(value: number | string, label?: string) {
  const renderedValue = typeof value === 'number' ? formatDrawNumber(value) : String(value)
  const rendered = label ? `${label}: ${renderedValue}` : renderedValue
  return draw.textSpec.normalized(rendered, 0.92, 0.08, draw.style.text('#111827', 12, 'bold'))
}

function scalarFromResult(result: DatumValue[]) {
  const value = result?.length ? Number(result[0]?.value) : NaN
  return Number.isFinite(value) ? value : null
}

function resolveRefPoint(ref: string, fallbackSeries?: string | null): TargetPoint | null {
  const refKey = ref.startsWith('ref:') ? ref.slice('ref:'.length) : ref
  const runtimeRows = getRuntimeResultsById(refKey)
  if (!runtimeRows.length) return null
  const first = runtimeRows[0]
  return {
    target: String(first.target),
    series: first.group != null ? String(first.group) : fallbackSeries ?? undefined }
}

function toPoint(selector: TargetSelector, fallbackSeries?: string | null): TargetPoint | null {
  if (selector == null) return null
  if (typeof selector === 'string' || typeof selector === 'number') {
    if (typeof selector === 'string' && selector.startsWith('ref:')) {
      return resolveRefPoint(selector, fallbackSeries)
    }
    return { target: String(selector), series: fallbackSeries ?? undefined }
  }
  if (typeof selector === 'object' && typeof selector.id === 'string' && selector.id.startsWith('n')) {
    return resolveRefPoint(selector.id, fallbackSeries)
  }
  const target =
    selector.target != null
      ? String(selector.target)
      : selector.category != null
        ? String(selector.category)
        : selector.id != null
          ? String(selector.id)
          : null
  if (!target) return null
  const series = selector.series != null ? String(selector.series) : fallbackSeries ?? undefined
  return { target, series }
}

function selectorPoints(
  selector: TargetSelector | TargetSelector[] | undefined,
  fallbackSeries?: string | null,
): TargetPoint[] {
  if (selector == null) return []
  const list = Array.isArray(selector) ? selector : [selector]
  return list
    .map((item) => toPoint(item, fallbackSeries))
    .filter((item): item is TargetPoint => item !== null)
}

function selectorRefKey(selector: TargetSelector | TargetSelector[] | undefined): string | null {
  if (selector == null) return null
  if (Array.isArray(selector)) {
    for (const item of selector) {
      const key = selectorRefKey(item)
      if (key) return key
    }
    return null
  }
  if (typeof selector === 'string') {
    if (selector.startsWith('ref:')) return selector.slice('ref:'.length)
    if (/^n\d+$/i.test(selector)) return selector
    return null
  }
  if (typeof selector === 'number') return null
  if (typeof selector.id === 'string') {
    if (selector.id.startsWith('ref:')) return selector.id.slice('ref:'.length)
    if (/^n\d+$/i.test(selector.id)) return selector.id
  }
  return null
}

function resolveScalarRef(selector: TargetSelector | TargetSelector[] | undefined): ScalarRefValue | null {
  const refKey = selectorRefKey(selector)
  if (!refKey) return null
  const runtimeRows = getRuntimeResultsById(refKey)
  if (!runtimeRows.length) return null
  const numeric = runtimeRows.map((row) => Number(row.value)).find((value) => Number.isFinite(value))
  if (numeric == null || !Number.isFinite(numeric)) return null
  const preferred = runtimeRows[0]?.name ? String(runtimeRows[0].name) : `ref:${refKey}`
  return {
    refKey,
    label: preferred,
    value: numeric,
    target: runtimeRows[0]?.target != null ? String(runtimeRows[0].target) : null }
}

function resolveDiffScalarPair(op: OperationSpec): { left: ScalarRefValue; right: ScalarRefValue } | null {
  const fallback = resolveBinaryInputsFromMeta(op.meta?.inputs)
  const leftSelector = op.targetA ?? fallback.targetA
  const rightSelector = op.targetB ?? fallback.targetB
  const left = resolveScalarRef(leftSelector)
  const right = resolveScalarRef(rightSelector)
  if (!left || !right) return null
  return { left, right }
}

function chartTargetsFromContext(context: AutoDrawPlanContext) {
  const nodes = Array.from(context.container.querySelectorAll('svg [data-target]'))
  const targets = new Set<string>()
  nodes.forEach((node) => {
    if (!(node instanceof Element)) return
    if (node.classList.contains('annotation')) return
    const value = node.getAttribute('data-target')
    if (!value) return
    targets.add(String(value))
  })
  if (targets.size > 0) return targets
  context.prevWorking.forEach((row) => {
    const target = row?.target
    if (target == null) return
    targets.add(String(target))
  })
  return targets
}

function isChartBackedRef(refTarget: string | null, chartTargets: Set<string>) {
  if (!refTarget) return false
  if (refTarget.startsWith('__')) return false
  return chartTargets.has(refTarget)
}

function firstPair(op: OperationSpec): { a: TargetPoint; b: TargetPoint } | null {
  const fallback = resolveBinaryInputsFromMeta(op.meta?.inputs)
  const left = selectorPoints(op.targetA ?? fallback.targetA, op.groupA ?? op.group)
  const right = selectorPoints(op.targetB ?? fallback.targetB, op.groupB ?? op.group)
  if (!left.length || !right.length) return null
  return { a: left[0], b: right[0] }
}

function targetAggregate(data: DatumValue[], target: string) {
  const values = data
    .filter((item) => String(item.target) === target)
    .map((item) => Number(item.value))
    .filter(Number.isFinite)
  if (!values.length) return null
  return values.reduce((acc, value) => acc + value, 0)
}

function highlightTargets(op: OperationSpec, targets: string[], color = '#0ea5e9') {
  if (!targets.length) return [] as any[]
  return [ops.draw.highlight(op.chartId, draw.select.markKeys('rect', ...targets), color)]
}

function uniqueResultTargets(result: DatumValue[]) {
  return Array.from(new Set(result.map((item) => String(item.target))))
}

function isSplitRootFilterHighlightSuppressed(
  op: OperationSpec,
  context: AutoDrawPlanContext,
  candidateTargets: string[],
  result: DatumValue[],
) {
  const view = (op.meta as { view?: { splitGroup?: string; panelId?: string } } | undefined)?.view
  if (!view?.splitGroup || !view?.panelId) return false
  if (!op.chartId || op.chartId !== view.panelId) return false
  const metaInputs = Array.isArray(op.meta?.inputs) ? op.meta.inputs : []
  if (metaInputs.length > 0) return false

  const panelDomain = getSimpleBarSplitDomain(context.container, op.chartId)
  if (!panelDomain || panelDomain.size === 0) return false

  const requestedTargets = candidateTargets.length ? candidateTargets : uniqueResultTargets(result)
  if (!requestedTargets.length) return false
  if (requestedTargets.length !== panelDomain.size) return false
  const requestedSet = new Set(requestedTargets.map((target) => String(target)))
  for (const domainValue of panelDomain) {
    if (!requestedSet.has(String(domainValue))) return false
  }
  return true
}

function resolveNodeChartId(node: Element) {
  const direct = node.getAttribute('data-chart-id')
  if (direct && direct.trim().length > 0) return direct.trim()
  const scopedParent = node.closest('[data-chart-id]')
  if (!scopedParent) return null
  const inherited = scopedParent.getAttribute('data-chart-id')
  return inherited && inherited.trim().length > 0 ? inherited.trim() : null
}

function collectTargetMetrics(context: AutoDrawPlanContext, chartId?: string) {
  const out = new Map<string, TargetMetric>()
  const nodes = Array.from(context.container.querySelectorAll<SVGGraphicsElement>('svg [data-target][data-value]'))
  nodes.forEach((node) => {
    if (!(node instanceof Element)) return
    if (node.classList.contains('annotation')) return
    const tagName = node.tagName.toLowerCase()
    if (tagName !== 'rect' && tagName !== 'path') return
    const target = node.getAttribute('data-target')
    if (!target || target.trim().length === 0) return
    if (chartId) {
      const nodeChartId = resolveNodeChartId(node)
      if (nodeChartId && nodeChartId !== chartId) return
    }
    const rawValue = Number(node.getAttribute('data-value'))
    if (!Number.isFinite(rawValue)) return
    const ownerSvg = node.ownerSVGElement
    if (!ownerSvg) return
    const svgRect = ownerSvg.getBoundingClientRect()
    if (!(svgRect.width > 0 && svgRect.height > 0)) return
    let viewportRect = svgRect
    if (chartId) {
      const quotedChartId = chartId.replace(/"/g, '\\"')
      const explicitPanel = ownerSvg.querySelector<SVGGElement>(
        `g[data-chart-id="${quotedChartId}"][data-chart-panel="true"]`,
      )
      const fallbackPanel = node.closest<SVGGElement>(`[data-chart-id="${quotedChartId}"]`)
      const panelNode = explicitPanel ?? fallbackPanel
      if (panelNode) {
        const panelRect = panelNode.getBoundingClientRect()
        if (panelRect.width > 0 && panelRect.height > 0) {
          viewportRect = panelRect
        }
      }
    }
    const rect = node.getBoundingClientRect()
    const x = (rect.left + rect.width / 2 - viewportRect.left) / viewportRect.width
    const y = 1 - (rect.top - viewportRect.top) / viewportRect.height
    if (!Number.isFinite(x) || !Number.isFinite(y)) return
    const key = target.trim()
    const prev = out.get(key)
    if (!prev || rect.width * rect.height > 0) {
      out.set(key, {
        value: rawValue,
        x: Math.max(0, Math.min(1, x)),
        y: Math.max(0, Math.min(1, y)),
      })
    }
  })
  return out
}

function inferNormalizedYForValue(value: number, metrics: Map<string, TargetMetric>, fallbackData: DatumValue[]) {
  const points = Array.from(metrics.values())
    .map((metric) => ({ value: Number(metric.value), y: Number(metric.y) }))
    .filter((point) => Number.isFinite(point.value) && Number.isFinite(point.y))
    .sort((a, b) => a.value - b.value)
  if (points.length === 1) return points[0].y
  if (points.length > 1) {
    if (value <= points[0].value) return points[0].y
    if (value >= points[points.length - 1].value) return points[points.length - 1].y
    for (let i = 0; i < points.length - 1; i += 1) {
      const left = points[i]
      const right = points[i + 1]
      if (value < left.value || value > right.value) continue
      const span = right.value - left.value
      if (!(span > 0)) return (left.y + right.y) / 2
      const t = (value - left.value) / span
      return left.y + t * (right.y - left.y)
    }
    return points[points.length - 1].y
  }

  const numeric = fallbackData.map((row) => Number(row.value)).filter(Number.isFinite)
  if (!numeric.length) return null
  const lo = Math.min(...numeric)
  const hi = Math.max(...numeric)
  if (!(hi > lo)) return 0.5
  return Math.max(0, Math.min(1, (value - lo) / (hi - lo)))
}

function buildPairBarValueTexts(op: OperationSpec, targetA: string, valueA: number | null, targetB: string, valueB: number | null) {
  const plan: any[] = []
  if (Number.isFinite(valueA ?? NaN)) {
    plan.push(
      ops.draw.text(
        op.chartId,
        draw.select.markKeys('rect', targetA),
        draw.textSpec.anchor(formatDrawNumber(Number(valueA)), draw.style.text('#111827', 12, 'bold')),
      ),
    )
  }
  if (Number.isFinite(valueB ?? NaN)) {
    plan.push(
      ops.draw.text(
        op.chartId,
        draw.select.markKeys('rect', targetB),
        draw.textSpec.anchor(formatDrawNumber(Number(valueB)), draw.style.text('#111827', 12, 'bold')),
      ),
    )
  }
  return plan
}

function textTargets(result: DatumValue[], op: OperationSpec, precision = 2) {
  const plan: any[] = []
  result.forEach((entry) => {
    const numeric = Number(entry.value)
    if (!Number.isFinite(numeric)) return
    plan.push(
      ops.draw.text(
        op.chartId,
        draw.select.markKeys('rect', String(entry.target)),
        draw.textSpec.anchor(formatDrawNumber(numeric, precision), draw.style.text('#111827', 12, 'bold')),
      ),
    )
  })
  return plan
}

function contiguousRuns(targets: string[], orderedDomain: string[]) {
  if (!targets.length || !orderedDomain.length) return [] as Array<[string, string]>
  const selected = new Set(targets)
  const runs: Array<[string, string]> = []
  let start: string | null = null
  let prev: string | null = null
  orderedDomain.forEach((label) => {
    if (selected.has(label)) {
      if (!start) start = label
      prev = label
      return
    }
    if (start && prev) runs.push([start, prev])
    start = null
    prev = null
  })
  if (start && prev) runs.push([start, prev])
  return runs
}

function buildSetOpPlan(result: DatumValue[], op: OperationSpec, context: AutoDrawPlanContext) {
  if (!result.length) return null
  const targets = Array.from(new Set(result.map((d) => String(d.target))))
  const plan = highlightTargets(op, targets, '#0ea5e9')
  const domain = Array.from(new Set(context.prevWorking.map((d) => String(d.target))))
  const runs = contiguousRuns(targets, domain)
  const label = op.fn === 'intersection' ? 'intersection' : 'union'
  runs.forEach(([start, end]) => {
    if (start === end) return
    plan.push(
      ops.draw.band(op.chartId, 'x', [start, end], label, {
        fill: 'rgba(59,130,246,0.16)',
        stroke: '#3b82f6',
        strokeWidth: 1.5,
        opacity: 1 }),
    )
  })
  plan.push(ops.draw.text(op.chartId, undefined, textScore(targets.length, label)))
  return plan
}

function buildRangePlan(result: DatumValue[], op: OperationSpec) {
  if (result.length < 2) return null
  const minRow = result.find((row) => String(row.target) === '__min__')
  const maxRow = result.find((row) => String(row.target) === '__max__')
  if (!minRow || !maxRow) return null

  const minName = minRow.name ? String(minRow.name) : ''
  const maxName = maxRow.name ? String(maxRow.name) : ''
  if (minName && maxName) {
    return [
      ops.draw.band(op.chartId, 'x', [minName, maxName], 'range', {
        fill: 'rgba(59,130,246,0.16)',
        stroke: '#3b82f6',
        strokeWidth: 1.5,
        opacity: 1 }),
    ]
  }

  const minValue = Number(minRow.value)
  const maxValue = Number(maxRow.value)
  if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) return null
  const lo = Math.min(minValue, maxValue)
  const hi = Math.max(minValue, maxValue)
  return [
    ops.draw.band(op.chartId, 'y', [lo, hi], 'range', {
      fill: 'rgba(59,130,246,0.14)',
      stroke: '#3b82f6',
      strokeWidth: 1.5,
      opacity: 1 }),
  ]
}

function buildThresholdFilterPlan(result: DatumValue[], op: OperationSpec) {
  const threshold = Number(op.value)
  if (!Number.isFinite(threshold)) return null
  const token = String(op.operator ?? '').toLowerCase()
  const when = token === '>' || token === 'gt'
    ? 'gt'
    : token === '>=' || token === 'gte'
      ? 'gte'
      : token === '<' || token === 'lt'
        ? 'lt'
        : token === '<=' || token === 'lte'
          ? 'lte'
          : null
  if (!when) return null
  const targets = Array.from(new Set(result.map((d) => String(d.target))))
  return [
    ops.draw.line(op.chartId, lineAt(threshold, '#ef4444')),
    ops.draw.barSegment(
      op.chartId,
      targets,
      draw.segmentSpec.threshold(
        threshold,
        when as any,
        draw.style.segment('rgba(239,68,68,0.28)', '#dc2626', 1.5, 0.8),
      ),
    ),
    ops.draw.filter(op.chartId, draw.filterSpec.y(when as any, threshold)),
  ]
}

export const SIMPLE_BAR_AUTO_DRAW_PLAN_BUILDERS: Record<
  string,
  (result: DatumValue[], op: OperationSpec, context: AutoDrawPlanContext) => any[] | null
> = {
  [OperationOp.RetrieveValue]: (result, op) => {
    if (!result.length) return null
    return [...highlightTargets(op, Array.from(new Set(result.map((d) => String(d.target)))), '#ef4444'), ...textTargets(result, op)]
  },
  [OperationOp.Filter]: (result, op, context) => {
    if (Array.isArray(op.include) && op.include.length > 0) {
      const includeTargets = op.include.map((item) => String(item))
      const highlightPlan = isSplitRootFilterHighlightSuppressed(op, context, includeTargets, result)
        ? []
        : highlightTargets(op, includeTargets, '#ef4444')
      return [...highlightPlan, ops.draw.filter(op.chartId, draw.filterSpec.xInclude(...op.include))]
    }
    if (Array.isArray(op.exclude) && op.exclude.length > 0) {
      const excluded = new Set(op.exclude.map((item) => String(item)))
      const pass = result
        .map((item) => String(item.target))
        .filter((target, idx, arr) => arr.indexOf(target) === idx && !excluded.has(target))
      const highlightPlan = isSplitRootFilterHighlightSuppressed(op, context, pass, result)
        ? []
        : highlightTargets(op, pass, '#ef4444')
      return [...highlightPlan, ops.draw.filter(op.chartId, draw.filterSpec.xExclude(...op.exclude))]
    }
    return buildThresholdFilterPlan(result, op)
  },
  [OperationOp.Sort]: (_result, op) => [ops.draw.clear(op.chartId), ops.draw.sort(op.chartId, op.field === 'x' ? 'x' : 'y', op.order === 'desc' ? 'desc' : 'asc')],
  [OperationOp.FindExtremum]: (result, op) => {
    if (!result.length) return null
    return [...highlightTargets(op, Array.from(new Set(result.map((d) => String(d.target)))), '#ef4444'), ...textTargets(result, op)]
  },
  [OperationOp.DetermineRange]: (result, op) => buildRangePlan(result, op),
  [OperationOp.Compare]: (result, op, context) => {
    if (!result.length) return null
    const plan: any[] = []
    const pair = firstPair(op)
    if (!pair) return null
    const valueA = targetAggregate(context.prevWorking, pair.a.target)
    const valueB = targetAggregate(context.prevWorking, pair.b.target)
    const maxValue = Number.isFinite(valueA ?? NaN) && Number.isFinite(valueB ?? NaN) ? Math.max(Number(valueA), Number(valueB)) : null
    const minValue = Number.isFinite(valueA ?? NaN) && Number.isFinite(valueB ?? NaN) ? Math.min(Number(valueA), Number(valueB)) : null
    const metrics = collectTargetMetrics(context, op.chartId)

    plan.push(...highlightTargets(op, [pair.a.target, pair.b.target], EMPHASIS_RED))
    plan.push(...buildPairBarValueTexts(op, pair.a.target, valueA, pair.b.target, valueB))

    if (Number.isFinite(valueA ?? NaN)) {
      plan.push(ops.draw.line(op.chartId, lineAt(Number(valueA), EMPHASIS_RED)))
    }
    if (Number.isFinite(valueB ?? NaN) && Number(valueB) !== Number(valueA)) {
      plan.push(ops.draw.line(op.chartId, lineAt(Number(valueB), EMPHASIS_RED)))
    }

    if (maxValue != null && minValue != null && maxValue > minValue) {
      const smallerTarget = Number(valueA) <= Number(valueB) ? pair.a.target : pair.b.target
      const smallerMetric = metrics.get(smallerTarget)
      const startX = smallerMetric?.x
      const startY = smallerMetric?.y ?? inferNormalizedYForValue(minValue, metrics, context.prevWorking)
      const endY = inferNormalizedYForValue(maxValue, metrics, context.prevWorking)
      if (
        Number.isFinite(startX ?? NaN) &&
        Number.isFinite(startY ?? NaN) &&
        Number.isFinite(endY ?? NaN) &&
        Number(endY) > Number(startY)
      ) {
        plan.push(
          ops.draw.line(
            op.chartId,
            draw.lineSpec.normalized(Number(startX), Number(startY), Number(startX), Number(endY), draw.style.line(EMPHASIS_RED, 2, 0.95)),
          ),
        )
      }
    }

    const compareValue = scalarFromResult(result) ?? (maxValue != null && minValue != null ? maxValue - minValue : null)
    if (compareValue != null && maxValue != null) {
      const compareText = makeAverageTextOp(op.chartId, maxValue, context)
      if (compareText.text) {
        compareText.text.value = `Difference: ${formatDrawNumber(compareValue)}`
      }
      plan.push(compareText)
    }
    return plan.length ? plan : null
  },
  [OperationOp.CompareBool]: (result, op) => {
    const scalar = scalarFromResult(result)
    if (scalar == null) return null
    return [ops.draw.text(op.chartId, undefined, textScore(scalar >= 1 ? 'true' : 'false', 'compareBool'))]
  },
  [OperationOp.Sum]: (result, op) => {
    const scalar = scalarFromResult(result)
    if (scalar == null) return null
    return [ops.draw.sum(op.chartId, draw.sumSpec.value(scalar, op.targetName ?? 'Sum'))]
  },
  [OperationOp.Average]: (result, op, context) => {
    const scalar = scalarFromResult(result)
    if (scalar == null) return null
    return [ops.draw.line(op.chartId, lineAt(scalar, AVERAGE_LINE_COLOR)), makeAverageTextOp(op.chartId, scalar, context)]
  },
  [OperationOp.Diff]: (result, op, context) => {
    const scalarPair = resolveDiffScalarPair(op)
    if (scalarPair) {
      const chartTargets = chartTargetsFromContext(context)
      const leftBacked = isChartBackedRef(scalarPair.left.target, chartTargets)
      const rightBacked = isChartBackedRef(scalarPair.right.target, chartTargets)
      if (leftBacked !== rightBacked) {
        console.warn('[autoDraw:diff] mixed chart-backed refs; keeping mark-diff fallback', {
          nodeId: op.meta?.nodeId ?? null,
          leftTarget: scalarPair.left.target,
          rightTarget: scalarPair.right.target })
      }

      if (!leftBacked && !rightBacked) {
        const leftAbs = Math.abs(scalarPair.left.value)
        const rightAbs = Math.abs(scalarPair.right.value)
        const deltaFromResult = scalarFromResult(result)
        const deltaValue = deltaFromResult != null ? Math.abs(deltaFromResult) : Math.abs(leftAbs - rightAbs)
        const style = {
          leftFill: '#ef4444',
          rightFill: '#ef4444',
          lineStroke: '#ef4444',
          arrowStroke: '#0ea5e9',
          textColor: '#111827',
          panelFill: '#ffffff',
          panelStroke: '#cbd5e1' } as const

        const nodeBase = `${op.meta?.nodeId ?? 'diff'}`
        const panelBaseNode = `${nodeBase}_scalar_base`
        const panelDiffNode = `${nodeBase}_scalar_diff`
        const basePanel = ops.draw.scalarPanel(
          op.chartId,
          draw.scalarPanelSpec.fullReplaceBase(
            scalarPair.left.label,
            leftAbs,
            scalarPair.right.label,
            rightAbs,
            style,
          ),
        )
        basePanel.meta = { nodeId: panelBaseNode, inputs: [], sentenceIndex: op.meta?.sentenceIndex ?? 0 }

        const diffPanel = ops.draw.scalarPanel(
          op.chartId,
          draw.scalarPanelSpec.fullReplaceDiff(
            scalarPair.left.label,
            leftAbs,
            scalarPair.right.label,
            rightAbs,
            deltaValue,
            'Difference',
            style,
          ),
        )
        diffPanel.meta = {
          nodeId: panelDiffNode,
          inputs: [panelBaseNode],
          sentenceIndex: op.meta?.sentenceIndex ?? 0 }
        return [basePanel, diffPanel]
      }

      // chart-backed scalar refs intentionally fall through to mark-diff flow below.
    }

    const pair = firstPair(op)
    if (!pair) return null
    const valueA = targetAggregate(context.prevWorking, pair.a.target)
    const valueB = targetAggregate(context.prevWorking, pair.b.target)
    const maxValue = Number.isFinite(valueA ?? NaN) && Number.isFinite(valueB ?? NaN) ? Math.max(Number(valueA), Number(valueB)) : null
    const minValue = Number.isFinite(valueA ?? NaN) && Number.isFinite(valueB ?? NaN) ? Math.min(Number(valueA), Number(valueB)) : null
    const metrics = collectTargetMetrics(context, op.chartId)

    const plan: any[] = [...highlightTargets(op, [pair.a.target, pair.b.target], EMPHASIS_RED)]
    plan.push(...buildPairBarValueTexts(op, pair.a.target, valueA, pair.b.target, valueB))

    if (Number.isFinite(valueA ?? NaN)) {
      plan.push(ops.draw.line(op.chartId, lineAt(Number(valueA), EMPHASIS_RED)))
    }
    if (Number.isFinite(valueB ?? NaN) && Number(valueB) !== Number(valueA)) {
      plan.push(ops.draw.line(op.chartId, lineAt(Number(valueB), EMPHASIS_RED)))
    }

    if (maxValue != null && minValue != null && maxValue > minValue) {
      const smallerTarget = Number(valueA) <= Number(valueB) ? pair.a.target : pair.b.target
      const smallerMetric = metrics.get(smallerTarget)
      const startX = smallerMetric?.x
      const startY = smallerMetric?.y ?? inferNormalizedYForValue(minValue, metrics, context.prevWorking)
      const endY = inferNormalizedYForValue(maxValue, metrics, context.prevWorking)
      if (
        Number.isFinite(startX ?? NaN) &&
        Number.isFinite(startY ?? NaN) &&
        Number.isFinite(endY ?? NaN) &&
        Number(endY) > Number(startY)
      ) {
        plan.push(
          ops.draw.line(
            op.chartId,
            draw.lineSpec.normalized(Number(startX), Number(startY), Number(startX), Number(endY), draw.style.line(EMPHASIS_RED, 2, 0.95)),
          ),
        )
      }
    }

    const signed = (op as { signed?: unknown }).signed === true
    const scalar = scalarFromResult(result)
    let deltaValue: number | null = null
    if (scalar != null) {
      deltaValue = signed ? scalar : Math.abs(scalar)
    } else if (Number.isFinite(valueA ?? NaN) && Number.isFinite(valueB ?? NaN)) {
      const raw = Number(valueA) - Number(valueB)
      deltaValue = signed ? raw : Math.abs(raw)
    }

    if (deltaValue != null && maxValue != null) {
      const deltaText = makeAverageTextOp(op.chartId, maxValue, context)
      if (deltaText.text) {
        deltaText.text.value = `Δ: ${formatDrawNumber(deltaValue)}`
      }
      plan.push(deltaText)
    }
    return plan
  },
  [OperationOp.Nth]: (result, op) => {
    if (!result.length) return null
    return [...highlightTargets(op, result.map((d) => String(d.target)), '#ef4444'), ...textTargets(result, op)]
  },
  [OperationOp.Count]: (result, op) => {
    const scalar = scalarFromResult(result)
    if (scalar == null) return null
    return [
      ops.draw.text(
        op.chartId,
        undefined,
        draw.textSpec.normalized(`count: ${formatDrawNumber(scalar)}`, 0.5, 0.92, draw.style.text('#111827', 12, 'bold')),
      ),
    ]
  },
  [OperationOp.Scale]: (result, op, context) => {
    const scalar = scalarFromResult(result)
    if (scalar == null) return null
    const plan: any[] = [ops.draw.line(op.chartId, lineAt(scalar, EMPHASIS_RED))]
    const scaleText = makeAverageTextOp(op.chartId, scalar, context)
    if (scaleText.text) {
      scaleText.text.value = `scale: ${formatDrawNumber(scalar)}`
    }
    plan.push(scaleText)

    const targetPoint = toPoint((op as { target?: TargetSelector }).target as TargetSelector)
    if (targetPoint?.target) {
      const metrics = collectTargetMetrics(context, op.chartId)
      const targetActualValue = metrics.get(targetPoint.target)?.value
      plan.push(
        ops.draw.text(
          op.chartId,
          draw.select.markKeys('rect', targetPoint.target),
          draw.textSpec.anchor(
            formatDrawNumber(Number.isFinite(targetActualValue ?? NaN) ? Number(targetActualValue) : scalar),
            draw.style.text('#111827', 12, 'bold'),
          ),
        ),
      )
    }
    return plan
  },
  [OperationOp.SetOp]: (result, op, context) => buildSetOpPlan(result, op, context) }

export const SIMPLE_BAR_AUTO_DRAW_PLANS = withStagedAutoDrawPlanRegistry(
  'simple-bar',
  SIMPLE_BAR_AUTO_DRAW_PLAN_BUILDERS,
)

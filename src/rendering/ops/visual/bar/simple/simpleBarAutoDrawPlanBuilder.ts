import type { DatumValue, OperationSpec, TargetSelector } from '../../../../../types'
import type { DrawOp } from '../../../../draw/types'
import { OperationOp } from '../../../../../types'
import type { AutoDrawPlanContext } from '../../../common/executeDataOp'
import { draw, ops } from '../../../../../operation/build/authoring'
import { getRuntimeResultsById, resolveBinaryInputsFromMeta } from '../../../../../domain/operation/dataOps'
import {
  AUTO_DRAW_TEXT_FONT_SIZE,
  AVERAGE_LINE_COLOR,
  buildBinaryGeometryComparisonPlan,
  formatDrawNumber,
  inferNormalizedYForValue,
  makeAggregateLineSlot,
  makeAverageTextOp,
  makeValueLabelSlot,
  withAnnotationSlot,
} from '../../helpers'
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
  return draw.textSpec.normalized(rendered, 0.92, 0.08, draw.style.text('#111827', AUTO_DRAW_TEXT_FONT_SIZE, 'bold'))
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
  const explicitTarget =
    selector.target != null
      ? String(selector.target)
      : selector.category != null
        ? String(selector.category)
        : null
  if (explicitTarget) {
    const series = selector.series != null ? String(selector.series) : fallbackSeries ?? undefined
    return { target: explicitTarget, series }
  }
  if (typeof selector === 'object' && typeof selector.id === 'string' && selector.id.startsWith('n')) {
    return resolveRefPoint(selector.id, fallbackSeries)
  }
  const target = selector.id != null ? String(selector.id) : null
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
  if (selector.target != null || selector.category != null) {
    return null
  }
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
  return [ops.draw.highlight(op.chartId, draw.select.markFieldKeys('rect', 'target', ...targets), color)]
}

function emphasizedTargets(op: OperationSpec, targets: string[]) {
  const preserve = new Set(
    (
      (op.meta as { visualSurface?: { preserveTargets?: string[] } } | undefined)?.visualSurface?.preserveTargets ?? []
    ).map((value) => String(value)),
  )
  return targets.filter((target) => !preserve.has(String(target)))
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
    // When no chartId, normalize y relative to the plot frame (not the full SVG height)
    // to stay consistent with how draw.lineSpec.normalized() interprets [0,1].
    const viewBox = ownerSvg.viewBox?.baseVal
    const svgScaleY = viewBox && svgRect.height > 0 ? viewBox.height / svgRect.height : 1
    const plotH = Number(ownerSvg.getAttribute('data-plot-h'))
    const mTop = Number(ownerSvg.getAttribute('data-m-top'))
    const usePlotNorm = !chartId && plotH > 0 && Number.isFinite(mTop)
    const y = usePlotNorm
      ? 1 - ((rect.top - svgRect.top) * svgScaleY - mTop) / plotH
      : 1 - (rect.top - viewportRect.top) / viewportRect.height
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

function buildPairBarValueTexts(op: OperationSpec, targetA: string, valueA: number | null, targetB: string, valueB: number | null) {
  const plan: any[] = []
  if (Number.isFinite(valueA ?? NaN)) {
    plan.push(
      withAnnotationSlot(
        ops.draw.text(
          op.chartId,
          draw.select.markFieldKeys('rect', 'target', targetA),
          draw.textSpec.anchor(formatDrawNumber(Number(valueA)), draw.style.text('#111827', AUTO_DRAW_TEXT_FONT_SIZE, 'bold')),
        ),
        makeValueLabelSlot(op.chartId, targetA),
      ),
    )
  }
  if (Number.isFinite(valueB ?? NaN)) {
    plan.push(
      withAnnotationSlot(
        ops.draw.text(
          op.chartId,
          draw.select.markFieldKeys('rect', 'target', targetB),
          draw.textSpec.anchor(formatDrawNumber(Number(valueB)), draw.style.text('#111827', AUTO_DRAW_TEXT_FONT_SIZE, 'bold')),
        ),
        makeValueLabelSlot(op.chartId, targetB),
      ),
    )
  }
  return plan
}

function buildBinaryBarComparisonPlan(
  op: OperationSpec,
  context: AutoDrawPlanContext,
  fallbackColor = EMPHASIS_RED,
) {
  const pair = firstPair(op)
  if (!pair) return null
  const valueA = targetAggregate(context.prevWorking, pair.a.target)
  const valueB = targetAggregate(context.prevWorking, pair.b.target)
  const metrics = collectTargetMetrics(context, op.chartId)
  const metricA = metrics.get(pair.a.target)
  const metricB = metrics.get(pair.b.target)

  const yA = metricA?.y ?? (valueA != null ? inferNormalizedYForValue(op.chartId, valueA, context) : null)
  const yB = metricB?.y ?? (valueB != null ? inferNormalizedYForValue(op.chartId, valueB, context) : null)
  const deltaValue = valueA == null || valueB == null
    ? null
    : op.op === OperationOp.Diff && op.signed
      ? valueA - valueB
      : Math.abs(valueA - valueB)

  return buildBinaryGeometryComparisonPlan({
    chartId: op.chartId,
    color: fallbackColor,
    precision: typeof op.precision === 'number' ? op.precision : 2,
    valueA,
    valueB,
    normalizedYA: yA,
    normalizedYB: yB,
    highlightOps:
      op.op === OperationOp.Diff
        ? undefined
        : highlightTargets(op, emphasizedTargets(op, [pair.a.target, pair.b.target]), fallbackColor),
    valueLabelOps: buildPairBarValueTexts(op, pair.a.target, valueA, pair.b.target, valueB),
    deltaValue,
  })
}

function textTargets(result: DatumValue[], op: OperationSpec, precision = 2) {
  const plan: any[] = []
  result.forEach((entry) => {
    const numeric = Number(entry.value)
    if (!Number.isFinite(numeric)) return
    plan.push(
      withAnnotationSlot(
        ops.draw.text(
          op.chartId,
          draw.select.markFieldKeys('rect', 'target', String(entry.target)),
          draw.textSpec.anchor(formatDrawNumber(numeric, precision), draw.style.text('#111827', AUTO_DRAW_TEXT_FONT_SIZE, 'bold')),
        ),
        makeValueLabelSlot(op.chartId, String(entry.target), entry.group != null ? String(entry.group) : null),
      ),
    )
  })
  return plan
}

function numericFilterBounds(op: OperationSpec) {
  if (String(op.operator ?? '').toLowerCase() !== 'between' || !Array.isArray(op.value) || op.value.length < 2) {
    return null
  }
  const [start, end] = op.value
  const a = Number(start)
  const b = Number(end)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  return [Math.min(a, b), Math.max(a, b)] as const
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

function buildResultDrivenFilterPlan(result: DatumValue[], op: OperationSpec) {
  const targets = Array.from(new Set(result.map((d) => String(d.target))))
  const plan: any[] = []
  const betweenBounds = numericFilterBounds(op)
  if (betweenBounds) {
    plan.push(
      ops.draw.band(op.chartId, 'y', [betweenBounds[0], betweenBounds[1]], 'between', {
        fill: 'rgba(239,68,68,0.12)',
        stroke: '#dc2626',
        strokeWidth: 1.5,
        opacity: 1 }),
    )
  } else {
    const threshold = Number(op.value)
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
    if (Number.isFinite(threshold) && when) {
      plan.push(ops.draw.line(op.chartId, lineAt(threshold, '#ef4444')))
      plan.push(
        ops.draw.barSegment(
          op.chartId,
          targets,
          draw.segmentSpec.threshold(
            threshold,
            when as any,
            draw.style.segment('rgba(239,68,68,0.28)', '#dc2626', 1.5, 0.8),
          ),
        ),
      )
    }
  }
  if (targets.length > 0) {
    plan.unshift(...highlightTargets(op, targets, '#ef4444'))
    plan.push(ops.draw.filter(op.chartId, draw.filterSpec.xInclude(...targets)))
  }
  if (!plan.length) return null
  return plan
}

function buildLagDiffTextOp(op: OperationSpec, x: number, y: number, value: number) {
  return ops.draw.text(
    op.chartId,
    undefined,
    draw.textSpec.normalized(
      formatDrawNumber(value, op.precision),
      x,
      y,
      draw.style.text('#111827', AUTO_DRAW_TEXT_FONT_SIZE, 'bold'),
      0,
      -5,
    ),
  )
}

export const SIMPLE_BAR_AUTO_DRAW_PLAN_BUILDERS: Record<
  string,
  (result: DatumValue[], op: OperationSpec, context: AutoDrawPlanContext) => any[] | null
> = {
  [OperationOp.RetrieveValue]: (result, op) => {
    if (!result.length) return null
    return [
      ...highlightTargets(op, Array.from(new Set(result.map((d) => String(d.target)))), '#ef4444'),
      ...textTargets(result, op, typeof op.precision === 'number' ? op.precision : 2),
    ]
  },
  [OperationOp.Filter]: (result, op, context) => {
    if (Array.isArray(op.include) && op.include.length > 0) {
      return [ops.draw.filter(op.chartId, draw.filterSpec.xInclude(...op.include))]
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
    return buildResultDrivenFilterPlan(result, op)
  },
  [OperationOp.Sort]: (_result, op) => [ops.draw.clear(op.chartId), ops.draw.sort(op.chartId, op.field === 'x' ? 'x' : 'y', op.order === 'desc' ? 'desc' : 'asc')],
  [OperationOp.FindExtremum]: (result, op) => {
    if (!result.length) return null
    return [
      ...highlightTargets(op, Array.from(new Set(result.map((d) => String(d.target)))), '#ef4444'),
      ...textTargets(result, op, typeof op.precision === 'number' ? op.precision : 2),
    ]
  },
  [OperationOp.CompareBool]: (_result, op, context) => buildBinaryBarComparisonPlan(op, context, EMPHASIS_RED),
  [OperationOp.PairDiff]: (_result, op) => {
    console.warn('pairDiff is not supported for simple bar charts', { op })
    return null
  },
  [OperationOp.Sum]: (result, op) => {
    const scalar = scalarFromResult(result)
    if (scalar == null) return null
    return [ops.draw.sum(op.chartId, draw.sumSpec.value(scalar, op.targetName ?? 'Sum'))]
  },
  [OperationOp.Average]: (result, op, context) => {
    const scalar = scalarFromResult(result)
    if (scalar == null) return null
    return [
      withAnnotationSlot(
        ops.draw.line(op.chartId, lineAt(scalar, AVERAGE_LINE_COLOR)),
        makeAggregateLineSlot(op.chartId, 'average'),
      ),
      makeAverageTextOp(op.chartId, scalar, context),
    ]
  },
  [OperationOp.Diff]: (result, op, context) => {
    return buildBinaryBarComparisonPlan(op, context, EMPHASIS_RED)
  },
  [OperationOp.LagDiff]: (result, op, context) => {
    if (!result.length) return null
    const metrics = collectTargetMetrics(context, op.chartId)
    const plan: any[] = []
    const highlighted = new Set<string>()
    result.forEach((entry) => {
      const currentTarget = String(entry.target)
      const previousTarget = entry.prevTarget != null ? String(entry.prevTarget) : null
      if (!previousTarget) return
      const metricPrev = metrics.get(previousTarget)
      const metricCurr = metrics.get(currentTarget)
      if (!metricPrev || !metricCurr) return
      highlighted.add(previousTarget)
      highlighted.add(currentTarget)
      plan.push(
        ops.draw.line(
          op.chartId,
          draw.lineSpec.connectBy(
            previousTarget,
            currentTarget,
            undefined,
            undefined,
            draw.style.line('#0ea5e9', 2, 0.9),
            draw.arrow.endOnly(),
            { start: 'top-right', end: 'top-left' },
          ),
        ),
      )
      plan.push(
        buildLagDiffTextOp(
          op,
          Math.max(0.05, Math.min(0.95, (metricPrev.x + metricCurr.x) / 2)),
          Math.max(0.05, Math.min(0.95, Math.max(metricPrev.y, metricCurr.y) + 0.06)),
          Number(entry.value),
        ),
      )
    })
    if (!plan.length) return null
    return [...highlightTargets(op, Array.from(highlighted), '#0ea5e9'), ...plan]
  },
  [OperationOp.Nth]: (result, op) => {
    if (!result.length) return null
    return [
      ...highlightTargets(op, result.map((d) => String(d.target)), '#ef4444'),
      ...textTargets(result, op, typeof op.precision === 'number' ? op.precision : 2),
    ]
  },
  [OperationOp.Count]: (result, op) => {
    const scalar = scalarFromResult(result)
    if (scalar == null) return null
    return [
      ops.draw.text(
        op.chartId,
        undefined,
        draw.textSpec.normalized(
          `count: ${formatDrawNumber(scalar)}`,
          0.5,
          0.92,
          draw.style.text('#111827', AUTO_DRAW_TEXT_FONT_SIZE, 'bold'),
        ),
      ),
    ]
  },
  [OperationOp.Scale]: (result, op, context) => {
    const scalar = scalarFromResult(result)
    if (scalar == null) return null
    const plan: any[] = [ops.draw.line(op.chartId, lineAt(scalar, EMPHASIS_RED))]
    const scaleText = makeAverageTextOp(op.chartId, scalar, context)
    if (scaleText.text) {
      const factor = Number(op.factor)
      const renderedFactor = Number.isFinite(factor) ? formatDrawNumber(factor, op.precision) : '1'
      scaleText.text.value = `Scaled by ${renderedFactor}: ${formatDrawNumber(scalar, op.precision)}`
    }
    plan.push(scaleText)

    const targetPoint = toPoint((op as { target?: TargetSelector }).target as TargetSelector)
    if (targetPoint?.target) {
      const metrics = collectTargetMetrics(context, op.chartId)
      const targetActualValue = metrics.get(targetPoint.target)?.value
      plan.push(
        withAnnotationSlot(
          ops.draw.text(
            op.chartId,
            draw.select.markFieldKeys('rect', 'target', targetPoint.target),
            draw.textSpec.anchor(
              formatDrawNumber(Number.isFinite(targetActualValue ?? NaN) ? Number(targetActualValue) : scalar),
              draw.style.text('#111827', AUTO_DRAW_TEXT_FONT_SIZE, 'bold'),
            ),
          ),
          makeValueLabelSlot(op.chartId, targetPoint.target),
        ),
      )
    }
    return plan
  } }

export const SIMPLE_BAR_AUTO_DRAW_PLANS = withStagedAutoDrawPlanRegistry(
  'simple-bar',
  SIMPLE_BAR_AUTO_DRAW_PLAN_BUILDERS,
)

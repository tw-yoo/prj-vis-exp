import type { DatumValue, OperationSpec, TargetSelector } from '../../../../../types'
import { OperationOp } from '../../../../../types'
import type { AutoDrawPlanContext } from '../../../common/executeDataOp'
import { draw, ops } from '../../../../../operation/build/authoring'
import { getRuntimeResultsById, resolveBinaryInputsFromMeta } from '../../../../../domain/operation/dataOps'
import { normalizeGroupSelection } from '../../../../../domain/operation/groupSelection'
import { DataAttributes } from '../../../../interfaces'
import {
  AUTO_DRAW_TEXT_FONT_SIZE,
  AVERAGE_LINE_COLOR,
  makeAggregateLineSlot,
  makeAggregateTextSlot,
  buildHighlightPlan,
  buildTextPlan,
  buildBinaryGeometryComparisonPlan,
  formatDrawNumber,
  withAnnotationSlot,
} from '../../helpers'
import { withStagedAutoDrawPlanRegistry } from '../../helpers'

type TargetPoint = { target: string; series?: string }
type GroupedBarMetric = { id: string; target: string; series?: string; value: number; x: number; y: number }

function lineAt(value: number, color = '#0ea5e9') {
  return draw.lineSpec.horizontalFromY(value, draw.style.line(color, 2, 0.85))
}

function textScore(value: number, label?: string) {
  const rendered = label ? `${label}: ${formatDrawNumber(value)}` : formatDrawNumber(value)
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

function firstPair(op: OperationSpec): { a: TargetPoint; b: TargetPoint } | null {
  const fallback = resolveBinaryInputsFromMeta(op.meta?.inputs)
  const left = selectorPoints(op.targetA ?? fallback.targetA, op.groupA ?? op.group)
  const right = selectorPoints(op.targetB ?? fallback.targetB, op.groupB ?? op.group)
  if (!left.length || !right.length) return null
  if ((op.groupA || op.groupB) && left[0].target !== right[0].target) return null
  return { a: left[0], b: right[0] }
}

function firstComparisonPair(op: OperationSpec): { a: TargetPoint; b: TargetPoint } | null {
  const fallback = resolveBinaryInputsFromMeta(op.meta?.inputs)
  const left = selectorPoints(op.targetA ?? fallback.targetA, op.groupA ?? op.group)
  const right = selectorPoints(op.targetB ?? fallback.targetB, op.groupB ?? op.group)
  if (!left.length || !right.length) return null
  return { a: left[0], b: right[0] }
}

function aggregateByTarget(data: DatumValue[], target: string) {
  const values = data
    .filter((item) => String(item.target) === target)
    .map((item) => Number(item.value))
    .filter(Number.isFinite)
  if (!values.length) return null
  return values.reduce((acc, value) => acc + value, 0)
}

function aggregateByPoint(data: DatumValue[], point: TargetPoint) {
  const values = data
    .filter((item) => String(item.target) === point.target)
    .filter((item) => point.series == null || String(item.group ?? '') === String(point.series))
    .map((item) => Number(item.value))
    .filter(Number.isFinite)
  if (!values.length) return null
  return values.reduce((acc, value) => acc + value, 0)
}

function metricKey(point: TargetPoint) {
  return `${point.target}::${point.series ?? ''}`
}

function resolveNodeChartId(node: Element) {
  const direct = node.getAttribute('data-chart-id')
  if (direct && direct.trim().length > 0) return direct.trim()
  const scopedParent = node.closest('[data-chart-id]')
  if (!scopedParent) return null
  const inherited = scopedParent.getAttribute('data-chart-id')
  return inherited && inherited.trim().length > 0 ? inherited.trim() : null
}

function collectGroupedBarMetrics(context: AutoDrawPlanContext, chartId?: string) {
  const out = new Map<string, GroupedBarMetric>()
  const nodes = Array.from(context.container.querySelectorAll<SVGRectElement>('svg rect.main-bar[data-target][data-value]'))
  nodes.forEach((node) => {
    const target = (node.getAttribute('data-target') ?? '').trim()
    if (!target) return
    if (chartId) {
      const nodeChartId = resolveNodeChartId(node)
      if (nodeChartId && nodeChartId !== chartId) return
    }
    const id = (node.getAttribute('data-id') ?? target).trim()
    const series = (node.getAttribute('data-series') ?? node.getAttribute('data-group-value') ?? '').trim() || undefined
    const value = Number(node.getAttribute('data-value'))
    if (!id || !Number.isFinite(value)) return
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
    out.set(metricKey({ target, series }), {
      id,
      target,
      series,
      value,
      x: Math.max(0, Math.min(1, x)),
      y: Math.max(0, Math.min(1, y)),
    })
  })
  return out
}

function buildGroupedBarValueTexts(op: OperationSpec, metrics: GroupedBarMetric[], chartId = op.chartId) {
  return buildTextPlan(
    metrics.map((metric) => ({ target: metric.id, value: metric.value })),
    '#111827',
    typeof op.precision === 'number' ? op.precision : 2,
    DataAttributes.Id,
    chartId,
  )
}

function resolvePanelPairMetric(metrics: GroupedBarMetric[], group: string) {
  const exact = metrics.find((metric) => metric.target === group && metric.series === group)
  if (exact) return exact
  const bySeries = metrics.filter((metric) => metric.series === group)
  if (bySeries.length === 1) return bySeries[0]
  const byTarget = metrics.filter((metric) => metric.target === group)
  if (byTarget.length === 1) return byTarget[0]
  return null
}

function buildFacetPanelPairDiffPlan(result: DatumValue[], op: OperationSpec, context: AutoDrawPlanContext) {
  if (!result.length || !op.groupA || !op.groupB) return null
  const plan: any[] = []

  result.forEach((entry) => {
    const panelChartId = String(entry.target ?? '').trim()
    if (!panelChartId) return

    const panelMetrics = Array.from(collectGroupedBarMetrics(context, panelChartId).values())
    const metricA = resolvePanelPairMetric(panelMetrics, String(op.groupA))
    const metricB = resolvePanelPairMetric(panelMetrics, String(op.groupB))
    if (!metricA || !metricB) return

    plan.push(
      ...buildGroupedBarValueTexts(op, [metricA, metricB], panelChartId),
      ...buildBinaryGeometryComparisonPlan({
        chartId: panelChartId,
        color: '#ef4444',
        precision: typeof op.precision === 'number' ? op.precision : 2,
        valueA: metricA.value,
        valueB: metricB.value,
        normalizedYA: metricA.y,
        normalizedYB: metricB.y,
        deltaValue: Number(entry.value),
      }),
    )
  })

  return plan.length ? plan : null
}

function buildBinaryGroupedBarComparisonPlan(op: OperationSpec, context: AutoDrawPlanContext, color = '#ef4444') {
  const pair = firstComparisonPair(op)
  if (!pair) return null
  const metrics = collectGroupedBarMetrics(context, op.chartId)
  const metricA = metrics.get(metricKey(pair.a))
  const metricB = metrics.get(metricKey(pair.b))
  const valueA = metricA?.value ?? aggregateByPoint(context.prevWorking, pair.a)
  const valueB = metricB?.value ?? aggregateByPoint(context.prevWorking, pair.b)
  const highlightKeys = [metricA?.id, metricB?.id].filter((value): value is string => typeof value === 'string' && value.length > 0)
  const deltaValue = valueA == null || valueB == null
    ? null
    : op.op === OperationOp.Diff && op.signed
      ? valueA - valueB
      : Math.abs(valueA - valueB)
  return buildBinaryGeometryComparisonPlan({
    chartId: op.chartId,
    color,
    precision: typeof op.precision === 'number' ? op.precision : 2,
    valueA,
    valueB,
    normalizedYA: metricA?.y ?? null,
    normalizedYB: metricB?.y ?? null,
    highlightOps:
      op.op === OperationOp.Diff
        ? undefined
        : highlightKeys.length
          ? buildHighlightPlan(highlightKeys, color, 'id')
          : buildHighlightPlan(emphasizedTargets(op, [pair.a.target, pair.b.target]), color),
    valueLabelOps: buildGroupedBarValueTexts(op, [metricA, metricB].filter((value): value is GroupedBarMetric => value != null)),
    deltaValue,
  })
}

function seriesPairLine(op: OperationSpec, pair: { a: TargetPoint; b: TargetPoint }, color: string) {
  return ops.draw.line(
    op.chartId,
    draw.lineSpec.connectBy(
      pair.a.target,
      pair.b.target,
      pair.a.series,
      pair.b.series,
      draw.style.line(color, 2, 0.9),
      draw.arrow.endOnly(),
    ),
  )
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
  const plan = buildHighlightPlan(targets, '#0ea5e9')
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

function uniqueTargets(result: DatumValue[]) {
  return Array.from(new Set(result.map((row) => String(row.target))))
}

function emphasizedTargets(op: OperationSpec, targets: string[]) {
  const preserve = new Set(
    ((op.meta as { visualSurface?: { preserveTargets?: string[] } } | undefined)?.visualSurface?.preserveTargets ?? [])
      .map((value) => String(value)),
  )
  return targets.filter((target) => !preserve.has(String(target)))
}

function toTargetValueEntries(result: DatumValue[]) {
  const seen = new Set<string>()
  const out: Array<{ target: string; value: number }> = []
  result.forEach((row) => {
    const target = String(row.target)
    const value = Number(row.value)
    if (!target || !Number.isFinite(value) || seen.has(target)) return
    seen.add(target)
    out.push({ target, value })
  })
  return out
}

function parseThresholdCondition(operator: string | undefined) {
  const token = String(operator ?? '').toLowerCase()
  if (token === '>' || token === 'gt') return 'gt' as const
  if (token === '>=' || token === 'gte') return 'gte' as const
  if (token === '<' || token === 'lt') return 'lt' as const
  if (token === '<=' || token === 'lte') return 'lte' as const
  return null
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

function buildFilterPlan(result: DatumValue[], op: OperationSpec) {
  const groupSelection = normalizeGroupSelection((op as OperationSpec & { group?: unknown }).group)
  if (groupSelection.kind === 'single') {
    return [ops.draw.groupedFilterGroups(op.chartId, [groupSelection.values[0]], 'include')]
  }
  if (Array.isArray(op.include) && op.include.length > 0) {
    const includeTargets = op.include.map((item) => String(item))
    return [
      ...buildHighlightPlan(includeTargets, '#ef4444'),
      ops.draw.filter(op.chartId, draw.filterSpec.xInclude(...op.include)),
    ]
  }
  if (Array.isArray(op.exclude) && op.exclude.length > 0) {
    const excluded = new Set(op.exclude.map((item) => String(item)))
    const pass = uniqueTargets(result).filter((target) => !excluded.has(target))
    return [
      ...buildHighlightPlan(pass, '#ef4444'),
      ops.draw.filter(op.chartId, draw.filterSpec.xExclude(...op.exclude)),
    ]
  }
  const targets = uniqueTargets(result)
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
    const condition = parseThresholdCondition(op.operator)
    if (Number.isFinite(threshold) && condition) {
      plan.push(ops.draw.line(op.chartId, lineAt(threshold, '#ef4444')))
      plan.push(
        ops.draw.barSegment(
          op.chartId,
          targets,
          draw.segmentSpec.threshold(
            threshold,
            condition,
            draw.style.segment('rgba(239,68,68,0.28)', '#dc2626', 1.5, 0.8),
          ),
        ),
      )
    }
  }
  if (targets.length > 0) {
    plan.unshift(...buildHighlightPlan(targets, '#ef4444'))
    plan.push(ops.draw.filter(op.chartId, draw.filterSpec.xInclude(...targets)))
  }
  return plan.length ? plan : null
}

export const GROUPED_BAR_AUTO_DRAW_PLAN_BUILDERS: Record<
  string,
  (result: DatumValue[], op: OperationSpec, context: AutoDrawPlanContext) => any[] | null
> = {
  [OperationOp.RetrieveValue]: (result, op) => {
    if (!result.length) return null
    return [
      ...buildHighlightPlan(uniqueTargets(result), '#ef4444'),
      ...buildTextPlan(toTargetValueEntries(result), '#111827', typeof op.precision === 'number' ? op.precision : 2, 'target', op.chartId),
    ]
  },
  [OperationOp.Filter]: (result, op) => buildFilterPlan(result, op),
  [OperationOp.FindExtremum]: (result, op) => {
    if (!result.length) return null
    return [
      ...buildHighlightPlan(uniqueTargets(result), '#ef4444'),
      ...buildTextPlan(toTargetValueEntries(result), '#111827', typeof op.precision === 'number' ? op.precision : 2, 'target', op.chartId),
    ]
  },
  [OperationOp.Sort]: (_result, op) => [
    ops.draw.clear(op.chartId),
    ops.draw.sort(op.chartId, op.field === 'x' ? 'x' : 'y', op.order === 'desc' ? 'desc' : 'asc'),
  ],
  [OperationOp.Nth]: (result, op) => {
    if (!result.length) return null
    return [
      ...buildHighlightPlan(uniqueTargets(result), '#ef4444'),
      ...buildTextPlan(toTargetValueEntries(result), '#111827', typeof op.precision === 'number' ? op.precision : 2, 'target', op.chartId),
    ]
  },
  [OperationOp.Sum]: (result, op) => {
    const value = scalarFromResult(result)
    if (value == null) return null
    return [ops.draw.sum(op.chartId, draw.sumSpec.value(value, op.targetName ?? 'Sum'))]
  },
  [OperationOp.Average]: (result, op) => {
    const value = scalarFromResult(result)
    if (value == null) return null
    const groupSelection = normalizeGroupSelection((op as OperationSpec & { group?: unknown }).group)
    const plans: any[] = []
    if (groupSelection.kind === 'single') {
      plans.push(ops.draw.groupedToSimple(op.chartId, groupSelection.values[0]))
    }
    plans.push(
      withAnnotationSlot(
        ops.draw.line(op.chartId, lineAt(value, AVERAGE_LINE_COLOR)),
        makeAggregateLineSlot(op.chartId, 'average'),
      ),
      withAnnotationSlot(
        ops.draw.text(op.chartId, undefined, textScore(value, 'average')),
        makeAggregateTextSlot(op.chartId, 'average'),
      ),
    )
    return plans
  },
  [OperationOp.DetermineRange]: (result, op) => buildRangePlan(result, op),
  [OperationOp.Compare]: (_result, op, context) => buildBinaryGroupedBarComparisonPlan(op, context, '#0ea5e9'),
  [OperationOp.CompareBool]: (_result, op, context) => buildBinaryGroupedBarComparisonPlan(op, context, '#ef4444'),
  [OperationOp.Diff]: (result, op, context) => {
    return buildBinaryGroupedBarComparisonPlan(op, context, '#ef4444')
  },
  [OperationOp.LagDiff]: (result, op, context) => {
    if (!result.length) return null
    const metrics = collectGroupedBarMetrics(context, op.chartId)
    const highlightIds: string[] = []
    const textMetrics: GroupedBarMetric[] = []
    const plan: any[] = []
    result.forEach((entry) => {
      if (entry.prevTarget) {
        plan.push(
          ops.draw.line(
            op.chartId,
            draw.lineSpec.connectBy(
              String(entry.prevTarget),
              String(entry.target),
              entry.group ?? undefined,
              entry.group ?? undefined,
              draw.style.line('#0ea5e9', 2, 0.85),
              draw.arrow.endOnly(),
              { start: 'top-right', end: 'top-left' },
            ),
          ),
        )
      }
      const metric = metrics.get(metricKey({ target: String(entry.target), series: entry.group != null ? String(entry.group) : undefined }))
      if (metric) {
        highlightIds.push(metric.id)
        textMetrics.push({ ...metric, value: Number(entry.value) })
      }
    })
    return [...plan, ...buildHighlightPlan(highlightIds, '#0ea5e9', 'id'), ...buildGroupedBarValueTexts(op, textMetrics)]
  },
  [OperationOp.PairDiff]: (result, op, context) => {
    if (!result.length || !op.groupA || !op.groupB) return null
    if (typeof op.keyField === 'string' && op.keyField.trim().length > 0) {
      return buildFacetPanelPairDiffPlan(result, op, context)
    }
    const metrics = collectGroupedBarMetrics(context, op.chartId)
    const plan: any[] = []
    result.forEach((entry) => {
      const target = String(entry.target)
      const metricA = metrics.get(metricKey({ target, series: String(op.groupA) }))
      const metricB = metrics.get(metricKey({ target, series: String(op.groupB) }))
      if (!metricA || !metricB) return
      plan.push(
        ...buildGroupedBarValueTexts(op, [metricA, metricB]),
        ...buildBinaryGeometryComparisonPlan({
          chartId: op.chartId,
          color: '#ef4444',
          precision: typeof op.precision === 'number' ? op.precision : 2,
          valueA: metricA.value,
          valueB: metricB.value,
          normalizedYA: metricA.y,
          normalizedYB: metricB.y,
          deltaValue: Number(entry.value),
        }),
      )
    })
    return plan.length ? plan : null
  },
  [OperationOp.Count]: (result, op) => {
    const value = scalarFromResult(result)
    if (value == null) return null
    return [ops.draw.text(op.chartId, undefined, textScore(value, 'count'))]
  },
  [OperationOp.Add]: (result, op) => {
    const value = scalarFromResult(result)
    if (value == null) return null
    return [ops.draw.line(op.chartId, lineAt(value)), ops.draw.text(op.chartId, undefined, textScore(value, 'add'))]
  },
  [OperationOp.Scale]: (result, op) => {
    const value = scalarFromResult(result)
    if (value == null) return null
    const factor = Number(op.factor)
    const renderedFactor = Number.isFinite(factor) ? formatDrawNumber(factor, op.precision) : '1'
    return [
      ops.draw.line(op.chartId, lineAt(value)),
      ops.draw.text(op.chartId, undefined, textScore(value, `scale ×${renderedFactor}`)),
    ]
  },
  [OperationOp.SetOp]: (result, op, context) => buildSetOpPlan(result, op, context) }


export const GROUPED_BAR_AUTO_DRAW_PLANS = withStagedAutoDrawPlanRegistry(
  'grouped-bar',
  GROUPED_BAR_AUTO_DRAW_PLAN_BUILDERS,
)

import type { DatumValue, OperationSpec, TargetSelector } from '../../../../../types'
import { OperationOp } from '../../../../../types'
import type { AutoDrawPlanContext } from '../../../common/executeDataOp'
import { draw, ops } from '../../../../../operation/build/authoring'
import { getRuntimeResultsById, resolveBinaryInputsFromMeta } from '../../../../../domain/operation/dataOps'
import { normalizeGroupSelection } from '../../../../../domain/operation/groupSelection'
import {
  AUTO_DRAW_TEXT_FONT_SIZE,
  AVERAGE_LINE_COLOR,
  buildBinaryGeometryComparisonPlan,
  buildHighlightPlan,
  buildTextPlan,
  formatDrawNumber,
  makeAggregateLineSlot,
  makeAggregateTextSlot,
  withAnnotationSlot,
} from '../../helpers'
import { withStagedAutoDrawPlanRegistry } from '../../helpers'

type TargetPoint = { target: string; series?: string }
type StackedBarMetric = { id: string; target: string; series?: string; value: number; x: number; y: number }

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

function firstTarget(selector: TargetSelector | TargetSelector[] | undefined): string | null {
  const points = selectorPoints(selector)
  return points.length ? points[0].target : null
}

function firstPair(op: OperationSpec): { a: TargetPoint; b: TargetPoint } | null {
  const fallback = resolveBinaryInputsFromMeta(op.meta?.inputs)
  const left = selectorPoints(op.targetA ?? fallback.targetA, op.groupA ?? op.group)
  const right = selectorPoints(op.targetB ?? fallback.targetB, op.groupB ?? op.group)
  if (!left.length || !right.length) return null

  // For explicit group-pair comparisons, require same target to render strict series-level connector.
  if ((op.groupA || op.groupB) && left[0].target !== right[0].target) {
    return null
  }
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

function aggregateTargetValues(result: DatumValue[]) {
  const totals = new Map<string, number>()
  result.forEach((row) => {
    const target = String(row.target)
    const value = Number(row.value)
    if (!target || !Number.isFinite(value)) return
    totals.set(target, (totals.get(target) ?? 0) + value)
  })
  return Array.from(totals.entries()).map(([target, value]) => ({ target, value }))
}

function resolveNodeChartId(node: Element) {
  const direct = node.getAttribute('data-chart-id')
  if (direct && direct.trim().length > 0) return direct.trim()
  const scopedParent = node.closest('[data-chart-id]')
  if (!scopedParent) return null
  const inherited = scopedParent.getAttribute('data-chart-id')
  return inherited && inherited.trim().length > 0 ? inherited.trim() : null
}

function resolveTopSegmentIdsByTarget(container: HTMLElement, chartId: string | undefined, targets: string[]) {
  const targetSet = new Set(targets.map((target) => String(target)))
  const picks = new Map<string, { id: string; y: number }>()
  const bars = Array.from(container.querySelectorAll<SVGRectElement>('svg rect.main-bar[data-target][data-id]'))
  bars.forEach((bar) => {
    const target = (bar.getAttribute('data-target') ?? '').trim()
    const id = (bar.getAttribute('data-id') ?? '').trim()
    if (!target || !id || !targetSet.has(target)) return
    if (chartId) {
      const nodeChartId = resolveNodeChartId(bar)
      if (nodeChartId && nodeChartId !== chartId) return
    }
    const y = Number(bar.getAttribute('y'))
    const normalizedY = Number.isFinite(y) ? y : Number.POSITIVE_INFINITY
    const existing = picks.get(target)
    if (!existing || normalizedY < existing.y) {
      picks.set(target, { id, y: normalizedY })
    }
  })
  const out = new Map<string, string>()
  picks.forEach((pick, target) => out.set(target, pick.id))
  return out
}

function collectStackedBarMetrics(context: AutoDrawPlanContext, chartId?: string) {
  const out = new Map<string, StackedBarMetric>()
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
    const rect = node.getBoundingClientRect()
    const x = (rect.left + rect.width / 2 - svgRect.left) / svgRect.width
    const y = 1 - (rect.top - svgRect.top) / svgRect.height
    if (!Number.isFinite(x) || !Number.isFinite(y)) return
    out.set(metricKey({ target, series }), { id, target, series, value, x, y })
  })
  return out
}

function buildStackedBarValueTexts(op: OperationSpec, metrics: StackedBarMetric[]) {
  return buildTextPlan(
    metrics.map((metric) => ({ target: metric.id, value: metric.value })),
    '#111827',
    typeof op.precision === 'number' ? op.precision : 2,
    'id',
    op.chartId,
  )
}

function buildStackedBarDeltaText(op: OperationSpec, x: number, y: number, value: number) {
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

function comparisonTextPosition(a: StackedBarMetric, b: StackedBarMetric) {
  return {
    x: Math.max(0.05, Math.min(0.95, (a.x + b.x) / 2)),
    y: Math.max(0.05, Math.min(0.95, Math.max(a.y, b.y) + 0.06)),
  }
}

function buildBinaryStackedBarComparisonPlan(op: OperationSpec, context: AutoDrawPlanContext, color = '#ef4444') {
  const pair = firstComparisonPair(op)
  if (!pair) return null
  const metrics = collectStackedBarMetrics(context, op.chartId)
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
    valueLabelOps: buildStackedBarValueTexts(op, [metricA, metricB].filter((value): value is StackedBarMetric => value != null)),
    deltaValue,
  })
}

function buildRetrieveValuePlan(result: DatumValue[], op: OperationSpec, context: AutoDrawPlanContext) {
  if (!result.length) return null
  const precision = typeof op.precision === 'number' ? op.precision : 2

  const groupSelection = normalizeGroupSelection((op as OperationSpec & { group?: unknown }).group)
  if (groupSelection.kind === 'single') {
    const groupToken = groupSelection.values[0]
    const segmentEntries = result
      .map((row) => {
        const target = String(row.target)
        const group = row.group != null ? String(row.group) : groupToken
        const id = (row.id != null ? String(row.id) : `${target}|${group}`).trim()
        const value = Number(row.value)
        if (!id || !Number.isFinite(value)) return null
        return { id, value }
      })
      .filter((entry): entry is { id: string; value: number } => entry !== null)
    if (!segmentEntries.length) return null
    return [
      ...buildHighlightPlan(segmentEntries.map((entry) => entry.id), '#ef4444', 'id'),
      ...buildTextPlan(
        segmentEntries.map((entry) => ({ target: entry.id, value: entry.value })),
        '#111827',
        precision,
        'id',
        op.chartId,
      ),
    ]
  }

  const aggregatedEntries = aggregateTargetValues(result)
  if (!aggregatedEntries.length) return null
  const targets = aggregatedEntries.map((entry) => entry.target)
  const topSegmentIds = resolveTopSegmentIdsByTarget(context.container, op.chartId, targets)
  const textEntries = aggregatedEntries
    .map((entry) => {
      const id = topSegmentIds.get(entry.target)
      if (!id) return null
      return { target: id, value: entry.value }
    })
    .filter((entry): entry is { target: string; value: number } => entry !== null)

  const plan: any[] = [...buildHighlightPlan(targets, '#ef4444', 'target')]
  if (textEntries.length) {
    plan.push(...buildTextPlan(textEntries, '#111827', precision, 'id', op.chartId))
  }
  return plan
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
    // Data-op filter.group means series filtering in-place, not chart-type conversion.
    return [ops.draw.stackedFilterGroups(op.chartId, [groupSelection.values[0]], 'include')]
  }
  if (Array.isArray(op.include) && op.include.length > 0) {
    return [
      ops.draw.filter(op.chartId, draw.filterSpec.xInclude(...op.include)),
    ]
  }
  if (Array.isArray(op.exclude) && op.exclude.length > 0) {
    return [
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
    plan.push(ops.draw.filter(op.chartId, draw.filterSpec.xInclude(...targets)))
  }
  return plan.length ? plan : null
}

export const STACKED_BAR_AUTO_DRAW_PLAN_BUILDERS: Record<
  string,
  (result: DatumValue[], op: OperationSpec, context: AutoDrawPlanContext) => any[] | null
> = {
  [OperationOp.RetrieveValue]: (result, op, context) => buildRetrieveValuePlan(result, op, context),
  [OperationOp.Filter]: (result, op) => buildFilterPlan(result, op),
  [OperationOp.FindExtremum]: (result, op, context) => {
    if (!result.length) return null
    const value = scalarFromResult(result)
    const targets = uniqueTargets(result)
    const textEntries = targets.map((target) => ({ target, value: Number(value ?? NaN) }))
    const whichLabel = op.which === 'min' ? 'min' : 'max'
    const plan: any[] = []
    if (value != null) {
      plan.push(
        withAnnotationSlot(
          ops.draw.line(op.chartId, lineAt(value, '#ef4444')),
          makeAggregateLineSlot(op.chartId, whichLabel),
        ),
      )
      plan.push(
        withAnnotationSlot(
          ops.draw.text(op.chartId, undefined, textScore(value, whichLabel)),
          makeAggregateTextSlot(op.chartId, whichLabel),
        ),
      )
    }
    if (targets.length) {
      const topSegmentIds = resolveTopSegmentIdsByTarget(context.container, op.chartId, targets)
      const anchored = textEntries
        .map((entry) => {
          const id = topSegmentIds.get(entry.target)
          if (!id || !Number.isFinite(entry.value)) return null
          return { target: id, value: entry.value }
        })
        .filter((entry): entry is { target: string; value: number } => entry !== null)
      if (anchored.length) {
        plan.push(...buildTextPlan(anchored, '#111827', typeof op.precision === 'number' ? op.precision : 2, 'id', op.chartId))
      }
    }
    return plan.length ? plan : null
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
    return [
      withAnnotationSlot(
        ops.draw.line(op.chartId, lineAt(value, AVERAGE_LINE_COLOR)),
        makeAggregateLineSlot(op.chartId, 'average'),
      ),
      withAnnotationSlot(
        ops.draw.text(op.chartId, undefined, textScore(value, 'average')),
        makeAggregateTextSlot(op.chartId, 'average'),
      ),
    ]
  },
  [OperationOp.DetermineRange]: (result, op) => buildRangePlan(result, op),
  [OperationOp.Compare]: (_result, op, context) => buildBinaryStackedBarComparisonPlan(op, context, '#0ea5e9'),
  [OperationOp.CompareBool]: (_result, op, context) => buildBinaryStackedBarComparisonPlan(op, context, '#ef4444'),
  [OperationOp.Diff]: (result, op, context) => {
    return buildBinaryStackedBarComparisonPlan(op, context, '#ef4444')
  },
  [OperationOp.LagDiff]: (result, op, context) => {
    if (!result.length) return null
    const metrics = collectStackedBarMetrics(context, op.chartId)
    const highlightIds: string[] = []
    const textMetrics: StackedBarMetric[] = []
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
    return [...plan, ...buildHighlightPlan(highlightIds, '#0ea5e9', 'id'), ...buildStackedBarValueTexts(op, textMetrics)]
  },
  [OperationOp.PairDiff]: (result, op, context) => {
    if (!result.length || !op.groupA || !op.groupB) return null
    const metrics = collectStackedBarMetrics(context, op.chartId)
    const highlightIds = new Set<string>()
    const plan: any[] = []
    result.forEach((entry) => {
      const target = String(entry.target)
      const metricA = metrics.get(metricKey({ target, series: String(op.groupA) }))
      const metricB = metrics.get(metricKey({ target, series: String(op.groupB) }))
      if (metricA) highlightIds.add(metricA.id)
      if (metricB) highlightIds.add(metricB.id)
      plan.push(
        ops.draw.line(
          op.chartId,
          draw.lineSpec.connectBy(
            target,
            target,
            String(op.groupA),
            String(op.groupB),
            draw.style.line('#ef4444', 2, 0.9),
            draw.arrow.endOnly(),
            { start: 'top-right', end: 'top-left' },
          ),
        ),
      )
      if (metricA && metricB) {
        const position = comparisonTextPosition(metricA, metricB)
        plan.push(
          buildStackedBarDeltaText(
            op,
            position.x,
            position.y,
            Number(entry.value),
          ),
        )
      }
    })
    return plan
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


export const STACKED_BAR_AUTO_DRAW_PLANS = withStagedAutoDrawPlanRegistry(
  'stacked-bar',
  STACKED_BAR_AUTO_DRAW_PLAN_BUILDERS,
)

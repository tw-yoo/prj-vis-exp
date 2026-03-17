import type { DatumValue, OperationSpec, TargetSelector } from '../../../../../types'
import { OperationOp } from '../../../../../types'
import type { AutoDrawPlanContext } from '../../../common/executeDataOp'
import { draw, ops } from '../../../../../operation/build/authoring'
import { getRuntimeResultsById, resolveBinaryInputsFromMeta } from '../../../../../domain/operation/dataOps'
import { AVERAGE_LINE_COLOR, buildHighlightPlan, buildTextPlan, formatDrawNumber } from '../../helpers'
import { withStagedAutoDrawPlanRegistry } from '../../helpers'

type TargetPoint = { target: string; series?: string }

function lineAt(value: number, color = '#0ea5e9') {
  return draw.lineSpec.horizontalFromY(value, draw.style.line(color, 2, 0.85))
}

function textScore(value: number, label?: string) {
  const rendered = label ? `${label}: ${formatDrawNumber(value)}` : formatDrawNumber(value)
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
  if ((op.groupA || op.groupB) && left[0].target !== right[0].target) return null
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

function buildFilterPlan(result: DatumValue[], op: OperationSpec) {
  if (typeof op.group === 'string' && op.group.trim().length > 0) {
    return [ops.draw.groupedFilterGroups(op.chartId, [op.group], 'include')]
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
  const threshold = Number(op.value)
  const condition = parseThresholdCondition(op.operator)
  if (!Number.isFinite(threshold) || !condition) return null
  const targets = uniqueTargets(result)
  return [
    ops.draw.line(op.chartId, lineAt(threshold, '#ef4444')),
    ops.draw.barSegment(
      op.chartId,
      targets,
      draw.segmentSpec.threshold(
        threshold,
        condition,
        draw.style.segment('rgba(239,68,68,0.28)', '#dc2626', 1.5, 0.8),
      ),
    ),
    ops.draw.filter(op.chartId, draw.filterSpec.y(condition, threshold)),
  ]
}

export const GROUPED_BAR_AUTO_DRAW_PLAN_BUILDERS: Record<
  string,
  (result: DatumValue[], op: OperationSpec, context: AutoDrawPlanContext) => any[] | null
> = {
  [OperationOp.RetrieveValue]: (result, op) => {
    if (!result.length) return null
    return [...buildHighlightPlan(uniqueTargets(result), '#ef4444'), ...buildTextPlan(toTargetValueEntries(result), '#111827', 2)]
  },
  [OperationOp.Filter]: (result, op) => buildFilterPlan(result, op),
  [OperationOp.FindExtremum]: (result, op) => {
    if (!result.length) return null
    return [...buildHighlightPlan(uniqueTargets(result), '#ef4444'), ...buildTextPlan(toTargetValueEntries(result), '#111827', 2)]
  },
  [OperationOp.Sort]: (_result, op) => [
    ops.draw.clear(op.chartId),
    ops.draw.sort(op.chartId, op.field === 'x' ? 'x' : 'y', op.order === 'desc' ? 'desc' : 'asc'),
  ],
  [OperationOp.Nth]: (result, op) => {
    if (!result.length) return null
    return [...buildHighlightPlan(uniqueTargets(result), '#ef4444'), ...buildTextPlan(toTargetValueEntries(result), '#111827', 2)]
  },
  [OperationOp.Sum]: (result, op) => {
    const value = scalarFromResult(result)
    if (value == null) return null
    return [ops.draw.sum(op.chartId, draw.sumSpec.value(value, op.targetName ?? 'Sum'))]
  },
  [OperationOp.Average]: (result, op) => {
    const value = scalarFromResult(result)
    if (value == null) return null
    return [ops.draw.line(op.chartId, lineAt(value, AVERAGE_LINE_COLOR))]
  },
  [OperationOp.DetermineRange]: (result, op) => buildRangePlan(result, op),
  [OperationOp.Compare]: (result, op) => {
    if (!result.length) return null
    const plan = buildHighlightPlan(Array.from(new Set(result.map((d) => String(d.target)))))
    const pair = firstPair(op)
    if (pair) {
      plan.push(seriesPairLine(op, pair, '#0ea5e9'))
    } else {
      const targetA = firstTarget(op.targetA)
      const targetB = firstTarget(op.targetB)
      if (targetA && targetB) {
        plan.push(
          ops.draw.line(
            op.chartId,
            draw.lineSpec.connect(targetA, targetB, draw.style.line('#0ea5e9', 2, 0.9), draw.arrow.endOnly()),
          ),
        )
      }
    }
    const value = scalarFromResult(result)
    if (value != null) plan.push(ops.draw.line(op.chartId, lineAt(value)))
    return plan
  },
  [OperationOp.CompareBool]: (result, op) => {
    const value = scalarFromResult(result)
    if (value == null) return null
    return [ops.draw.text(op.chartId, undefined, textScore(value, value >= 1 ? 'true' : 'false'))]
  },
  [OperationOp.Diff]: (result, op, context) => {
    const pair = firstPair(op)
    const plan = [] as any[]
    if (pair) {
      plan.push(seriesPairLine(op, pair, '#ef4444'))
      const valueA = aggregateByTarget(context.prevWorking, pair.a.target)
      const valueB = aggregateByTarget(context.prevWorking, pair.b.target)
      if (valueA != null && valueB != null) {
        plan.push(ops.draw.line(op.chartId, lineAt(Math.min(valueA, valueB), '#94a3b8')))
      }
      plan.push(...buildHighlightPlan(emphasizedTargets(op, [pair.a.target, pair.b.target]), '#0ea5e9'))
    } else {
      const targetA = firstTarget(op.targetA)
      const targetB = firstTarget(op.targetB)
      if (!targetA || !targetB) return null
      const valueA = aggregateByTarget(context.prevWorking, targetA)
      const valueB = aggregateByTarget(context.prevWorking, targetB)
      plan.push(...buildHighlightPlan(emphasizedTargets(op, [targetA, targetB]), '#0ea5e9'))
      plan.push(
        ops.draw.line(
          op.chartId,
          draw.lineSpec.connect(targetA, targetB, draw.style.line('#ef4444', 2, 0.9), draw.arrow.endOnly()),
        ),
      )
      if (valueA != null && valueB != null) {
        plan.push(ops.draw.line(op.chartId, lineAt(Math.min(valueA, valueB), '#94a3b8')))
      }
    }
    const scalar = scalarFromResult(result)
    if (scalar != null) {
      plan.push(ops.draw.text(op.chartId, undefined, textScore(scalar, 'Δ')))
    }
    return plan
  },
  [OperationOp.LagDiff]: (result, op) => {
    if (!result.length) return null
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
            ),
          ),
        )
      }
    })
    const entries = result.map((d) => ({ target: String(d.target), value: d.value }))
    return [...plan, ...buildHighlightPlan(entries.map((d) => d.target), '#0ea5e9'), ...buildTextPlan(entries, '#111827', 2)]
  },
  [OperationOp.PairDiff]: (result, op) => {
    if (!result.length || !op.groupA || !op.groupB) return null
    const plan: any[] = []
    result.forEach((entry) => {
      const target = String(entry.target)
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
          ),
        ),
      )
    })
    const entries = result.map((d) => ({ target: String(d.target), value: d.value }))
    return [...plan, ...buildTextPlan(entries, '#111827', 2)]
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
    return [ops.draw.line(op.chartId, lineAt(value)), ops.draw.text(op.chartId, undefined, textScore(value, 'scale'))]
  },
  [OperationOp.SetOp]: (result, op, context) => buildSetOpPlan(result, op, context) }


export const GROUPED_BAR_AUTO_DRAW_PLANS = withStagedAutoDrawPlanRegistry(
  'grouped-bar',
  GROUPED_BAR_AUTO_DRAW_PLAN_BUILDERS,
)

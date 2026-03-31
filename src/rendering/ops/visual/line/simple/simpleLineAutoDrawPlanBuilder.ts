import type { DatumValue, OperationSpec } from '../../../../../types'
import { OperationOp } from '../../../../../types'
import type { AutoDrawPlanContext } from '../../../common/executeDataOp'
import { draw, ops } from '../../../../../operation/build/authoring'
import { getRuntimeResultsById, resolveBinaryInputsFromMeta } from '../../../../../domain/operation/dataOps'
import {
  AUTO_DRAW_TEXT_FONT_SIZE,
  AVERAGE_LINE_COLOR,
  buildHighlightPlan,
  buildBinaryComparisonRailPlan,
  buildPointValueLabelOps,
  buildSelectedPointGuideOps,
  formatDrawNumber,
  inferNormalizedYForValue,
  makeAverageTextOp,
} from '../../helpers'
import { withStagedAutoDrawPlanRegistry } from '../../helpers'

function scalarFromResult(result: DatumValue[]) {
  const value = result?.length ? Number(result[0]?.value) : NaN
  return Number.isFinite(value) ? value : null
}

function highlightSeriesPoints(result: DatumValue[], chartId?: string, color = '#ef4444') {
  const seen = new Set<string>()
  const out: any[] = []
  result.forEach((datum) => {
    const target = String(datum.target)
    if (!target || seen.has(target)) return
    seen.add(target)
    out.push(ops.draw.highlight(chartId, draw.select.markKeys('circle', target), color))
  })
  return out
}

function pointValueTexts(result: DatumValue[], chartId: string | undefined, precision?: number) {
  const seen = new Set<string>()
  const plan: any[] = []
  result.forEach((datum) => {
    const target = String(datum.target)
    const value = Number(datum.value)
    if (!target || !Number.isFinite(value) || seen.has(target)) return
    seen.add(target)
    plan.push(
      ops.draw.text(
        chartId,
        draw.select.markKeys('circle', target),
        draw.textSpec.anchor(formatDrawNumber(value, precision), draw.style.text('#111827', AUTO_DRAW_TEXT_FONT_SIZE, 'bold')),
      ),
    )
  })
  return plan
}

function resolveSimpleLineComparisonRows(op: OperationSpec, context: AutoDrawPlanContext) {
  const fallback = resolveBinaryInputsFromMeta(op.meta?.inputs)
  const targetA = getSelectorTarget(op.targetA ?? fallback.targetA)
  const targetB = getSelectorTarget(op.targetB ?? fallback.targetB)
  if (!targetA || !targetB) return null
  const source = context.prevWorking
  const rowA =
    source.find((row) => String(row.target) === targetA) ??
    ({ target: targetA, value: Number.NaN } as DatumValue)
  const rowB =
    source.find((row) => String(row.target) === targetB) ??
    ({ target: targetB, value: Number.NaN } as DatumValue)
  return {
    targetA,
    targetB,
    rows: [rowA, rowB],
  }
}

function buildBinarySimpleLineComparisonPlan(
  op: OperationSpec,
  context: AutoDrawPlanContext,
  color = '#ef4444',
) {
  const resolved = resolveSimpleLineComparisonRows(op, context)
  if (!resolved) return null
  const { rows } = resolved
  const valueA = Number(rows[0]?.value)
  const valueB = Number(rows[1]?.value)
  return buildBinaryComparisonRailPlan({
    chartId: op.chartId,
    color,
    precision: typeof op.precision === 'number' ? op.precision : 2,
    valueA: Number.isFinite(valueA) ? valueA : null,
    valueB: Number.isFinite(valueB) ? valueB : null,
    normalizedYA: Number.isFinite(valueA) ? inferNormalizedYForValue(op.chartId, valueA, context) : null,
    normalizedYB: Number.isFinite(valueB) ? inferNormalizedYForValue(op.chartId, valueB, context) : null,
    highlightOps: highlightSeriesPoints(rows, op.chartId, color),
    valueLabelOps: buildPointValueLabelOps({
      chartId: op.chartId,
      result: rows,
      context,
      precision: op.precision,
    }),
    deltaValue:
      Number.isFinite(valueA) && Number.isFinite(valueB)
        ? op.op === OperationOp.Diff && op.signed
          ? valueA - valueB
          : Math.abs(valueA - valueB)
        : null,
  })
}

function textAtTopRight(chartId: string | undefined, value: string) {
  return ops.draw.text(
    chartId,
    undefined,
    draw.textSpec.normalized(value, 0.92, 0.08, draw.style.text('#111827', AUTO_DRAW_TEXT_FONT_SIZE, 'bold')),
  )
}

function hLine(chartId: string | undefined, value: number, color = '#0ea5e9') {
  return ops.draw.line(chartId, draw.lineSpec.horizontalFromY(value, draw.style.line(color, 2, 0.85)))
}

function parseThresholdCondition(operator: string | undefined) {
  const token = String(operator ?? '').toLowerCase()
  if (token === '>' || token === 'gt') return 'gt' as const
  if (token === '>=' || token === 'gte') return 'gte' as const
  if (token === '<' || token === 'lt') return 'lt' as const
  if (token === '<=' || token === 'lte') return 'lte' as const
  return null
}

function getSelectorTarget(selector: any): string | null {
  if (selector == null) return null
  if (typeof selector === 'string' && selector.startsWith('ref:')) {
    const runtimeRows = getRuntimeResultsById(selector.slice('ref:'.length))
    return runtimeRows.length ? String(runtimeRows[0].target) : null
  }
  if (typeof selector === 'string' || typeof selector === 'number') return String(selector)
  if (Array.isArray(selector)) return getSelectorTarget(selector[0])
  if (typeof selector === 'object') {
    if (selector.target != null) return String(selector.target)
    if (selector.category != null) return String(selector.category)
    if (typeof selector.id === 'string' && selector.id.startsWith('n')) {
      const runtimeRows = getRuntimeResultsById(selector.id)
      if (runtimeRows.length) return String(runtimeRows[0].target)
    }
    if (selector.id != null) return String(selector.id)
  }
  return null
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

function rangeBandPlan(result: DatumValue[], op: OperationSpec) {
  const minRow = result.find((row) => String(row.target) === '__min__')
  const maxRow = result.find((row) => String(row.target) === '__max__')
  if (!minRow || !maxRow) return null
  const minName = minRow.name ? String(minRow.name) : ''
  const maxName = maxRow.name ? String(maxRow.name) : ''
  if (minName && maxName) {
    return [ops.draw.band(op.chartId, 'x', [minName, maxName], 'range')]
  }
  const minValue = Number(minRow.value)
  const maxValue = Number(maxRow.value)
  if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) return null
  return [ops.draw.band(op.chartId, 'y', [Math.min(minValue, maxValue), Math.max(minValue, maxValue)], 'range')]
}

function buildFilterPlan(result: DatumValue[], op: OperationSpec) {
  const targets = Array.from(new Set(result.map((row) => String(row.target))))
  const highlightPlan = buildHighlightPlan(targets, '#ef4444')
  const plan: any[] = [ops.draw.lineToBar(op.chartId)]

  if (Array.isArray(op.include) && op.include.length > 0) {
    const includeTargets = op.include.map((item) => String(item))
    return [...plan, ...highlightPlan, ops.draw.filter(op.chartId, draw.filterSpec.xInclude(...includeTargets))]
  }
  if (Array.isArray(op.exclude) && op.exclude.length > 0) {
    const excludeTargets = op.exclude.map((item) => String(item))
    return [
      ...plan,
      ...highlightPlan,
      ops.draw.filter(op.chartId, draw.filterSpec.xExclude(...excludeTargets)),
    ]
  }
  if (String(op.operator ?? '').toLowerCase() === 'between' && Array.isArray(op.value) && op.value.length >= 2) {
    const [start, end] = op.value
    const low = Number(start)
    const high = Number(end)
    if (Number.isFinite(low) && Number.isFinite(high)) {
      plan.push(ops.draw.band(op.chartId, 'y', [Math.min(low, high), Math.max(low, high)], 'between'))
    }
  } else {
    const threshold = Number(op.value)
    const condition = parseThresholdCondition(op.operator)
    if (Number.isFinite(threshold) && condition) {
      plan.push(hLine(op.chartId, threshold, '#ef4444'))
    }
  }
  if (targets.length > 0) {
    plan.push(ops.draw.filter(op.chartId, draw.filterSpec.xInclude(...targets)))
    plan.push(...highlightPlan)
  }
  return plan.length ? plan : null
}

export const SIMPLE_LINE_AUTO_DRAW_PLAN_BUILDERS: Record<
  string,
  (result: DatumValue[], op: OperationSpec, context: AutoDrawPlanContext) => any[] | null
> = {
  [OperationOp.RetrieveValue]: (result, op, context) => [
    ...highlightSeriesPoints(result, op.chartId),
    ...buildSelectedPointGuideOps({ chartId: op.chartId, result, context }),
    ...pointValueTexts(result, op.chartId, op.precision),
  ],
  [OperationOp.FindExtremum]: (result, op, context) => [
    ...highlightSeriesPoints(result, op.chartId),
    ...buildSelectedPointGuideOps({ chartId: op.chartId, result, context }),
    ...pointValueTexts(result, op.chartId, op.precision),
  ],
  [OperationOp.Filter]: (result, op) => buildFilterPlan(result, op),
  [OperationOp.Average]: (result, op, context) => {
    const avg = scalarFromResult(result)
    if (avg == null) return null
    return [hLine(op.chartId, avg, AVERAGE_LINE_COLOR), makeAverageTextOp(op.chartId, avg, context)]
  },
  [OperationOp.DetermineRange]: (result, op) => rangeBandPlan(result, op),
  [OperationOp.Diff]: (_result, op, context) => buildBinarySimpleLineComparisonPlan(op, context, '#ef4444'),
  [OperationOp.Compare]: (_result, op, context) => buildBinarySimpleLineComparisonPlan(op, context, '#0ea5e9'),
  [OperationOp.CompareBool]: (_result, op, context) => buildBinarySimpleLineComparisonPlan(op, context, '#ef4444'),
  [OperationOp.LagDiff]: (result, op) => {
    if (!result.length) return null
    const plan = [] as any[]
    result.forEach((entry) => {
      if (!entry.prevTarget) return
      plan.push(
        ops.draw.line(
          op.chartId,
          draw.lineSpec.connect(
            String(entry.prevTarget),
            String(entry.target),
            draw.style.line('#0ea5e9', 2, 0.85),
            draw.arrow.endOnly(),
          ),
        ),
      )
    })
    return [...plan, ...highlightSeriesPoints(result, op.chartId, '#0ea5e9'), ...pointValueTexts(result, op.chartId, op.precision)]
  },
  [OperationOp.PairDiff]: (_result, op) => {
    console.warn('pairDiff is not supported for simple line charts', { op })
    return null
  },
  [OperationOp.Nth]: (result, op) => highlightSeriesPoints(result, op.chartId),
  [OperationOp.Count]: (result, op) => {
    const count = scalarFromResult(result)
    if (count == null) return null
    return [textAtTopRight(op.chartId, `count: ${count}`)]
  },
  [OperationOp.Add]: (result, op) => {
    const value = scalarFromResult(result)
    if (value == null) return null
    return [hLine(op.chartId, value), textAtTopRight(op.chartId, `add: ${formatDrawNumber(value)}`)]
  },
  [OperationOp.Scale]: (result, op) => {
    const value = scalarFromResult(result)
    if (value == null) return null
    const factor = Number(op.factor)
    const renderedFactor = Number.isFinite(factor) ? formatDrawNumber(factor, op.precision) : '1'
    return [hLine(op.chartId, value), textAtTopRight(op.chartId, `scale ×${renderedFactor}: ${formatDrawNumber(value, op.precision)}`)]
  },
  [OperationOp.Sum]: (result, op) => {
    const value = scalarFromResult(result)
    if (value == null) return null
    return [textAtTopRight(op.chartId, `sum: ${formatDrawNumber(value)}`), hLine(op.chartId, value)]
  },
  [OperationOp.SetOp]: (result, op, context) => {
    if (!result.length) return null
    const targets = Array.from(new Set(result.map((row) => String(row.target))))
    const domain = Array.from(new Set(context.prevWorking.map((row) => String(row.target))))
    const runs = contiguousRuns(targets, domain)
    const plan = [...highlightSeriesPoints(result, op.chartId, '#0ea5e9')]
    runs.forEach(([start, end]) => {
      if (start === end) return
      plan.push(
        ops.draw.band(op.chartId, 'x', [start, end], op.fn === 'intersection' ? 'intersection' : 'union'),
      )
    })
    plan.push(textAtTopRight(op.chartId, `${op.fn ?? 'setOp'}: ${targets.length}`))
    return plan
  } }


export const SIMPLE_LINE_AUTO_DRAW_PLANS = withStagedAutoDrawPlanRegistry(
  'simple-line',
  SIMPLE_LINE_AUTO_DRAW_PLAN_BUILDERS,
)

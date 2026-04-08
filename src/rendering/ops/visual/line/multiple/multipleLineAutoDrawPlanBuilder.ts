import type { DatumValue, OperationSpec } from '../../../../../types'
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
import { buildMultiLinePointId } from '../../../../../rendering/line/multipleLineRenderer'
import { DataAttributes } from '../../../../../rendering/interfaces'

function scalarFromResult(result: DatumValue[]) {
  const value = result?.length ? Number(result[0]?.value) : NaN
  return Number.isFinite(value) ? value : null
}

function pointHighlights(result: DatumValue[], chartId?: string, color = '#ef4444') {
  const seenPoints = new Set<string>()
  const seenSeries = new Set<string>()
  const out: any[] = []
  result.forEach((datum) => {
    const target = String(datum.target)
    const series = datum.group != null ? String(datum.group) : ''
    const pointId = buildMultiLinePointId(target, series)
    if (target && !seenPoints.has(pointId)) {
      seenPoints.add(pointId)
      out.push(ops.draw.highlight(chartId, draw.select.markFieldKeys('circle', 'id', pointId), color))
    }
    if (series && !seenSeries.has(series)) {
      seenSeries.add(series)
      out.push(ops.draw.highlight(chartId, draw.select.markFieldKeys('path', 'series', series), color))
    }
  })
  return out
}

function pointValueTexts(result: DatumValue[], chartId: string | undefined, precision?: number) {
  const seen = new Set<string>()
  const plan: any[] = []
  result.forEach((datum) => {
    const target = String(datum.target)
    const series = datum.group != null ? String(datum.group) : ''
    const value = Number(datum.value)
    const pointId = buildMultiLinePointId(target, series)
    if (!target || !series || !Number.isFinite(value) || seen.has(pointId)) return
    seen.add(pointId)
    plan.push(
      withAnnotationSlot(
        ops.draw.text(
          chartId,
          draw.select.markFieldKeys('circle', 'id', pointId),
          draw.textSpec.anchor(formatDrawNumber(value, precision), draw.style.text('#111827', AUTO_DRAW_TEXT_FONT_SIZE, 'bold')),
        ),
        makeValueLabelSlot(chartId, target, series),
      ),
    )
  })
  return plan
}

type MultiLinePointMetric = {
  id: string
  x: number
  y: number
}

function collectPointMetrics(context: AutoDrawPlanContext, chartId?: string) {
  const out = new Map<string, MultiLinePointMetric>()
  const nodes = Array.from(context.container.querySelectorAll<SVGCircleElement>('svg circle[data-id][data-target][data-value]'))
  nodes.forEach((node) => {
    const pointId = (node.getAttribute('data-id') ?? '').trim()
    if (!pointId) return
    if (chartId) {
      const scoped = node.closest('[data-chart-id]')
      const nodeChartId = scoped?.getAttribute('data-chart-id')
      if (nodeChartId && nodeChartId !== chartId) return
    }
    const ownerSvg = node.ownerSVGElement
    if (!ownerSvg) return
    const svgRect = ownerSvg.getBoundingClientRect()
    if (!(svgRect.width > 0 && svgRect.height > 0)) return
    const rect = node.getBoundingClientRect()
    const x = (rect.left + rect.width / 2 - svgRect.left) / svgRect.width
    const y = 1 - (rect.top + rect.height / 2 - svgRect.top) / svgRect.height
    if (!Number.isFinite(x) || !Number.isFinite(y)) return
    out.set(pointId, { id: pointId, x, y })
  })
  return out
}

function pairDiffText(chartId: string | undefined, x: number, y: number, value: number, precision?: number) {
  return ops.draw.text(
    chartId,
    undefined,
    draw.textSpec.normalized(
      formatDrawNumber(value, precision),
      x,
      y,
      draw.style.text('#111827', AUTO_DRAW_TEXT_FONT_SIZE, 'bold'),
      0,
      -5,
    ),
  )
}

function resolveMultiLineComparisonRows(op: OperationSpec, context: AutoDrawPlanContext) {
  const fallback = resolveBinaryInputsFromMeta(op.meta?.inputs)
  const targetA = getSelectorTarget(op.targetA ?? fallback.targetA)
  const targetB = getSelectorTarget(op.targetB ?? fallback.targetB)
  if (!targetA || !targetB) return null
  const groupA = op.groupA ?? op.group
  const groupB = op.groupB ?? op.group
  const source = context.prevWorking
  const rowA =
    source.find((row) => String(row.target) === targetA && (groupA == null || String(row.group) === String(groupA))) ??
    ({ target: targetA, group: groupA ?? null, value: Number.NaN } as DatumValue)
  const rowB =
    source.find((row) => String(row.target) === targetB && (groupB == null || String(row.group) === String(groupB))) ??
    ({ target: targetB, group: groupB ?? null, value: Number.NaN } as DatumValue)
  return {
    targetA,
    targetB,
    groupA: groupA != null ? String(groupA) : null,
    groupB: groupB != null ? String(groupB) : null,
    rows: [rowA, rowB],
  }
}

function buildBinaryMultiLineComparisonPlan(
  op: OperationSpec,
  context: AutoDrawPlanContext,
  color = '#ef4444',
) {
  const resolved = resolveMultiLineComparisonRows(op, context)
  if (!resolved) return null
  const { targetA, targetB, groupA, groupB, rows } = resolved
  const metrics = collectPointMetrics(context, op.chartId)
  const valueA = Number(rows[0]?.value)
  const valueB = Number(rows[1]?.value)
  const pointA = metrics.get(buildMultiLinePointId(targetA, groupA ?? ''))
  const pointB = metrics.get(buildMultiLinePointId(targetB, groupB ?? ''))
  return buildBinaryGeometryComparisonPlan({
    chartId: op.chartId,
    color,
    precision: typeof op.precision === 'number' ? op.precision : 2,
    valueA: Number.isFinite(valueA) ? valueA : null,
    valueB: Number.isFinite(valueB) ? valueB : null,
    normalizedYA: pointA?.y ?? (Number.isFinite(valueA) ? inferNormalizedYForValue(op.chartId, valueA, context) : null),
    normalizedYB: pointB?.y ?? (Number.isFinite(valueB) ? inferNormalizedYForValue(op.chartId, valueB, context) : null),
    highlightOps: pointHighlights(rows, op.chartId, color),
    valueLabelOps: pointValueTexts(rows, op.chartId, op.precision),
    deltaValue:
      Number.isFinite(valueA) && Number.isFinite(valueB)
        ? op.op === OperationOp.Diff && op.signed
          ? valueA - valueB
          : Math.abs(valueA - valueB)
        : null,
  })
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

function topText(chartId: string | undefined, value: string) {
  return ops.draw.text(
    chartId,
    undefined,
    draw.textSpec.normalized(value, 0.92, 0.08, draw.style.text('#111827', AUTO_DRAW_TEXT_FONT_SIZE, 'bold')),
  )
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
  if (minName && maxName) return [ops.draw.band(op.chartId, 'x', [minName, maxName], 'range')]
  const minValue = Number(minRow.value)
  const maxValue = Number(maxRow.value)
  if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) return null
  return [ops.draw.band(op.chartId, 'y', [Math.min(minValue, maxValue), Math.max(minValue, maxValue)], 'range')]
}

function resolveFilterFieldRole(op: OperationSpec, context: AutoDrawPlanContext) {
  const svg = context.container.querySelector('svg')
  const xField = (svg?.getAttribute(DataAttributes.XField) ?? '').trim()
  const yField = (svg?.getAttribute(DataAttributes.YField) ?? '').trim()
  const field = String(op.field ?? '').trim()
  if (field.length === 0) return 'unknown' as const
  if (xField && field === xField) return 'x' as const
  if (yField && field === yField) return 'y' as const
  return 'unknown' as const
}

function buildFilterPlan(result: DatumValue[], op: OperationSpec, context: AutoDrawPlanContext) {
  if (Array.isArray(op.include) && op.include.length > 0) {
    const includeTargets = op.include.map((item) => String(item))
    return [ops.draw.filter(op.chartId, draw.filterSpec.xInclude(...includeTargets))]
  }
  if (Array.isArray(op.exclude) && op.exclude.length > 0) {
    const excludeTargets = op.exclude.map((item) => String(item))
    return [ops.draw.filter(op.chartId, draw.filterSpec.xExclude(...excludeTargets))]
  }
  const targets = Array.from(new Set(result.map((row) => String(row.target))))
  const filterFieldRole = resolveFilterFieldRole(op, context)
  const plan: any[] = []
  if (
    filterFieldRole === 'y' &&
    String(op.operator ?? '').toLowerCase() === 'between' &&
    Array.isArray(op.value) &&
    op.value.length >= 2
  ) {
    const [start, end] = op.value
    const low = Number(start)
    const high = Number(end)
    if (Number.isFinite(low) && Number.isFinite(high)) {
      plan.push(ops.draw.band(op.chartId, 'y', [Math.min(low, high), Math.max(low, high)], 'between'))
    }
  } else if (filterFieldRole === 'y') {
    const threshold = Number(op.value)
    const condition = parseThresholdCondition(op.operator)
    if (Number.isFinite(threshold) && condition) {
      plan.push(hLine(op.chartId, threshold, '#ef4444'))
    }
  }
  if (targets.length > 0) {
    plan.push(ops.draw.filter(op.chartId, draw.filterSpec.xInclude(...targets)))
  }
  return plan.length ? plan : null
}

export const MULTI_LINE_AUTO_DRAW_PLAN_BUILDERS: Record<
  string,
  (result: DatumValue[], op: OperationSpec, context: AutoDrawPlanContext) => any[] | null
> = {
  [OperationOp.RetrieveValue]: (result, op) => [
    ...pointHighlights(result, op.chartId, '#ef4444'),
    ...pointValueTexts(result, op.chartId, op.precision),
  ],
  [OperationOp.FindExtremum]: (result, op) => [
    ...pointHighlights(result, op.chartId, '#ef4444'),
    ...pointValueTexts(result, op.chartId, op.precision),
  ],
  [OperationOp.Filter]: (result, op, context) => buildFilterPlan(result, op, context),
  [OperationOp.Average]: (result, op, context) => {
    const avg = scalarFromResult(result)
    if (avg == null) return null
    return [
      withAnnotationSlot(hLine(op.chartId, avg, AVERAGE_LINE_COLOR), makeAggregateLineSlot(op.chartId, 'average')),
      makeAverageTextOp(op.chartId, avg, context),
    ]
  },
  [OperationOp.DetermineRange]: (result, op) => rangeBandPlan(result, op),
  [OperationOp.Compare]: (_result, op, context) => buildBinaryMultiLineComparisonPlan(op, context, '#0ea5e9'),
  [OperationOp.Diff]: (_result, op, context) => buildBinaryMultiLineComparisonPlan(op, context, '#ef4444'),
  [OperationOp.PairDiff]: (result, op, context) => {
    if (!result.length || !op.groupA || !op.groupB) return null
    const plan: any[] = []
    const highlightRows: DatumValue[] = []
    const metrics = collectPointMetrics(context, op.chartId)
    result.forEach((entry) => {
      const target = String(entry.target)
      const groupA = String(op.groupA)
      const groupB = String(op.groupB)
      highlightRows.push(
        { ...entry, group: groupA, value: Number.NaN },
        { ...entry, group: groupB, value: Number.NaN },
      )
      plan.push(
        ops.draw.line(
          op.chartId,
          draw.lineSpec.connectBy(
            target,
            target,
            groupA,
            groupB,
            draw.style.line('#ef4444', 2, 0.9),
            draw.arrow.endOnly(),
          ),
        ),
      )
      const pointA = metrics.get(buildMultiLinePointId(target, groupA))
      const pointB = metrics.get(buildMultiLinePointId(target, groupB))
      if (pointA && pointB) {
        plan.push(
          pairDiffText(
            op.chartId,
            (pointA.x + pointB.x) / 2,
            (pointA.y + pointB.y) / 2,
            Number(entry.value),
            op.precision,
          ),
        )
      }
    })
    return [...plan, ...pointHighlights(highlightRows, op.chartId, '#ef4444')]
  },
  [OperationOp.LagDiff]: (result, op) => {
    if (!result.length) return null
    const plan: any[] = []
    result.forEach((entry) => {
      if (!entry.prevTarget) return
      const series = entry.group != null ? String(entry.group) : undefined
      plan.push(
        ops.draw.line(
          op.chartId,
          draw.lineSpec.connectBy(
            String(entry.prevTarget),
            String(entry.target),
            series,
            series,
            draw.style.line('#0ea5e9', 2, 0.85),
            draw.arrow.endOnly(),
          ),
        ),
      )
    })
    return [...plan, ...pointHighlights(result, op.chartId, '#0ea5e9'), ...pointValueTexts(result, op.chartId, op.precision)]
  },
  [OperationOp.Nth]: (result, op) => pointHighlights(result, op.chartId),
  [OperationOp.Count]: (result, op) => {
    const value = scalarFromResult(result)
    if (value == null) return null
    return [topText(op.chartId, `count: ${value}`)]
  },
  [OperationOp.CompareBool]: (_result, op, context) => buildBinaryMultiLineComparisonPlan(op, context, '#ef4444'),
  [OperationOp.Add]: (result, op) => {
    const value = scalarFromResult(result)
    if (value == null) return null
    return [hLine(op.chartId, value), topText(op.chartId, `add: ${formatDrawNumber(value)}`)]
  },
  [OperationOp.Scale]: (result, op) => {
    const value = scalarFromResult(result)
    if (value == null) return null
    const factor = Number(op.factor)
    const renderedFactor = Number.isFinite(factor) ? formatDrawNumber(factor, op.precision) : '1'
    return [hLine(op.chartId, value), topText(op.chartId, `scale ×${renderedFactor}: ${formatDrawNumber(value, op.precision)}`)]
  },
  [OperationOp.Sum]: (result, op) => {
    const value = scalarFromResult(result)
    if (value == null) return null
    return [hLine(op.chartId, value), topText(op.chartId, `sum: ${formatDrawNumber(value)}`)]
  },
  [OperationOp.SetOp]: (result, op, context) => {
    if (!result.length) return null
    const targets = Array.from(new Set(result.map((row) => String(row.target))))
    const domain = Array.from(new Set(context.prevWorking.map((row) => String(row.target))))
    const runs = contiguousRuns(targets, domain)
    const plan = [...pointHighlights(result, op.chartId, '#0ea5e9')] as any[]
    runs.forEach(([start, end]) => {
      if (start === end) return
      plan.push(ops.draw.band(op.chartId, 'x', [start, end], op.fn === 'intersection' ? 'intersection' : 'union'))
    })
    plan.push(topText(op.chartId, `${op.fn ?? 'setOp'}: ${targets.length}`))
    return plan
  } }


export const MULTI_LINE_AUTO_DRAW_PLANS = withStagedAutoDrawPlanRegistry(
  'multi-line',
  MULTI_LINE_AUTO_DRAW_PLAN_BUILDERS,
)

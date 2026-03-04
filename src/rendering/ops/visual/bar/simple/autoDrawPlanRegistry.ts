import type { DatumValue, OperationSpec, TargetSelector } from '../../../../../types'
import { OperationOp } from '../../../../../types'
import type { AutoDrawPlanContext } from '../../../common/executeDataOp'
import { draw, ops } from '../../../../../operation/build/authoring'
import { getRuntimeResultsById, resolveBinaryInputsFromMeta } from '../../../../../domain/operation/dataOps'
import { formatDrawNumber } from '../../helpers'

type TargetPoint = { target: string; series?: string }
type ScalarRefValue = { refKey: string; label: string; value: number; target: string | null }

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
    series: first.group != null ? String(first.group) : fallbackSeries ?? undefined,
  }
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
    target: runtimeRows[0]?.target != null ? String(runtimeRows[0].target) : null,
  }
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
        opacity: 1,
      }),
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
        opacity: 1,
      }),
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
      opacity: 1,
    }),
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

export const SIMPLE_BAR_AUTO_DRAW_PLANS: Record<
  string,
  (result: DatumValue[], op: OperationSpec, context: AutoDrawPlanContext) => any[] | null
> = {
  [OperationOp.RetrieveValue]: (result, op) => {
    if (!result.length) return null
    return [...highlightTargets(op, Array.from(new Set(result.map((d) => String(d.target)))), '#ef4444'), ...textTargets(result, op)]
  },
  [OperationOp.Filter]: (result, op) => {
    if (Array.isArray(op.include) && op.include.length > 0) {
      const includeTargets = op.include.map((item) => String(item))
      return [...highlightTargets(op, includeTargets, '#ef4444'), ops.draw.filter(op.chartId, draw.filterSpec.xInclude(...op.include))]
    }
    if (Array.isArray(op.exclude) && op.exclude.length > 0) {
      const excluded = new Set(op.exclude.map((item) => String(item)))
      const pass = result
        .map((item) => String(item.target))
        .filter((target, idx, arr) => arr.indexOf(target) === idx && !excluded.has(target))
      return [...highlightTargets(op, pass, '#ef4444'), ops.draw.filter(op.chartId, draw.filterSpec.xExclude(...op.exclude))]
    }
    return buildThresholdFilterPlan(result, op)
  },
  [OperationOp.Sort]: (_result, op) => [ops.draw.clear(op.chartId), ops.draw.sort(op.chartId, op.field === 'x' ? 'x' : 'y', op.order === 'desc' ? 'desc' : 'asc')],
  [OperationOp.FindExtremum]: (result, op) => {
    if (!result.length) return null
    return [...highlightTargets(op, Array.from(new Set(result.map((d) => String(d.target)))), '#ef4444'), ...textTargets(result, op)]
  },
  [OperationOp.DetermineRange]: (result, op) => buildRangePlan(result, op),
  [OperationOp.Compare]: (result, op) => {
    if (!result.length) return null
    const plan: any[] = []
    const pair = firstPair(op)
    if (pair) {
      plan.push(...highlightTargets(op, [pair.a.target, pair.b.target]))
      plan.push(
        ops.draw.line(
          op.chartId,
          draw.lineSpec.connect(pair.a.target, pair.b.target, draw.style.line('#0ea5e9', 2, 0.9), draw.arrow.endOnly()),
        ),
      )
    }
    const scalar = scalarFromResult(result)
    if (scalar != null) {
      plan.push(ops.draw.line(op.chartId, lineAt(scalar)))
      plan.push(ops.draw.text(op.chartId, undefined, textScore(scalar, 'compare')))
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
  [OperationOp.Average]: (result, op) => {
    const scalar = scalarFromResult(result)
    if (scalar == null) return null
    return [ops.draw.line(op.chartId, lineAt(scalar)), ops.draw.text(op.chartId, undefined, textScore(scalar, 'avg'))]
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
          rightTarget: scalarPair.right.target,
        })
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
          panelStroke: '#cbd5e1',
        } as const

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
            'Δ',
            style,
          ),
        )
        diffPanel.meta = {
          nodeId: panelDiffNode,
          inputs: [panelBaseNode],
          sentenceIndex: op.meta?.sentenceIndex ?? 0,
        }
        return [basePanel, diffPanel]
      }

      // chart-backed scalar refs intentionally fall through to mark-diff flow below.
    }

    const pair = firstPair(op)
    if (!pair) return null
    const nodeBase = `${op.meta?.nodeId ?? 'diff'}`
    const lineNode = `${nodeBase}_line`
    const arrowNode = `${nodeBase}_arrow`
    const textNode = `${nodeBase}_text`

    const connector = ops.draw.line(
      op.chartId,
      draw.lineSpec.connect(pair.a.target, pair.b.target, draw.style.line('#0ea5e9', 2, 0.9)),
    )
    connector.meta = { nodeId: lineNode, inputs: [], sentenceIndex: op.meta?.sentenceIndex ?? 0 }

    // Render only arrowhead in phase 2 (line stroke hidden, arrow style visible).
    const arrowOnly = ops.draw.line(
      op.chartId,
      draw.lineSpec.connect(
        pair.a.target,
        pair.b.target,
        draw.style.line('#0ea5e9', 2, 0.9),
        draw.arrow.endOnly(
          undefined,
          undefined,
          draw.style.arrow('#0ea5e9', '#0ea5e9', 2, 0.9),
        ),
      ),
    )
    arrowOnly.meta = {
      nodeId: arrowNode,
      inputs: [lineNode],
      sentenceIndex: op.meta?.sentenceIndex ?? 0,
    }

    const plan: any[] = [
      ...highlightTargets(op, [pair.a.target, pair.b.target], '#ef4444'),
      connector,
      arrowOnly,
    ]
    const valueA = targetAggregate(context.prevWorking, pair.a.target)
    const valueB = targetAggregate(context.prevWorking, pair.b.target)
    if (valueA != null && valueB != null) {
      plan.push(ops.draw.line(op.chartId, lineAt(Math.min(valueA, valueB), '#94a3b8')))
      const deltaText = ops.draw.text(op.chartId, undefined, textScore(Math.abs(valueA - valueB), 'Δ'))
      deltaText.meta = {
        nodeId: textNode,
        inputs: [lineNode],
        sentenceIndex: op.meta?.sentenceIndex ?? 0,
      }
      plan.push(deltaText)
    }
    return plan
  },
  [OperationOp.LagDiff]: (result, op) => {
    if (!result.length) return null
    const plan: any[] = []
    result.forEach((entry) => {
      const prevTarget = entry.prevTarget ? String(entry.prevTarget) : null
      const target = String(entry.target)
      if (prevTarget) {
        plan.push(
          ops.draw.line(
            op.chartId,
            draw.lineSpec.connect(prevTarget, target, draw.style.line('#0ea5e9', 2, 0.85), draw.arrow.endOnly()),
          ),
        )
      }
    })
    return [...plan, ...highlightTargets(op, Array.from(new Set(result.map((d) => String(d.target))))), ...textTargets(result, op)]
  },
  [OperationOp.PairDiff]: (result, op) => {
    if (!result.length) return null
    return [
      ...highlightTargets(op, Array.from(new Set(result.map((d) => String(d.target))))),
      ...textTargets(result, op),
      ops.draw.text(op.chartId, undefined, textScore(result.length, 'pairDiff')),
    ]
  },
  [OperationOp.Nth]: (result, op) => {
    if (!result.length) return null
    return [...highlightTargets(op, result.map((d) => String(d.target)), '#ef4444'), ...textTargets(result, op)]
  },
  [OperationOp.Count]: (result, op) => {
    const scalar = scalarFromResult(result)
    if (scalar == null) return null
    return [ops.draw.text(op.chartId, undefined, textScore(scalar, 'count'))]
  },
  [OperationOp.Add]: (result, op) => {
    const scalar = scalarFromResult(result)
    if (scalar == null) return null
    return [ops.draw.line(op.chartId, lineAt(scalar)), ops.draw.text(op.chartId, undefined, textScore(scalar, 'add'))]
  },
  [OperationOp.Scale]: (result, op) => {
    const scalar = scalarFromResult(result)
    if (scalar == null) return null
    return [ops.draw.line(op.chartId, lineAt(scalar)), ops.draw.text(op.chartId, undefined, textScore(scalar, 'scale'))]
  },
  [OperationOp.SetOp]: (result, op, context) => buildSetOpPlan(result, op, context),
}

import type { AutoDrawPlanContext } from '../../../../ops/common/executeDataOp.ts'
import type { DatumValue } from '../../../../../types'
import type { DrawOp } from '../../../../draw/types'
import { DrawComparisonAliasGroups, type DrawComparisonOperator } from '../../../../draw/types'
import type { OpFilterSpec } from '../../../../../types/operationSpecs.ts'
import { draw, ops } from '../../../../../operation/build/authoring'

const DEFAULT_LINE_COLOR = '#ef4444'
const DEFAULT_SEGMENT_FILL = 'rgba(239,68,68,0.28)'
const DEFAULT_SEGMENT_STROKE = '#dc2626'
const DEFAULT_SEGMENT_OPACITY = 0.8
const DEFAULT_SEGMENT_STROKE_WIDTH = 1.5

function normalizeThreshold(value: unknown) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function normalizeOperator(operator?: string): DrawComparisonOperator | null {
  if (!operator) return null
  const token = operator.toLowerCase()
  const entries = Object.entries(DrawComparisonAliasGroups) as Array<[DrawComparisonOperator, readonly string[]]>
  for (const [key, aliases] of entries) {
    if (aliases.includes(token)) return key
  }
  return null
}

function buildSelectTargets(result: DatumValue[]) {
  const seen = new Set<string>()
  const targets: string[] = []
  for (const datum of result) {
    const key = String(datum.target)
    if (!seen.has(key)) {
      seen.add(key)
      targets.push(key)
    }
  }
  return targets
}

export function buildSimpleBarFilterDrawPlan(
  _result: DatumValue[],
  op: OpFilterSpec,
  _context?: AutoDrawPlanContext,
): DrawOp[] | null {
  const threshold = normalizeThreshold(op.value)
  const operator = normalizeOperator(op.operator)
  if (threshold == null || !operator) {
    return null
  }

  const targets = buildSelectTargets(_result)
  const lineColor = DEFAULT_LINE_COLOR
  const lineStrokeWidth = 2
  const lineOpacity = 0.9

  const segmentFill = DEFAULT_SEGMENT_FILL
  const segmentStroke = DEFAULT_SEGMENT_STROKE
  const segmentOpacity = DEFAULT_SEGMENT_OPACITY
  const segmentStrokeWidth = DEFAULT_SEGMENT_STROKE_WIDTH
  const lineSpec = draw.lineSpec.horizontalFromY(
    threshold,
    draw.style.line(lineColor, lineStrokeWidth, lineOpacity),
  )
  const segmentSpec = draw.segmentSpec.threshold(
    threshold,
    operator,
    draw.style.segment(segmentFill, segmentStroke, segmentStrokeWidth, segmentOpacity),
  )
  const filterSpec = draw.filterSpec.y(operator, threshold)

  const plan: DrawOp[] = [
    ops.draw.line(op.chartId, lineSpec),
    ops.draw.barSegment(op.chartId, targets, segmentSpec),
    ops.draw.filter(op.chartId, filterSpec),
  ]

  return plan
}

import type { AutoDrawPlanContext } from '../../../../ops/common/executeDataOp.ts'
import { OperationOp, type DatumValue } from '../../../../../types'
import type { DrawOp } from '../../../../draw/types'
import { DrawAction, DrawLineModes } from '../../../../draw/types'
import type {OpFilterSpec} from "../../../../../types/operationSpecs.ts";

const DEFAULT_LINE_COLOR = '#ef4444'
const DEFAULT_SEGMENT_FILL = 'rgba(239,68,68,0.28)'
const DEFAULT_SEGMENT_STROKE = '#dc2626'
const DEFAULT_SEGMENT_OPACITY = 0.8
const DEFAULT_SEGMENT_STROKE_WIDTH = 1.5

type NormalizedOperator = 'gt' | 'gte' | 'lt' | 'lte'

function normalizeThreshold(value: unknown) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function normalizeOperator(operator?: string): NormalizedOperator | null {
  if (!operator) return null
  switch (operator.toLowerCase()) {
    case '>':
    case 'gt':
    case 'greater':
    case 'greaterthan':
      return 'gt'
    case '>=':
    case 'gte':
    case 'greaterorequal':
      return 'gte'
    case '<':
    case 'lt':
    case 'less':
    case 'lessthan':
      return 'lt'
    case '<=':
    case 'lte':
    case 'lessorequal':
      return 'lte'
    default:
      return null
  }
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

  const plan: DrawOp[] = [
    {
      op: OperationOp.Draw,
      action: DrawAction.Line,
      chartId: op.chartId,
      line: {
        mode: DrawLineModes.HorizontalFromY,
        hline: { y: threshold },
        style: {
          stroke: lineColor,
          strokeWidth: lineStrokeWidth,
          opacity: lineOpacity,
        },
      },
    },
    {
      op: OperationOp.Draw,
      action: DrawAction.Sleep,
      seconds: 1,
      chartId: op.chartId,
    },
    {
      op: OperationOp.Draw,
      action: DrawAction.BarSegment,
      chartId: op.chartId,
      select: targets.length ? { keys: targets } : undefined,
      segment: {
        threshold,
        when: operator,
        style: {
          fill: segmentFill,
          stroke: segmentStroke,
          strokeWidth: segmentStrokeWidth,
          opacity: segmentOpacity,
        },
      },
    },
    {
      op: OperationOp.Draw,
      action: DrawAction.Sleep,
      seconds: 1,
      chartId: op.chartId,
    },
    {
      op: OperationOp.Draw,
      action: DrawAction.Clear,
      chartId: op.chartId,
    },
    {
      op: OperationOp.Draw,
      action: DrawAction.Filter,
      chartId: op.chartId,
      filter: {
        y: {
          op: operator,
          value: threshold,
        },
      },
    },
  ]

  return plan
}

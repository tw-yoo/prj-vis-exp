import type { AutoDrawPlanContext } from '../../../../ops/common/executeDataOp.ts'
import type { DatumValue } from '../../../../../types'
import type { DrawOp } from '../../../../draw/types'
import type { OpAverageSpec } from '../../../../../types/operationSpecs.ts'
import { draw, ops } from '../../../../../operation/build/authoring'

const DEFAULT_LINE_COLOR = '#0ea5e9'
const DEFAULT_LINE_OPACITY = 0.8
const DEFAULT_LINE_WIDTH = 2

export function buildSimpleBarAverageDrawPlan(
  result: DatumValue[],
  op: OpAverageSpec,
  _context?: AutoDrawPlanContext,
): DrawOp[] | null {
  if (!result.length) return null
  const datum = result[0]
  const value = datum.value
  if (!Number.isFinite(value)) return null
  const lineSpec = draw.lineSpec.horizontalFromY(
    value,
    draw.style.line(DEFAULT_LINE_COLOR, DEFAULT_LINE_WIDTH, DEFAULT_LINE_OPACITY),
  )
  return [
    ops.draw.line(op.chartId, lineSpec),
  ]
}

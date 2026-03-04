import type { AutoDrawPlanContext } from '../../../../ops/common/executeDataOp'
import type { DatumValue } from '../../../../../types'
import type { DrawOp } from '../../../../draw/types'
import type { OpCompareSpec } from '../../../../../types/operationSpecs'
import { draw, ops } from '../../../../../operation/build/authoring'

export function buildSimpleBarCompareDrawPlan(
  result: DatumValue[],
  op: OpCompareSpec,
  _context?: AutoDrawPlanContext,
): DrawOp[] | null {
  const targets = result.length ? Array.from(new Set(result.map((d) => String(d.target)))) : []
  const plan: DrawOp[] = []
  if (targets.length) {
    plan.push(ops.draw.highlight(op.chartId, draw.select.markKeys('rect', ...targets), '#ef4444'))
  }
  if (result.length) {
    const val = result[0].value
    if (Number.isFinite(val)) {
      const lineSpec = draw.lineSpec.horizontalFromY(val, draw.style.line('#0ea5e9', 2, 0.85))
      plan.push(ops.draw.line(op.chartId, lineSpec))
    }
  }
  return plan.length ? plan : null
}

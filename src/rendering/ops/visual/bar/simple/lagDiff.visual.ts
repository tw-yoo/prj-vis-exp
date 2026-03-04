import type { AutoDrawPlanContext } from '../../../../ops/common/executeDataOp'
import type { DatumValue } from '../../../../../types'
import type { DrawOp } from '../../../../draw/types'
import type { OpLagDiffSpec } from '../../../../../types/operationSpecs'
import { draw, ops } from '../../../../../operation/build/authoring'
import { formatDrawNumber } from '../../helpers'

export function buildSimpleBarLagDiffDrawPlan(
  result: DatumValue[],
  _op: OpLagDiffSpec,
  _context?: AutoDrawPlanContext,
): DrawOp[] | null {
  if (!result.length) return null
  const targets = Array.from(new Set(result.map((d) => String(d.target))))
  const plan: DrawOp[] = []
  plan.push(ops.draw.highlight(undefined, draw.select.markKeys('rect', ...targets), '#0ea5e9'))
  result.forEach((d) => {
    const text = Number.isFinite(d.value) ? formatDrawNumber(d.value) : ''
    if (!text) return
    plan.push(
      ops.draw.text(
        undefined,
        draw.select.markKeys('rect', String(d.target)),
        draw.textSpec.anchor(text, draw.style.text('#111827', 12, 'bold')),
      ),
    )
  })
  return plan
}

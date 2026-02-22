import type { DatumValue } from '../../../../../types'
import type { DrawOp } from '../../../../draw/types'
import type { OpSumSpec } from '../../../../../types/operationSpecs.ts'
import { draw, ops } from '../../../../../operation/build/authoring'

export function buildSimpleBarSumDrawPlan(
  result: DatumValue[],
  op: OpSumSpec,
): DrawOp[] | null {
  if (!result.length) return null
  const datum = result[0]
  const value = datum.value
  if (!Number.isFinite(value)) return null
  const label = String(op.targetName ?? datum.target ?? 'Sum')
  return [
    ops.draw.sum(op.chartId, draw.sumSpec.value(value, label)),
    ops.draw.sleep(1, op.chartId),
  ]
}

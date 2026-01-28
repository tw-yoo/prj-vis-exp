import type { DatumValue } from '../../../../../types'
import { OperationOp } from '../../../../../types'
import { DrawAction, type DrawOp } from '../../../../draw/types'
import type { OpSumSpec } from '../../../../../types/operationSpecs.ts'

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
    {
      op: OperationOp.Draw,
      action: DrawAction.Sum,
      chartId: op.chartId,
      sum: { value, label },
    },
    {
      op: OperationOp.Draw,
      action: DrawAction.Sleep,
      chartId: op.chartId,
      seconds: 1,
    },
  ]
}

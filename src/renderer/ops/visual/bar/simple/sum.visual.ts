import type { DatumValue } from '../../../../../types'
import type { DrawOp } from '../../../../draw/types'
import type { OpSumSpec } from '../../../../../types/operationSpecs.ts'
import { drawOps } from '../../../../draw/drawOps'

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
    drawOps.sum({ chartId: op.chartId, sum: { value, label } }),
    drawOps.sleep({ chartId: op.chartId, seconds: 1 }),
  ]
}

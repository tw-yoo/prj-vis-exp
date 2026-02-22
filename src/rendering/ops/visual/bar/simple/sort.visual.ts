import type { AutoDrawPlanContext } from '../../../../ops/common/executeDataOp.ts'
import type { DatumValue } from '../../../../../types'
import type { DrawOp } from '../../../../draw/types'
import type { OpSortSpec } from '../../../../../types/operationSpecs.ts'
import { ops } from '../../../../../operation/build/authoring'

export function buildSimpleBarSortDrawPlan(
  _result: DatumValue[],
  op: OpSortSpec,
  _context?: AutoDrawPlanContext,
): DrawOp[] {
  const sortBy = op.field === 'x' ? 'x' : 'y'
  const sortOrder = op.order === 'desc' ? 'desc' : 'asc'
  return [
    ops.draw.clear(op.chartId),
    ops.draw.sort(op.chartId, sortBy, sortOrder),
  ]
}

import type { AutoDrawPlanContext } from '../../../../ops/common/executeDataOp.ts'
import { OperationOp, type DatumValue } from '../../../../../types'
import type { DrawOp } from '../../../../draw/types'
import { DrawAction } from '../../../../draw/types'
import type {OpSortSpec} from "../../../../../types/operationSpecs.ts";

export function buildSimpleBarSortDrawPlan(
  _result: DatumValue[],
  op: OpSortSpec,
  _context?: AutoDrawPlanContext,
): DrawOp[] {
  const sortBy = op.field === 'x' ? 'x' : 'y'
  const sortOrder = op.order === 'desc' ? 'desc' : 'asc'
  return [
    {
      op: OperationOp.Draw,
      action: DrawAction.Clear
    },
    {
      op: OperationOp.Draw,
      action: DrawAction.Sort,
      sort: {
        by: sortBy,
        order: sortOrder,
      },
    },
  ]
}

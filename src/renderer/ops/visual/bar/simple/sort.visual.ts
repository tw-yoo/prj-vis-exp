import { OperationOp, type DatumValue } from '../../../../../types'
import type { DrawOp } from '../../../../draw/types'
import { DrawAction } from '../../../../draw/types'
import type { SortVisualOp } from './types'

export function buildSimpleBarSortDrawPlan(_: DatumValue[], op: SortVisualOp): DrawOp[] {
  const sortBy = op.by === 'x' ? 'x' : 'y'
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

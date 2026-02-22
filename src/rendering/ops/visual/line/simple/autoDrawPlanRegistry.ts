import type { DatumValue, OperationSpec } from '../../../../../types'
import type { AutoDrawPlanContext } from '../../../common/executeDataOp'

export const SIMPLE_LINE_AUTO_DRAW_PLANS: Record<
  string,
  (result: DatumValue[], op: OperationSpec, context: AutoDrawPlanContext) => any[] | null
> = {}

import type { DatumValue, OperationSpec } from '../../../../../types'
import { OperationOp } from '../../../../../types'
import type { AutoDrawPlanContext } from '../../../common/executeDataOp'
import { buildSimpleBarRetrieveValueDrawPlan } from './retrieveValue.visual'
import { buildSimpleBarSortDrawPlan } from './sort.visual'
import { buildSimpleBarFilterDrawPlan } from './filter.visual'
import { buildSimpleBarExtremumDrawPlan } from './extremum.visual'
import { buildSimpleBarAverageDrawPlan } from './average.visual'
import { buildSimpleBarCountDrawPlan } from './count.visual'
import { buildSimpleBarDiffDrawPlan } from './diff.visual'
import { buildSimpleBarNthDrawPlan } from './nth.visual'
import { buildSimpleBarSumDrawPlan } from './sum.visual'

export const SIMPLE_BAR_AUTO_DRAW_PLANS: Record<
  string,
  (result: DatumValue[], op: OperationSpec, context: AutoDrawPlanContext) => any[] | null
> = {
  [OperationOp.RetrieveValue]: (result, op, context) =>
    buildSimpleBarRetrieveValueDrawPlan(result, op as any, context),
  [OperationOp.Sort]: (result, op, context) => buildSimpleBarSortDrawPlan(result, op as any, context),
  [OperationOp.Filter]: (result, op, context) => buildSimpleBarFilterDrawPlan(result, op as any, context),
  [OperationOp.FindExtremum]: (result, op, context) =>
    buildSimpleBarExtremumDrawPlan(result, op as any, context),
  [OperationOp.Average]: (result, op, context) => buildSimpleBarAverageDrawPlan(result, op as any, context),
  [OperationOp.Count]: (result, op, context) => buildSimpleBarCountDrawPlan(result, op as any, context),
  [OperationOp.Diff]: (result, op, context) => buildSimpleBarDiffDrawPlan(result, op as any, context),
  [OperationOp.Nth]: (result, op, context) => buildSimpleBarNthDrawPlan(result, op as any, context),
  [OperationOp.Sum]: (result, op) => buildSimpleBarSumDrawPlan(result, op as any),
}

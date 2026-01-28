import type { DatumValue, OperationSpec } from '../../../types'

export type AutoDrawPlanContext = {
  container: HTMLElement
  prevWorking: DatumValue[]
}

export function executeDataOperation(
  input: DatumValue[],
  op: OperationSpec,
  handlers: Record<string, (data: DatumValue[], op: OperationSpec) => DatumValue[]>,
  autoDrawPlans: Record<
    string,
    ((result: DatumValue[], op: OperationSpec, context: AutoDrawPlanContext) => unknown[] | null) | undefined
  > = {},
  context?: AutoDrawPlanContext,
) {
  const fn = handlers[op.op ?? '']
  if (!fn) return null
  const result = fn(input, op)
  const planBuilder = autoDrawPlans[op.op ?? '']
  const drawPlan = planBuilder && context ? planBuilder(result, op, context) : null
  return { result, drawPlan }
}

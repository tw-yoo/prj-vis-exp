import type { DatumValue, OperationSpec } from '../../../types'

export function executeDataOperation(
  input: DatumValue[],
  op: OperationSpec,
  handlers: Record<string, (data: DatumValue[], op: OperationSpec) => DatumValue[]>,
  autoDrawPlans: Record<string, (result: DatumValue[], op: OperationSpec) => unknown[] | null> = {},
) {
  const fn = handlers[op.op ?? '']
  if (!fn) return null
  const result = fn(input, op)
  const planBuilder = autoDrawPlans[op.op ?? '']
  const drawPlan = planBuilder ? planBuilder(result, op) : null
  return { result, drawPlan }
}


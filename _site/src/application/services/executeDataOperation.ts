import type { DatumValue, OperationSpec } from '../../domain/operation/types'
import { OperationOp } from '../../domain/operation/types'
import { resolveFilterRefThreshold } from '../../domain/operation/dataOps'

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
  const resolvedOp = resolveOperationForExecution(op)
  const fn = handlers[resolvedOp.op ?? '']
  if (!fn) return null
  const result = fn(input, resolvedOp)
  const planBuilder = autoDrawPlans[resolvedOp.op ?? '']
  const drawPlan = planBuilder && context ? planBuilder(result, resolvedOp, context) : null
  return { result, drawPlan }
}

function resolveOperationForExecution(op: OperationSpec): OperationSpec {
  if (op.op !== OperationOp.Filter) return op
  if (typeof op.value !== 'string' || !op.value.startsWith('ref:')) return op

  const resolved = resolveFilterRefThreshold(
    op.value,
    typeof op.aggregate === 'string' ? op.aggregate : undefined,
  )
  if (!Number.isFinite(resolved ?? NaN)) {
    throw new Error(`filter: unresolved ref value "${op.value}"`)
  }
  return { ...op, value: resolved }
}

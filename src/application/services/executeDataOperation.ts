import type { DatumValue, OperationSpec } from '../../domain/operation/types'
import { OperationOp } from '../../domain/operation/types'
import { resolveFilterRefThreshold } from '../../domain/operation/dataOps'

export type AutoDrawPlanContext = {
  container: HTMLElement
  prevWorking: DatumValue[]
}

export function resolveAutoDrawVisualOp(op: OperationSpec): OperationSpec {
  return op
}

function isUsableDrawPlan(plan: unknown) {
  if (plan == null) return false
  if (Array.isArray(plan)) return plan.length > 0
  return true
}

function buildAutoDrawVisualOpCandidates(
  op: OperationSpec,
  autoDrawPlans: Record<
    string,
    ((result: DatumValue[], op: OperationSpec, context: AutoDrawPlanContext) => unknown[] | null) | undefined
  >,
) {
  const candidates: OperationSpec[] = []
  const primary = resolveAutoDrawVisualOp(op)
  if (primary.op && autoDrawPlans[primary.op]) {
    candidates.push(primary)
  }
  if (!candidates.some((candidate) => candidate.op === op.op)) {
    candidates.push(op)
  }
  return candidates
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
  let drawPlan: unknown[] | null = null
  if (context) {
    const candidates = buildAutoDrawVisualOpCandidates(resolvedOp, autoDrawPlans)
    for (const candidate of candidates) {
      const planBuilder = autoDrawPlans[candidate.op ?? '']
      if (!planBuilder) continue
      const candidatePlan = planBuilder(result, candidate, context)
      if (!isUsableDrawPlan(candidatePlan)) continue
      drawPlan = candidatePlan
      break
    }
  }
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

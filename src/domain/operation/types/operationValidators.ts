import { OperationOp } from './operationNames'
import type { OperationSpec } from './index'
import { normalizeGroupSelection } from '../groupSelection'
import type {
  OpAddSpec,
  OpAverageSpec,
  OpCompareBoolSpec,
  OpCountSpec,
  OpDiffByValueSpec,
  OpDiffSpec,
  OpFilterSpec,
  OpFindExtremumSpec,
  OpLagDiffSpec,
  OpNthSpec,
  OpPairDiffSpec,
  OpRetrieveValueSpec,
  OpScaleSpec,
  OpSortSpec,
  OpSumSpec,
} from './operationSpecs'

export function requireField<T extends OperationSpec>(op: T, field: keyof T, name?: string): void {
  const value = op[field]
  if (value === undefined || value === null) {
    const fieldName = name ?? String(field)
    throw new Error(`Operation "${op.op}" requires field "${fieldName}"`)
  }
}

export function requireOperator(op: OperationSpec): void {
  if (!op.operator) throw new Error(`Operation "${op.op}" requires "operator"`)
}

export function assertRetrieveValueSpec(op: OperationSpec): OpRetrieveValueSpec {
  if (op.op !== OperationOp.RetrieveValue) {
    throw new Error(`Expected RetrieveValue spec but got op "${op.op}"`)
  }
  const spec = op as OpRetrieveValueSpec
  if (spec.target == null) {
    throw new Error('retrieveValue requires "target"')
  }
  if (spec.targetAxis != null && spec.targetAxis !== 'x' && spec.targetAxis !== 'y') {
    throw new Error(`retrieveValue: "targetAxis" must be 'x' or 'y' (got ${String(spec.targetAxis)})`)
  }
  if (spec.targetAxis === 'y') {
    const targets = Array.isArray(spec.target) ? spec.target : [spec.target]
    for (const t of targets) {
      if (t == null || !Number.isFinite(Number(t))) {
        throw new Error(`retrieveValue: targetAxis='y' requires numeric target (got ${JSON.stringify(t)})`)
      }
    }
  }
  return spec
}

export function assertSortSpec(op: OperationSpec): OpSortSpec {
  if (op.op !== OperationOp.Sort) {
    throw new Error(`Expected Sort spec but got op "${op.op}"`)
  }
  return op as OpSortSpec
}

export function assertFilterSpec(op: OperationSpec): OpFilterSpec {
  if (op.op !== OperationOp.Filter) {
    throw new Error(`Expected Filter spec but got op "${op.op}"`)
  }
  const spec = op as OpFilterSpec
  const hasInclude = Array.isArray(spec.include) && spec.include.length > 0
  const hasExclude = Array.isArray(spec.exclude) && spec.exclude.length > 0
  const hasGroup = normalizeGroupSelection(spec.group).kind !== 'none'
  const hasOperator = Boolean(spec.operator)
  // Treat null as "not provided". Ops specs pasted from UI often include null fields.
  const hasValue = spec.value !== undefined && spec.value !== null
  const isArrayValue = Array.isArray(spec.value) && spec.value.length > 0
  if (!hasInclude && !hasExclude && !hasGroup && !hasOperator && !hasValue) {
    throw new Error('filter requires "operator/value" or "include/exclude" or "group"')
  }
  if (hasOperator && !hasValue) {
    throw new Error('filter requires "value" when "operator" is provided')
  }
  if (!hasOperator && hasValue && !isArrayValue) {
    throw new Error('filter requires "operator" when "value" is provided')
  }
  return spec
}

export function assertCompareBoolSpec(op: OperationSpec): OpCompareBoolSpec {
  if (op.op !== OperationOp.CompareBool) {
    throw new Error(`Expected CompareBool spec but got op "${op.op}"`)
  }
  const spec = op as OpCompareBoolSpec
  const inputCount = Array.isArray(spec.meta?.inputs) ? spec.meta.inputs.length : 0
  if ((spec.targetA == null || spec.targetB == null) && inputCount < 2) {
    throw new Error('compareBool requires "targetA" and "targetB"')
  }
  if (!spec.operator) throw new Error('compareBool requires "operator"')
  return spec
}

export function assertFindExtremumSpec(op: OperationSpec): OpFindExtremumSpec {
  if (op.op !== OperationOp.FindExtremum) {
    throw new Error(`Expected FindExtremum spec but got op "${op.op}"`)
  }
  const spec = op as OpFindExtremumSpec
  if (!spec.which) throw new Error('findExtremum requires "which"')
  return spec
}

export function assertDiffByValueSpec(op: OperationSpec): OpDiffByValueSpec {
  if (op.op !== OperationOp.DiffByValue) {
    throw new Error(`Expected DiffByValue spec but got op "${op.op}"`)
  }
  const spec = op as OpDiffByValueSpec
  const hasLiteral = typeof spec.value === 'number' && Number.isFinite(spec.value)
  const hasRef = typeof spec.targetValue === 'string' && spec.targetValue.length > 0
  const inputCount = Array.isArray(spec.meta?.inputs) ? spec.meta.inputs.length : 0
  if (!hasLiteral && !hasRef && inputCount < 1) {
    throw new Error('diffByValue requires "value" (literal) or "targetValue" (ref)')
  }
  return spec
}

export function assertSumSpec(op: OperationSpec): OpSumSpec {
  if (op.op !== OperationOp.Sum) {
    throw new Error(`Expected Sum spec but got op "${op.op}"`)
  }
  const spec = op as OpSumSpec
  if (!spec.field) throw new Error('sum requires "field"')
  return spec
}

export function assertAverageSpec(op: OperationSpec): OpAverageSpec {
  if (op.op !== OperationOp.Average) {
    throw new Error(`Expected Average spec but got op "${op.op}"`)
  }
  const spec = op as OpAverageSpec
  if (!spec.field) throw new Error('average requires "field"')
  return spec
}

export function assertDiffSpec(op: OperationSpec): OpDiffSpec {
  if (op.op !== OperationOp.Diff) {
    throw new Error(`Expected Diff spec but got op "${op.op}"`)
  }
  const spec = op as OpDiffSpec
  const inputCount = Array.isArray(spec.meta?.inputs) ? spec.meta.inputs.length : 0
  if ((spec.targetA == null || spec.targetB == null) && inputCount < 2) {
    throw new Error('diff requires "targetA" and "targetB"')
  }
  return spec
}

export function assertLagDiffSpec(op: OperationSpec): OpLagDiffSpec {
  if (op.op !== OperationOp.LagDiff) {
    throw new Error(`Expected LagDiff spec but got op "${op.op}"`)
  }
  return op as OpLagDiffSpec
}

export function assertPairDiffSpec(op: OperationSpec): OpPairDiffSpec {
  if (op.op !== OperationOp.PairDiff) {
    throw new Error(`Expected PairDiff spec but got op "${op.op}"`)
  }
  const spec = op as OpPairDiffSpec
  if (!spec.by && !spec.keyField) throw new Error('pairDiff requires "by" or "keyField"')
  if (!spec.groupA || !spec.groupB) throw new Error('pairDiff requires "groupA" and "groupB"')
  return spec
}

export function assertNthSpec(op: OperationSpec): OpNthSpec {
  if (op.op !== OperationOp.Nth) {
    throw new Error(`Expected Nth spec but got op "${op.op}"`)
  }
  const spec = op as OpNthSpec
  if (spec.n === undefined || spec.n === null) throw new Error('nth requires "n"')
  return spec
}

export function assertCountSpec(op: OperationSpec): OpCountSpec {
  if (op.op !== OperationOp.Count) {
    throw new Error(`Expected Count spec but got op "${op.op}"`)
  }
  return op as OpCountSpec
}

export function assertAddSpec(op: OperationSpec): OpAddSpec {
  if (op.op !== OperationOp.Add) {
    throw new Error(`Expected Add spec but got op "${op.op}"`)
  }
  const spec = op as OpAddSpec
  const inputCount = Array.isArray(spec.meta?.inputs) ? spec.meta.inputs.length : 0
  if ((spec.targetA == null || spec.targetB == null) && inputCount < 2) {
    throw new Error('add requires "targetA" and "targetB"')
  }
  return spec
}

export function assertScaleSpec(op: OperationSpec): OpScaleSpec {
  if (op.op !== OperationOp.Scale) {
    throw new Error(`Expected Scale spec but got op "${op.op}"`)
  }
  const spec = op as OpScaleSpec
  if (spec.target == null) throw new Error('scale requires "target"')
  if (!Number.isFinite(Number(spec.factor))) throw new Error('scale requires numeric "factor"')
  return spec
}


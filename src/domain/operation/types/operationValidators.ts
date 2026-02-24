import { OperationOp } from './operationNames'
import type { OperationSpec } from './index'
import type {
  OpAverageSpec,
  OpCompareBoolSpec,
  OpCompareSpec,
  OpCountSpec,
  OpDetermineRangeSpec,
  OpDiffSpec,
  OpFilterSpec,
  OpFindExtremumSpec,
  OpLagDiffSpec,
  OpNthSpec,
  OpRetrieveValueSpec,
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
  const hasOperator = Boolean(spec.operator)
  // Treat null as "not provided". Ops specs pasted from UI often include null fields.
  const hasValue = spec.value !== undefined && spec.value !== null
  if (!hasInclude && !hasExclude && !hasOperator && !hasValue) {
    throw new Error('filter requires "operator/value" or "include/exclude"')
  }
  if (hasOperator && !hasValue) {
    throw new Error('filter requires "value" when "operator" is provided')
  }
  if (!hasOperator && hasValue) {
    throw new Error('filter requires "operator" when "value" is provided')
  }
  return spec
}

export function assertCompareSpec(op: OperationSpec): OpCompareSpec {
  if (op.op !== OperationOp.Compare) {
    throw new Error(`Expected Compare spec but got op "${op.op}"`)
  }
  const spec = op as OpCompareSpec
  if (spec.targetA == null || spec.targetB == null) {
    throw new Error('compare requires "targetA" and "targetB"')
  }
  return spec
}

export function assertCompareBoolSpec(op: OperationSpec): OpCompareBoolSpec {
  if (op.op !== OperationOp.CompareBool) {
    throw new Error(`Expected CompareBool spec but got op "${op.op}"`)
  }
  const spec = op as OpCompareBoolSpec
  if (spec.targetA == null || spec.targetB == null) {
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

export function assertDetermineRangeSpec(op: OperationSpec): OpDetermineRangeSpec {
  if (op.op !== OperationOp.DetermineRange) {
    throw new Error(`Expected DetermineRange spec but got op "${op.op}"`)
  }
  return op as OpDetermineRangeSpec
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
  if (spec.targetA == null || spec.targetB == null) {
    throw new Error('diff requires "targetA" and "targetB"')
  }
  return spec
}

export function assertLagDiffSpec(op: OperationSpec): OpLagDiffSpec {
  if (op.op !== OperationOp.LagDiff) {
    throw new Error(`Expected LagDiff spec but got op "${op.op}"`)
  }
  const spec = op as OpLagDiffSpec
  if (!spec.orderField) throw new Error('lagDiff requires "orderField"')
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

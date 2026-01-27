import type { OperationSpec } from './index'

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

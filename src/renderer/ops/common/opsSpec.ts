import type { JsonValue, OperationSpec } from '../../../types'

export type OpsSpecInput = { ops?: OperationSpec[] } | OperationSpec[] | OperationSpec | null | undefined

export function normalizeOpsList(opsSpec: OpsSpecInput): OperationSpec[] {
  if (!opsSpec) return []
  if (Array.isArray(opsSpec)) return opsSpec
  if (typeof opsSpec === 'object' && Array.isArray((opsSpec as { ops?: JsonValue }).ops)) {
    return (opsSpec as { ops: OperationSpec[] }).ops
  }
  if (typeof opsSpec === 'object') return [opsSpec as OperationSpec]
  return []
}


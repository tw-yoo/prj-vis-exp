import {
  getRuntimeResultsById,
  resolveBinaryInputsFromMeta,
  resolveScalarAggregateFromRows,
} from '../domain/operation/dataOps'
import type { DatumValue, OperationSpec, TargetSelector } from '../domain/operation/types'

export type DiffEndpointSelector = TargetSelector | TargetSelector[] | undefined
export const RESULT_REF_ATTRIBUTE = 'data-operation-result-ref'
export const OPERATION_ROLE_ATTRIBUTE = 'data-operation-role'

export type DerivedDiffEndpoint = {
  kind: 'derived'
  selector: DiffEndpointSelector
  refKey: string
  rows: DatumValue[]
  value: number
}

export function collectReferencedResultIds(groups: Array<{ ops?: OperationSpec[] }> | OperationSpec[][]): string[] {
  const ids = new Set<string>()
  const operationGroups = groups.map((group) => Array.isArray(group) ? group : group.ops ?? [])
  operationGroups.flat().forEach((operation) => {
    referencesFromOperation(operation).forEach((key) => ids.add(key))
  })
  return Array.from(ids).filter((key) => key.trim().length > 0)
}

/**
 * Returns the operation IDs that `operation` consumes as `ref:nX` inputs
 * (across `targetA`, `targetB`, and `meta.inputs`). Used per-op to compute the
 * still-live reference set; combined with downstream-operation refs to decide
 * which prior annotations can be cleaned up.
 */
export function referencesFromOperation(operation: OperationSpec): string[] {
  const ids = new Set<string>()
  readRefKey(operation.targetA).forEach((key) => ids.add(key))
  readRefKey(operation.targetB).forEach((key) => ids.add(key))
  // diffByValue uses `targetValue` for its scalar ref.
  const targetValue = (operation as OperationSpec & { targetValue?: unknown }).targetValue
  if (typeof targetValue === 'string' && targetValue.startsWith('ref:')) {
    const key = targetValue.slice('ref:'.length).trim()
    if (key) ids.add(key)
  }
  // filter operations can use `value: "ref:nX"`.
  const opValue = (operation as OperationSpec & { value?: unknown }).value
  if (typeof opValue === 'string' && opValue.startsWith('ref:')) {
    const key = opValue.slice('ref:'.length).trim()
    if (key) ids.add(key)
  }
  if (Array.isArray(operation.meta?.inputs)) {
    operation.meta.inputs.forEach((input) => {
      if (typeof input === 'string' || typeof input === 'number') {
        ids.add(String(input).replace(/^ref:/, ''))
      }
    })
  }
  return Array.from(ids).filter((key) => key.trim().length > 0)
}

export function operationResultIds(operation: OperationSpec): string[] {
  const ids = new Set<string>()
  const raw = operation as OperationSpec & { id?: string | number; key?: string | number }
  if (raw.id != null) ids.add(String(raw.id))
  if (raw.key != null) ids.add(String(raw.key))
  const nodeId = operation.meta?.nodeId
  if (typeof nodeId === 'string' || typeof nodeId === 'number') ids.add(String(nodeId))
  return Array.from(ids)
}

export function operationResultRef(operation: OperationSpec): string | null {
  return operationResultIds(operation)[0] ?? null
}

export function isOperationResultReferenced(operation: OperationSpec, referencedResultIds: string[] | undefined) {
  if (!referencedResultIds?.length) return false
  const refs = new Set(referencedResultIds.map((key) => String(key).replace(/^ref:/, '')))
  return operationResultIds(operation).some((id) => refs.has(id))
}

export function diffEndpointSelectors(operation: OperationSpec): {
  targetA: DiffEndpointSelector
  targetB: DiffEndpointSelector
} {
  const fallback = resolveBinaryInputsFromMeta(operation.meta?.inputs)
  return {
    targetA: operation.targetA ?? fallback.targetA,
    targetB: operation.targetB ?? fallback.targetB,
  }
}

export function resolveDerivedDiffEndpoint(
  selector: DiffEndpointSelector,
  aggregateHint?: string,
): DerivedDiffEndpoint | null {
  const refKey = firstRefKey(selector)
  if (!refKey) return null
  const rows = getRuntimeResultsById(refKey)
  const value = resolveScalarAggregateFromRows(rows, aggregateHint)
  if (value == null || !Number.isFinite(value)) return null
  return {
    kind: 'derived',
    selector,
    refKey,
    rows,
    value,
  }
}

function firstRefKey(selector: DiffEndpointSelector): string | null {
  return readRefKey(selector)[0] ?? null
}

function readRefKey(selector: DiffEndpointSelector): string[] {
  if (selector == null) return []
  if (Array.isArray(selector)) return selector.flatMap(readRefKey)
  if (typeof selector === 'string') {
    if (!selector.startsWith('ref:')) return []
    const key = selector.slice('ref:'.length).trim()
    return key ? [key] : []
  }
  if (typeof selector === 'object') {
    const id = selector.id
    if (id == null) return []
    const raw = String(id).trim()
    if (!raw) return []
    return [raw.startsWith('ref:') ? raw.slice('ref:'.length).trim() : raw].filter(Boolean)
  }
  return []
}

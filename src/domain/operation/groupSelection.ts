import type { OperationSpec } from './types'

export type GroupSelectionKind = 'none' | 'single' | 'multi'

export type NormalizedGroupSelection = {
  kind: GroupSelectionKind
  values: string[]
}

function normalizeGroupToken(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }
  if (typeof value !== 'string') return null
  const token = value.trim()
  return token.length > 0 ? token : null
}

export function normalizeGroupSelection(group: unknown): NormalizedGroupSelection {
  const values: string[] = []
  const seen = new Set<string>()

  const pushValue = (value: unknown) => {
    const token = normalizeGroupToken(value)
    if (!token || seen.has(token)) return
    seen.add(token)
    values.push(token)
  }

  if (Array.isArray(group)) {
    group.forEach((entry) => pushValue(entry))
  } else {
    pushValue(group)
  }

  if (values.length === 0) return { kind: 'none', values: [] }
  if (values.length === 1) return { kind: 'single', values }
  return { kind: 'multi', values }
}

export function normalizeOpForSingleGroupDelegation(op: OperationSpec, _series: string): OperationSpec {
  const next = { ...op } as OperationSpec & { group?: unknown }
  delete next.group
  return next
}

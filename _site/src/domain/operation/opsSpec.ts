import type { JsonValue, OperationSpec } from './types'

export type OpsSpecGroupMap = {
  ops?: OperationSpec[]
  [groupName: string]: JsonValue | OperationSpec[] | undefined
}

export type OpsSpecInput = OpsSpecGroupMap | OperationSpec[] | OperationSpec | null | undefined

export type NormalizedOpsGroup = {
  name: string
  ops: OperationSpec[]
}

type UnknownRecord = Record<string, unknown>

function isPlainObject(value: unknown): value is UnknownRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function stripNullToUndefined(value: unknown): unknown {
  if (value === null) return undefined
  if (Array.isArray(value)) return value.map(stripNullToUndefined).filter((v) => v !== undefined)
  if (isPlainObject(value)) {
    const out: UnknownRecord = {}
    Object.entries(value).forEach(([key, entry]) => {
      const next = stripNullToUndefined(entry)
      if (next !== undefined) out[key] = next
    })
    return out
  }
  return value
}

function normalizeOperationSpec(op: OperationSpec): OperationSpec {
  // Normalize specs pasted from UI, which frequently include explicit nulls.
  const cleaned = stripNullToUndefined(op)
  return (cleaned && typeof cleaned === 'object' ? (cleaned as OperationSpec) : op)
}

function isOperationSpec(value: unknown): value is OperationSpec {
  return !!value && typeof value === 'object' && typeof (value as { op?: unknown }).op === 'string'
}

function isOperationSpecArray(value: unknown): value is OperationSpec[] {
  return Array.isArray(value) && value.every((entry) => isOperationSpec(entry))
}

function orderedGroupNames(groupNames: string[]) {
  const unique = Array.from(new Set(groupNames))
  const out: string[] = []
  if (unique.includes('ops')) out.push('ops')
  unique
    .filter((name) => /^ops\d+$/.test(name))
    .sort((a, b) => Number(a.slice(3)) - Number(b.slice(3)))
    .forEach((name) => {
      if (!out.includes(name)) out.push(name)
    })
  unique
    .filter((name) => name !== 'ops' && name !== 'last' && !/^ops\d+$/.test(name))
    .sort((a, b) => a.localeCompare(b))
    .forEach((name) => {
      if (!out.includes(name)) out.push(name)
    })
  if (unique.includes('last')) out.push('last')
  unique.forEach((name) => {
    if (!out.includes(name)) out.push(name)
  })
  return out
}

export function normalizeOpsGroups(opsSpec: OpsSpecInput): NormalizedOpsGroup[] {
  if (!opsSpec) return []
  if (Array.isArray(opsSpec)) return [{ name: 'ops', ops: opsSpec.map(normalizeOperationSpec) }]
  if (isOperationSpec(opsSpec)) return [{ name: 'ops', ops: [normalizeOperationSpec(opsSpec)] }]
  if (typeof opsSpec !== 'object') return []

  const source = opsSpec as OpsSpecGroupMap
  const groups: Record<string, OperationSpec[]> = {}

  if (isOperationSpecArray(source.ops)) {
    groups.ops = source.ops.map(normalizeOperationSpec)
  }

  Object.entries(source).forEach(([key, value]) => {
    if (key === 'ops') return
    if (isOperationSpecArray(value)) {
      groups[key] = value.map(normalizeOperationSpec)
    }
  })

  if (!Object.keys(groups).length && isOperationSpec(source)) {
    groups.ops = [normalizeOperationSpec(source)]
  }

  return orderedGroupNames(Object.keys(groups)).map((name) => ({
    name,
    ops: groups[name] ?? [],
  }))
}

export function normalizeOpsList(opsSpec: OpsSpecInput): OperationSpec[] {
  return normalizeOpsGroups(opsSpec).flatMap((group) => group.ops)
}

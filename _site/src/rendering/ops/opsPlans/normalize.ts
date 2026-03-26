import type { OperationSpec } from '../../../types'
import type { OpsPlanContext, OpsPlanGroups, OpsPlanInput, OpsPlanObject } from './types'

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

const isOp = (value: unknown): value is OperationSpec =>
  isPlainObject(value) && typeof (value as { op?: unknown }).op === 'string'

const isOpArray = (value: unknown): value is OperationSpec[] =>
  Array.isArray(value) && value.every((item) => isOp(item))

function normalizeOpsObject(value: OpsPlanObject): OpsPlanGroups {
  if (isOpArray((value as { ops?: unknown }).ops)) {
    return [(value as { ops: OperationSpec[] }).ops]
  }

  const entries = Object.entries(value).filter(([, ops]) => isOpArray(ops))
  if (!entries.length) return []

  const parseKeyIndex = (key: string) => {
    if (key === 'ops') return -1
    const match = /^ops(\d+)$/.exec(key)
    if (!match) return null
    return Number(match[1])
  }

  entries.sort((a, b) => {
    const aIndex = parseKeyIndex(a[0])
    const bIndex = parseKeyIndex(b[0])
    if (aIndex != null && bIndex != null) return aIndex - bIndex
    if (aIndex != null) return -1
    if (bIndex != null) return 1
    return a[0].localeCompare(b[0])
  })

  return entries.map(([, ops]) => ops as OperationSpec[])
}

function normalizeOpsArray(value: OperationSpec[] | OperationSpec[][]): OpsPlanGroups {
  if (!Array.isArray(value)) return []
  if (value.length === 0) return []
  if (value.every((item) => isOp(item))) {
    return [value as OperationSpec[]]
  }
  return (value as OperationSpec[][])
    .filter((group) => Array.isArray(group))
    .map((group) => group.filter((item) => isOp(item)))
    .filter((group) => group.length > 0)
}

function normalizeOpsValue(value: OpsPlanGroups | OpsPlanObject | OperationSpec[] | OperationSpec | null | undefined) {
  if (!value) return []
  if (Array.isArray(value)) return normalizeOpsArray(value as OperationSpec[] | OperationSpec[][])
  if (isPlainObject(value)) {
    if (isOp(value)) return [[value]]
    return normalizeOpsObject(value as OpsPlanObject)
  }
  return []
}

export function normalizeOpsPlan(input: OpsPlanInput, context?: OpsPlanContext): OpsPlanGroups {
  const resolved = typeof input === 'function' ? input(resolveContext(context)) : input
  return normalizeOpsValue(resolved as OpsPlanGroups | OpsPlanObject | OperationSpec[])
}

function resolveContext(context?: OpsPlanContext): OpsPlanContext {
  if (context) return context
  throw new Error('normalizeOpsPlan: OpsPlanContext is required for builder functions.')
}

import type { OperationSpec } from '../../../src/api/legacy'

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
type UnknownRecord = Record<string, unknown>

const DEFAULT_DRAW_PLAN_PATH = '/generated/draw_plans/latest.json'

export type DrawPlanGroup = {
  name: string
  ops: OperationSpec[]
}

export type PythonDrawPlanLoadResult = {
  path: string
  groups: DrawPlanGroup[]
  ops: OperationSpec[]
}

function isPlainObject(value: unknown): value is UnknownRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isOperationSpecValue(value: unknown): value is OperationSpec {
  return isPlainObject(value) && typeof value.op === 'string'
}

function isOperationSpecArray(value: unknown): value is OperationSpec[] {
  return Array.isArray(value) && value.every((entry) => isOperationSpecValue(entry))
}

function isDrawOperation(op: OperationSpec): boolean {
  return op.op === 'draw' || typeof (op as { action?: unknown }).action === 'string'
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
    .filter((name) => name !== 'ops' && !/^ops\d+$/.test(name))
    .sort((a, b) => a.localeCompare(b))
    .forEach((name) => {
      if (!out.includes(name)) out.push(name)
    })
  unique.forEach((name) => {
    if (!out.includes(name)) out.push(name)
  })
  return out
}

function normalizeGroupSource(payload: unknown): UnknownRecord | null {
  if (!isPlainObject(payload)) return null
  const maybeWrapped = payload.ops1
  if (isPlainObject(maybeWrapped)) return maybeWrapped
  return payload
}

function normalizeDrawPlanGroups(payload: unknown): DrawPlanGroup[] {
  const source = normalizeGroupSource(payload)
  if (!source) return []

  const groups: Record<string, OperationSpec[]> = {}
  if (isOperationSpecArray(source.ops)) {
    groups.ops = source.ops.filter(isDrawOperation)
  }

  Object.entries(source).forEach(([key, value]) => {
    if (key === 'ops') return
    if (!isOperationSpecArray(value)) return
    groups[key] = value.filter(isDrawOperation)
  })

  if (!Object.keys(groups).length && isOperationSpecValue(source) && isDrawOperation(source)) {
    groups.ops = [source]
  }

  return orderedGroupNames(Object.keys(groups)).map((name) => ({
    name,
    ops: groups[name] ?? [],
  }))
}

export async function fetchLatestPythonDrawPlan(
  options: {
    path?: string
    fetcher?: FetchLike
  } = {},
): Promise<PythonDrawPlanLoadResult> {
  const path = options.path ?? DEFAULT_DRAW_PLAN_PATH
  const fetcher = options.fetcher ?? fetch.bind(globalThis)
  const response = await fetcher(path, { method: 'GET', cache: 'no-store' })
  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`Failed to load Python draw plan (${response.status}): ${detail || response.statusText}`)
  }
  const payload = await response.json()
  const groups = normalizeDrawPlanGroups(payload)
  const ops = groups.flatMap((group) => group.ops)
  if (!ops.length) {
    throw new Error('Python draw plan is empty or has no executable draw operations.')
  }
  return { path, groups, ops }
}


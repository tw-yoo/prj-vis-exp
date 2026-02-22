import type { JsonValue } from '../../../types'
import type { ChartTypeValue } from '../../../domain/chart'
import type { FieldSchema, OpsBuilderBlock, OpsBuilderGroup, OpsBuilderState, OperationSchema } from './types'
import { operationRegistry } from './registry'
import { makeId } from './id'

type UnknownRecord = Record<string, unknown>

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isAllowedForChart(allowedCharts: ChartTypeValue[] | undefined, chartType: ChartTypeValue | null) {
  if (!allowedCharts || allowedCharts.length === 0) return true
  if (!chartType) return true
  return allowedCharts.includes(chartType)
}

function getOperationSchema(op: string): OperationSchema | null {
  return operationRegistry.operations.find((entry) => entry.op === op) ?? null
}

function stripNullToUndefined(value: unknown): unknown {
  if (value === null) return undefined
  if (Array.isArray(value)) return value.map(stripNullToUndefined).filter((v) => v !== undefined)
  if (isPlainObject(value)) {
    const out: UnknownRecord = {}
    Object.entries(value).forEach(([k, v]) => {
      const next = stripNullToUndefined(v)
      if (next !== undefined) out[k] = next
    })
    return out
  }
  return value
}

function coerceScalar(kind: string, value: unknown) {
  if (value === undefined) return undefined
  switch (kind) {
    case 'string':
      return typeof value === 'string' ? value : String(value)
    case 'number': {
      const n = typeof value === 'number' ? value : Number(value)
      return Number.isFinite(n) ? n : undefined
    }
    case 'boolean':
      return typeof value === 'boolean' ? value : undefined
    case 'stringOrNumber': {
      if (typeof value === 'string' || typeof value === 'number') return value
      return undefined
    }
    case 'stringOrMap': {
      if (typeof value === 'string') return value
      if (isPlainObject(value)) {
        const out: Record<string, string> = {}
        Object.entries(value).forEach(([k, v]) => {
          if (!k.trim()) return
          out[k] = typeof v === 'string' ? v : String(v)
        })
        return Object.keys(out).length ? out : undefined
      }
      return undefined
    }
    default:
      return value
  }
}

function coerceArray(kind: string, value: unknown) {
  const list = Array.isArray(value) ? value : [value]
  if (kind === 'stringArray') {
    const out = list.map((v) => (v == null ? undefined : String(v))).filter((v) => v !== undefined)
    return out.length ? out : undefined
  }
  if (kind === 'numberArray') {
    const nums = list.map((v) => Number(v)).filter((n) => Number.isFinite(n))
    return nums.length ? nums : undefined
  }
  if (kind === 'stringOrNumberArray') {
    const out = list
      .map((v) => (typeof v === 'string' || typeof v === 'number' ? v : undefined))
      .filter((v) => v !== undefined)
    return out.length ? out : undefined
  }
  return undefined
}

function importBySchema(schema: FieldSchema, raw: unknown): unknown {
  const cleaned = stripNullToUndefined(raw)
  if (cleaned === undefined) return undefined

  switch (schema.kind) {
    case 'enum': {
      const v = coerceScalar('string', cleaned)
      if (!v) return undefined
      if (schema.options && !schema.options.includes(String(v))) return undefined
      return String(v)
    }
    case 'string':
    case 'number':
    case 'boolean':
    case 'stringOrNumber':
    case 'stringOrMap':
      return coerceScalar(schema.kind, cleaned)
    case 'stringArray':
    case 'numberArray':
    case 'stringOrNumberArray':
      return coerceArray(schema.kind, cleaned)
    case 'object': {
      if (!isPlainObject(cleaned) || !schema.fields) return undefined
      const out: UnknownRecord = {}
      schema.fields.forEach((f) => {
        const next = importBySchema(f, cleaned[f.key])
        if (next !== undefined) out[f.key] = next
      })
      return Object.keys(out).length ? out : undefined
    }
    case 'map': {
      if (!isPlainObject(cleaned) || !schema.valueSchema) return undefined
      const out: Record<string, unknown> = {}
      Object.entries(cleaned).forEach(([k, v]) => {
        if (!k.trim()) return
        const next = importBySchema(schema.valueSchema as FieldSchema, v)
        if (next !== undefined) out[k] = next
      })
      return Object.keys(out).length ? out : undefined
    }
    default:
      return undefined
  }
}

function ensureRequiredDefaults(schema: FieldSchema, current: unknown): unknown {
  const required = schema.optional !== true
  if (!required) return current
  if (current !== undefined) return current

  switch (schema.kind) {
    case 'string':
      return ''
    case 'number':
      return 0
    case 'boolean':
      return false
    case 'enum':
      return schema.options?.[0] ?? ''
    case 'stringOrNumber':
      return ''
    case 'stringOrMap':
      return ''
    case 'stringArray':
    case 'numberArray':
    case 'stringOrNumberArray':
      return []
    case 'object': {
      const out: UnknownRecord = {}
      ;(schema.fields ?? []).forEach((f) => {
        const next = ensureRequiredDefaults(f, undefined)
        if (next !== undefined) out[f.key] = next
      })
      return out
    }
    case 'map':
      return {}
    default:
      return current
  }
}

function buildDrawMergedFields(drawSchema: OperationSchema, action: string) {
  const actionSchema = drawSchema.actions?.find((a) => a.value === action) ?? null
  const fields: FieldSchema[] = [
    ...(drawSchema.fields ?? []),
    ...(actionSchema?.fields ?? []),
  ]
  return { actionSchema, fields }
}

function importOneOp(raw: unknown, chartType: ChartTypeValue | null): OpsBuilderBlock | null {
  if (!isPlainObject(raw)) return null
  const op = raw.op
  if (typeof op !== 'string') return null
  const meta = isPlainObject(raw.meta) ? raw.meta : null
  const metaSourceRaw = meta?.source
  const source = typeof metaSourceRaw === 'string' && metaSourceRaw.trim().length > 0 ? metaSourceRaw.trim() : undefined
  const opSchema = getOperationSchema(op)
  if (!opSchema) return null
  if (!isAllowedForChart(opSchema.allowedCharts, chartType)) return null

  const fields: UnknownRecord = {}

  if (op === 'draw') {
    const action = raw.action
    if (typeof action !== 'string') return null
    const { actionSchema, fields: merged } = buildDrawMergedFields(opSchema, action)
    if (!actionSchema) return null
    if (!isAllowedForChart(actionSchema.allowedCharts, chartType)) return null
    fields.action = action
    merged.forEach((f) => {
      if (f.key === 'action') return
      const next = importBySchema(f, raw[f.key])
      if (next !== undefined) fields[f.key] = next
    })
    // Auto-open required draw fields.
    merged.forEach((f) => {
      if (f.key === 'action') return
      const next = ensureRequiredDefaults(f, fields[f.key])
      if (next !== undefined) fields[f.key] = next
    })
  } else {
    ;(opSchema.fields ?? []).forEach((f) => {
      const next = importBySchema(f, raw[f.key])
      if (next !== undefined) fields[f.key] = next
    })
    ;(opSchema.fields ?? []).forEach((f) => {
      const next = ensureRequiredDefaults(f, fields[f.key])
      if (next !== undefined) fields[f.key] = next
    })
  }

  return { id: makeId('block'), op, disabled: false, source, fields }
}

export function importOpToBuilderBlock(rawOp: unknown, chartType: ChartTypeValue | null): OpsBuilderBlock | null {
  return importOneOp(rawOp, chartType)
}

function normalizeGroupsFromJson(parsed: JsonValue): Array<{ name: string; ops: unknown[] }> {
  const groups: Array<{ name: string; ops: unknown[] }> = []
  const isOpsArray = (value: unknown): value is unknown[] =>
    Array.isArray(value) && value.every((item) => isPlainObject(item) && typeof item.op === 'string')

  if (Array.isArray(parsed)) {
    if (isOpsArray(parsed)) groups.push({ name: 'ops', ops: parsed })
    return groups
  }

  if (isPlainObject(parsed)) {
    if (isOpsArray(parsed.ops)) {
      groups.push({ name: 'ops', ops: parsed.ops })
      return groups
    }
    Object.entries(parsed).forEach(([key, value]) => {
      if (isOpsArray(value)) groups.push({ name: key, ops: value })
    })
    if (!groups.length && typeof parsed.op === 'string') {
      groups.push({ name: 'ops', ops: [parsed] })
    }
  }

  return groups
}

export function importOpsBuilderStateFromJsonText(jsonText: string, chartType: ChartTypeValue | null): OpsBuilderState {
  const parsed = JSON.parse(jsonText) as JsonValue
  const groupsRaw = normalizeGroupsFromJson(parsed)

  const groups: OpsBuilderGroup[] = groupsRaw.map((g, idx) => {
    const blocks: OpsBuilderBlock[] = []
    g.ops.forEach((rawOp) => {
      const block = importOneOp(rawOp, chartType)
      if (block) blocks.push(block)
    })
    return {
      id: makeId('group'),
      name: g.name || `ops_${idx + 1}`,
      disabled: false,
      blocks,
    }
  })

  if (!groups.length) {
    return { groups: [{ id: makeId('group'), name: 'ops', disabled: false, blocks: [] }] }
  }

  return { groups }
}

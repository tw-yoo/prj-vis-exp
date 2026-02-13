import type { ChartTypeValue } from '../utils/chartRenderer'
import type { OperationSpec } from '../types'
import { OperationOp } from '../types'
import type { DrawAction } from '../renderer/draw/types'
import { drawOps } from '../renderer/draw/drawOps'
import { dataOps } from '../logic/dataOpsBuilder'
import type { FieldSchema, OpsBuilderBlock, OpsBuilderState, OperationSchema } from './types'
import { operationRegistry } from './registry'

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function sanitizeGroupKey(name: string) {
  const trimmed = (name || '').trim()
  const base = trimmed.length ? trimmed : 'ops'
  return base.replace(/[^\w\- ]+/g, '').trim() || 'ops'
}

function getOperationSchema(op: string): OperationSchema | null {
  return operationRegistry.operations.find((entry) => entry.op === op) ?? null
}

function isAllowedForChart(allowedCharts: ChartTypeValue[] | undefined, chartType: ChartTypeValue | null) {
  if (!allowedCharts || allowedCharts.length === 0) return true
  if (!chartType) return true
  return allowedCharts.includes(chartType)
}

function filterUndefinedDeep(value: unknown, schema: FieldSchema): unknown {
  if (value === undefined || value === null) return undefined

  switch (schema.kind) {
    case 'stringOrMap': {
      if (typeof value === 'string') return value
      if (!isPlainObject(value)) return undefined
      const out: Record<string, unknown> = {}
      Object.entries(value as Record<string, unknown>).forEach(([k, v]) => {
        if (!k.trim()) return
        out[k] = typeof v === 'string' ? v : String(v)
      })
      return Object.keys(out).length ? out : undefined
    }
    case 'object': {
      if (!isPlainObject(value) || !schema.fields) return undefined
      const out: Record<string, unknown> = {}
      schema.fields.forEach((field) => {
        const next = filterUndefinedDeep((value as any)[field.key], field)
        if (next !== undefined) out[field.key] = next
      })
      return Object.keys(out).length ? out : undefined
    }
    case 'map': {
      if (!isPlainObject(value) || !schema.valueSchema) return undefined
      const out: Record<string, unknown> = {}
      Object.entries(value as Record<string, unknown>).forEach(([k, v]) => {
        if (!k.trim()) return
        const next = filterUndefinedDeep(v, schema.valueSchema as FieldSchema)
        if (next !== undefined) out[k] = next
      })
      return Object.keys(out).length ? out : undefined
    }
    default:
      return value
  }
}

function materializeOptionalNullsDeep(value: unknown, schema: FieldSchema): unknown {
  // Optional OFF => null. Required OFF => undefined (validation should prevent).
  if (value === undefined) {
    return schema.optional ? null : undefined
  }
  if (value === null) {
    return schema.optional ? null : undefined
  }

  switch (schema.kind) {
    case 'stringOrMap': {
      if (typeof value === 'string') return value
      if (!isPlainObject(value)) return undefined
      const out: Record<string, unknown> = {}
      Object.entries(value as Record<string, unknown>).forEach(([k, v]) => {
        if (!k.trim()) return
        out[k] = typeof v === 'string' ? v : String(v)
      })
      return Object.keys(out).length ? out : undefined
    }
    case 'object': {
      if (!schema.fields) return value
      const input = isPlainObject(value) ? (value as Record<string, unknown>) : {}
      const out: Record<string, unknown> = {}
      schema.fields.forEach((field) => {
        const next = materializeOptionalNullsDeep((input as any)[field.key], field)
        if (next !== undefined) out[field.key] = next
      })
      return out
    }
    case 'map': {
      if (!schema.valueSchema) return value
      const input = isPlainObject(value) ? (value as Record<string, unknown>) : {}
      const out: Record<string, unknown> = {}
      Object.entries(input).forEach(([k, v]) => {
        if (!k.trim()) return
        const next = materializeOptionalNullsDeep(v, schema.valueSchema as FieldSchema)
        if (next !== undefined) out[k] = next
      })
      return out
    }
    default:
      return value
  }
}

function buildDrawSchemas(drawSchema: OperationSchema, action: string) {
  const actionSchema = drawSchema.actions?.find((a) => a.value === action) ?? null
  const fields: FieldSchema[] = [
    ...(drawSchema.fields ?? []),
    ...(actionSchema?.fields ?? []),
  ]
  return { actionSchema, fields }
}

const buildDataOp = (op: string, fields: Record<string, unknown>) => {
  switch (op) {
    case OperationOp.RetrieveValue:
      return dataOps.retrieveValue(fields as any)
    case OperationOp.Filter:
      return dataOps.filter(fields as any)
    case OperationOp.FindExtremum:
      return dataOps.findExtremum(fields as any)
    case OperationOp.DetermineRange:
      return dataOps.determineRange(fields as any)
    case OperationOp.Compare:
      return dataOps.compare(fields as any)
    case OperationOp.CompareBool:
      return dataOps.compareBool(fields as any)
    case OperationOp.Sort:
      return dataOps.sort(fields as any)
    case OperationOp.Sum:
      return dataOps.sum(fields as any)
    case OperationOp.Average:
      return dataOps.average(fields as any)
    case OperationOp.Diff:
      return dataOps.diff(fields as any)
    case OperationOp.LagDiff:
      return dataOps.lagDiff(fields as any)
    case OperationOp.Nth:
      return dataOps.nth(fields as any)
    case OperationOp.Count:
      return dataOps.count(fields as any)
    case OperationOp.Sleep:
      return dataOps.sleep(fields as any)
    default:
      return { op, ...fields } as OperationSpec
  }
}

function buildRunnableSpec(
  opSchema: OperationSchema,
  fields: Record<string, unknown>,
  chartType: ChartTypeValue | null,
): OperationSpec | null {
  if (!isAllowedForChart(opSchema.allowedCharts, chartType)) return null

  if (opSchema.op === 'draw') {
    const action = fields.action
    if (typeof action !== 'string') return null
    const { actionSchema, fields: merged } = buildDrawSchemas(opSchema, action)
    if (!actionSchema || !isAllowedForChart(actionSchema.allowedCharts, chartType)) return null

    const out: Record<string, unknown> = { action }
    merged.forEach((f) => {
      if (f.key === 'action') return
      const next = filterUndefinedDeep(fields[f.key], f)
      if (next !== undefined) out[f.key] = next
    })
    const { action: actionValue, ...rest } = out as { action: string }
    return drawOps.fromAction(actionValue as DrawAction, rest)
  }

  const out: Record<string, unknown> = {}
  ;(opSchema.fields ?? []).forEach((f) => {
    const next = filterUndefinedDeep(fields[f.key], f)
    if (next !== undefined) out[f.key] = next
  })
  return buildDataOp(opSchema.op, out)
}

function buildJsonSpec(
  opSchema: OperationSchema,
  fields: Record<string, unknown>,
  chartType: ChartTypeValue | null,
): OperationSpec | null {
  if (!isAllowedForChart(opSchema.allowedCharts, chartType)) return null

  if (opSchema.op === 'draw') {
    const action = fields.action
    if (typeof action !== 'string') return null
    const { actionSchema, fields: merged } = buildDrawSchemas(opSchema, action)
    if (!actionSchema || !isAllowedForChart(actionSchema.allowedCharts, chartType)) return null

    const out: Record<string, unknown> = { action }
    merged.forEach((f) => {
      if (f.key === 'action') return
      const next = materializeOptionalNullsDeep(fields[f.key], f)
      if (next !== undefined) out[f.key] = next
    })
    const { action: actionValue, ...rest } = out as { action: string }
    return drawOps.fromAction(actionValue as DrawAction, rest)
  }

  const out: Record<string, unknown> = {}
  ;(opSchema.fields ?? []).forEach((f) => {
    const next = materializeOptionalNullsDeep(fields[f.key], f)
    if (next !== undefined) out[f.key] = next
  })
  return buildDataOp(opSchema.op, out)
}

export type ExportResult = {
  runnableGroups: OperationSpec[][]
  json: string
}

export function buildRunnableOpFromBlock(
  block: OpsBuilderBlock,
  chartType: ChartTypeValue | null,
): OperationSpec | null {
  if (!block.op) return null
  const schema = getOperationSchema(block.op)
  if (!schema) return null
  return buildRunnableSpec(schema, block.fields, chartType)
}

export function exportOps(state: OpsBuilderState, chartType: ChartTypeValue | null): ExportResult {
  const runnableGroups: OperationSpec[][] = []
  const payload: Record<string, OperationSpec[]> = {}

  const usedKeys = new Set<string>()
  const uniqueKey = (raw: string) => {
    let key = sanitizeGroupKey(raw)
    if (!usedKeys.has(key)) {
      usedKeys.add(key)
      return key
    }
    let i = 2
    while (usedKeys.has(`${key}_${i}`)) i += 1
    const next = `${key}_${i}`
    usedKeys.add(next)
    return next
  }

  state.groups.forEach((group, idx) => {
    if (group.disabled) return

    const runnableOps: OperationSpec[] = []
    const jsonOps: OperationSpec[] = []

    group.blocks.forEach((block) => {
      if (block.disabled) return
      if (!block.op) return
      const schema = getOperationSchema(block.op)
      if (!schema) return

      const runnable = buildRunnableSpec(schema, block.fields, chartType)
      if (runnable) runnableOps.push(runnable)

      const jsonSpec = buildJsonSpec(schema, block.fields, chartType)
      if (jsonSpec) jsonOps.push(jsonSpec)
    })

    if (!runnableOps.length) return
    runnableGroups.push(runnableOps)

    const key = uniqueKey(group.name || `ops_${idx + 1}`)
    payload[key] = jsonOps
  })

  return { runnableGroups, json: JSON.stringify(payload, null, 2) }
}

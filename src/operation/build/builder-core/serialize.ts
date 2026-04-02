import type { ChartTypeValue } from '../../../domain/chart'
import type { OperationSpec } from '../../../types'
import { OperationOp } from '../../../types'
import { DrawAction, DrawAnnotationLifecycles, type DrawAction as DrawActionValue, type DrawOp } from '../../../rendering/draw/types'
import type { FieldSchema, OpsBuilderBlock, OpsBuilderState, OperationSchema } from './types'
import { operationRegistry } from './registry'

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

type UnknownRecord = Record<string, unknown>

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
        const next = filterUndefinedDeep(value[field.key], field)
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
      const input: UnknownRecord = isPlainObject(value) ? value : {}
      const out: Record<string, unknown> = {}
      schema.fields.forEach((field) => {
        const next = materializeOptionalNullsDeep(input[field.key], field)
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
  return { op, ...fields } as OperationSpec
}

type DrawBaseArgs = {
  chartId?: string
  select?: DrawOp['select']
  selectKeys?: Array<string | number>
  annotation?: DrawOp['annotation']
  meta?: DrawOp['meta']
}

function buildSelect(args: DrawBaseArgs): DrawOp['select'] {
  if (args.select) return args.select
  if (args.selectKeys && args.selectKeys.length > 0) return { keys: args.selectKeys }
  return undefined
}

function buildDrawBase(action: DrawActionValue, args: DrawBaseArgs = {}): DrawOp {
  return {
    op: OperationOp.Draw,
    action,
    annotation: args.annotation,
    meta: args.meta,
    chartId: args.chartId,
    select: buildSelect(args),
  }
}

function buildDrawOp(action: DrawActionValue, args: Record<string, unknown> = {}): DrawOp {
  switch (action) {
    case DrawAction.Highlight:
    case DrawAction.Dim: {
      const op = buildDrawBase(action, args as DrawBaseArgs)
      if ('style' in args) op.style = args.style as DrawOp['style']
      return op
    }
    case DrawAction.Clear:
      return buildDrawBase(action, { chartId: args.chartId as string | undefined })
    case DrawAction.Text:
      return { ...buildDrawBase(action, args as DrawBaseArgs), text: args.text as DrawOp['text'] }
    case DrawAction.Rect:
      return { ...buildDrawBase(action, args as DrawBaseArgs), rect: args.rect as DrawOp['rect'] }
    case DrawAction.Line:
      return { ...buildDrawBase(action, args as DrawBaseArgs), line: args.line as DrawOp['line'] }
    case DrawAction.LineTrace:
      return buildDrawBase(action, args as DrawBaseArgs)
    case DrawAction.BarSegment:
      return {
        ...buildDrawBase(action, {
          ...(args as DrawBaseArgs),
          annotation: ((args.annotation as DrawOp['annotation']) ?? { lifecycle: DrawAnnotationLifecycles.Transient }),
        }),
        segment: args.segment as DrawOp['segment'],
      }
    case DrawAction.Split:
      return { ...buildDrawBase(action, args as DrawBaseArgs), split: args.split as DrawOp['split'] }
    case DrawAction.Unsplit:
      return buildDrawBase(action, args as DrawBaseArgs)
    case DrawAction.Sort:
      return { ...buildDrawBase(action, args as DrawBaseArgs), sort: args.sort as DrawOp['sort'] }
    case DrawAction.Filter:
      return { ...buildDrawBase(action, args as DrawBaseArgs), filter: args.filter as DrawOp['filter'] }
    case DrawAction.Sum:
      return { ...buildDrawBase(action, args as DrawBaseArgs), sum: args.sum as DrawOp['sum'] }
    case DrawAction.LineToBar:
    case DrawAction.MultiLineToStacked:
    case DrawAction.MultiLineToGrouped:
      return buildDrawBase(action, args as DrawBaseArgs)
    case DrawAction.StackedToGrouped:
    case DrawAction.GroupedToStacked:
      return { ...buildDrawBase(action, args as DrawBaseArgs), stackGroup: args.stackGroup as DrawOp['stackGroup'] }
    case DrawAction.StackedToSimple:
    case DrawAction.GroupedToSimple:
      return { ...buildDrawBase(action, args as DrawBaseArgs), toSimple: args.toSimple as DrawOp['toSimple'] }
    case DrawAction.StackedFilterGroups:
    case DrawAction.GroupedFilterGroups:
      return { ...buildDrawBase(action, args as DrawBaseArgs), groupFilter: args.groupFilter as DrawOp['groupFilter'] }
    case DrawAction.Band:
      return { ...buildDrawBase(action, args as DrawBaseArgs), band: args.band as DrawOp['band'] }
    case DrawAction.ScalarPanel:
      return { ...buildDrawBase(action, args as DrawBaseArgs), scalarPanel: args.scalarPanel as DrawOp['scalarPanel'] }
    case DrawAction.Sleep: {
      const op = buildDrawBase(action, args as DrawBaseArgs)
      if ('seconds' in args) op.seconds = args.seconds as number | undefined
      if ('duration' in args) op.duration = args.duration as number | undefined
      return op
    }
    default:
      return { op: OperationOp.Draw, action, ...args } as DrawOp
  }
}

const withBlockSourceMeta = (operation: OperationSpec | null, source: string | undefined): OperationSpec | null => {
  if (!operation) return null
  if (!source || !source.trim()) return operation
  return {
    ...operation,
    meta: {
      ...(operation.meta ?? {}),
      source: source.trim(),
    },
  }
}

function buildRunnableSpec(
  opSchema: OperationSchema,
  fields: Record<string, unknown>,
  chartType: ChartTypeValue | null,
  source?: string,
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
    return withBlockSourceMeta(buildDrawOp(actionValue as DrawAction, rest), source)
  }

  const out: Record<string, unknown> = {}
  ;(opSchema.fields ?? []).forEach((f) => {
    const next = filterUndefinedDeep(fields[f.key], f)
    if (next !== undefined) out[f.key] = next
  })
  return withBlockSourceMeta(buildDataOp(opSchema.op, out), source)
}

function buildJsonSpec(
  opSchema: OperationSchema,
  fields: Record<string, unknown>,
  chartType: ChartTypeValue | null,
  source?: string,
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
    return withBlockSourceMeta(buildDrawOp(actionValue as DrawAction, rest), source)
  }

  const out: Record<string, unknown> = {}
  ;(opSchema.fields ?? []).forEach((f) => {
    const next = materializeOptionalNullsDeep(fields[f.key], f)
    if (next !== undefined) out[f.key] = next
  })
  return withBlockSourceMeta(buildDataOp(opSchema.op, out), source)
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
  return buildRunnableSpec(schema, block.fields, chartType, block.source)
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

      const runnable = buildRunnableSpec(schema, block.fields, chartType, block.source)
      if (runnable) runnableOps.push(runnable)

      const jsonSpec = buildJsonSpec(schema, block.fields, chartType, block.source)
      if (jsonSpec) jsonOps.push(jsonSpec)
    })

    if (!runnableOps.length) return
    runnableGroups.push(runnableOps)

    const key = uniqueKey(group.name || `ops_${idx + 1}`)
    payload[key] = jsonOps
  })

  return { runnableGroups, json: JSON.stringify(payload, null, 2) }
}

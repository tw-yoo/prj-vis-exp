import { ChartType, type ChartSpec, type ChartTypeValue } from '../domain/chart'
import { OperationOp, type DatumValue, type OperationSpec } from '../domain/operation/types'
import type { TensionPolicy } from './tensionPolicy'

export type AxisKind = 'temporal' | 'quantitative' | 'ordinal' | 'nominal' | 'unknown'
export type FilterVisualMode = 'dim' | 'remove'
export type FilterYDomainMode = 'preserve' | 'rescale'

export interface FilterVisualDecision {
  mode: FilterVisualMode
  reason: string
  xKind: AxisKind
  isContiguous: boolean
  yDomainMode: FilterYDomainMode
}

export interface ResolveFilterVisualDecisionArgs {
  spec: ChartSpec
  chartType: ChartTypeValue
  operation: OperationSpec
  filteredData: DatumValue[]
  originalData: DatumValue[]
  groupOps: OperationSpec[]
  operationIndex: number
  policy?: TensionPolicy
}

type EncodingChannel = {
  field?: unknown
  type?: unknown
}

const AXIS_KINDS = new Set<AxisKind>(['temporal', 'quantitative', 'ordinal', 'nominal', 'unknown'])
const SUBSET_INTERNAL_OPS = new Set<string>([
  OperationOp.Average,
  OperationOp.Sum,
  OperationOp.Count,
  OperationOp.FindExtremum,
  OperationOp.Nth,
  OperationOp.Sort,
])
const MARK_RELATION_OPS = new Set<string>([
  OperationOp.Diff,
  OperationOp.RetrieveValue,
  OperationOp.DiffByValue,
  OperationOp.CompareBool,
])
const THRESHOLD_OPERATORS = new Set(['>', '>=', '<', '<=', 'between'])

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function readXChannel(spec: ChartSpec): EncodingChannel {
  return (asRecord(asRecord(spec.encoding)?.x) ?? {}) as EncodingChannel
}

function normalizeAxisKind(value: unknown): AxisKind | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  return AXIS_KINDS.has(normalized as AxisKind) ? normalized as AxisKind : null
}

function fieldNameSuggestsTemporal(field: string | null) {
  if (!field) return false
  return /\b(year|date|time|month|quarter|week|day|period|season)\b/i.test(field)
}

function fieldNameSuggestsOrdinal(field: string | null) {
  if (!field) return false
  return /\b(rank|order|level|stage|step|grade|position|tier)\b/i.test(field)
}

function isYearLike(value: string) {
  return /^(18|19|20|21)\d{2}$/.test(value.trim())
}

function isDateLike(value: string) {
  const trimmed = value.trim()
  if (isYearLike(trimmed)) return true
  if (/^(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*([-' ]?\d{2,4})?$/i.test(trimmed)) return true
  if (/^q[1-4]([-' ]?\d{2,4})?$/i.test(trimmed)) return true
  return !Number.isNaN(Date.parse(trimmed)) && /[-/]|[a-z]/i.test(trimmed)
}

function valueSamplesSuggestTemporal(values: string[]) {
  if (values.length === 0) return false
  const sample = values.slice(0, 8)
  return sample.filter(isDateLike).length >= Math.max(1, Math.ceil(sample.length * 0.6))
}

function valueSamplesSuggestQuantitative(values: string[]) {
  if (values.length === 0) return false
  const sample = values.slice(0, 8)
  return sample.filter((value) => Number.isFinite(Number(value))).length === sample.length
}

function uniqueTargets(rows: DatumValue[]) {
  const out: string[] = []
  const seen = new Set<string>()
  rows.forEach((row) => {
    const key = String(row.target)
    if (seen.has(key)) return
    seen.add(key)
    out.push(key)
  })
  return out
}

export function resolveXAxisKind(spec: ChartSpec, operation: OperationSpec, rows: DatumValue[]): AxisKind {
  const xChannel = readXChannel(spec)
  const xField = typeof xChannel.field === 'string' ? xChannel.field.trim() : rows[0]?.category ?? null
  const encodingKind = normalizeAxisKind(xChannel.type)
  const hint = normalizeAxisKind(operation.xKindHint)
  const values = uniqueTargets(rows)

  if (encodingKind === 'temporal' || encodingKind === 'quantitative' || encodingKind === 'ordinal') return encodingKind
  if (encodingKind === 'nominal') {
    if (hint && hint !== 'unknown' && hint !== 'nominal') return hint
    if (fieldNameSuggestsTemporal(xField) || valueSamplesSuggestTemporal(values)) return 'temporal'
    if (fieldNameSuggestsOrdinal(xField)) return 'ordinal'
    return 'nominal'
  }

  if (hint && hint !== 'unknown') return hint
  if (fieldNameSuggestsTemporal(xField) || valueSamplesSuggestTemporal(values)) return 'temporal'
  if (fieldNameSuggestsOrdinal(xField)) return 'ordinal'
  if (valueSamplesSuggestQuantitative(values)) return 'quantitative'
  return values.length > 0 ? 'nominal' : 'unknown'
}

function isContiguousSubset(originalData: DatumValue[], filteredData: DatumValue[]) {
  const originalTargets = uniqueTargets(originalData)
  const retained = new Set(uniqueTargets(filteredData))
  const indexes = originalTargets
    .map((target, index) => retained.has(target) ? index : null)
    .filter((index): index is number => index != null)
  if (indexes.length <= 1) return true
  const min = Math.min(...indexes)
  const max = Math.max(...indexes)
  return indexes.length === max - min + 1
}

function isMeasureThresholdFilter(operation: OperationSpec, originalData: DatumValue[]) {
  const operator = typeof operation.operator === 'string' ? operation.operator : ''
  if (!THRESHOLD_OPERATORS.has(operator)) return false
  const field = typeof operation.field === 'string' ? operation.field : null
  if (!field) return false
  return originalData.some((datum) => datum.measure === field || field === 'value')
}

function nextOperation(args: ResolveFilterVisualDecisionArgs) {
  return args.groupOps[args.operationIndex + 1] ?? null
}

function nodeId(operation: OperationSpec) {
  return operation.meta?.nodeId ?? operation.id ?? null
}

function nextUsesExternalInputs(current: OperationSpec, next: OperationSpec | null) {
  if (!next || !Array.isArray(next.meta?.inputs) || next.meta.inputs.length === 0) return false
  const currentId = nodeId(current)
  if (!currentId) return next.meta.inputs.length > 0
  return next.meta.inputs.some((input) => String(input) !== String(currentId))
}

function isMembershipFilter(operation: OperationSpec) {
  return Boolean(
    (Array.isArray(operation.include) && operation.include.length > 0) ||
    (Array.isArray(operation.exclude) && operation.exclude.length > 0) ||
    (!operation.operator && Array.isArray(operation.value) && operation.value.length > 0) ||
    (!operation.operator && operation.group != null),
  )
}

function isScopeReductionFilter(operation: OperationSpec, originalData: DatumValue[]) {
  return isMembershipFilter(operation) || !isMeasureThresholdFilter(operation, originalData)
}

export function resolveFilterVisualDecision(args: ResolveFilterVisualDecisionArgs): FilterVisualDecision {
  const xKind = resolveXAxisKind(args.spec, args.operation, args.originalData)
  const isContiguous = isContiguousSubset(args.originalData, args.filteredData)
  const next = nextOperation(args)
  const nextOpName = typeof next?.op === 'string' ? next.op : null
  const override = args.policy?.salienceStrategy.perOp?.[OperationOp.Filter]

  if (override === 'dim' || override === 'remove') {
    return { mode: override, reason: `manual filter salience override: ${override}`, xKind, isContiguous, yDomainMode: 'preserve' }
  }

  if (args.chartType !== ChartType.SIMPLE_BAR) {
    return { mode: 'dim', reason: 'non-simple-bar fallback', xKind, isContiguous, yDomainMode: 'preserve' }
  }
  if (!next) {
    return { mode: 'dim', reason: 'leaf filter explains excluded marks', xKind, isContiguous, yDomainMode: 'preserve' }
  }
  if (isMeasureThresholdFilter(args.operation, args.originalData)) {
    return { mode: 'dim', reason: 'measure threshold needs excluded-bar context', xKind, isContiguous, yDomainMode: 'preserve' }
  }
  if (nextUsesExternalInputs(args.operation, next)) {
    return { mode: 'dim', reason: 'next operation compares against external inputs', xKind, isContiguous, yDomainMode: 'preserve' }
  }
  if ((xKind === 'temporal' || xKind === 'quantitative' || xKind === 'ordinal') && !isContiguous) {
    return { mode: 'dim', reason: 'ordered x subset is non-contiguous', xKind, isContiguous, yDomainMode: 'preserve' }
  }
  if (xKind === 'nominal' && !isContiguous && nextOpName && MARK_RELATION_OPS.has(nextOpName)) {
    return { mode: 'dim', reason: 'non-contiguous nominal subset feeds mark relation operation', xKind, isContiguous, yDomainMode: 'preserve' }
  }
  if (nextOpName === OperationOp.Sort) {
    return { mode: 'remove', reason: 'sort should operate on a materialized subset', xKind, isContiguous, yDomainMode: 'preserve' }
  }
  if (nextOpName && SUBSET_INTERNAL_OPS.has(nextOpName) && isScopeReductionFilter(args.operation, args.originalData)) {
    return { mode: 'remove', reason: 'filter scopes subset-internal operation', xKind, isContiguous, yDomainMode: 'preserve' }
  }

  return { mode: 'dim', reason: 'default context-preserving filter', xKind, isContiguous, yDomainMode: 'preserve' }
}

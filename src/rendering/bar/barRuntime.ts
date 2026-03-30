import * as d3 from 'd3'
import type { ChartSpec } from '../../domain/chart'
import type { JsonValue } from '../../types'
import { loadRowsFromVegaLiteData } from '../vegaLite/dataLoader'
import { applyVegaLiteTransforms } from '../vegaLite/transform'

export type RawDatum = Record<string, JsonValue>

type FilterExpr =
  | string
  | { field?: string; equal?: JsonValue; oneOf?: JsonValue[]; range?: [JsonValue, JsonValue]; lt?: JsonValue; lte?: JsonValue; gt?: JsonValue; gte?: JsonValue }
  | { and?: FilterExpr[]; or?: FilterExpr[]; not?: FilterExpr }

type SortSpec = JsonValue | undefined

const DEFAULT_CATEGORY_COLORS = ['#4f46e5', '#14b8a6', '#f97316', '#e11d48', '#8b5cf6', '#0ea5e9', '#16a34a', '#f59e0b']

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function toNumber(value: JsonValue) {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function aggregateForSort(rows: RawDatum[], sortField: string, op = 'sum') {
  const numericValues = sortField ? rows.map((row) => Number(row[sortField])).filter(Number.isFinite) : []
  switch (String(op).toLowerCase()) {
    case 'count':
    case 'valid':
      return rows.length
    case 'mean':
    case 'average':
    case 'avg':
      return d3.mean(numericValues) ?? 0
    case 'median':
      return d3.median(numericValues) ?? 0
    case 'min':
      return d3.min(numericValues) ?? 0
    case 'max':
      return d3.max(numericValues) ?? 0
    case 'sum':
    default:
      return d3.sum(numericValues)
  }
}

function evalDatumExpression(datum: RawDatum, expr: string): boolean {
  const js = expr.replace(/\bdatum\./g, 'd.')
  // eslint-disable-next-line no-new-func
  const fn = new Function('d', `return (${js});`) as (d: RawDatum) => boolean
  return Boolean(fn(datum))
}

function evalFilterExpr(datum: RawDatum, expr: FilterExpr | undefined): boolean {
  if (expr == null) return true
  if (typeof expr === 'string') {
    try {
      return evalDatumExpression(datum, expr)
    } catch {
      return true
    }
  }
  const rec = asRecord(expr)
  if (Array.isArray(rec.and)) return (rec.and as FilterExpr[]).every((entry) => evalFilterExpr(datum, entry))
  if (Array.isArray(rec.or)) return (rec.or as FilterExpr[]).some((entry) => evalFilterExpr(datum, entry))
  if (rec.not !== undefined) return !evalFilterExpr(datum, rec.not as FilterExpr)

  const field = typeof rec.field === 'string' ? rec.field : null
  if (!field) return true
  const value = datum[field]

  if (Array.isArray(rec.oneOf)) {
    const tokenSet = new Set(rec.oneOf.map((entry) => String(entry)))
    return tokenSet.has(String(value))
  }
  if (rec.equal !== undefined) return String(value) === String(rec.equal)
  if (Array.isArray(rec.range) && rec.range.length >= 2) {
    const lower = Number(rec.range[0])
    const upper = Number(rec.range[1])
    const numeric = Number(value)
    if (!Number.isFinite(numeric) || !Number.isFinite(lower) || !Number.isFinite(upper)) return false
    return numeric >= lower && numeric <= upper
  }

  const numeric = Number(value)
  if (rec.lt !== undefined) {
    const threshold = Number(rec.lt)
    return Number.isFinite(numeric) && Number.isFinite(threshold) ? numeric < threshold : false
  }
  if (rec.lte !== undefined) {
    const threshold = Number(rec.lte)
    return Number.isFinite(numeric) && Number.isFinite(threshold) ? numeric <= threshold : false
  }
  if (rec.gt !== undefined) {
    const threshold = Number(rec.gt)
    return Number.isFinite(numeric) && Number.isFinite(threshold) ? numeric > threshold : false
  }
  if (rec.gte !== undefined) {
    const threshold = Number(rec.gte)
    return Number.isFinite(numeric) && Number.isFinite(threshold) ? numeric >= threshold : false
  }
  return true
}

export function cloneRows(rows: RawDatum[]) {
  return rows.map((row) => ({ ...row }))
}

export async function loadBarRows(spec: ChartSpec): Promise<RawDatum[]> {
  const rows = await loadRowsFromVegaLiteData(spec.data)
  const transformed = applyVegaLiteTransforms(cloneRows(rows), spec.transform as JsonValue | undefined)
  return cloneRows(transformed)
}

export function resolveCategoricalDomain(rows: RawDatum[], field: string, sortSpec: SortSpec, sortField?: string) {
  const fallbackDomain = Array.from(new Set(rows.map((row) => row[field]).filter((value) => value != null))).map(
    (value) => value as string | number,
  )
  if (!sortSpec) return fallbackDomain
  if (Array.isArray(sortSpec)) return sortSpec.map((entry) => String(entry)) as Array<string | number>
  if (typeof sortSpec === 'string') {
    const next = fallbackDomain.slice()
    if (sortSpec === 'ascending') return next.sort(d3.ascending)
    if (sortSpec === 'descending') return next.sort(d3.descending)
    return next
  }
  if (typeof sortSpec === 'object') {
    const rec = asRecord(sortSpec)
    const grouped = new Map<string, RawDatum[]>()
    rows.forEach((row) => {
      const raw = row[field]
      if (raw == null) return
      const key = String(raw)
      if (!grouped.has(key)) grouped.set(key, [])
      grouped.get(key)!.push(row)
    })
    const direction = String(rec.order ?? 'ascending').toLowerCase() === 'descending' ? -1 : 1
    const sortByField = typeof rec.field === 'string' ? rec.field : sortField ?? ''
    const sortOp = typeof rec.op === 'string' ? rec.op : 'sum'
    return Array.from(grouped.entries())
      .map(([key, bucket]) => ({
        key,
        display: bucket[0]?.[field] as string | number,
        value: aggregateForSort(bucket, sortByField, sortOp),
      }))
      .sort((a, b) => {
        const diff = a.value - b.value
        if (Number.isFinite(diff) && diff !== 0) return diff * direction
        return d3.ascending(String(a.key), String(b.key))
      })
      .map((entry) => entry.display)
  }
  return fallbackDomain
}

export function resolveDiscreteDomainFromScale(
  rows: RawDatum[],
  field: string | null | undefined,
  scale: unknown,
  fallbackField?: string,
) {
  const scaleRec = asRecord(scale)
  if (Array.isArray(scaleRec.domain)) {
    return scaleRec.domain
      .map((entry) => (entry == null ? null : (entry as string | number)))
      .filter((entry): entry is string | number => entry !== null)
  }
  const resolvedField = field ?? fallbackField
  if (!resolvedField) return []
  return Array.from(new Set(rows.map((row) => row[resolvedField]).filter((value) => value != null))).map(
    (value) => value as string | number,
  )
}

export function resolveBaseBarFill(spec: ChartSpec) {
  const mark = spec.mark
  if (mark && typeof mark === 'object' && !Array.isArray(mark)) {
    if (typeof mark.fill === 'string' && mark.fill.trim().length > 0) return mark.fill
    if (typeof mark.color === 'string' && mark.color.trim().length > 0) return mark.color
  }
  const configColor = asRecord(asRecord(spec.config).mark).color
  if (typeof configColor === 'string' && configColor.trim().length > 0) return configColor
  return '#69b3a2'
}

export function resolveColorRange(spec: ChartSpec) {
  const colorScale = asRecord(asRecord(asRecord(spec.encoding).color).scale)
  if (Array.isArray(colorScale.range)) {
    const colors = colorScale.range.map((entry) => (typeof entry === 'string' ? entry.trim() : '')).filter(Boolean)
    if (colors.length > 0) return colors
  }
  const configRange = asRecord(asRecord(spec.config).range)
  if (Array.isArray(configRange.category)) {
    const colors = configRange.category.map((entry) => (typeof entry === 'string' ? entry.trim() : '')).filter(Boolean)
    if (colors.length > 0) return colors
  }
  return DEFAULT_CATEGORY_COLORS
}

export function resolveScaleDomain(values: number[], scale: unknown, minZeroDefault = true): [number, number] {
  const scaleRec = asRecord(scale)
  const minRaw = d3.min(values.filter(Number.isFinite))
  const maxRaw = d3.max(values.filter(Number.isFinite))
  let domainMin = Number.isFinite(minRaw as number) ? (minRaw as number) : 0
  let domainMax = Number.isFinite(maxRaw as number) ? (maxRaw as number) : 0
  const zero = typeof scaleRec.zero === 'boolean' ? scaleRec.zero : minZeroDefault
  if (zero) {
    domainMin = Math.min(domainMin, 0)
    domainMax = Math.max(domainMax, 0)
  }
  if (Array.isArray(scaleRec.domain) && scaleRec.domain.length >= 2) {
    const explicitMin = Number(scaleRec.domain[0])
    const explicitMax = Number(scaleRec.domain[1])
    if (Number.isFinite(explicitMin)) domainMin = explicitMin
    if (Number.isFinite(explicitMax)) domainMax = explicitMax
  }
  const domainMinOverride = Number(scaleRec.domainMin)
  const domainMaxOverride = Number(scaleRec.domainMax)
  if (Number.isFinite(domainMinOverride)) domainMin = domainMinOverride
  if (Number.isFinite(domainMaxOverride)) domainMax = domainMaxOverride
  if (domainMin === domainMax) domainMax = domainMin + 1
  return [domainMin, domainMax]
}

type ResolvedColorCondition = { test?: FilterExpr; value?: string } | null

function resolveColorCondition(spec: ChartSpec): ResolvedColorCondition {
  const colorChannel = asRecord(asRecord(spec.encoding).color)
  const condition = colorChannel.condition
  if (Array.isArray(condition)) {
    const first = condition.find((entry) => typeof asRecord(entry).value === 'string')
    if (!first) return null
    const rec = asRecord(first)
    return { test: rec.test as FilterExpr | undefined, value: typeof rec.value === 'string' ? rec.value : undefined }
  }
  const rec = asRecord(condition)
  if (typeof rec.value !== 'string') return null
  return { test: rec.test as FilterExpr | undefined, value: rec.value }
}

export function buildBarColorResolver(
  spec: ChartSpec,
  colorField: string | null | undefined,
  domain: Array<string | number>,
) {
  const palette = resolveColorRange(spec)
  const baseFill = resolveBaseBarFill(spec)
  const colorScale = d3.scaleOrdinal<string, string>(palette).domain(domain.map((entry) => String(entry)))
  const condition = resolveColorCondition(spec)
  return (rows: RawDatum[], key?: string | number | null) => {
    if (condition?.value && rows.some((row) => evalFilterExpr(row, condition.test))) {
      return condition.value
    }
    if (key != null) {
      return colorScale(String(key)) ?? baseFill
    }
    if (colorField) {
      const first = rows.find((row) => row[colorField] != null)?.[colorField]
      if (first != null) return colorScale(String(first)) ?? baseFill
    }
    return baseFill
  }
}

import type { JsonValue } from '../../types'

type RawDatum = Record<string, JsonValue>

type FilterObject =
  | { field: string; equal: JsonValue }
  | { field: string; oneOf: JsonValue[] }
  | { field: string; range: [JsonValue, JsonValue] }
  | { field: string; lt: JsonValue }
  | { field: string; lte: JsonValue }
  | { field: string; gt: JsonValue }
  | { field: string; gte: JsonValue }

type FilterExpr =
  | string
  | FilterObject
  | { and: FilterExpr[] }
  | { or: FilterExpr[] }
  | { not: FilterExpr }

type CalculateTransform = { calculate: string; as: string }
type FilterTransform = { filter: FilterExpr }
type UnknownTransform = Record<string, unknown>

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function toNumber(value: JsonValue) {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function evalDatumExpression(datum: RawDatum, expr: string): JsonValue {
  // NOTE: This mirrors existing behavior in `simpleBarRenderer.ts` (new Function).
  // It is intended for local research prototypes and trusted specs.
  const js = expr.replace(/\bdatum\./g, 'd.')
  // eslint-disable-next-line no-new-func
  const fn = new Function('d', `return (${js});`) as (d: RawDatum) => JsonValue
  return fn(datum)
}

function evalFilterObject(datum: RawDatum, filter: FilterObject): boolean {
  const raw = datum[filter.field]
  if ('equal' in filter) return raw === filter.equal
  if ('oneOf' in filter) return filter.oneOf.some((v) => v === raw)
  if ('range' in filter) {
    const num = toNumber(raw)
    const min = toNumber(filter.range[0])
    const max = toNumber(filter.range[1])
    if (num == null || min == null || max == null) return false
    return num >= min && num <= max
  }
  if ('lt' in filter) {
    const num = toNumber(raw)
    const other = toNumber(filter.lt)
    return num != null && other != null ? num < other : false
  }
  if ('lte' in filter) {
    const num = toNumber(raw)
    const other = toNumber(filter.lte)
    return num != null && other != null ? num <= other : false
  }
  if ('gt' in filter) {
    const num = toNumber(raw)
    const other = toNumber(filter.gt)
    return num != null && other != null ? num > other : false
  }
  if ('gte' in filter) {
    const num = toNumber(raw)
    const other = toNumber(filter.gte)
    return num != null && other != null ? num >= other : false
  }
  return true
}

function evalFilterExpr(datum: RawDatum, filter: FilterExpr): boolean {
  if (typeof filter === 'string') {
    try {
      return !!evalDatumExpression(datum, filter)
    } catch {
      // If parsing fails, keep datum (match existing "fail open" posture).
      return true
    }
  }
  if (!isRecord(filter)) return true
  if (Array.isArray((filter as any).and)) {
    return ((filter as any).and as FilterExpr[]).every((f) => evalFilterExpr(datum, f))
  }
  if (Array.isArray((filter as any).or)) {
    return ((filter as any).or as FilterExpr[]).some((f) => evalFilterExpr(datum, f))
  }
  if ('not' in filter) {
    return !evalFilterExpr(datum, (filter as any).not as FilterExpr)
  }
  if (typeof (filter as any).field === 'string') {
    return evalFilterObject(datum, filter as unknown as FilterObject)
  }
  return true
}

export function applyVegaLiteTransforms(rows: RawDatum[], transforms: JsonValue | undefined): RawDatum[] {
  if (!Array.isArray(rows) || rows.length === 0) return rows
  if (!Array.isArray(transforms)) return rows

  let next = rows
  transforms.forEach((t) => {
    if (!isRecord(t)) return

    const maybeFilter = (t as FilterTransform).filter
    if (maybeFilter !== undefined) {
      next = next.filter((row) => evalFilterExpr(row, maybeFilter as FilterExpr))
      return
    }

    const calc = t as unknown as CalculateTransform
    if (typeof calc.calculate === 'string' && typeof calc.as === 'string' && calc.as.trim() !== '') {
      const asKey = calc.as
      next = next.map((row) => {
        try {
          const value = evalDatumExpression(row, calc.calculate)
          return { ...row, [asKey]: value }
        } catch {
          return row
        }
      })
    }
  })

  return next
}


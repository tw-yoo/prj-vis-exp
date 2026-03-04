import type { DatumValue, JsonPrimitive, JsonValue, OperationSpec, TargetSelector } from './types'
import type {
  OpAddSpec,
  OpCompareBoolSpec,
  OpCompareSpec,
  OpCountSpec,
  OpDiffSpec,
  OpDetermineRangeSpec,
  OpFilterSpec,
  OpFindExtremumSpec,
  OpLagDiffSpec,
  OpNthSpec,
  OpPairDiffSpec,
  OpRetrieveValueSpec,
  OpScaleSpec,
  OpSetOpSpec,
  OpSortSpec,
  OpSumSpec,
  OpAverageSpec,
} from './types/operationSpecs'
import {
  assertAddSpec,
  assertAverageSpec,
  assertCompareBoolSpec,
  assertCompareSpec,
  assertCountSpec,
  assertDetermineRangeSpec,
  assertDiffSpec,
  assertFilterSpec,
  assertFindExtremumSpec,
  assertLagDiffSpec,
  assertNthSpec,
  assertPairDiffSpec,
  assertRetrieveValueSpec,
  assertScaleSpec,
  assertSetOpSpec,
  assertSortSpec,
  assertSumSpec,
} from './types/operationValidators'

// ---------------------------------------------------------------------------
// Shared helpers (ported from dataOpsCore.js)
// ---------------------------------------------------------------------------

const ROUND_PRECISION = 2
const ROUND_FACTOR = 10 ** ROUND_PRECISION

/** Round a numeric value to 2 decimal places; return original if non-numeric. */
export function roundNumeric(value: number) {
  if (!Number.isFinite(value)) return value
  return Math.round(value * ROUND_FACTOR) / ROUND_FACTOR
}

export function toTrimmedString(value: JsonPrimitive | undefined, fallback = '') {
  if (value == null) return fallback
  const str = String(value).trim()
  return str.length ? str : fallback
}

export function formatFieldLabel(field: JsonPrimitive | undefined, fallback = 'value') {
  const label = toTrimmedString(field, fallback)
  return label || fallback
}

export function formatGroupSuffix(group: JsonPrimitive | undefined) {
  const label = toTrimmedString(group, '')
  return label ? ` (${label})` : ''
}

export function formatTargetLabel(selector: TargetSelector | TargetSelector[] | undefined): string {
  if (Array.isArray(selector)) {
    const labels: string[] = selector
      .map((entry) => formatTargetLabel(entry))
      .filter((label): label is string => typeof label === 'string' && label.length > 0)
    if (labels.length === 0) return 'Multiple targets'
    return labels.join(' + ')
  }
  if (selector == null) return ''
  if (typeof selector === 'string' || typeof selector === 'number') return String(selector)
  if (typeof selector === 'object') {
    if (selector.category && selector.series) return `${selector.category}/${selector.series}`
    if (selector.category) return String(selector.category)
    if ((selector as { target?: JsonValue }).target) return String((selector as { target?: JsonValue }).target)
    if ((selector as { id?: JsonValue }).id) return String((selector as { id?: JsonValue }).id)
  }
  return ''
}

/** Create a human-friendly label for an aggregated result. */
export function formatResultName(
  kind: string,
  field: JsonPrimitive | undefined,
  opts: { group?: JsonPrimitive; detail?: JsonPrimitive } = {},
) {
  const baseField = formatFieldLabel(field)
  const groupPart = formatGroupSuffix(opts.group)
  const detailPart = toTrimmedString(opts.detail, '')
  const detailSuffix = detailPart ? ` — ${detailPart}` : ''
  return `${kind} of ${baseField}${groupPart}${detailSuffix}`
}

// ---------------------------------------------------------------------------
// Runtime result store (in-memory; pure JS, no DOM)
// ---------------------------------------------------------------------------

const runtimeResults = new Map<string, DatumValue[]>()

function cloneDatumValue(datum: DatumValue): DatumValue {
  return {
    category: datum.category,
    measure: datum.measure,
    target: datum.target,
    group: datum.group ?? null,
    value: datum.value,
    id: datum.id ?? null,
    lookupId: datum.lookupId ?? datum.id ?? null,
    name: datum.name ?? null,
    prevTarget: datum.prevTarget,
    series: datum.series ?? null,
  }
}

/** Clear all cached runtime results. */
export function resetRuntimeResults() {
  runtimeResults.clear()
}

/** Store a result array (or single datum) keyed for later lookup. */
export function storeRuntimeResult(key: string | number, result: DatumValue | DatumValue[] | null | undefined) {
  if (key == null) return
  const id = String(key)
  if (result == null) {
    runtimeResults.delete(id)
    return
  }
  const arr = Array.isArray(result) ? result : [result]
  const normalized = arr.map(cloneDatumValue).filter((d) => Number.isFinite(d.value))
  if (!normalized.length) {
    runtimeResults.delete(id)
    return
  }
  runtimeResults.set(id, normalized)
}

/** Retrieve a deep-cloned copy of cached results by key. */
export function getRuntimeResultsById(key: string | number | null | undefined): DatumValue[] {
  if (key == null) return []
  const id = String(key)
  const stored = runtimeResults.get(id)
  if (!stored || !stored.length) return []
  return stored.map(cloneDatumValue)
}

/** Build a stable runtime key from op identifier + index. */
export function makeRuntimeKey(opKey: string | number | null | undefined, index: number | null | undefined) {
  const base = opKey != null ? String(opKey) : 'step'
  const suffix = Number.isFinite(index ?? undefined) ? Number(index) : 0
  return `${base}_${suffix}`
}

// ---------------------------------------------------------------------------
// Utilities from lineChartOperationFunctions.js
// ---------------------------------------------------------------------------

/** Defensive clone to avoid mutating the caller's array */
function cloneData(data: DatumValue[]): DatumValue[] {
  return Array.isArray(data) ? data.slice() : []
}

/** Slice by group label value if provided (string or truthy), otherwise passthrough */
function sliceByGroup(data: DatumValue[], group: string | null | undefined) {
  if (group === undefined || group === null || group === '') return data
  return data.filter((d) => d.group === group)
}

/**
 * Build a predicate for filtering by field.
 * For label/category fields: match by d.category === field.
 * For measure fields: match by d.measure === field  OR (field === 'value').
 * If field is omitted/unknown, passthrough.
 */
function predicateByField(field: string | undefined, kind: 'category' | 'measure' | undefined) {
  if (!field) return () => true
  if (kind === 'measure') {
    if (field === 'value') return () => true
    return (d: DatumValue) => d.measure === field
  }
  if (kind === 'category') {
    if (field === 'target') return () => true // default label alias
    return (d: DatumValue) => d.category === field
  }
  // Fallback: accept either
  return (d: DatumValue) => d.measure === field || d.category === field || field === 'value' || field === 'target'
}

/** Guess whether a field is category-like or measure-like from the data */
function inferFieldKind(data: DatumValue[], field: string | undefined): 'category' | 'measure' | undefined {
  if (!field) return undefined
  const hasMeasure = data.some((d) => d.measure === field || field === 'value')
  const hasCategory = data.some((d) => d.category === field || field === 'target')
  if (hasMeasure && !hasCategory) return 'measure'
  if (hasCategory && !hasMeasure) return 'category'
  // ambiguous: prefer undefined; caller may still constrain with predicateByField
  return undefined
}

/** Comparison helpers */
const cmpNumAsc = (a: number, b: number) => a - b
const cmpNumDesc = (a: number, b: number) => b - a
const cmpStrAsc = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
const cmpStrDesc = (a: string, b: string) => (a < b ? 1 : a > b ? -1 : 0)

/** Operator evaluation for filter/compareBool */
function evalOperator(operator: string | undefined, left: JsonValue, right: JsonValue): boolean {
  switch (operator) {
    case '>':
      return (left as number) > (right as number)
    case '>=':
      return (left as number) >= (right as number)
    case '<':
      return (left as number) < (right as number)
    case '<=':
      return (left as number) <= (right as number)
    case '==':
    case 'eq':
      return left === right
    case '!=':
      return left !== right
    case 'in':
      return Array.isArray(right) && right.includes(left as never)
    case 'not-in':
      return Array.isArray(right) && !right.includes(left as never)
    case 'contains':
      return typeof left === 'string' && (typeof right === 'string' || Array.isArray(right))
        ? Array.isArray(right)
          ? right.every((tok) => left.includes(String(tok)))
          : left.includes(String(right))
        : false
    default:
      throw new Error(`Unsupported operator: ${operator}`)
  }
}

/** Aggregation helpers */
function aggregate(values: JsonValue[], agg: string | undefined) {
  if (!Array.isArray(values) || values.length === 0) return NaN
  const numeric = values.map((value) => Number(value)).filter((value) => Number.isFinite(value))
  if (numeric.length === 0) return NaN
  switch (agg) {
    case 'sum':
      return numeric.reduce((s, v) => s + v, 0)
    case 'avg':
      return numeric.reduce((s, v) => s + v, 0) / numeric.length
    case 'min':
      return Math.min(...numeric)
    case 'max':
      return Math.max(...numeric)
    case undefined:
    default:
      return numeric.reduce((s, v) => s + v, 0)
  }
}

/** Normalize `targetA`/`targetB` form (string or {category, series}) */
function normalizeTargetInput(target: TargetSelector | TargetSelector[] | undefined, opGroup: string | null | undefined) {
  if (target && typeof target === 'object' && !Array.isArray(target)) {
    return { category: (target as { category?: TargetSelector }).category, series: (target as { series?: string }).series ?? opGroup ?? undefined }
  }
  return { category: target as TargetSelector, series: opGroup ?? undefined }
}

function parseComparableValue(raw: JsonValue | Date): number | string | null {
  if (raw instanceof Date) {
    const ts = +raw
    if (!Number.isNaN(ts)) return ts
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw
  }
  const str = String(raw ?? '').trim()
  if (str === '') return null
  const date = new Date(str)
  if (!Number.isNaN(+date)) return +date
  const num = Number(str)
  if (Number.isFinite(num)) return num
  return str
}

function compareComparableValues(a: number | string | null, b: number | string | null) {
  const aNull = a === null || a === undefined
  const bNull = b === null || b === undefined
  if (aNull && bNull) return 0
  if (aNull) return -1
  if (bNull) return 1
  if (typeof a === 'number' && typeof b === 'number') {
    if (a < b) return -1
    if (a > b) return 1
    return 0
  }
  const aStr = String(a)
  const bStr = String(b)
  if (aStr < bStr) return -1
  if (aStr > bStr) return 1
  return 0
}

/** Select slice for a (category, series) target within optional measure field constraint */
function sliceForTarget(data: DatumValue[], opField: string | undefined, targetIn: TargetSelector | TargetSelector[] | undefined, opGroup: string | null | undefined) {
  const { category, series } = normalizeTargetInput(targetIn, opGroup)
  let slice = data
  if (series !== undefined) slice = sliceByGroup(slice, series as string | null)
  // Constrain to requested measure if opField looks like measure
  const kind = inferFieldKind(data, opField)
  if (kind === 'measure') {
    slice = slice.filter((d) => (opField === 'value' ? true : d.measure === opField))
  }
  // Match category value (label)
  const byTarget = slice.filter((d) => d.target === String(category))
  if (byTarget.length > 0 || category == null) {
    return byTarget
  }

  const targetId = String(category)
  const targetIdNormalized = targetId.startsWith('ref:') ? targetId.slice('ref:'.length) : targetId
  const byId = slice.filter((d) => d && String(d.id) === targetId)
  if (byId.length > 0) {
    return byId
  }
  if (targetIdNormalized !== targetId) {
    const byNormalizedId = slice.filter((d) => d && String(d.id) === targetIdNormalized)
    if (byNormalizedId.length > 0) {
      return byNormalizedId
    }
  }

  const runtimeMatchesPrimary = getRuntimeResultsById(targetId)
  const runtimeMatchesFallback = targetIdNormalized !== targetId ? getRuntimeResultsById(targetIdNormalized) : []
  const runtimeMatches = runtimeMatchesPrimary.length > 0 ? runtimeMatchesPrimary : runtimeMatchesFallback
  if (runtimeMatches.length > 0) {
    let runtimeSlice = runtimeMatches
    if (series !== undefined) {
      runtimeSlice = runtimeSlice.filter((d) => String(d.group) === String(series))
    }
    const runtimeKind = kind ?? inferFieldKind(runtimeSlice, opField)
    if (runtimeKind === 'measure') {
      runtimeSlice = runtimeSlice.filter((d) => (opField === 'value' ? true : d.measure === opField))
    } else if (runtimeKind === 'category') {
      runtimeSlice = runtimeSlice.filter((d) => (opField === 'target' ? true : d.category === opField))
    }
    if (runtimeSlice.length > 0) {
      return runtimeSlice
    }
  }
  return byTarget
}

function selectorRefKey(target: TargetSelector | TargetSelector[] | undefined): string | null {
  if (target == null) return null
  if (Array.isArray(target)) {
    for (const entry of target) {
      const key = selectorRefKey(entry)
      if (key) return key
    }
    return null
  }
  if (typeof target === 'string' && target.startsWith('ref:n')) {
    return target.slice('ref:'.length)
  }
  if (typeof target === 'object') {
    const refId = (target as { id?: JsonValue }).id
    if (typeof refId === 'string' && refId.startsWith('n')) return refId
  }
  return null
}

export function resolveBinaryInputsFromMeta(inputs: unknown): {
  targetA?: TargetSelector | TargetSelector[]
  targetB?: TargetSelector | TargetSelector[]
} {
  if (!Array.isArray(inputs)) return {}
  const ids = inputs
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
  if (ids.length < 2) return {}
  const normalizeRef = (value: string) => (value.startsWith('ref:') ? value : `ref:${value}`)
  return {
    targetA: normalizeRef(ids[0]),
    targetB: normalizeRef(ids[1]),
  }
}

function resolveSelectorScalar(
  data: DatumValue[],
  opField: string | undefined,
  target: TargetSelector | TargetSelector[] | undefined,
  group: string | null | undefined,
  agg: string | undefined,
): number | null {
  if (target == null) return null
  if (typeof target === 'number' && Number.isFinite(target)) return target
  const numericText = typeof target === 'string' ? Number(target) : NaN
  if (Number.isFinite(numericText)) return numericText

  const refKey = selectorRefKey(target)
  if (refKey) {
    const runtime = getRuntimeResultsById(refKey)
    if (!runtime.length) return null
    const values = runtime.map((item) => Number(item.value)).filter(Number.isFinite)
    if (!values.length) return null
    return aggregate(values, agg)
  }

  const slice = sliceForTarget(data, opField, target, group)
  if (!slice.length) return null
  const values = slice.map((item) => Number(item.value)).filter(Number.isFinite)
  if (!values.length) return null
  return aggregate(values, agg)
}

function targetKeyForPairDiff(item: DatumValue, byField: string) {
  if (byField === 'target' || byField === item.category) return String(item.target)
  if (byField === 'id') return String(item.id ?? '')
  const runtimeLookupKey = item.lookupId ?? item.id ?? null
  if (runtimeLookupKey) {
    const runtimeRows = getRuntimeResultsById(runtimeLookupKey)
    if (runtimeRows.length > 0) {
      const key = runtimeRows[0]?.target
      if (key) return String(key)
    }
  }
  return String(item.target)
}

/** Factory for a single numeric DatumValue result */
function makeScalarDatum(
  measureName: string | null | undefined,
  group: string | null | undefined,
  categoryName: string | null | undefined,
  targetLabel: string | null | undefined,
  numericValue: number,
  name: string | null = null,
): DatumValue[] {
  return [
    {
      category: categoryName ?? 'result',
      measure: measureName ?? 'value',
      target: targetLabel ?? '__result__',
      group: group ?? null,
      value: roundNumeric(Number(numericValue)),
      name: name ?? targetLabel ?? '__result__',
    },
  ]
}

// ---------------------------------------------------------------------------
// Operations (ported from lineChartOperationFunctions.js)
// ---------------------------------------------------------------------------

/** 3.1 retrieveValue */
/** Op 3.1: select entries matching target/field/group. */
export function retrieveValue(data: DatumValue[], op: OperationSpec): DatumValue[] {
  const arr = cloneData(data)
  const spec = assertRetrieveValueSpec(op)
  const { field, target, group } = spec
  return sliceForTarget(arr, field, target, group ?? null)
}

/** 3.2 filter */
/** Op 3.2: filter by operator/value against category or measure field. */
export function filterData(data: DatumValue[], op: OperationSpec): DatumValue[] {
  const arr = cloneData(data)
  const spec = assertFilterSpec(op)
  const { field, operator, value, group, include, exclude } = spec
  const byGroup = sliceByGroup(arr, group ?? null)
  const includeSet = new Set((include ?? []).map(String))
  const excludeSet = new Set((exclude ?? []).map(String))
  const byTarget =
    includeSet.size || excludeSet.size
      ? byGroup.filter((d) => {
          const key = String(d.target)
          if (includeSet.size && !includeSet.has(key)) return false
          if (excludeSet.size && excludeSet.has(key)) return false
          return true
        })
      : byGroup

  // nlp_server shorthand: filter with array value and no operator.
  // Example: {"field":"Country","value":["South Korea","France"]}
  // Resolve against group/target labels using the denser match.
  if (!operator && Array.isArray(value) && value.length > 0) {
    const valueSet = new Set(value.map((entry) => String(entry)))
    const byGroupValue = byTarget.filter((d) => d.group != null && valueSet.has(String(d.group)))
    const byTargetValue = byTarget.filter((d) => valueSet.has(String(d.target)))
    if (byGroupValue.length === 0 && byTargetValue.length === 0) return []
    if (byGroupValue.length > byTargetValue.length) return byGroupValue
    if (byTargetValue.length > byGroupValue.length) return byTargetValue
    const hint = String(field ?? '').toLowerCase()
    if (hint.includes('series') || hint.includes('group') || hint.includes('country')) {
      return byGroupValue.length ? byGroupValue : byTargetValue
    }
    return byTargetValue.length ? byTargetValue : byGroupValue
  }

  if (!operator) {
    return byTarget
  }

  const kind = inferFieldKind(byTarget, field)
  const inField = byTarget.filter(predicateByField(field, kind))

  if (operator === 'between') {
    const [start, end] = Array.isArray(value) ? value : []
    if (start === undefined || end === undefined) {
      throw new Error('filter: "between" requires [start, end]')
    }
    // Apply to label (category) domain — inclusive
    return inField.filter((d) => {
      const t = d.target
      const ts = Date.parse(t)
      const s = Date.parse(String(start))
      const e = Date.parse(String(end))
      if (!Number.isNaN(ts) && !Number.isNaN(s) && !Number.isNaN(e)) {
        return ts >= s && ts <= e
      }
      // fallback to string compare
      return t >= String(start) && t <= String(end)
    })
  }

  // Numeric vs categorical dispatch
  if (kind === 'measure') {
    return inField.filter((d) => evalOperator(operator, d.value, value ?? d.value))
  }
  // category
  return inField.filter((d) => evalOperator(operator, d.target, value ?? d.target))
}

/** 3.3 compare — returns the winning datum (array of one) */
/** Op 3.3: compare two targets; return the winning datum. */
export function compareOp(data: DatumValue[], op: OperationSpec): DatumValue[] {
  const arr = cloneData(data)
  const spec = assertCompareSpec(op)
  const { field, groupA, groupB, aggregate: agg, which = 'max' } = spec
  const fallbackTargets = resolveBinaryInputsFromMeta(spec.meta?.inputs)
  const targetA = spec.targetA ?? fallbackTargets.targetA
  const targetB = spec.targetB ?? fallbackTargets.targetB
  if (targetA == null || targetB == null) {
    throw new Error('compare: targetA/targetB not found and meta.inputs fallback unavailable')
  }
  const gA = groupA ?? op.group
  const gB = groupB ?? op.group
  const sA = sliceForTarget(arr, field, targetA, gA ?? null)
  const sB = sliceForTarget(arr, field, targetB, gB ?? null)
  if (sA.length === 0 || sB.length === 0) {
    throw new Error('compare: targetA/targetB not found in data slice')
  }
  const vA = aggregate(sA.map((d) => d.value), agg as string | undefined)
  const vB = aggregate(sB.map((d) => d.value), agg as string | undefined)
  const pickA = which === 'max' ? vA >= vB : vA <= vB
  const chosen = pickA ? sA[sA.length - 1] : sB[sB.length - 1]
  return [chosen]
}

/** 3.4 compareBool — returns a scalar DatumValue[] (value: 1 or 0) */
/** Op 3.4: compare two targets; return a numeric boolean result. */
export function compareBoolOp(data: DatumValue[], op: OperationSpec): DatumValue[] {
  const arr = cloneData(data)
  const spec = assertCompareBoolSpec(op)
  const { field, groupA, groupB, operator } = spec
  const fallbackTargets = resolveBinaryInputsFromMeta(spec.meta?.inputs)
  const targetA = spec.targetA ?? fallbackTargets.targetA
  const targetB = spec.targetB ?? fallbackTargets.targetB
  if (targetA == null || targetB == null) {
    throw new Error('compareBool: targetA/targetB not found and meta.inputs fallback unavailable')
  }
  const gA = groupA ?? op.group
  const gB = groupB ?? op.group
  const sA = sliceForTarget(arr, field, targetA, gA ?? null)
  const sB = sliceForTarget(arr, field, targetB, gB ?? null)
  if (sA.length === 0 || sB.length === 0) {
    throw new Error('compareBool: targetA/targetB not found in data slice')
  }
  // If multiple per target, compare deterministic aggregate-last
  const vA = aggregate(sA.map((d) => d.value), undefined)
  const vB = aggregate(sB.map((d) => d.value), undefined)
  const boolResult = evalOperator(operator, vA, vB)
  const fieldLabel = field || 'value'
  const groupLabel = op.group ?? gA ?? gB ?? null
  const detail = [formatTargetLabel(targetA), formatTargetLabel(targetB)].filter(Boolean).join(' vs ')
  const name = formatResultName('CompareBool', fieldLabel, { group: groupLabel, detail })
  return makeScalarDatum(fieldLabel, groupLabel, 'bool', '__compareBool__', boolResult ? 1 : 0, name)
}

/** 3.5 findExtremum */
/** Op 3.5: find min/max datum within an optional group/field. */
export function findExtremum(data: DatumValue[], op: OperationSpec): DatumValue[] {
  const arr = cloneData(data)
  const spec = assertFindExtremumSpec(op)
  const { field, which, group } = spec
  const byGroup = sliceByGroup(arr, group ?? null)
  const kind = inferFieldKind(byGroup, field) || 'category'
  const section = byGroup.filter(predicateByField(field, kind))
  if (section.length === 0) return []
  const normalized = section
    .map((datum) => ({
      datum,
      value: kind === 'measure' ? datum.value : parseComparableValue(datum.target),
    }))
    .filter((entry) => entry.value !== null && entry.value !== undefined)
  if (normalized.length === 0) return []
  const sorted = normalized.slice().sort((a, b) => compareComparableValues(a.value, b.value))
  const pickMax = which !== 'min'
  const chosen = pickMax ? sorted[sorted.length - 1] : sorted[0]
  return [chosen.datum]
}

/** 3.6 sort */
/** Op 3.6: sort a slice while preserving non-matching rows. */
export function sortData(data: DatumValue[], op: OperationSpec): DatumValue[] {
  const arr = cloneData(data)
  const spec = assertSortSpec(op)
  const { field, order = 'asc', group } = spec
  const byGroup = sliceByGroup(arr, group ?? null)
  const kind = inferFieldKind(byGroup, field)
  const inField = byGroup.filter(predicateByField(field, kind))
  const others = byGroup.filter((d) => !inField.includes(d)) // sort only the slice; keep others after

  const sorted = inField.slice().sort((a, b) => {
    if (kind === 'measure') {
      return order === 'asc' ? cmpNumAsc(a.value, b.value) : cmpNumDesc(a.value, b.value)
    }
    // category lexical sort on target
    return order === 'asc' ? cmpStrAsc(a.target, b.target) : cmpStrDesc(a.target, b.target)
  })

  return sorted.concat(others)
}

/** 3.7 determineRange — returns {category: <field>, min, max} */
/** Op 3.7: determine range (min/max) for measure or category domain. */
export function determineRange(
  data: DatumValue[],
  op: OperationSpec,
): DatumValue[] {
  const arr = cloneData(data)
  const spec = assertDetermineRangeSpec(op)
  const { field, group } = spec
  const byGroup = sliceByGroup(arr, group ?? null)
  const kind = inferFieldKind(byGroup, field) || 'measure'
  const inField = byGroup.filter(predicateByField(field, kind))
  const fieldLabel = field || (kind === 'measure' ? 'value' : 'target')
  const groupLabel = group ?? null
  const nameMin = formatResultName('RangeMin', fieldLabel, { group: groupLabel })
  const nameMax = formatResultName('RangeMax', fieldLabel, { group: groupLabel })
  if (inField.length === 0) {
    return [
      ...makeScalarDatum(fieldLabel, groupLabel, 'range', '__min__', NaN, nameMin),
      ...makeScalarDatum(fieldLabel, groupLabel, 'range', '__max__', NaN, nameMax),
    ]
  }

  if (kind === 'measure') {
    const vals = inField.map((d) => d.value)
    const min = roundNumeric(Math.min(...vals))
    const max = roundNumeric(Math.max(...vals))
    return [
      ...makeScalarDatum(fieldLabel, groupLabel, 'range', '__min__', min, nameMin),
      ...makeScalarDatum(fieldLabel, groupLabel, 'range', '__max__', max, nameMax),
    ]
  }
  // category range: try date range, else lexicographic ordinal range as indices
  const targets = inField.map((d) => d.target)
  const parsed = targets.map((t) => Date.parse(t))
  if (parsed.every((ts) => !Number.isNaN(ts))) {
    const min = roundNumeric(Math.min(...parsed))
    const max = roundNumeric(Math.max(...parsed))
    return [
      ...makeScalarDatum(fieldLabel, groupLabel, 'range', '__min__', min, nameMin),
      ...makeScalarDatum(fieldLabel, groupLabel, 'range', '__max__', max, nameMax),
    ]
  }
  // ordinal index range
  const uniq = Array.from(new Set(targets)).sort(cmpStrAsc)
  const min = roundNumeric(0)
  const max = roundNumeric(Math.max(0, uniq.length - 1))
  return [
    ...makeScalarDatum(fieldLabel, groupLabel, 'range', '__min__', min, nameMin),
    ...makeScalarDatum(fieldLabel, groupLabel, 'range', '__max__', max, nameMax),
  ]
}

/** 3.8 count — returns a single numeric DatumValue */
/** Op 3.8: count rows; returns single DatumValue with the count. */
export function countData(data: DatumValue[], op: OperationSpec): DatumValue[] {
  const arr = cloneData(data)
  const spec = assertCountSpec(op)
  const { group } = spec
  const byGroup = sliceByGroup(arr, group ?? null)
  const fieldLabel = op?.field || 'target'
  const name = formatResultName('Count', fieldLabel, { group })
  return makeScalarDatum('value', group ?? null, 'count', '__count__', byGroup.length, name)
}

/** 3.9 sum — returns a single numeric DatumValue */
/** Op 3.9: sum numeric values; returns single DatumValue. */
export function sumData(data: DatumValue[], op: OperationSpec): DatumValue[] {
  const arr = cloneData(data)
  const spec = assertSumSpec(op)
  const { field, group } = spec
  const byGroup = sliceByGroup(arr, group ?? null).filter(predicateByField(field, 'measure'))
  const s = byGroup.reduce((acc, d) => acc + d.value, 0)
  const fieldLabel = field || 'value'
  const name = formatResultName('Sum', fieldLabel, { group })
  return makeScalarDatum(fieldLabel, group ?? null, fieldLabel, '__sum__', s, name)
}

/** 3.10 average — returns a single numeric DatumValue */
/** Op 3.10: average numeric values; returns single DatumValue. */
export function averageData(data: DatumValue[], op: OperationSpec): DatumValue[] {
  const arr = cloneData(data)
  const spec = assertAverageSpec(op)
  const { field, group } = spec
  const byGroup = sliceByGroup(arr, group ?? null).filter(predicateByField(field, 'measure'))
  const fieldLabel = field || 'value'
  const name = formatResultName('Average', fieldLabel, { group })
  if (byGroup.length === 0) return makeScalarDatum(fieldLabel, group ?? null, fieldLabel, '__avg__', NaN, name)
  const avg = byGroup.reduce((acc, d) => acc + d.value, 0) / byGroup.length
  return makeScalarDatum(fieldLabel, group ?? null, fieldLabel, '__avg__', avg, name)
}

/** 3.11 diff — returns a single numeric DatumValue (signed if op.signed) */
/** Op 3.11: difference/ratio/percent-of-total between targets. */
export function diffData(data: DatumValue[], op: OperationSpec = {}): DatumValue[] {
  const arr = cloneData(data)
  const spec = assertDiffSpec(op)
  const {
    field,
    groupA,
    groupB,
    aggregate: agg,
    signed = true,
  } = spec
  const fallbackTargets = resolveBinaryInputsFromMeta(spec.meta?.inputs)
  const targetA = spec.targetA ?? fallbackTargets.targetA
  const targetB = spec.targetB ?? fallbackTargets.targetB
  if (targetA == null || targetB == null) {
    throw new Error('diff: targetA/targetB not found and meta.inputs fallback unavailable')
  }
  const gA = groupA ?? op.group ?? null
  const gB = groupB ?? op.group ?? null

  const collectSlice = (targets: TargetSelector | TargetSelector[] | undefined, groupLabel: string | null) => {
    const list = Array.isArray(targets) ? targets : [targets]
    const collected: DatumValue[] = []
    list.forEach((entry) => {
      const slice = sliceForTarget(arr, field, entry, groupLabel)
      if (Array.isArray(slice) && slice.length > 0) {
        collected.push(...slice)
      }
    })
    return collected
  }

  const sA = collectSlice(targetA, gA)
  const sB = collectSlice(targetB, gB)
  if (!sA.length || !sB.length) {
    throw new Error('diff: targetA/targetB not found in data slice')
  }

  const toNumericValues = (items: DatumValue[]) =>
    items
      .map((datum) => Number(datum?.value))
      .filter((value) => Number.isFinite(value))
  const valuesA = toNumericValues(sA)
  const valuesB = toNumericValues(sB)
  if (!valuesA.length || !valuesB.length) {
    throw new Error('diff: numeric values missing for targetA/targetB')
  }

  const aggregateKey = typeof agg === 'string' ? agg.toLowerCase() : agg
  const sumValues = (values: number[]) => values.reduce((total, value) => total + value, 0)
  const aggregateValues = (values: number[]) => aggregate(values, aggregateKey as string | undefined)

  const aVal = aggregateValues(valuesA)
  const bVal = aggregateValues(valuesB)
  if (!Number.isFinite(aVal) || !Number.isFinite(bVal)) {
    throw new Error('diff: unable to aggregate targetA/targetB values')
  }

  const aggregateMode = typeof aggregateKey === 'string' ? aggregateKey : null
  const isPercentOfTotal = aggregateMode === 'percentage_of_total' || aggregateMode === 'percent_of_total'
  const mode = String(op?.mode ?? 'difference').toLowerCase()

  let resultValue: number
  let targetLabel = op?.targetName ?? '__diff__'

  if (isPercentOfTotal) {
    const numerator = sumValues(valuesA)
    const denominator = sumValues(valuesB)
    if (denominator === 0) {
      console.warn('diff (percentage_of_total): denominator is zero', { op })
      return []
    }
    resultValue = (numerator / denominator) * 100
    targetLabel = op?.targetName ?? 'PercentOfTotal'
  } else if (mode === 'ratio') {
    const numerator = sumValues(valuesA)
    const denominator = sumValues(valuesB)
    if (denominator === 0) {
      console.warn('diff (ratio): denominator is zero', { op })
      return []
    }
    const defaultScale = op?.percent ? 100 : 1
    const scale = Number.isFinite(op?.scale) ? Number(op.scale) : defaultScale
    resultValue = (numerator / denominator) * (Number.isFinite(scale) ? scale : 1)
    targetLabel = op?.targetName ?? (op?.percent ? 'PercentOfTotal' : 'Ratio')
  } else {
    const diffValue = (aVal as number) - (bVal as number)
    resultValue = signed ? diffValue : Math.abs(diffValue)
    targetLabel = op?.targetName ?? '__diff__'
  }

  const precision = Number.isFinite(Number(op?.precision)) ? Math.max(0, Number(op.precision)) : null
  if (precision !== null) {
    resultValue = Number(resultValue.toFixed(precision))
  }

  const fieldLabel = field || sA[0]?.measure || sB[0]?.measure || 'value'
  const groupLabel = op.group ?? gA ?? gB ?? null
  const detail = [formatTargetLabel(targetA), formatTargetLabel(targetB)].filter(Boolean).join(' vs ')
  const name = formatResultName('Diff', fieldLabel, { group: groupLabel, detail })

  return makeScalarDatum(fieldLabel, groupLabel, fieldLabel, targetLabel, resultValue, name)
}

/** 3.11b lagDiff — adjacent differences across an ordered sequence */
/** Op 3.11b: adjacent differences across an ordered sequence. */
export function lagDiffData(data: DatumValue[], op: OperationSpec): DatumValue[] {
  const arr = cloneData(data)
  const spec = assertLagDiffSpec(op)
  const { field, orderField, order = 'asc', group, absolute = false } = spec
  const byGroup = sliceByGroup(arr, group ?? null)
  if (byGroup.length < 2) return []

  const measureName = field || byGroup[0]?.measure || 'value'
  const categoryName = orderField || byGroup[0]?.category || 'target'

  const decorated = byGroup.map((datum) => {
    const datumRec = datum as unknown as Record<string, JsonValue>
    const orderValue = parseComparableValue(orderField ? datumRec?.[orderField] ?? datum.target : datum.target)
    return { datum, orderValue }
  })

  const direction = order === 'desc' ? -1 : 1
  decorated.sort((a, b) => direction * compareComparableValues(a.orderValue, b.orderValue))

  const diffs: DatumValue[] = []
  for (let i = 1; i < decorated.length; i++) {
    const curr = decorated[i].datum
    const prev = decorated[i - 1].datum
    if (!curr || !prev) continue
    const diffValue = absolute ? Math.abs(Number(curr.value) - Number(prev.value)) : Number(curr.value) - Number(prev.value)
    if (!Number.isFinite(diffValue)) continue

    const resultDatum: DatumValue = {
      category: categoryName,
      measure: measureName,
      target: curr.target,
      group: curr.group ?? null,
      value: roundNumeric(diffValue),
      id: curr.id ? `${curr.id}_lagdiff` : undefined,
      prevTarget: prev.target,
    }
    const labelPrev = formatTargetLabel(prev.target)
    const labelCurr = formatTargetLabel(curr.target)
    if (labelPrev || labelCurr) {
      resultDatum.name = labelPrev && labelCurr ? `${labelPrev} → ${labelCurr}` : labelCurr || labelPrev || undefined
    }
    diffs.push(resultDatum)
  }
  return diffs
}

/** 3.11c pairDiff — key-wise differences between two groups. */
export function pairDiffData(data: DatumValue[], op: OperationSpec): DatumValue[] {
  const arr = cloneData(data)
  const spec = assertPairDiffSpec(op)
  const {
    by,
    field,
    groupA,
    groupB,
    signed = true,
    absolute = false,
    precision,
    group,
  } = spec
  const scoped = sliceByGroup(arr, group ?? null)
  const keyA = String(groupA)
  const keyB = String(groupB)
  const seriesField = spec.seriesField

  const belongsToSeries = (item: DatumValue, series: string) => {
    if (seriesField && seriesField !== (item.category ?? '')) {
      return String(item.group ?? item.series ?? '') === series
    }
    return String(item.group ?? item.series ?? '') === series
  }

  const left = scoped.filter((item) => belongsToSeries(item, keyA))
  const right = scoped.filter((item) => belongsToSeries(item, keyB))
  if (!left.length || !right.length) return []

  const measureName = field ?? left[0]?.measure ?? right[0]?.measure ?? 'value'
  const buildMap = (items: DatumValue[]) => {
    const out = new Map<string, number[]>()
    items.forEach((item) => {
      if (measureName !== 'value' && item.measure != null && item.measure !== measureName) return
      const key = targetKeyForPairDiff(item, by)
      if (!key) return
      const value = Number(item.value)
      if (!Number.isFinite(value)) return
      const bucket = out.get(key) ?? []
      bucket.push(value)
      out.set(key, bucket)
    })
    return out
  }

  const mapA = buildMap(left)
  const mapB = buildMap(right)
  const keys = Array.from(mapA.keys()).filter((key) => mapB.has(key)).sort(cmpStrAsc)
  const resultGroup = `${keyA}-${keyB}`
  const out: DatumValue[] = []
  keys.forEach((key) => {
    const aVals = mapA.get(key) ?? []
    const bVals = mapB.get(key) ?? []
    if (!aVals.length || !bVals.length) return
    const aVal = aggregate(aVals, spec.aggregate as string | undefined)
    const bVal = aggregate(bVals, spec.aggregate as string | undefined)
    if (!Number.isFinite(aVal) || !Number.isFinite(bVal)) return
    let delta = signed ? aVal - bVal : Math.abs(aVal - bVal)
    if (absolute) delta = Math.abs(delta)
    if (Number.isFinite(Number(precision))) {
      delta = Number(delta.toFixed(Math.max(0, Number(precision))))
    }
    out.push({
      category: by,
      measure: measureName,
      target: key,
      group: resultGroup,
      value: roundNumeric(delta),
      name: '__pairDiff__',
    })
  })
  return out
}

/** 3.13 add — scalar addition. */
export function addData(data: DatumValue[], op: OperationSpec): DatumValue[] {
  const arr = cloneData(data)
  const spec = assertAddSpec(op)
  const group = spec.group ?? null
  const fallbackTargets = resolveBinaryInputsFromMeta(spec.meta?.inputs)
  const targetA = spec.targetA ?? fallbackTargets.targetA
  const targetB = spec.targetB ?? fallbackTargets.targetB
  if (targetA == null || targetB == null) return []
  const left = resolveSelectorScalar(arr, spec.field, targetA, group, spec.aggregate as string | undefined)
  const right = resolveSelectorScalar(arr, spec.field, targetB, group, spec.aggregate as string | undefined)
  if (!Number.isFinite(left) || !Number.isFinite(right)) return []
  return makeScalarDatum(
    spec.field ?? 'value',
    group,
    'result',
    spec.targetName ?? '__add__',
    Number(left) + Number(right),
    formatResultName('Add', spec.field ?? 'value', {
      group,
      detail: `${formatTargetLabel(targetA)} + ${formatTargetLabel(targetB)}`,
    }),
  )
}

/** 3.14 scale — scalar multiply. */
export function scaleData(data: DatumValue[], op: OperationSpec): DatumValue[] {
  const arr = cloneData(data)
  const spec = assertScaleSpec(op)
  const group = spec.group ?? null
  const base = resolveSelectorScalar(arr, spec.field, spec.target, group, spec.aggregate as string | undefined)
  const factor = Number(spec.factor)
  if (!Number.isFinite(base) || !Number.isFinite(factor)) return []
  return makeScalarDatum(
    spec.field ?? 'value',
    group,
    'result',
    spec.targetName ?? '__scale__',
    Number(base) * factor,
    formatResultName('Scale', spec.field ?? 'value', {
      group,
      detail: `${formatTargetLabel(spec.target)} × ${factor}`,
    }),
  )
}

/** 3.15 setOp — set union/intersection over runtime node inputs. */
export function setOpData(_data: DatumValue[], op: OperationSpec): DatumValue[] {
  const spec = assertSetOpSpec(op)
  const inputs = Array.isArray(op.meta?.inputs) ? op.meta!.inputs!.filter((id) => typeof id === 'string') : []
  if (inputs.length < 2) return []

  const collections = inputs.map((id) => getRuntimeResultsById(id)).filter((rows) => rows.length > 0)
  if (collections.length < 2) return []
  const filteredCollections = spec.group
    ? collections.map((rows) => rows.filter((row) => String(row.group ?? '') === String(spec.group)))
    : collections
  if (filteredCollections.some((rows) => rows.length === 0)) return []

  const targetSets = filteredCollections.map((rows) => new Set(rows.map((row) => String(row.target))))
  const merged = spec.fn === 'intersection'
    ? Array.from(targetSets.slice(1).reduce((acc, next) => {
      return new Set(Array.from(acc).filter((item) => next.has(item)))
    }, new Set(targetSets[0])))
    : Array.from(targetSets.reduce((acc, next) => {
      next.forEach((item) => acc.add(item))
      return acc
    }, new Set<string>()))

  const representative = new Map<string, DatumValue>()
  filteredCollections.forEach((rows) => {
    rows.forEach((row) => {
      const key = String(row.target)
      if (!representative.has(key)) representative.set(key, row)
    })
  })

  return merged
    .sort(cmpStrAsc)
    .map((target) => {
      const base = representative.get(target)
      return {
        category: base?.category ?? 'target',
        measure: base?.measure ?? 'value',
        target,
        group: spec.group ?? base?.group ?? null,
        value: 1,
        name: target,
      } as DatumValue
    })
}

/** 3.12 nth — returns the n-th item in current ordering (1-based) */
/** Op 3.12: return the n-th datum (1-based) from left/right. */
export function nthData(data: DatumValue[], op: OperationSpec): DatumValue[] {
  const arr = cloneData(data)
  const spec = assertNthSpec(op)
  const { n, from = 'left', group } = spec
  const byGroup = sliceByGroup(arr, group ?? null)
  if (byGroup.length === 0) return []
  const queryIndices = Array.isArray(n) ? n : [n]

  const normalized = queryIndices
    .map((value) => {
      const num = Number(value)
      if (!Number.isFinite(num) || num < 1) return null
      return Math.floor(num)
    })
    .filter((value): value is number => value !== null)

  if (normalized.length === 0) return []

  const baseSequence = from === 'right' ? [...byGroup].reverse() : byGroup.slice()

  const results: DatumValue[] = []
  normalized.forEach((rank) => {
    const idx = rank - 1
    if (idx >= 0 && idx < baseSequence.length) {
      results.push(baseSequence[idx])
    }
  })

  return results
}

// ---------------------------------------------------------------------------
// Central dispatcher (optional)
// ---------------------------------------------------------------------------
export const LineChartOps = {
  retrieveValue,
  filter: filterData,
  compare: compareOp,
  compareBool: compareBoolOp,
  findExtremum,
  sort: sortData,
  determineRange,
  count: countData,
  sum: sumData,
  average: averageData,
  diff: diffData,
  lagDiff: lagDiffData,
  pairDiff: pairDiffData,
  nth: nthData,
  add: addData,
  scale: scaleData,
  setOp: setOpData,
}

export default LineChartOps

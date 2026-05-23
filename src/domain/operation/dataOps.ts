import { OperationOp, type DatumValue, type JsonPrimitive, type JsonValue, type OperationSpec, type TargetSelector } from './types'
import type {
  OpAddSpec,
  OpCompareBoolSpec,
  OpCountSpec,
  OpDiffByValueSpec,
  OpDiffSpec,
  OpFilterSpec,
  OpFindExtremumSpec,
  OpLagDiffSpec,
  OpNthSpec,
  OpPairDiffSpec,
  OpRetrieveValueSpec,
  OpScaleSpec,
  OpSortSpec,
  OpSumSpec,
  OpAverageSpec,
} from './types/operationSpecs'
import {
  assertAddSpec,
  assertAverageSpec,
  assertCompareBoolSpec,
  assertCountSpec,
  assertDiffByValueSpec,
  assertDiffSpec,
  assertFilterSpec,
  assertFindExtremumSpec,
  assertLagDiffSpec,
  assertNthSpec,
  assertPairDiffSpec,
  assertRetrieveValueSpec,
  assertScaleSpec,
  assertSortSpec,
  assertSumSpec,
} from './types/operationValidators'
import {
  buildAggregateLabel,
  buildBinaryLabel,
  buildOrdinalLabel,
  buildSemanticMeasure,
  buildScaledLabel,
  buildValuesLabelFromRows,
  compactSemanticList,
} from './semanticLabels'
import { normalizeGroupSelection } from './groupSelection'

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

function isSyntheticResultTarget(value: string) {
  return value.startsWith('__')
}

function runtimeLabelForRef(refId: string): string | null {
  const runtimeRows = getRuntimeResultsById(refId)
  if (!runtimeRows.length) return null

  const explicitNames = Array.from(
    new Set(
      runtimeRows
        .map((row) => (typeof row.name === 'string' ? row.name.trim() : ''))
        .filter((value) => value.length > 0),
    ),
  )
  if (explicitNames.length > 0) {
    return explicitNames.length === 1 ? explicitNames[0] : compactSemanticList(explicitNames)
  }

  const rowLabel = buildValuesLabelFromRows(runtimeRows)
  if (rowLabel) {
    return rowLabel
  }

  return null
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
  if (typeof selector === 'number') return String(selector)
  if (typeof selector === 'string') {
    if (selector.startsWith('ref:')) {
      return runtimeLabelForRef(selector.slice('ref:'.length).trim()) ?? 'the previous result'
    }
    return String(selector)
  }
  if (typeof selector === 'object') {
    if (typeof (selector as { id?: JsonValue }).id === 'string') {
      const id = String((selector as { id?: JsonValue }).id).trim()
      if (/^n\d+$/i.test(id)) {
        const resolved = runtimeLabelForRef(id)
        if (resolved) return resolved
      }
    }
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

function semanticSubjectFromRows(rows: DatumValue[], fallbackField: string) {
  const valuesLabel = buildValuesLabelFromRows(rows)
  return valuesLabel ?? formatFieldLabel(fallbackField)
}

function semanticLabelFromCompareTargets(targetA: TargetSelector | TargetSelector[] | undefined, targetB: TargetSelector | TargetSelector[] | undefined) {
  return {
    left: formatTargetLabel(targetA) || 'the previous result',
    right: formatTargetLabel(targetB) || 'the previous result',
  }
}

function scalarGroupLabel(group: OperationSpec['group'] | string | null | undefined): string | null {
  if (Array.isArray(group)) return group.length > 0 ? String(group[0]) : null
  return group == null ? null : String(group)
}

// ---------------------------------------------------------------------------
// Runtime result store (in-memory; pure JS, no DOM)
// ---------------------------------------------------------------------------

const runtimeResults = new Map<string, DatumValue[]>()

function cloneDatumValue(datum: DatumValue): DatumValue {
  return {
    category: datum.category,
    measure: datum.measure,
    semanticMeasure: datum.semanticMeasure ?? null,
    target: datum.target,
    displayTarget: datum.displayTarget ?? null,
    group: datum.group ?? null,
    panel: datum.panel ?? null,
    panelField: datum.panelField ?? null,
    value: datum.value,
    id: datum.id ?? null,
    lookupId: datum.lookupId ?? datum.id ?? null,
    name: datum.name ?? null,
    prevTarget: datum.prevTarget,
    series: datum.series ?? null,
  }
}

function inheritSemanticMeasure(datum: DatumValue): DatumValue {
  return {
    ...datum,
    semanticMeasure: datum.semanticMeasure ?? datum.measure ?? null,
  }
}

function inheritSemanticMeasureList(rows: DatumValue[]): DatumValue[] {
  return rows.map(inheritSemanticMeasure)
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

export function snapshotRuntimeResults(): Map<string, DatumValue[]> {
  const snapshot = new Map<string, DatumValue[]>()
  runtimeResults.forEach((rows, key) => {
    snapshot.set(key, rows.map(cloneDatumValue))
  })
  return snapshot
}

export function restoreRuntimeResults(snapshot: Map<string, DatumValue[]>) {
  runtimeResults.clear()
  snapshot.forEach((rows, key) => {
    runtimeResults.set(
      key,
      rows.map(cloneDatumValue).filter((datum) => Number.isFinite(datum.value)),
    )
  })
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

/** Slice by one or more group labels if provided, otherwise passthrough. */
function sliceByGroup(data: DatumValue[], group: unknown) {
  const selection = normalizeGroupSelection(group)
  if (selection.kind === 'none') return data
  const allowed = new Set(selection.values.map(String))
  return data.filter((datum) => datum.group != null && allowed.has(String(datum.group)))
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

export function refKeyFromScalarValue(value: JsonValue | undefined): string | null {
  if (typeof value !== 'string' || !value.startsWith('ref:')) return null
  const refKey = value.slice('ref:'.length).trim()
  return refKey.length > 0 ? refKey : null
}

export function resolveScalarAggregateFromRows(
  rows: DatumValue[] | null | undefined,
  aggregateHint?: string,
): number | null {
  const numeric = (rows ?? []).map((item) => Number(item?.value)).filter(Number.isFinite)
  if (!numeric.length) return null
  const resolved = aggregate(numeric, aggregateHint)
  return Number.isFinite(resolved) ? Number(resolved) : null
}

export function resolveFilterRefThresholdFromResults(
  value: JsonValue | undefined,
  resultsByNodeId: ReadonlyMap<string, DatumValue[]>,
  aggregateHint?: string,
): number | null {
  const refKey = refKeyFromScalarValue(value)
  if (!refKey) return null
  return resolveScalarAggregateFromRows(resultsByNodeId.get(refKey), aggregateHint)
}

/** Normalize `targetA`/`targetB` form (string or {category, series}) */
function normalizeTargetInput(target: TargetSelector | TargetSelector[] | undefined, opGroup: string | null | undefined) {
  if (target && typeof target === 'object' && !Array.isArray(target)) {
    return {
      id: (target as { id?: string | number }).id,
      category:
        (target as { category?: TargetSelector; target?: TargetSelector }).category ??
        (target as { target?: TargetSelector }).target,
      series: (target as { series?: string }).series ?? opGroup ?? undefined,
    }
  }
  return { id: undefined, category: target as TargetSelector, series: opGroup ?? undefined }
}

function datumIdentityKey(datum: DatumValue) {
  const id = datum.id != null ? String(datum.id) : ''
  const lookupId = datum.lookupId != null ? String(datum.lookupId) : ''
  const target = String(datum.target ?? '')
  const group = datum.group != null ? String(datum.group) : ''
  const measure = datum.measure != null ? String(datum.measure) : ''
  return [id, lookupId, target, group, measure].join('::')
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
  if (Array.isArray(targetIn)) {
    const seen = new Set<string>()
    const merged: DatumValue[] = []
    targetIn.forEach((entry) => {
      const slice = sliceForTarget(data, opField, entry, opGroup)
      slice.forEach((datum) => {
        const key = datumIdentityKey(datum)
        if (seen.has(key)) return
        seen.add(key)
        merged.push(datum)
      })
    })
    return merged
  }

  const { id, category, series } = normalizeTargetInput(targetIn, opGroup)
  let slice = data
  if (series !== undefined) slice = sliceByGroup(slice, series as string | null)
  // Constrain to requested measure if opField looks like measure
  const kind = inferFieldKind(data, opField)
  if (kind === 'measure') {
    slice = slice.filter((d) => (opField === 'value' ? true : d.measure === opField))
  }

  if (id != null) {
    const targetId = String(id)
    const normalizedId = targetId.startsWith('ref:') ? targetId.slice('ref:'.length) : targetId
    const byId = slice.filter((d) => d && (String(d.id) === targetId || String(d.lookupId) === targetId))
    if (byId.length > 0) {
      return byId
    }
    if (normalizedId !== targetId) {
      const byNormalizedId = slice.filter((d) => d && (String(d.id) === normalizedId || String(d.lookupId) === normalizedId))
      if (byNormalizedId.length > 0) {
        return byNormalizedId
      }
    }
    const runtimeMatchesPrimary = getRuntimeResultsById(targetId)
    const runtimeMatchesFallback = normalizedId !== targetId ? getRuntimeResultsById(normalizedId) : []
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

export function resolveFilterRefThreshold(
  value: JsonValue | undefined,
  aggregateHint?: string,
): number | null {
  const refKey = refKeyFromScalarValue(value)
  if (!refKey) return null
  return resolveScalarAggregateFromRows(getRuntimeResultsById(refKey), aggregateHint)
}

function targetKeyForPairDiff(item: DatumValue, byField: string) {
  const normalized = String(byField ?? '').trim()
  if (!normalized) return null
  if (normalized === 'target' || normalized === 'category') return String(item.target)
  if (item.category != null && normalized === String(item.category)) return String(item.target)
  if (normalized === 'id') {
    const id = item.id ?? item.lookupId ?? null
    return id != null ? String(id) : null
  }
  if (normalized === 'displayTarget') {
    const displayTarget = item.displayTarget ?? item.target ?? null
    return displayTarget != null ? String(displayTarget) : null
  }
  if (normalized === 'name') {
    const name = item.name ?? item.displayTarget ?? item.target ?? null
    return name != null ? String(name) : null
  }
  return null
}

function keyFieldForPairDiff(item: DatumValue, keyField: string) {
  const normalized = String(keyField ?? '').trim()
  if (!normalized) return null
  if ((item.panelField ?? '').trim() === normalized) {
    return item.panel != null ? String(item.panel) : null
  }
  if (item.category != null && normalized === String(item.category)) return String(item.target)
  if (normalized === 'panel') return item.panel != null ? String(item.panel) : null
  return null
}

/** Factory for a single numeric DatumValue result */
function makeScalarDatum(
  measureName: string | null | undefined,
  group: string | null | undefined,
  categoryName: string | null | undefined,
  targetLabel: string | null | undefined,
  numericValue: number,
  name: string | null = null,
  semanticMeasure: string | null = null,
): DatumValue[] {
  return [
    {
      category: categoryName ?? 'result',
      measure: measureName ?? 'value',
      semanticMeasure: semanticMeasure ?? measureName ?? 'value',
      target: targetLabel ?? '__result__',
      displayTarget: name ?? targetLabel ?? '__result__',
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
/** Op 3.1: select entries matching target/field/group.
 *
 * Forward (default, `targetAxis === 'x'`): `target` is an x-axis category label;
 *   returns matching DatumValue rows.
 * Reverse (`targetAxis === 'y'`): `target` is a numeric y value; returns rows
 *   whose `value` equals `target` (constrained to `field` if supplied; constrained
 *   to `group` if supplied — same semantics as the forward case).
 *   Multiple matches (same y at different x) all flow through.
 */
export function retrieveValue(data: DatumValue[], op: OperationSpec): DatumValue[] {
  const arr = cloneData(data)
  const spec = assertRetrieveValueSpec(op)
  const { field, target, group, targetAxis } = spec
  if (targetAxis === 'y') {
    return inheritSemanticMeasureList(sliceByMeasureValue(arr, field, target, scalarGroupLabel(group)))
  }
  return inheritSemanticMeasureList(sliceForTarget(arr, field, target, scalarGroupLabel(group)))
}

/** Reverse-lookup helper for retrieveValue: find rows whose `value` equals `targetIn`.
 *  Mirrors `sliceForTarget`'s array-target union semantics. */
function sliceByMeasureValue(
  data: DatumValue[],
  opField: string | undefined,
  targetIn: TargetSelector | TargetSelector[] | undefined,
  opGroup: string | null | undefined,
): DatumValue[] {
  if (Array.isArray(targetIn)) {
    const seen = new Set<string>()
    const merged: DatumValue[] = []
    targetIn.forEach((entry) => {
      const slice = sliceByMeasureValue(data, opField, entry, opGroup)
      slice.forEach((datum) => {
        const key = datumIdentityKey(datum)
        if (seen.has(key)) return
        seen.add(key)
        merged.push(datum)
      })
    })
    return merged
  }
  if (targetIn == null) return []
  const numericTarget = Number(targetIn)
  if (!Number.isFinite(numericTarget)) return []
  let slice = data
  if (opGroup !== undefined) slice = sliceByGroup(slice, opGroup as string | null)
  const kind = inferFieldKind(data, opField)
  if (kind === 'measure') {
    slice = slice.filter((d) => (opField === 'value' ? true : d.measure === opField))
  }
  return slice.filter((d) => Number.isFinite(Number(d.value)) && Number(d.value) === numericTarget)
}

/** 3.2 filter */
/** Op 3.2: filter by operator/value against category or measure field. */
export function filterData(data: DatumValue[], op: OperationSpec): DatumValue[] {
  const arr = cloneData(data)
  const spec = assertFilterSpec(op)
  const { field, operator, value, group, include, exclude } = spec
  let resolvedValue: JsonValue | undefined = value
  if (typeof value === 'string' && value.startsWith('ref:')) {
    const resolved = resolveFilterRefThreshold(
      value,
      typeof spec.aggregate === 'string' ? spec.aggregate : undefined,
    )
    if (!Number.isFinite(resolved ?? NaN)) {
      throw new Error(`filter: unresolved ref value "${value}"`)
    }
    resolvedValue = resolved
  }
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
    if (byGroupValue.length > byTargetValue.length) return inheritSemanticMeasureList(byGroupValue)
    if (byTargetValue.length > byGroupValue.length) return inheritSemanticMeasureList(byTargetValue)
    const hint = String(field ?? '').toLowerCase()
    if (hint.includes('series') || hint.includes('group') || hint.includes('country')) {
      return inheritSemanticMeasureList(byGroupValue.length ? byGroupValue : byTargetValue)
    }
    return inheritSemanticMeasureList(byTargetValue.length ? byTargetValue : byGroupValue)
  }

  if (!operator) {
    return inheritSemanticMeasureList(byTarget)
  }

  const kind = inferFieldKind(byTarget, field)
  const inField = byTarget.filter(predicateByField(field, kind))

  if (operator === 'between') {
    const [start, end] = Array.isArray(resolvedValue) ? resolvedValue : []
    if (start === undefined || end === undefined) {
      throw new Error('filter: "between" requires [start, end]')
    }
    if (kind === 'measure') {
      const lo = Number(start)
      const hi = Number(end)
      if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
        throw new Error('filter: "between" requires numeric bounds for measure fields')
      }
      const min = Math.min(lo, hi)
      const max = Math.max(lo, hi)
      return inheritSemanticMeasureList(inField.filter((d) => Number.isFinite(Number(d.value)) && Number(d.value) >= min && Number(d.value) <= max))
    }
    return inheritSemanticMeasureList(inField.filter((d) => {
      const t = d.target
      const ts = Date.parse(t)
      const s = Date.parse(String(start))
      const e = Date.parse(String(end))
      if (!Number.isNaN(ts) && !Number.isNaN(s) && !Number.isNaN(e)) {
        const min = Math.min(s, e)
        const max = Math.max(s, e)
        return ts >= min && ts <= max
      }
      const lo = String(start)
      const hi = String(end)
      const min = lo <= hi ? lo : hi
      const max = lo <= hi ? hi : lo
      return t >= min && t <= max
    }))
  }

  // Numeric vs categorical dispatch
  if (kind === 'measure') {
    return inheritSemanticMeasureList(inField.filter((d) => evalOperator(operator, d.value, resolvedValue ?? d.value)))
  }
  // category
  return inheritSemanticMeasureList(inField.filter((d) => evalOperator(operator, d.target, resolvedValue ?? d.target)))
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
  const gA = scalarGroupLabel(groupA ?? op.group)
  const gB = scalarGroupLabel(groupB ?? op.group)
  const sA = sliceForTarget(arr, field, targetA, gA)
  const sB = sliceForTarget(arr, field, targetB, gB)
  if (sA.length === 0 || sB.length === 0) {
    throw new Error('compareBool: targetA/targetB not found in data slice')
  }
  // If multiple per target, compare deterministic aggregate-last
  const vA = aggregate(sA.map((d) => d.value), undefined)
  const vB = aggregate(sB.map((d) => d.value), undefined)
  const boolResult = evalOperator(operator, vA, vB)
  const fieldLabel = field || 'value'
  const groupLabel = scalarGroupLabel(op.group) ?? gA ?? gB ?? null
  const { left, right } = semanticLabelFromCompareTargets(targetA, targetB)
  const name = buildBinaryLabel('comparison', left, right)
  return makeScalarDatum(fieldLabel, groupLabel, 'bool', '__compareBool__', boolResult ? 1 : 0, name, buildSemanticMeasure(OperationOp.CompareBool, fieldLabel))
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
  const label = buildAggregateLabel(
    pickMax ? 'maximum' : 'minimum',
    semanticSubjectFromRows(section, field || 'value'),
  )
  return [
    {
      ...chosen.datum,
      semanticMeasure: chosen.datum.semanticMeasure ?? chosen.datum.measure ?? null,
      name: label,
      displayTarget: label,
    },
  ]
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

  return inheritSemanticMeasureList(sorted.concat(others))
}

/** 3.7 diffByValue — returns each datum's delta vs a single reference scalar */
/** Op 3.7: compare every datum to a single scalar reference value. */
export function diffByValueOp(data: DatumValue[], op: OperationSpec): DatumValue[] {
  const arr = cloneData(data)
  const spec = assertDiffByValueSpec(op)
  const { field, group, signed = true } = spec
  const reference = resolveDiffByValueReference(spec)
  if (reference == null) {
    throw new Error('diffByValue: reference value could not be resolved')
  }
  const byGroup = sliceByGroup(arr, group ?? null)
  const inField = field
    ? byGroup.filter(predicateByField(field, inferFieldKind(byGroup, field) || 'measure'))
    : byGroup
  return inField.map((d) => {
    const numeric = Number(d.value)
    const delta = signed ? numeric - reference : Math.abs(numeric - reference)
    return {
      ...d,
      semanticMeasure: buildSemanticMeasure(OperationOp.DiffByValue, field ?? d.measure ?? null),
      value: roundNumeric(delta),
      name: `Δ vs ${roundNumeric(reference)}`,
    }
  })
}

function resolveDiffByValueReference(spec: OpDiffByValueSpec): number | null {
  if (typeof spec.value === 'number' && Number.isFinite(spec.value)) return spec.value
  // scalar 기준값은 targetValue: "ref:nX" 로만 선언한다. meta.inputs fallback 없음.
  const refSource = spec.targetValue
  if (typeof refSource !== 'string') return null
  const refKey = refSource.startsWith('ref:') ? refSource.slice('ref:'.length) : refSource
  const trimmed = refKey.trim()
  if (!trimmed) return null
  const rows = getRuntimeResultsById(trimmed)
  return resolveScalarAggregateFromRows(rows)
}

/** 3.8 count — returns a single numeric DatumValue */
/** Op 3.8: count rows; returns single DatumValue with the count. */
export function countData(data: DatumValue[], op: OperationSpec): DatumValue[] {
  const arr = cloneData(data)
  const spec = assertCountSpec(op)
  const { group } = spec
  const byGroup = sliceByGroup(arr, group ?? null)
  const fieldLabel = op?.field || 'target'
  const name = buildAggregateLabel('count', semanticSubjectFromRows(byGroup, fieldLabel))
  return makeScalarDatum('value', group ?? null, 'count', '__count__', byGroup.length, name, buildSemanticMeasure(OperationOp.Count, fieldLabel))
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
  const name = buildAggregateLabel('sum', semanticSubjectFromRows(byGroup, fieldLabel))
  return makeScalarDatum(fieldLabel, group ?? null, fieldLabel, '__sum__', s, name, buildSemanticMeasure(OperationOp.Sum, fieldLabel))
}

/** 3.10 average — returns a single numeric DatumValue */
/** Op 3.10: average numeric values; returns single DatumValue. */
export function averageData(data: DatumValue[], op: OperationSpec): DatumValue[] {
  const arr = cloneData(data)
  const spec = assertAverageSpec(op)
  const { field, group } = spec
  const byGroup = sliceByGroup(arr, group ?? null).filter(predicateByField(field, 'measure'))
  const fieldLabel = field || 'value'
  const name = buildAggregateLabel('average', semanticSubjectFromRows(byGroup, fieldLabel))
  if (byGroup.length === 0) return makeScalarDatum(fieldLabel, group ?? null, fieldLabel, '__avg__', NaN, name, buildSemanticMeasure(OperationOp.Average, fieldLabel))
  const avg = byGroup.reduce((acc, d) => acc + d.value, 0) / byGroup.length
  return makeScalarDatum(fieldLabel, group ?? null, fieldLabel, '__avg__', avg, name, buildSemanticMeasure(OperationOp.Average, fieldLabel))
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
  const gA = scalarGroupLabel(groupA ?? op.group)
  const gB = scalarGroupLabel(groupB ?? op.group)

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
  const groupLabel = scalarGroupLabel(op.group) ?? gA ?? gB ?? null
  const { left, right } = semanticLabelFromCompareTargets(targetA, targetB)
  const name = buildBinaryLabel('difference', left, right)

  return makeScalarDatum(fieldLabel, groupLabel, fieldLabel, targetLabel, resultValue, name, buildSemanticMeasure(OperationOp.Diff, fieldLabel))
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
      semanticMeasure: buildSemanticMeasure(OperationOp.LagDiff, measureName),
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
      resultDatum.displayTarget = resultDatum.name
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
    keyField,
    field,
    groupA,
    groupB,
    signed = true,
    absolute = false,
    precision,
    group,
  } = spec
  const scoped = sliceByGroup(arr, group ?? null)
  const hasSeriesData = scoped.some((item) => item.group != null || item.series != null)
  if (!hasSeriesData) {
    throw new Error('pairDiff requires grouped or multi-series data')
  }
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
  const pairKeyLabel = typeof keyField === 'string' && keyField.trim().length > 0 ? keyField.trim() : String(by ?? '').trim()
  const buildMap = (items: DatumValue[]) => {
    const out = new Map<string, number[]>()
    let supportedKeyCount = 0
    items.forEach((item) => {
      if (measureName !== 'value' && item.measure != null && item.measure !== measureName) return
      const key =
        typeof keyField === 'string' && keyField.trim().length > 0
          ? keyFieldForPairDiff(item, keyField)
          : targetKeyForPairDiff(item, String(by ?? ''))
      if (!key) return
      supportedKeyCount += 1
      const value = Number(item.value)
      if (!Number.isFinite(value)) return
      const bucket = out.get(key) ?? []
      bucket.push(value)
      out.set(key, bucket)
    })
    return { out, supportedKeyCount }
  }

  const mapAResult = buildMap(left)
  const mapBResult = buildMap(right)
  if (mapAResult.supportedKeyCount === 0 || mapBResult.supportedKeyCount === 0) {
    if (pairKeyLabel) {
      throw new Error(`pairDiff: unsupported key field "${pairKeyLabel}"`)
    }
    throw new Error('pairDiff: unsupported key field')
  }
  const mapA = mapAResult.out
  const mapB = mapBResult.out
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
      category: pairKeyLabel || null,
      measure: measureName,
      semanticMeasure: buildSemanticMeasure(OperationOp.PairDiff, measureName),
      target: key,
      displayTarget: typeof keyField === 'string' && keyField.trim().length > 0 ? key : buildBinaryLabel('difference', groupA, groupB),
      group: resultGroup,
      panel: typeof keyField === 'string' && keyField.trim().length > 0 ? key : null,
      panelField: typeof keyField === 'string' && keyField.trim().length > 0 ? keyField.trim() : null,
      value: roundNumeric(delta),
      name: buildBinaryLabel('difference', groupA, groupB),
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
  const labels = semanticLabelFromCompareTargets(targetA, targetB)
  return makeScalarDatum(
    spec.field ?? 'value',
    group,
    'result',
    spec.targetName ?? '__add__',
    Number(left) + Number(right),
    buildBinaryLabel('sum', labels.left, labels.right),
    buildSemanticMeasure(OperationOp.Add, spec.field ?? 'value', { addend: labels.right }),
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
    buildScaledLabel(formatTargetLabel(spec.target) || 'the previous result'),
    buildSemanticMeasure(OperationOp.Scale, spec.field ?? 'value', { factor }),
  )
}

/** 3.12 nth — returns the n-th item in current ordering (1-based) */
/** Op 3.12: return the n-th datum (1-based) from left/right. */
export function nthData(data: DatumValue[], op: OperationSpec): DatumValue[] {
  const arr = cloneData(data)
  const spec = assertNthSpec(op)
  const { n, from = 'left', group, orderField } = spec
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

  const decorated = byGroup.map((datum, index) => {
    const normalizedOrderField = typeof orderField === 'string' ? orderField.trim() : ''
    let orderValue: number | string | null = index
    if (!normalizedOrderField || normalizedOrderField === 'target' || normalizedOrderField === datum.category) {
      orderValue = parseComparableValue(datum.target)
    } else if (normalizedOrderField === 'value' || normalizedOrderField === datum.measure) {
      orderValue = parseComparableValue(datum.value)
    } else if (normalizedOrderField === 'group' || normalizedOrderField === 'series') {
      orderValue = parseComparableValue(datum.group ?? '')
    } else if (normalizedOrderField === 'id') {
      orderValue = parseComparableValue(datum.id ?? '')
    }
    return { datum, orderValue, index }
  })

  decorated.sort((a, b) => {
    const cmp = compareComparableValues(a.orderValue, b.orderValue)
    if (cmp !== 0) return cmp
    return a.index - b.index
  })

  const baseSequence = from === 'right'
    ? decorated.map((entry) => entry.datum).reverse()
    : decorated.map((entry) => entry.datum)

  const results: DatumValue[] = []
  normalized.forEach((rank) => {
    const idx = rank - 1
    if (idx >= 0 && idx < baseSequence.length) {
      results.push({
        ...baseSequence[idx],
        semanticMeasure: baseSequence[idx].semanticMeasure ?? baseSequence[idx].measure ?? null,
        name: buildOrdinalLabel(rank, semanticSubjectFromRows(byGroup, op.field || 'value')),
        displayTarget: buildOrdinalLabel(rank, semanticSubjectFromRows(byGroup, op.field || 'value')),
      })
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
  compareBool: compareBoolOp,
  findExtremum,
  sort: sortData,
  diffByValue: diffByValueOp,
  count: countData,
  sum: sumData,
  average: averageData,
  diff: diffData,
  lagDiff: lagDiffData,
  pairDiff: pairDiffData,
  nth: nthData,
  add: addData,
  scale: scaleData,
}

export default LineChartOps

import type { DatumValue } from '../../../types'
import { toDatumValuesFromRaw, type RawRow } from './datum'

export function toWorkingDatumValuesFromStore(params: {
  raw: RawRow[]
  specXField: string
  specYField: string
  ctxXField?: string | null
  ctxYField?: string | null
  groupField?: string
  groupFallback?: (row: RawRow) => string | null
}): DatumValue[] {
  const xField = params.ctxXField || params.specXField
  const yField = params.ctxYField || params.specYField
  return toDatumValuesFromRaw(
    params.raw,
    { xField, yField, groupField: params.groupField },
    { groupFallback: params.groupFallback },
  )
}

export function aggregateDatumValuesByTarget(data: DatumValue[]): DatumValue[] {
  const byTarget = new Map<
    string,
    { value: number; hasValue: boolean; sample: DatumValue }
  >()
  const order: string[] = []

  data.forEach((datum) => {
    const key = String(datum.target)
    let entry = byTarget.get(key)
    if (!entry) {
      entry = { value: 0, hasValue: false, sample: datum }
      byTarget.set(key, entry)
      order.push(key)
    }
    const v = Number(datum.value)
    if (Number.isFinite(v)) {
      entry.value += v
      entry.hasValue = true
    }
  })

  return order.map((key) => {
    const entry = byTarget.get(key)!
    const sample = entry.sample
    return {
      category: sample.category ?? null,
      measure: sample.measure ?? null,
      target: String(sample.target),
      group: null,
      value: entry.hasValue ? entry.value : NaN,
      id: sample.id ?? key,
    }
  })
}

export function countUniqueGroups(data: DatumValue[]): number {
  const seen = new Set<string>()
  data.forEach((datum) => {
    const group = datum.group
    if (group == null) return
    const normalized = String(group).trim()
    if (!normalized) return
    seen.add(normalized)
  })
  return seen.size
}

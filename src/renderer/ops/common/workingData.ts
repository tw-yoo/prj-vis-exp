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


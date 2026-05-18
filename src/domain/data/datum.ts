import type { DatumValue, JsonValue } from '../operation/types'

export type RawRow = Record<string, JsonValue>

export function toDatumValuesFromRaw(
  rawData: RawRow[],
  fields: { xField: string; yField: string; groupField?: string },
  options: {
    groupFallback?: (row: RawRow) => string | null
    panelField?: string
    panelFallback?: (row: RawRow) => string | null
    idField?: string
  } = {},
): DatumValue[] {
  const { xField, yField, groupField } = fields
  const { groupFallback, panelField, panelFallback, idField = 'id' } = options

  return rawData.map((row, idx) => {
    const targetRaw = row[xField] ?? `item_${idx}`
    const valueRaw = row[yField]
    const groupValue =
      groupField && row[groupField] != null
        ? String(row[groupField])
        : groupFallback
          ? groupFallback(row)
          : (row.group ?? row.color ?? row.series ?? null)
    const panelValue =
      panelField && row[panelField] != null
        ? String(row[panelField])
        : panelFallback
          ? panelFallback(row)
          : (row.panel ?? null)

    return {
      category: xField,
      measure: yField,
      semanticMeasure: yField,
      target: String(targetRaw),
      group: groupValue != null && String(groupValue).trim() !== '' ? String(groupValue) : null,
      panel: panelValue != null && String(panelValue).trim() !== '' ? String(panelValue) : null,
      panelField: panelField?.trim() ? panelField.trim() : null,
      value: Number(valueRaw),
      id: (row as any)?.[idField] != null ? String((row as any)[idField]) : String(idx),
    }
  })
}

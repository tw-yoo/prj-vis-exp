import type { JsonValue } from '../../types'

type RawDatum = Record<string, JsonValue>

function normalizeText(value: JsonValue | undefined): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : null
  }
  return null
}

function isDatumLikeRow(row: RawDatum) {
  return 'target' in row && 'value' in row
}

function resolveRowDisplayLabel(row: RawDatum, keyField: string): string | null {
  const explicit = normalizeText(row.displayTarget)
  if (explicit) return explicit

  const label = normalizeText(row.label)
  if (label) return label

  const name = normalizeText(row.name)
  if (name && (keyField === 'target' || isDatumLikeRow(row))) {
    return name
  }

  const raw = normalizeText(row[keyField])
  return raw
}

export function buildCategoricalDisplayLabelMap(rows: RawDatum[], keyField: string) {
  const labels = new Map<string, string>()
  rows.forEach((row) => {
    const raw = normalizeText(row[keyField])
    if (!raw || labels.has(raw)) return
    const display = resolveRowDisplayLabel(row, keyField)
    if (!display) return
    labels.set(raw, display)
  })
  return labels
}

export function categoricalTickFormatter(labelMap: Map<string, string>) {
  return (value: string | number) => labelMap.get(String(value)) ?? String(value)
}

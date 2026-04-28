import type { JsonValue } from '../../types'

type Axis = 'x' | 'y'
type AxisDatum = {
  measure?: string | null
  [key: string]: unknown
}
type AxisTitleSpec = {
  meta?: { axisLabels?: Partial<Record<Axis, JsonValue>> }
  encoding?: Partial<Record<Axis, { field?: JsonValue } | JsonValue>>
}

/**
 * Resolves display axis titles from explicit metadata and original measure / encoding fields.
 *
 * Note: `DatumValue.semanticMeasure` is intentionally NOT consumed here.
 * That field is preserved only for downstream parameter prediction (e.g. selecting
 * a target measure name when authoring a follow-up operation), not for display.
 * Axis titles must continue to reflect the original measure/encoding so the chart
 * surface stays stable across operation chains.
 */
export function resolveAxisTitle(spec: AxisTitleSpec, datums: AxisDatum[] | null | undefined, axis: Axis): string | null {
  const axisLabelOverride = normalizeOptionalLabel(spec.meta?.axisLabels?.[axis])
  if (axisLabelOverride !== undefined) return axisLabelOverride

  const explicitAxisTitle = resolveExplicitAxisTitle(spec, axis)
  if (explicitAxisTitle !== undefined) return explicitAxisTitle

  const field = resolveEncodingField(spec, axis)
  const firstDatum = datums?.find((datum) => datum && typeof datum === 'object') ?? null
  const measure = normalizeOptionalLabel(firstDatum?.measure)

  if (measure !== undefined) return measure
  return field
}

function normalizeOptionalLabel(value: unknown) {
  if (value === undefined) return undefined
  if (value === null) return null
  const str = String(value).trim()
  return str.length > 0 ? str : null
}

function resolveEncodingField(spec: AxisTitleSpec, axis: Axis): string | null {
  const channel = spec.encoding?.[axis]
  if (!channel || typeof channel !== 'object' || Array.isArray(channel)) return null
  const field = (channel as { field?: JsonValue }).field
  return typeof field === 'string' && field.trim().length > 0 ? field.trim() : null
}

function resolveExplicitAxisTitle(spec: AxisTitleSpec & { layer?: Array<{ encoding?: AxisTitleSpec['encoding'] }> }, axis: Axis) {
  const direct = extractAxisTitle(spec.encoding?.[axis])
  if (direct !== undefined) return direct
  if (!Array.isArray(spec.layer)) return undefined
  for (const layer of spec.layer) {
    const title = extractAxisTitle(layer?.encoding?.[axis])
    if (title !== undefined) return title
  }
  return undefined
}

function extractAxisTitle(channel: unknown): string | null | undefined {
  if (!channel || typeof channel !== 'object' || Array.isArray(channel)) return undefined
  const rec = channel as Record<string, unknown>
  if (Object.prototype.hasOwnProperty.call(rec, 'title')) {
    return normalizeOptionalLabel(rec.title)
  }
  const axis = rec.axis
  if (!axis || typeof axis !== 'object' || Array.isArray(axis)) return undefined
  const axisRec = axis as Record<string, unknown>
  if (Object.prototype.hasOwnProperty.call(axisRec, 'title')) {
    return normalizeOptionalLabel(axisRec.title)
  }
  return undefined
}

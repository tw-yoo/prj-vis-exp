import { ChartType, getChartType, type VegaLiteSpec } from '../../../domain/chart'
import { resolveMultiLineEncoding } from '../../line/multipleLineRenderer'
import { resolveSimpleLineEncoding } from '../../line/simpleLineRenderer'

type EncodingRecord = Record<string, unknown>

export type ResolvedEncodingFields = {
  xField: string
  yField: string
  groupField?: string
}

function asRecord(value: unknown): EncodingRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as EncodingRecord
}

function extractField(channel: unknown): string | null {
  const record = asRecord(channel)
  if (!record) return null
  const field = record.field
  return typeof field === 'string' && field.trim().length > 0 ? field.trim() : null
}

export function resolveEncodingFields(spec: VegaLiteSpec): ResolvedEncodingFields | null {
  const chartType = getChartType(spec)
  const topEncoding = asRecord(spec.encoding)
  const topX = extractField(topEncoding?.x)
  const topY = extractField(topEncoding?.y)
  const topColor = extractField(topEncoding?.color) ?? undefined

  if (
    chartType === ChartType.SIMPLE_BAR ||
    chartType === ChartType.GROUPED_BAR ||
    chartType === ChartType.STACKED_BAR
  ) {
    if (!topX || !topY) return null
    return { xField: topX, yField: topY, groupField: topColor }
  }

  if (chartType === ChartType.SIMPLE_LINE) {
    const resolved = resolveSimpleLineEncoding(spec)
    if (!resolved) return null
    return { xField: resolved.xField, yField: resolved.yField, groupField: resolved.colorField }
  }

  if (chartType === ChartType.MULTI_LINE) {
    const resolved = resolveMultiLineEncoding(spec)
    if (!resolved) return null
    return { xField: resolved.xField, yField: resolved.yField, groupField: resolved.colorField ?? undefined }
  }

  if (!topX || !topY) return null
  return { xField: topX, yField: topY, groupField: topColor }
}

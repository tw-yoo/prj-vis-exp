import type { JsonValue } from '../operation/types'
import { ChartType, type ChartTypeValue, type VegaLiteSpec } from './types'

type EncodingChannel = {
  field?: JsonValue
  type?: JsonValue
  stack?: JsonValue
}

type EncodingMap = Record<string, EncodingChannel | undefined>

function normalizeMarkType(mark: VegaLiteSpec['mark']) {
  if (!mark) return null
  if (typeof mark === 'string') return mark
  if (typeof mark === 'object' && typeof mark.type === 'string') {
    return mark.type
  }
  return null
}

function hasFieldChannel(channel: JsonValue | undefined) {
  if (!channel) return false
  if (typeof channel === 'string') return true
  if (typeof channel === 'object') {
    const channelObj = channel as { field?: JsonValue; condition?: JsonValue }
    if (channelObj.field) return true
    if (Array.isArray(channelObj.condition)) {
      return channelObj.condition.some((c) => !!(c as { field?: JsonValue })?.field)
    }
    if (channelObj.condition && (channelObj.condition as { field?: JsonValue }).field) return true
  }
  return false
}

function normalizeLayers(spec: VegaLiteSpec = {}) {
  const baseEncoding =
    spec.encoding && typeof spec.encoding === 'object' ? (spec.encoding as Record<string, JsonValue>) : {}
  if (Array.isArray(spec.layer) && spec.layer.length > 0) {
    return spec.layer.map((layer) => ({
      mark: normalizeMarkType((layer?.mark as VegaLiteSpec['mark']) ?? spec.mark),
      encoding: {
        ...baseEncoding,
        ...(layer?.encoding && typeof layer.encoding === 'object' ? layer.encoding : {}),
      },
    }))
  }
  return [
    {
      mark: normalizeMarkType(spec.mark),
      encoding: baseEncoding,
    },
  ]
}

export function getChartType(spec: VegaLiteSpec): ChartTypeValue | null {
  if (!spec || typeof spec !== 'object') return null

  const layers = normalizeLayers(spec)
  const baseEnc = spec.encoding || {}
  const hasFacet = !!(
    (baseEnc as { column?: JsonValue }).column || (baseEnc as { row?: JsonValue }).row || spec.facet || spec.repeat
  )

  const barLayer = layers.find((layer) => layer.mark === 'bar')
  if (barLayer) {
    const encoding = (barLayer.encoding || {}) as EncodingMap
    const hasColor = !!encoding.color
    const hasXOffset = hasFieldChannel((encoding as Record<string, JsonValue>).xOffset)

    if (hasFacet) {
      return ChartType.GROUPED_BAR
    }

    const isSingleSeriesColor =
      encoding.color?.field === encoding.y?.field &&
      encoding.x?.type === 'quantitative' &&
      encoding.y?.type === 'nominal'

    if (!hasColor || isSingleSeriesColor) {
      return ChartType.SIMPLE_BAR
    }
    if (hasXOffset) {
      return ChartType.GROUPED_BAR
    }

    const stackType = encoding.y?.stack || encoding.x?.stack || null
    if (stackType !== 'none') {
      return ChartType.STACKED_BAR
    }
    return ChartType.GROUPED_BAR
  }

  const lineLayers = layers.filter((layer) => layer.mark === 'line')
  if (lineLayers.length > 0) {
    const colorInLayers = layers.some((layer) => hasFieldChannel((layer.encoding as EncodingMap)?.color))
    const colorInBase = hasFieldChannel((baseEnc as Record<string, JsonValue>).color)
    if (colorInLayers || colorInBase) {
      return ChartType.MULTI_LINE
    }
    return ChartType.SIMPLE_LINE
  }

  return null
}

export { ChartType }

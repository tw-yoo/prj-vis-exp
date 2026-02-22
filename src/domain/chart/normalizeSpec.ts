import type { VegaLiteSpec } from './types'

type PaddingSpec = { left?: number; right?: number; top?: number; bottom?: number }
type AxisSpec = {
  labelFontSize?: number
  titleFontSize?: number
  titlePadding?: number
  labelPadding?: number
  labelLimit?: number
  domainColor?: string
  tickColor?: string
  labelColor?: string
  titleColor?: string
}
type LegendSpec = { labelColor?: string; titleColor?: string; labelFontSize?: number; titleFontSize?: number }
type ViewSpec = { stroke?: string }
type RangeSpec = { category?: string[] }

type NormalizableSpec = VegaLiteSpec & {
  encoding?: Record<string, unknown>
  facet?: Record<string, unknown>
  repeat?: Record<string, unknown>
  config?: {
    axis?: AxisSpec
    axisX?: AxisSpec
    axisY?: AxisSpec
    legend?: LegendSpec
    view?: ViewSpec
    range?: RangeSpec
    [key: string]: unknown
  }
  autosize?: unknown
  padding?: number | PaddingSpec
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function hasFacet(spec: NormalizableSpec) {
  const encoding = asRecord(spec.encoding)
  const facet = asRecord(spec.facet)
  const repeat = asRecord(spec.repeat)
  return !!encoding?.column || !!facet?.column || !!facet?.row || !!repeat?.column
}

export function normalizeSpec(spec: VegaLiteSpec): VegaLiteSpec {
  const clone: NormalizableSpec = { ...(spec as NormalizableSpec) }
  clone.width = clone.width ?? 600
  clone.height = clone.height ?? 300
  clone.padding = clone.padding ?? { left: 60, right: 20, top: 40, bottom: 70 }

  if (hasFacet(clone)) {
    clone.width = clone.width && clone.width < 200 ? clone.width : 140
    clone.autosize = { type: 'none', contains: 'padding' }
  }

  const config = clone.config ?? {}
  const axis: AxisSpec = {
    labelFontSize: 11,
    titleFontSize: 13,
    titlePadding: 10,
    labelPadding: 5,
    labelLimit: 0,
    domainColor: '#000000',
    tickColor: '#000000',
    labelColor: '#000000',
    titleColor: '#000000',
    ...(config.axis ?? {}),
  }
  const axisX: AxisSpec = {
    domainColor: '#000000',
    tickColor: '#000000',
    labelColor: '#000000',
    titleColor: '#000000',
    ...(config.axisX ?? {}),
  }
  const axisY: AxisSpec = {
    domainColor: '#000000',
    tickColor: '#000000',
    labelColor: '#000000',
    titleColor: '#000000',
    ...(config.axisY ?? {}),
  }
  const legend: LegendSpec = {
    labelColor: '#000000',
    titleColor: '#000000',
    ...(config.legend ?? {}),
    labelFontSize: 11,
    titleFontSize: 12,
  }
  const view: ViewSpec = { ...(config.view ?? {}), stroke: 'transparent' }
  const range: RangeSpec = {
    category: [
      '#60a5fa',
      '#fb7185',
      '#f59e0b',
      '#10b981',
      '#c084fc',
      '#f472b6',
      '#22d3ee',
      '#a3e635',
      '#f97316',
    ],
    ...(config.range ?? {}),
  }
  clone.config = {
    ...config,
    axis,
    axisX,
    axisY,
    legend,
    view,
    range,
  }
  return clone
}

import type { JsonValue } from '../operation/types'

export interface ChartSpec {
  $schema?: string
  data?: {
    url?: string
    values?: JsonValue[]
    [key: string]: JsonValue | undefined
  }
  mark?: string | { type?: string; [key: string]: JsonValue | undefined }
  encoding?: Record<string, JsonValue>
  layer?: Array<Record<string, JsonValue>>
  config?: Record<string, JsonValue>
  width?: number
  height?: number
  padding?: number | { left?: number; right?: number; top?: number; bottom?: number }
  autosize?: unknown
  [key: string]: unknown
}

export type VegaLiteSpec = ChartSpec

export const ChartType = Object.freeze({
  SIMPLE_BAR: 'Simple bar chart',
  STACKED_BAR: 'Stacked bar chart',
  GROUPED_BAR: 'Grouped bar chart',
  SIMPLE_LINE: 'Simple line chart',
  MULTI_LINE: 'Multi line chart',
})

export type ChartTypeValue = (typeof ChartType)[keyof typeof ChartType]

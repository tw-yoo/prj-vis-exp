import type { JsonValue } from '../operation/types'

export interface VegaLiteSpec {
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
  [key: string]: unknown
}

export const ChartType = Object.freeze({
  SIMPLE_BAR: 'Simple bar chart',
  STACKED_BAR: 'Stacked bar chart',
  GROUPED_BAR: 'Grouped bar chart',
  SIMPLE_LINE: 'Simple line chart',
  MULTI_LINE: 'Multi line chart',
})

export type ChartTypeValue = (typeof ChartType)[keyof typeof ChartType]

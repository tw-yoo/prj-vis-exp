import type { ChartTypeValue } from '../../../domain/chart'

export type FieldKind =
  | 'string'
  | 'number'
  | 'boolean'
  | 'enum'
  | 'stringOrNumber'
  | 'stringOrMap'
  | 'stringArray'
  | 'numberArray'
  | 'stringOrNumberArray'
  | 'object'
  | 'map'

export type FieldOptionsSource = 'target' | 'series' | 'id' | 'value' | 'dataKey' | 'field'

export type OpsBuilderOptionSources = {
  targets: string[]
  series: string[]
  ids: string[]
  values: string[]
  fields: string[]
}

export type FieldSchema = {
  key: string
  label: string
  kind: FieldKind
  optional?: boolean
  description?: string
  options?: Array<string>
  optionsSource?: FieldOptionsSource
  fields?: FieldSchema[]
  valueSchema?: FieldSchema
  ui?: 'chartId'
}

export type ActionSchema = {
  value: string
  label: string
  icon?: string
  allowedCharts?: ChartTypeValue[]
  fields?: FieldSchema[]
}

export type OperationSchema = {
  op: string
  label: string
  icon?: string
  allowedCharts?: ChartTypeValue[]
  fields?: FieldSchema[]
  actions?: ActionSchema[]
}

export type OperationRegistry = {
  operations: OperationSchema[]
}

export type OpsBuilderBlock = {
  id: string
  op: string | null
  disabled?: boolean
  source?: string
  fields: Record<string, unknown>
}

export type OpsBuilderGroup = {
  id: string
  name: string
  disabled?: boolean
  blocks: OpsBuilderBlock[]
}

export type OpsBuilderState = {
  groups: OpsBuilderGroup[]
}

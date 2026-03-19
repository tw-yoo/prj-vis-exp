export type JsonPrimitive = string | number | boolean | null
export interface JsonObject {
  [key: string]: JsonValue
}
export type JsonArray = JsonValue[]
export type JsonValue = JsonPrimitive | JsonObject | JsonArray

/**
 * Normalized datum used by chart operations.
 * - category: semantic x/label field name (e.g., "country")
 * - measure: semantic y/value field name (e.g., "rating")
 * - target: actual category value shown on axis (stringified)
 * - group: subgroup/series label (null for single-series)
 * - value: numeric value for operations
 */
export interface DatumValue {
  category: string | null
  measure: string | null
  target: string
  group: string | null
  value: number
  id?: string | null
  name?: string | null
  lookupId?: string | null
  prevTarget?: string | null
  series?: string | null
}

/*
 * Legacy result shapes (deprecated)
 * --------------------------------
 * We previously returned non-datum result types for some operations, but the
 * current system assumes operations return `DatumValue[]` only.
 */
// export interface IntervalValue {
//   category: string | null
//   min: number
//   max: number
//   id?: string | null
// }
//
// export interface BoolValue {
//   category: string | null
//   bool: boolean
//   id?: string | null
// }

export type TargetSelector =
  | string
  | number
  | {
      category?: string | number
      series?: string | null
      target?: string | number
      id?: string | number
    }

/**
 * Generic operation spec used by data ops and renderers.
 * Properties are optional because different ops use different subsets.
 */
export interface OperationSpec {
  op?: string
  text?: JsonValue
  meta?: {
    source?: 'interaction' | 'builder' | 'plan' | string
    [key: string]: JsonValue | undefined
  }
  chartId?: string
  surfaceId?: string
  field?: string
  /** Target include/exclude list (used by filter op) */
  include?: Array<string | number>
  exclude?: Array<string | number>
  operator?:
    | '>'
    | '>='
    | '<'
    | '<='
    | '=='
    | 'eq'
    | '!='
    | 'in'
    | 'not-in'
    | 'contains'
    | 'between'
    | string
  value?: JsonValue
  group?: string | null
  groupA?: string | null
  groupB?: string | null
  aggregate?: 'sum' | 'avg' | 'min' | 'max' | 'percentage_of_total' | 'percent_of_total' | string
  which?: 'max' | 'min'
  order?: 'asc' | 'desc'
  orderField?: string
  signed?: boolean
  mode?: 'difference' | 'ratio' | string
  percent?: boolean
  scale?: number
  factor?: number
  precision?: number
  fn?: 'intersection' | 'union' | string
  by?: string
  seriesField?: string
  target?: TargetSelector | TargetSelector[]
  targetA?: TargetSelector | TargetSelector[]
  targetB?: TargetSelector | TargetSelector[]
  targetName?: string
  n?: number | number[]
  from?: 'left' | 'right'
  absolute?: boolean
  /** Sleep duration in seconds */
  seconds?: number
  duration?: number
}

export type DataOpResult = DatumValue[]

export { OperationOp } from './operationNames'
export type { OperationOp as OperationOpType } from './operationNames'

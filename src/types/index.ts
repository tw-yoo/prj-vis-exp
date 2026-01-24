export type JsonPrimitive = string | number | boolean | null
export interface JsonObject {
  [key: string]: JsonValue
}
export interface JsonArray extends Array<JsonValue> {}
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

export interface IntervalValue {
  category: string | null
  min: number
  max: number
  id?: string | null
}

export interface BoolValue {
  category: string | null
  bool: boolean
  id?: string | null
}

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
  field?: string
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
  precision?: number
  target?: TargetSelector | TargetSelector[]
  targetA?: TargetSelector | TargetSelector[]
  targetB?: TargetSelector | TargetSelector[]
  targetName?: string
  n?: number | number[]
  from?: 'left' | 'right'
  absolute?: boolean
}

export type DataOpResult = DatumValue[] | BoolValue | IntervalValue

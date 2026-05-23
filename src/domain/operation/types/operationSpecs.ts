import { OperationOp } from './operationNames'
import type { OperationSpec, TargetSelector } from '.'

export interface OpRetrieveValueSpec extends OperationSpec {
  op: typeof OperationOp.RetrieveValue
  /**
   * Lookup target.
   * - When `targetAxis === 'x'` (default): the x-axis category label (or its id).
   * - When `targetAxis === 'y'`: the numeric y-axis value to find rows for.
   *   Multiple matches (same value at different categories) all flow through.
   */
  target: TargetSelector | TargetSelector[]
  /** Measure field constraint. Required when `targetAxis === 'y'` and the chart has multiple measures. */
  field?: string
  /**
   * Lookup direction. Default `'x'` (find y given x). Use `'y'` to find x category(ies)
   * whose measured value matches `target` (exact match against `field`, or any measure if omitted).
   */
  targetAxis?: 'x' | 'y'
  precision?: number
  visual?: {
    highlightColor?: string
    textColor?: string
  }
}

export interface OpFilterSpec extends OperationSpec {
  op: typeof OperationOp.Filter
  operator?: OperationSpec['operator']
  value?: OperationSpec['value']
  field?: string
  group?: OperationSpec['group']
  include?: Array<string | number>
  exclude?: Array<string | number>
}

export interface OpSortSpec extends OperationSpec {
  op: typeof OperationOp.Sort
  field?: string
  order?: 'asc' | 'desc'
  group?: string | null
}

export interface OpFindExtremumSpec extends OperationSpec {
  op: typeof OperationOp.FindExtremum
  which: 'max' | 'min'
  field?: string
  group?: string | null
}

export interface OpDiffByValueSpec extends OperationSpec {
  op: typeof OperationOp.DiffByValue
  value?: number
  targetValue?: string
  field?: string
  group?: string | null
  signed?: boolean
}

export interface OpCompareBoolSpec extends OperationSpec {
  op: typeof OperationOp.CompareBool
  targetA?: TargetSelector | TargetSelector[]
  targetB?: TargetSelector | TargetSelector[]
  operator: OperationSpec['operator']
  field?: string
  groupA?: string | null
  groupB?: string | null
}

export interface OpSumSpec extends OperationSpec {
  op: typeof OperationOp.Sum
  field: string
  group?: string | null
}

export interface OpAverageSpec extends OperationSpec {
  op: typeof OperationOp.Average
  field: string
  group?: string | null
}

export interface OpDiffSpec extends OperationSpec {
  op: typeof OperationOp.Diff
  targetA?: TargetSelector | TargetSelector[]
  targetB?: TargetSelector | TargetSelector[]
  field?: string
  signed?: boolean
  precision?: number
}

export interface OpLagDiffSpec extends OperationSpec {
  op: typeof OperationOp.LagDiff
  orderField: string
  order?: 'asc' | 'desc'
  group?: string | null
}

export interface OpPairDiffSpec extends OperationSpec {
  op: typeof OperationOp.PairDiff
  by?: string
  keyField?: string
  seriesField?: string
  field?: string
  groupA: string
  groupB: string
  signed?: boolean
  absolute?: boolean
  precision?: number
  group?: string | null
}

export interface OpNthSpec extends OperationSpec {
  op: typeof OperationOp.Nth
  n: number
  from?: 'left' | 'right'
  orderField?: string
  group?: string | null
}

export interface OpCountSpec extends OperationSpec {
  op: typeof OperationOp.Count
  field?: string
  group?: string | null
}

export interface OpAddSpec extends OperationSpec {
  op: typeof OperationOp.Add
  targetA: TargetSelector | TargetSelector[]
  targetB: TargetSelector | TargetSelector[]
  field?: string
  group?: string | null
}

export interface OpScaleSpec extends OperationSpec {
  op: typeof OperationOp.Scale
  target: TargetSelector | TargetSelector[]
  factor: number
  field?: string
  group?: string | null
}

/**
 * Range — max − min spread over the working data.
 *
 * Result: single DatumValue carrying the spread value plus the extremum
 * metadata so downstream ops (annotation, retrieval) can locate the endpoints.
 *
 * Replaces verbose `findExtremum(max) → findExtremum(min) → diff` chains
 * when the semantic intent is "range / spread / variation".
 */
export interface OpRangeSpec extends OperationSpec {
  op: typeof OperationOp.Range
  field?: string
  group?: string | null
}

/**
 * RollingWindow — sliding-window aggregate over an ordered series.
 *
 * For each starting position i (0 ≤ i ≤ N − window), aggregates the next
 * `window` rows using `aggregate` (default 'avg'). Returns N − window + 1
 * DatumValues, one per window, each carrying `{ value, windowStart,
 * windowEnd, windowKeys[] }` so a downstream `findExtremum` / `nth` can
 * pick the best window.
 *
 * `orderField` is the axis to slide along (typically the x-axis field);
 * defaults to natural data order when omitted.
 */
export interface OpRollingWindowSpec extends OperationSpec {
  op: typeof OperationOp.RollingWindow
  /** Size of the sliding window (positive integer ≥ 1). Required. */
  window: number
  /** Aggregate function applied within each window. Default `'avg'`. */
  aggregate?: 'sum' | 'avg' | 'min' | 'max'
  /** Measure field to aggregate. Defaults to the chart's primary measure. */
  field?: string
  /** Axis along which the window slides; falls back to natural data order. */
  orderField?: string
  group?: string | null
}

/**
 * MonotonicRun — find strictly monotonic runs along an ordered axis.
 *
 * `mode` controls what is returned:
 *  - `'longest'`    (default): the longest run as a DatumValue[] (its rows).
 *  - `'firstBreak'`: a single DatumValue marking where the first run starts.
 *  - `'all'`       : every qualifying run flattened, with `__runId` metadata.
 *
 * `minLength` filters out runs shorter than the given count (default 2).
 * `strict` requires every step to be strictly increasing / decreasing
 * (default true). `direction` defaults to `'increasing'`.
 */
export interface OpMonotonicRunSpec extends OperationSpec {
  op: typeof OperationOp.MonotonicRun
  direction?: 'increasing' | 'decreasing'
  strict?: boolean
  mode?: 'longest' | 'firstBreak' | 'all'
  minLength?: number
  field?: string
  orderField?: string
  group?: string | null
}


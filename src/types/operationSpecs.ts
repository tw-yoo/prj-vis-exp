import { OperationOp } from './operationNames'
import type { OperationSpec, TargetSelector } from '.'

export interface OpRetrieveValueSpec extends OperationSpec {
  op: typeof OperationOp.RetrieveValue
  target: TargetSelector | TargetSelector[]
  field?: string
  precision?: number
  visual?: {
    highlightColor?: string
    textColor?: string
  }
}

export interface OpFilterSpec extends OperationSpec {
  op: typeof OperationOp.Filter
  operator: OperationSpec['operator']
  value: OperationSpec['value']
  field?: string
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

export interface OpDetermineRangeSpec extends OperationSpec {
  op: typeof OperationOp.DetermineRange
  field?: string
  group?: string | null
}

export interface OpCompareSpec extends OperationSpec {
  op: typeof OperationOp.Compare
  targetA: TargetSelector | TargetSelector[]
  targetB: TargetSelector | TargetSelector[]
  field?: string
  groupA?: string | null
  groupB?: string | null
  which?: 'max' | 'min'
}

export interface OpCompareBoolSpec extends OperationSpec {
  op: typeof OperationOp.CompareBool
  targetA: TargetSelector | TargetSelector[]
  targetB: TargetSelector | TargetSelector[]
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
  targetA: TargetSelector | TargetSelector[]
  targetB: TargetSelector | TargetSelector[]
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

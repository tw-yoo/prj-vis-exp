import { OperationOp } from '../../types'
import type {
  OpAddSpec,
  OpAverageSpec,
  OpCompareBoolSpec,
  OpCompareSpec,
  OpCountSpec,
  OpDetermineRangeSpec,
  OpDiffSpec,
  OpFilterSpec,
  OpFindExtremumSpec,
  OpLagDiffSpec,
  OpNthSpec,
  OpPairDiffSpec,
  OpRetrieveValueSpec,
  OpScaleSpec,
  OpSetOpSpec,
  OpSortSpec,
  OpSumSpec,
} from '../../types/operationSpecs'

type WithoutOp<T> = Omit<T, 'op'>

export type RetrieveValueArgs = WithoutOp<OpRetrieveValueSpec>
export type FilterArgs = WithoutOp<OpFilterSpec>
export type FindExtremumArgs = WithoutOp<OpFindExtremumSpec>
export type DetermineRangeArgs = WithoutOp<OpDetermineRangeSpec>
export type CompareArgs = WithoutOp<OpCompareSpec>
export type CompareBoolArgs = WithoutOp<OpCompareBoolSpec>
export type SortArgs = WithoutOp<OpSortSpec>
export type SumArgs = WithoutOp<OpSumSpec>
export type AverageArgs = WithoutOp<OpAverageSpec>
export type DiffArgs = WithoutOp<OpDiffSpec>
export type LagDiffArgs = WithoutOp<OpLagDiffSpec>
export type PairDiffArgs = WithoutOp<OpPairDiffSpec>
export type NthArgs = WithoutOp<OpNthSpec>
export type CountArgs = WithoutOp<OpCountSpec>
export type AddArgs = WithoutOp<OpAddSpec>
export type ScaleArgs = WithoutOp<OpScaleSpec>
export type SetOpArgs = WithoutOp<OpSetOpSpec>
export type SleepArgs = { chartId?: string; seconds?: number; duration?: number }

/**
 * @deprecated Authoring code should prefer positional DSL helpers from
 * `src/operation/build/authoring` (`ops.data`) to keep required inputs explicit
 * in IDE signatures.
 */
export const dataOps = {
  retrieveValue(args: RetrieveValueArgs): OpRetrieveValueSpec {
    return { op: OperationOp.RetrieveValue, ...args }
  },

  filter(args: FilterArgs): OpFilterSpec {
    return { op: OperationOp.Filter, ...args }
  },

  findExtremum(args: FindExtremumArgs): OpFindExtremumSpec {
    return { op: OperationOp.FindExtremum, ...args }
  },

  determineRange(args: DetermineRangeArgs): OpDetermineRangeSpec {
    return { op: OperationOp.DetermineRange, ...args }
  },

  compare(args: CompareArgs): OpCompareSpec {
    return { op: OperationOp.Compare, ...args }
  },

  compareBool(args: CompareBoolArgs): OpCompareBoolSpec {
    return { op: OperationOp.CompareBool, ...args }
  },

  sort(args: SortArgs): OpSortSpec {
    return { op: OperationOp.Sort, ...args }
  },

  sum(args: SumArgs): OpSumSpec {
    return { op: OperationOp.Sum, ...args }
  },

  average(args: AverageArgs): OpAverageSpec {
    return { op: OperationOp.Average, ...args }
  },

  diff(args: DiffArgs): OpDiffSpec {
    return { op: OperationOp.Diff, ...args }
  },

  lagDiff(args: LagDiffArgs): OpLagDiffSpec {
    return { op: OperationOp.LagDiff, ...args }
  },

  pairDiff(args: PairDiffArgs): OpPairDiffSpec {
    return { op: OperationOp.PairDiff, ...args }
  },

  nth(args: NthArgs): OpNthSpec {
    return { op: OperationOp.Nth, ...args }
  },

  count(args: CountArgs): OpCountSpec {
    return { op: OperationOp.Count, ...args }
  },

  add(args: AddArgs): OpAddSpec {
    return { op: OperationOp.Add, ...args }
  },

  scale(args: ScaleArgs): OpScaleSpec {
    return { op: OperationOp.Scale, ...args }
  },

  setOp(args: SetOpArgs): OpSetOpSpec {
    return { op: OperationOp.SetOp, ...args }
  },

  sleep(args: SleepArgs) {
    return { op: OperationOp.Sleep, ...args }
  },
} as const

export type DataOpsFactory = typeof dataOps

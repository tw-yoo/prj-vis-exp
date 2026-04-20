import { OperationOp } from '../../../types'
import type { TargetSelector } from '../../../types'
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
} from '../../../types/operationSpecs'

type ComparisonOperator = NonNullable<OpFilterSpec['operator']>
type SortOrder = NonNullable<OpSortSpec['order']>
type ExtremumWhich = OpFindExtremumSpec['which']
type NthFrom = OpNthSpec['from']

function buildDataOp<T extends { op: string }>(op: T['op'], fields: Omit<T, 'op'>): T {
  return { op, ...fields } as T
}

export const dataActions = {
  retrieveValue(
    target: TargetSelector | TargetSelector[],
    field?: string,
    precision?: number,
    group?: string | null,
    chartId?: string,
  ): OpRetrieveValueSpec {
    return buildDataOp<OpRetrieveValueSpec>(OperationOp.RetrieveValue, { target, field, precision, group, chartId })
  },

  filterByComparison(
    operator: ComparisonOperator,
    value: OpFilterSpec['value'],
    field?: string,
    group?: OpFilterSpec['group'],
    chartId?: string,
  ): OpFilterSpec {
    return buildDataOp<OpFilterSpec>(OperationOp.Filter, { operator, value, field, group, chartId })
  },

  filterInclude(
    values: Array<string | number>,
    field?: string,
    group?: OpFilterSpec['group'],
    chartId?: string,
  ): OpFilterSpec {
    return buildDataOp<OpFilterSpec>(OperationOp.Filter, { include: [...values], field, group, chartId })
  },

  filterExclude(
    values: Array<string | number>,
    field?: string,
    group?: OpFilterSpec['group'],
    chartId?: string,
  ): OpFilterSpec {
    return buildDataOp<OpFilterSpec>(OperationOp.Filter, { exclude: [...values], field, group, chartId })
  },

  findExtremum(which: ExtremumWhich, field?: string, group?: string | null, chartId?: string): OpFindExtremumSpec {
    return buildDataOp<OpFindExtremumSpec>(OperationOp.FindExtremum, { which, field, group, chartId })
  },

  determineRange(field?: string, group?: string | null, chartId?: string): OpDetermineRangeSpec {
    return buildDataOp<OpDetermineRangeSpec>(OperationOp.DetermineRange, { field, group, chartId })
  },

  compare(
    targetA: TargetSelector | TargetSelector[],
    targetB: TargetSelector | TargetSelector[],
    field?: string,
    groupA?: string | null,
    groupB?: string | null,
    which?: OpCompareSpec['which'],
    chartId?: string,
  ): OpCompareSpec {
    return buildDataOp<OpCompareSpec>(OperationOp.Compare, { targetA, targetB, field, groupA, groupB, which, chartId })
  },

  compareBool(
    targetA: TargetSelector | TargetSelector[],
    targetB: TargetSelector | TargetSelector[],
    operator: ComparisonOperator,
    field?: string,
    groupA?: string | null,
    groupB?: string | null,
    chartId?: string,
  ): OpCompareBoolSpec {
    return buildDataOp<OpCompareBoolSpec>(OperationOp.CompareBool, {
      targetA,
      targetB,
      operator,
      field,
      groupA,
      groupB,
      chartId,
    })
  },

  sort(field?: string, order?: SortOrder, group?: string | null, chartId?: string): OpSortSpec {
    return buildDataOp<OpSortSpec>(OperationOp.Sort, { field, order, group, chartId })
  },

  sum(field: string, group?: string | null, chartId?: string): OpSumSpec {
    return buildDataOp<OpSumSpec>(OperationOp.Sum, { field, group, chartId })
  },

  average(field: string, group?: string | null, chartId?: string) {
    return buildDataOp<OpAverageSpec>(OperationOp.Average, { field, group, chartId })
  },

  diff(
    targetA: TargetSelector | TargetSelector[],
    targetB: TargetSelector | TargetSelector[],
    field?: string,
    signed?: boolean,
    precision?: number,
    chartId?: string,
  ): OpDiffSpec {
    return buildDataOp<OpDiffSpec>(OperationOp.Diff, { targetA, targetB, field, signed, precision, chartId })
  },

  lagDiff(orderField: string, order?: SortOrder, group?: string | null, chartId?: string): OpLagDiffSpec {
    return buildDataOp<OpLagDiffSpec>(OperationOp.LagDiff, { orderField, order, group, chartId })
  },

  pairDiff(
    by: string | undefined,
    groupA: string,
    groupB: string,
    seriesField?: string,
    field?: string,
    signed?: boolean,
    absolute?: boolean,
    precision?: number,
    group?: string | null,
    chartId?: string,
    keyField?: string,
  ): OpPairDiffSpec {
    return buildDataOp<OpPairDiffSpec>(OperationOp.PairDiff, {
      by,
      groupA,
      groupB,
      seriesField,
      field,
      signed,
      absolute,
      precision,
      group,
      chartId,
      keyField,
    })
  },

  nth(
    n: number,
    from?: NthFrom,
    orderField?: string,
    group?: string | null,
    chartId?: string,
  ): OpNthSpec {
    return buildDataOp<OpNthSpec>(OperationOp.Nth, { n, from, orderField, group, chartId })
  },

  count(field?: string, group?: string | null, chartId?: string): OpCountSpec {
    return buildDataOp<OpCountSpec>(OperationOp.Count, { field, group, chartId })
  },

  add(
    targetA: OpAddSpec['targetA'],
    targetB: OpAddSpec['targetB'],
    field?: string,
    group?: string | null,
    chartId?: string,
  ): OpAddSpec {
    return buildDataOp<OpAddSpec>(OperationOp.Add, { targetA, targetB, field, group, chartId })
  },

  scale(
    target: OpScaleSpec['target'],
    factor: number,
    field?: string,
    group?: string | null,
    chartId?: string,
  ): OpScaleSpec {
    return buildDataOp<OpScaleSpec>(OperationOp.Scale, { target, factor, field, group, chartId })
  },

  setOp(fn: OpSetOpSpec['fn'], group?: string | null, chartId?: string): OpSetOpSpec {
    return buildDataOp<OpSetOpSpec>(OperationOp.SetOp, { fn, group, chartId })
  },
}

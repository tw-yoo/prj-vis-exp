import { dataOps } from '../dataOpsBuilder'
import type { TargetSelector } from '../../../types'
import type {
  OpCompareBoolSpec,
  OpCompareSpec,
  OpCountSpec,
  OpDetermineRangeSpec,
  OpDiffSpec,
  OpFilterSpec,
  OpFindExtremumSpec,
  OpLagDiffSpec,
  OpNthSpec,
  OpRetrieveValueSpec,
  OpSortSpec,
  OpSumSpec,
} from '../../../types/operationSpecs'

type ComparisonOperator = NonNullable<OpFilterSpec['operator']>
type SortOrder = NonNullable<OpSortSpec['order']>
type ExtremumWhich = OpFindExtremumSpec['which']
type NthFrom = OpNthSpec['from']

export const dataActions = {
  retrieveValue(
    target: TargetSelector | TargetSelector[],
    field?: string,
    precision?: number,
    group?: string | null,
    chartId?: string,
  ): OpRetrieveValueSpec {
    return dataOps.retrieveValue({ target, field, precision, group, chartId })
  },

  filterByComparison(
    operator: ComparisonOperator,
    value: OpFilterSpec['value'],
    field?: string,
    group?: string | null,
    chartId?: string,
  ): OpFilterSpec {
    return dataOps.filter({ operator, value, field, group, chartId })
  },

  filterInclude(
    values: Array<string | number>,
    field?: string,
    group?: string | null,
    chartId?: string,
  ): OpFilterSpec {
    return dataOps.filter({ include: [...values], field, group, chartId })
  },

  filterExclude(
    values: Array<string | number>,
    field?: string,
    group?: string | null,
    chartId?: string,
  ): OpFilterSpec {
    return dataOps.filter({ exclude: [...values], field, group, chartId })
  },

  findExtremum(which: ExtremumWhich, field?: string, group?: string | null, chartId?: string): OpFindExtremumSpec {
    return dataOps.findExtremum({ which, field, group, chartId })
  },

  determineRange(field?: string, group?: string | null, chartId?: string): OpDetermineRangeSpec {
    return dataOps.determineRange({ field, group, chartId })
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
    return dataOps.compare({ targetA, targetB, field, groupA, groupB, which, chartId })
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
    return dataOps.compareBool({ targetA, targetB, operator, field, groupA, groupB, chartId })
  },

  sort(field?: string, order?: SortOrder, group?: string | null, chartId?: string): OpSortSpec {
    return dataOps.sort({ field, order, group, chartId })
  },

  sum(field: string, group?: string | null, chartId?: string): OpSumSpec {
    return dataOps.sum({ field, group, chartId })
  },

  average(field: string, group?: string | null, chartId?: string) {
    return dataOps.average({ field, group, chartId })
  },

  diff(
    targetA: TargetSelector | TargetSelector[],
    targetB: TargetSelector | TargetSelector[],
    field?: string,
    signed?: boolean,
    precision?: number,
    chartId?: string,
  ): OpDiffSpec {
    return dataOps.diff({ targetA, targetB, field, signed, precision, chartId })
  },

  lagDiff(orderField: string, order?: SortOrder, group?: string | null, chartId?: string): OpLagDiffSpec {
    return dataOps.lagDiff({ orderField, order, group, chartId })
  },

  nth(
    n: number,
    from?: NthFrom,
    orderField?: string,
    group?: string | null,
    chartId?: string,
  ): OpNthSpec {
    return dataOps.nth({ n, from, orderField, group, chartId })
  },

  count(field?: string, group?: string | null, chartId?: string): OpCountSpec {
    return dataOps.count({ field, group, chartId })
  },

  sleep(seconds: number, chartId?: string) {
    return dataOps.sleep({ seconds, chartId })
  },
}

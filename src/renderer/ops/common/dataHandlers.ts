import type { DatumValue, OperationSpec } from '../../../types'
import { OperationOp } from '../../../types'
import {
  retrieveValue,
  filterData,
  findExtremum,
  sortData,
  sumData,
  averageData,
  diffData,
  lagDiffData,
  nthData,
  compareOp,
  compareBoolOp,
  countData,
  determineRange,
} from '../../../logic/dataOps'

export const STANDARD_DATA_OP_HANDLERS: Record<string, (data: DatumValue[], op: OperationSpec) => DatumValue[]> = {
  [OperationOp.RetrieveValue]: retrieveValue,
  [OperationOp.Filter]: filterData,
  [OperationOp.FindExtremum]: findExtremum,
  [OperationOp.DetermineRange]: determineRange,
  [OperationOp.Compare]: compareOp,
  [OperationOp.CompareBool]: compareBoolOp,
  [OperationOp.Sort]: sortData,
  [OperationOp.Sum]: sumData,
  [OperationOp.Average]: averageData,
  [OperationOp.Diff]: diffData,
  [OperationOp.LagDiff]: lagDiffData,
  [OperationOp.Nth]: nthData,
  [OperationOp.Count]: countData,
}


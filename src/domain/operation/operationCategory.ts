import { OperationOp, type OperationOp as OperationName } from './types/operationNames'

/** Classifies operations by how they transform data semantics for planning. */
export type OperationCategory =
  | 'passthrough'
  | 'aggregate'
  | 'binary'
  | 'series-transform'
  | 'arithmetic'
  | 'set-op'
  | 'meta'

export const OPERATION_CATEGORY = {
  [OperationOp.RetrieveValue]: 'passthrough',
  [OperationOp.Filter]: 'passthrough',
  [OperationOp.FindExtremum]: 'passthrough',
  [OperationOp.Sort]: 'passthrough',
  [OperationOp.Nth]: 'passthrough',
  [OperationOp.Sum]: 'aggregate',
  [OperationOp.Average]: 'aggregate',
  [OperationOp.Count]: 'aggregate',
  [OperationOp.Diff]: 'binary',
  [OperationOp.DiffByValue]: 'binary',
  [OperationOp.CompareBool]: 'binary',
  [OperationOp.LagDiff]: 'series-transform',
  [OperationOp.PairDiff]: 'series-transform',
  [OperationOp.Add]: 'arithmetic',
  [OperationOp.Scale]: 'arithmetic',
  [OperationOp.SetOp]: 'set-op',
  [OperationOp.Sleep]: 'meta',
  [OperationOp.Draw]: 'meta',
} satisfies Record<OperationName, OperationCategory>

export function getOperationCategory(opName: OperationName | string | undefined): OperationCategory {
  return OPERATION_CATEGORY[opName as OperationName] ?? 'meta'
}

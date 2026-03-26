import { OperationOp } from '../operation/types'
import { NlpOperations, type NlpOperation } from './types'

const NLP_TO_OPERATION = {
  [NlpOperations.RetrieveValue]: OperationOp.RetrieveValue,
  [NlpOperations.Filter]: OperationOp.Filter,
  [NlpOperations.ArgMax]: OperationOp.FindExtremum,
  [NlpOperations.ArgMin]: OperationOp.FindExtremum,
  [NlpOperations.AggregateSum]: OperationOp.Sum,
  [NlpOperations.AggregateAverage]: OperationOp.Average,
  [NlpOperations.MathDiff]: OperationOp.Diff,
  [NlpOperations.DetermineRange]: OperationOp.DetermineRange,
  [NlpOperations.Compare]: OperationOp.Compare,
  [NlpOperations.CompareBool]: OperationOp.CompareBool,
  [NlpOperations.Sort]: OperationOp.Sort,
  [NlpOperations.LagDiff]: OperationOp.LagDiff,
  [NlpOperations.Nth]: OperationOp.Nth,
  [NlpOperations.Count]: OperationOp.Count,
} as const satisfies Record<NlpOperation, (typeof OperationOp)[keyof typeof OperationOp]>

const aliases: Record<string, NlpOperation> = {
  RETRIEVEVALUE: NlpOperations.RetrieveValue,
  RETRIEVE_VALUE: NlpOperations.RetrieveValue,
  LOOKUP: NlpOperations.RetrieveValue,
  FILTER: NlpOperations.Filter,
  ARGMAX: NlpOperations.ArgMax,
  ARG_MIN: NlpOperations.ArgMin,
  ARGMIN: NlpOperations.ArgMin,
  AGG_SUM: NlpOperations.AggregateSum,
  SUM: NlpOperations.AggregateSum,
  AGG_AVG: NlpOperations.AggregateAverage,
  AVG: NlpOperations.AggregateAverage,
  AVERAGE: NlpOperations.AggregateAverage,
  MATH_DIFF: NlpOperations.MathDiff,
  DIFF: NlpOperations.MathDiff,
  DETERMINE_RANGE: NlpOperations.DetermineRange,
  RANGE: NlpOperations.DetermineRange,
  COMPARE: NlpOperations.Compare,
  COMPARE_BOOL: NlpOperations.CompareBool,
  SORT: NlpOperations.Sort,
  LAG_DIFF: NlpOperations.LagDiff,
  LAGDIFF: NlpOperations.LagDiff,
  NTH: NlpOperations.Nth,
  COUNT: NlpOperations.Count,
}

export function toCanonicalNlpOperation(raw: string): NlpOperation | null {
  const normalized = raw.trim().toUpperCase().replace(/\s+/g, '_')
  return aliases[normalized] ?? null
}

export function mapNlpOperationToOperationOp(raw: string) {
  const canonical = toCanonicalNlpOperation(raw)
  if (!canonical) return null
  return NLP_TO_OPERATION[canonical]
}

export function isArgExtremumOperation(raw: string) {
  const canonical = toCanonicalNlpOperation(raw)
  return canonical === NlpOperations.ArgMax || canonical === NlpOperations.ArgMin
}


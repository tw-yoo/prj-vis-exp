export const OperationOp = {
  Draw: 'draw',
  RetrieveValue: 'retrieveValue',
  Filter: 'filter',
  FindExtremum: 'findExtremum',
  CompareBool: 'compareBool',
  DiffByValue: 'diffByValue',
  Sort: 'sort',
  Sum: 'sum',
  Average: 'average',
  Diff: 'diff',
  LagDiff: 'lagDiff',
  PairDiff: 'pairDiff',
  Nth: 'nth',
  Count: 'count',
  Add: 'add',
  Scale: 'scale',
  Sleep: 'sleep',
  // Derived-pattern ops introduced for richer explanation → spec coverage.
  // - Range:         max − min spread (one DatumValue with {value, max, min}).
  // - RollingWindow: sliding-window aggregate (sum/avg/min/max).
  // - MonotonicRun:  longest / firstBreak / all strictly monotonic runs along
  //                  an ordered axis.
  Range: 'range',
  RollingWindow: 'rollingWindow',
  MonotonicRun: 'monotonicRun',
} as const

export type OperationOp = (typeof OperationOp)[keyof typeof OperationOp]

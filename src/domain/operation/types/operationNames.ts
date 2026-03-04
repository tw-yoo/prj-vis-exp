export const OperationOp = {
  Draw: 'draw',
  RetrieveValue: 'retrieveValue',
  Filter: 'filter',
  FindExtremum: 'findExtremum',
  DetermineRange: 'determineRange',
  Compare: 'compare',
  CompareBool: 'compareBool',
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
  SetOp: 'setOp',
  Sleep: 'sleep',
} as const

export type OperationOp = (typeof OperationOp)[keyof typeof OperationOp]

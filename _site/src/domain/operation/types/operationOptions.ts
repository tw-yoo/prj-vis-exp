export const SortByOptions = ['x', 'y'] as const
export const SortOrderOptions = ['asc', 'desc'] as const
export const SplitByOptions = ['x'] as const
export const SplitOrientationOptions = ['vertical', 'horizontal'] as const
export const ExtremumWhichOptions = ['min', 'max'] as const
export const NthFromOptions = ['left', 'right'] as const
export const DiffModeOptions = ['difference', 'ratio'] as const
export const AggregateOptions = ['sum', 'avg', 'min', 'max', 'percentage_of_total', 'percent_of_total'] as const

export const ComparisonOperatorOptions = [
  'gt',
  'gte',
  'lt',
  'lte',
  '>',
  '>=',
  '<',
  '<=',
] as const

export const ComparisonOperatorExtendedOptions = [
  ...ComparisonOperatorOptions,
  '==',
  '!=',
  'eq',
  'in',
  'not-in',
  'contains',
] as const

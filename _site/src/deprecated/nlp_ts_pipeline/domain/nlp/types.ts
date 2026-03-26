import type { JsonValue, OperationSpec } from '../operation/types'
import type { VegaLiteSpec } from '../chart'

export const NlpOperations = {
  RetrieveValue: 'RETRIEVE_VALUE',
  Filter: 'FILTER',
  ArgMax: 'ARGMAX',
  ArgMin: 'ARGMIN',
  AggregateSum: 'AGG_SUM',
  AggregateAverage: 'AGG_AVG',
  MathDiff: 'MATH_DIFF',
  DetermineRange: 'DETERMINE_RANGE',
  Compare: 'COMPARE',
  CompareBool: 'COMPARE_BOOL',
  Sort: 'SORT',
  LagDiff: 'LAG_DIFF',
  Nth: 'NTH',
  Count: 'COUNT',
} as const

export type NlpOperation = (typeof NlpOperations)[keyof typeof NlpOperations]

export type LambdaStep = {
  step: number
  operation: NlpOperation | string
  target?: string | null
  target_a?: string | null
  target_b?: string | null
  group?: string | null
  group_by?: string | null
  condition?: string | null
  output_variable?: string | null
  input_variable?: string | null
  field?: string | null
  value?: JsonValue
  operator?: string | null
  which?: 'max' | 'min' | string | null
  order?: 'asc' | 'desc' | string | null
  order_field?: string | null
  n?: number | null
  from?: 'left' | 'right' | string | null
  from_?: 'left' | 'right' | string | null
  mode?: 'difference' | 'ratio' | string | null
  signed?: boolean | null
  aggregate?: string | null
  precision?: number | null
  branch?: string | null
}

export type SyntaxToken = {
  id: number
  text: string
  lemma?: string | null
  upos?: string | null
  head?: number | null
  deprel?: string | null
}

export type SyntaxFeature = {
  sentence_index: number
  text: string
  root_action?: string
  target_hint?: string | null
  condition_hint?: string | null
  mark_terms?: string[]
  descriptive_terms?: string[]
  visual_attribute_terms?: string[]
  visual_operation_terms?: string[]
  tokens?: SyntaxToken[]
}

export type RewriteTraceStep = {
  step: string
  before: string
  after: string
}

export type ParseTrace = {
  syntax_features?: SyntaxFeature[]
  mark_terms?: string[]
  visual_terms?: string[]
  rewrite_trace?: RewriteTraceStep[]
}

export type GenerateLambdaResponse = {
  resolved_text: string
  lambda_expression: LambdaStep[]
  ops_spec?: Record<string, OperationSpec[]>
  syntax_features?: SyntaxFeature[]
  mark_terms?: string[]
  visual_terms?: string[]
  rewrite_trace?: RewriteTraceStep[]
  warnings?: string[]
}

export type ChartContext = {
  spec: VegaLiteSpec
  xField?: string
  yField?: string
  seriesField?: string
  fields: string[]
  targets: string[]
  series: string[]
  values: string[]
}

export type OpsGroupSpec = {
  ops: OperationSpec[]
  [groupName: string]: OperationSpec[]
}

export type ParseToOpsWarnings = string[]

export type ParseToOpsResult = {
  resolvedText: string
  lambdaExpression: LambdaStep[]
  opsSpec: OpsGroupSpec
  trace: ParseTrace
  warnings: ParseToOpsWarnings
}

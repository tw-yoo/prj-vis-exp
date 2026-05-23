// Op × chart-type applicability matrix. Source of truth: APPLIERS arrays in
// src/operation-new/run{ChartType}.ts. Manually mirrored here so the web page
// can import without crossing the engine boundary.

export type ChartTypeKey =
  | 'bar_simple'
  | 'bar_grouped'
  | 'bar_stacked'
  | 'line_simple'
  | 'line_multiple'

export const CHART_TYPES: ChartTypeKey[] = [
  'bar_simple',
  'line_simple',
  'line_multiple',
  'bar_grouped',
  'bar_stacked',
]

export const CHART_TYPE_LABELS: Record<ChartTypeKey, string> = {
  bar_simple: 'Simple bar',
  bar_grouped: 'Grouped bar',
  bar_stacked: 'Stacked bar',
  line_simple: 'Simple line',
  line_multiple: 'Multiple line',
}

const APPLIES: Record<string, ChartTypeKey[]> = {
  retrieveValue: ['bar_simple', 'line_simple', 'line_multiple'],
  filter: ['bar_simple', 'line_simple', 'line_multiple', 'bar_grouped', 'bar_stacked'],
  diff: ['bar_simple', 'line_simple', 'line_multiple', 'bar_grouped', 'bar_stacked'],
  diffByValue: ['bar_simple'],
  average: ['bar_simple', 'line_simple', 'line_multiple', 'bar_grouped', 'bar_stacked'],
  findExtremum: ['bar_simple', 'line_simple', 'line_multiple'],
  sort: ['bar_simple'],
  lagDiff: ['line_simple', 'line_multiple'],
  pairDiff: ['line_multiple'],
  draw: ['bar_grouped', 'bar_stacked'],
  // Data-layer-only ops apply to no chart visually.
  sum: [],
  count: [],
  nth: [],
  add: [],
  scale: [],
  compareBool: [],
}

export function appliesTo(op: string): ChartTypeKey[] {
  return APPLIES[op] ?? []
}

export function isVisualOp(op: string): boolean {
  return appliesTo(op).length > 0
}

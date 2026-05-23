// Op-level documentation: category + summary + body. Hand-authored because
// .ops_schema.json has all description fields set to null, and dataOps.ts only
// carries one-line JSDoc.

export type OpCategory =
  | 'selection'
  | 'reduce'
  | 'aggregate'
  | 'diff'
  | 'arithmetic'
  | 'visual'

export type OpDoc = {
  op: string
  label: string
  category: OpCategory
  /** One-liner shown right under the title. */
  summary: string
  /** 1-2 short paragraphs explaining behavior + edge cases. */
  body: string
  /** What the op produces — used to caption the result. */
  outputKind: 'array' | 'scalar' | 'datum' | 'visual'
  /** True when no visual applier exists; only data-layer logic runs. */
  dataLayerOnly?: boolean
}

export const CATEGORY_LABELS: Record<OpCategory, string> = {
  selection: 'Selection',
  reduce: 'Reduce',
  aggregate: 'Aggregate',
  diff: 'Diff & Compare',
  arithmetic: 'Arithmetic',
  visual: 'Visual',
}

export const CATEGORY_ORDER: OpCategory[] = [
  'selection',
  'reduce',
  'aggregate',
  'diff',
  'arithmetic',
  'visual',
]

export const CATEGORY_COLORS: Record<OpCategory, string> = {
  selection: '#14b8a6',
  reduce: '#a855f7',
  aggregate: '#3b82f6',
  diff: '#ef4444',
  arithmetic: '#64748b',
  visual: '#f59e0b',
}

export const OP_DOCS: OpDoc[] = [
  {
    op: 'retrieveValue',
    label: 'Retrieve Value',
    category: 'selection',
    summary: 'Pick rows that match a category value, field, and optional series.',
    body:
      'Selects the datum(s) whose field equals the given target. Use it to highlight a specific point/bar so its value label appears. On multi-series charts, pass a group to scope the lookup to one series.',
    outputKind: 'datum',
  },
  {
    op: 'findExtremum',
    label: 'Find Extremum',
    category: 'selection',
    summary: 'Find the minimum or maximum value in the (optionally grouped) field.',
    body:
      'Scans the working data for the smallest or largest value and emits that single datum. On multi-series charts, pass a group to find the extremum within just that series.',
    outputKind: 'datum',
  },
  {
    op: 'nth',
    label: 'Nth',
    category: 'selection',
    summary: 'Pick the n-th item from a list, counting from the left or right.',
    body:
      'After (optional) ordering by orderField, returns the n-th row (1-based). `from: "right"` counts from the end. Currently data-layer only — no visual applier yet.',
    outputKind: 'datum',
    dataLayerOnly: true,
  },

  {
    op: 'filter',
    label: 'Filter',
    category: 'reduce',
    summary: 'Drop rows that don\'t match the operator/value or include/exclude list.',
    body:
      'Supports comparison operators (gt, gte, lt, lte, ==, !=, in, not-in, contains) and explicit include/exclude allow-lists. Non-matching marks fade out; the axis may rescale to fit the remaining data. Pass a group to scope the filter to one series.',
    outputKind: 'array',
  },
  {
    op: 'sort',
    label: 'Sort',
    category: 'reduce',
    summary: 'Reorder rows by a field in ascending or descending order.',
    body:
      'Reorders the working data. On bar charts the visual applier slides the bars into the new order; on other chart types this is data-layer only.',
    outputKind: 'array',
  },
  {
    op: 'average',
    label: 'Average',
    category: 'aggregate',
    summary: 'Compute the mean of a numeric field (optionally per group).',
    body:
      'Returns a single scalar. The visual applier draws a reference line at the average and labels it. If you pass a group, the mean is taken only within that series.',
    outputKind: 'scalar',
  },
  {
    op: 'sum',
    label: 'Sum',
    category: 'aggregate',
    summary: 'Add up all values in a numeric field (optionally per group).',
    body:
      'Returns a single scalar. Data-layer only — typically used as input to another op (e.g. diff) rather than drawn directly.',
    outputKind: 'scalar',
    dataLayerOnly: true,
  },
  {
    op: 'count',
    label: 'Count',
    category: 'aggregate',
    summary: 'Count the number of rows (optionally within a group).',
    body:
      'Returns a single scalar — the row count. Data-layer only; useful as a building block for other ops.',
    outputKind: 'scalar',
    dataLayerOnly: true,
  },

  {
    op: 'diff',
    label: 'Diff',
    category: 'diff',
    summary: 'Compute the difference (or ratio) between two specific targets.',
    body:
      'Pick targetA and targetB (category values, or upstream refs via "ref:n*"). The default mode is "difference" (B − A); "ratio" returns B/A. `signed: false` returns the absolute value. The visual applier draws a vertical arrow between the two points.',
    outputKind: 'scalar',
  },
  {
    op: 'diffByValue',
    label: 'Diff By Value',
    category: 'diff',
    summary: 'For each row, compute the delta against a single reference value.',
    body:
      'Returns one row per input — each row\'s value becomes (row − reference). On simple bar charts the visual applier replaces each bar height with its delta and shows a baseline at the reference.',
    outputKind: 'array',
  },
  {
    op: 'lagDiff',
    label: 'Lag Diff',
    category: 'diff',
    summary: 'Consecutive differences across an ordered sequence (e.g., year-over-year).',
    body:
      'After ordering by orderField (typically a time/year column), emits one row per adjacent pair: value[i] − value[i-1]. `absolute: true` drops the sign. On line charts the visual applier draws arrows between consecutive points and labels each delta.',
    outputKind: 'array',
  },
  {
    op: 'pairDiff',
    label: 'Pair Diff',
    category: 'diff',
    summary: 'Key-wise difference between two series (groupA vs groupB).',
    body:
      'For each key (e.g., Year) present in both groupA and groupB, emits (B − A). The visual applier on multi-line charts draws an arrow between the two series at each shared key.',
    outputKind: 'array',
  },
  {
    op: 'compareBool',
    label: 'Compare Bool',
    category: 'diff',
    summary: 'Evaluate a boolean comparison between two targets — returns 0 or 1.',
    body:
      'Looks up targetA and targetB, then runs the operator (gt, lt, ==, etc.) between their values. Returns a single scalar 1 (true) or 0 (false). Data-layer only.',
    outputKind: 'scalar',
    dataLayerOnly: true,
  },

  {
    op: 'add',
    label: 'Add',
    category: 'arithmetic',
    summary: 'Sum two targets (looked up by value).',
    body:
      'Resolves targetA and targetB (literal category labels or upstream refs) and returns A + B as a single scalar. Data-layer only.',
    outputKind: 'scalar',
    dataLayerOnly: true,
  },
  {
    op: 'scale',
    label: 'Scale',
    category: 'arithmetic',
    summary: 'Multiply a target by a numeric factor.',
    body:
      'Returns target × factor as a single scalar. Useful for unit conversion or building a scaled reference value. Data-layer only.',
    outputKind: 'scalar',
    dataLayerOnly: true,
  },

  {
    op: 'draw',
    label: 'Draw',
    category: 'visual',
    summary: 'Author-driven visual annotation (highlight / shape / text overlay).',
    body:
      'Used by the authoring tools rather than as part of the standard QA pipeline. The select clause picks a chart element and style describes the visual treatment.',
    outputKind: 'visual',
    dataLayerOnly: true,
  },
]

export function getOpDoc(op: string): OpDoc | undefined {
  return OP_DOCS.find((d) => d.op === op)
}

export function getOpsByCategory(category: OpCategory): OpDoc[] {
  return OP_DOCS.filter((d) => d.category === category)
}

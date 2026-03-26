import { OperationOp, type DatumValue, type TargetSelector } from './types'

export type SemanticLabel = {
  shortLabel: string
  longLabel: string
  compactLabel: string
}

export type AggregateSemanticKind = 'average' | 'sum' | 'count' | 'minimum' | 'maximum' | 'range'
export type BinarySemanticKind = 'difference' | 'comparison' | 'sum'

const DEFAULT_LIST_LIMIT = 3

function normalizeText(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''
}

function uniqueTexts(values: Array<string | number | null | undefined>): string[] {
  return Array.from(
    new Set(values.map((value) => normalizeText(value)).filter((value) => value.length > 0)),
  )
}

function isSyntheticTarget(value: string) {
  return value.startsWith('__')
}

export function compactSemanticList(values: Array<string | number>, maxItems = DEFAULT_LIST_LIMIT): string {
  const normalized = uniqueTexts(values)
  if (normalized.length === 0) return ''
  if (normalized.length <= maxItems) return normalized.join(', ')
  return `${normalized.slice(0, maxItems).join(', ')}, ...`
}

export function withDefiniteArticle(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return trimmed
  return /^the\s+/i.test(trimmed) ? trimmed : `the ${trimmed}`
}

export function withoutDefiniteArticle(value: string): string {
  return value.replace(/^the\s+/i, '').trim()
}

export function buildSemanticLabel(shortLabel: string): SemanticLabel {
  const normalized = withoutDefiniteArticle(shortLabel)
  return {
    shortLabel: normalized,
    longLabel: withDefiniteArticle(normalized),
    compactLabel: normalized,
  }
}

export function readableTargetsFromRows(rows: DatumValue[]): string[] {
  return uniqueTexts(
    rows
      .map((row) => normalizeText(row.target))
      .filter((target) => target.length > 0 && !isSyntheticTarget(target)),
  )
}

export function readableTargetsFromSelector(
  selector: TargetSelector | TargetSelector[] | undefined,
): string[] {
  if (selector == null) return []
  if (Array.isArray(selector)) {
    return uniqueTexts(selector.flatMap((entry) => readableTargetsFromSelector(entry)))
  }
  if (typeof selector === 'string') {
    if (selector.startsWith('ref:')) return []
    return uniqueTexts([selector])
  }
  if (typeof selector === 'number') {
    return uniqueTexts([selector])
  }
  const target = selector.target ?? selector.category
  const normalized = normalizeText(target)
  if (!normalized || normalized.startsWith('ref:')) return []
  return uniqueTexts([normalized])
}

export function buildValuesLabelFromTargets(
  targets: Array<string | number>,
  opts: { article?: boolean } = {},
): string {
  const compact = compactSemanticList(targets)
  if (!compact) {
    return opts.article ? 'the selected values' : 'selected values'
  }
  const base = uniqueTexts(targets).length === 1 ? `value of ${compact}` : `values for ${compact}`
  return opts.article ? withDefiniteArticle(base) : base
}

export function buildValuesLabelFromRows(rows: DatumValue[], opts: { article?: boolean } = {}): string | null {
  const targets = readableTargetsFromRows(rows)
  if (targets.length === 0) return null
  return buildValuesLabelFromTargets(targets, opts)
}

export function buildAggregateLabel(
  kind: AggregateSemanticKind,
  subject: string,
  opts: { article?: boolean } = {},
): string {
  const normalizedSubject = withoutDefiniteArticle(subject) || 'selected values'
  const noun =
    kind === 'average'
      ? 'average'
      : kind === 'sum'
        ? 'sum'
        : kind === 'count'
          ? 'count'
          : kind === 'minimum'
            ? 'minimum'
            : kind === 'maximum'
              ? 'maximum'
              : 'range'
  const base = `${noun} of ${normalizedSubject}`
  return opts.article ? withDefiniteArticle(base) : base
}

export function buildBinaryLabel(
  kind: BinarySemanticKind,
  left: string,
  right: string,
  opts: { article?: boolean } = {},
): string {
  const normalizedLeft = withoutDefiniteArticle(left) || 'the previous result'
  const normalizedRight = withoutDefiniteArticle(right) || 'the previous result'
  const noun = kind === 'difference' ? 'difference' : kind === 'comparison' ? 'comparison' : 'sum'
  const base =
    kind === 'sum'
      ? `${noun} of ${normalizedLeft} and ${normalizedRight}`
      : `${noun} between ${normalizedLeft} and ${normalizedRight}`
  return opts.article ? withDefiniteArticle(base) : base
}

export function buildScaledLabel(subject: string, opts: { article?: boolean } = {}): string {
  const normalizedSubject = withoutDefiniteArticle(subject) || 'the previous result'
  const base = `scaled value of ${normalizedSubject}`
  return opts.article ? withDefiniteArticle(base) : base
}

export function buildOrdinalLabel(rank: number, subject: string, opts: { article?: boolean } = {}): string {
  const normalizedSubject = withoutDefiniteArticle(subject) || 'selected values'
  const base = `${ordinal(rank)} value of ${normalizedSubject}`
  return opts.article ? withDefiniteArticle(base) : base
}

export function buildOperationResultLabel(args: {
  opName: string | undefined
  subject?: string | null
  left?: string | null
  right?: string | null
  factor?: number | null
  rank?: number | null
}): SemanticLabel | null {
  const { opName, subject, left, right, rank } = args
  const cleanSubject = subject ? withoutDefiniteArticle(subject) : ''
  const cleanLeft = left ? withoutDefiniteArticle(left) : ''
  const cleanRight = right ? withoutDefiniteArticle(right) : ''
  let shortLabel = ''

  switch (opName) {
    case OperationOp.RetrieveValue:
      shortLabel = cleanSubject ? buildValuesLabelFromTargets([cleanSubject]) : 'selected value'
      break
    case OperationOp.Filter:
      shortLabel = cleanSubject ? `values for ${cleanSubject}` : 'filtered values'
      break
    case OperationOp.Average:
      shortLabel = buildAggregateLabel('average', cleanSubject || 'selected values')
      break
    case OperationOp.Sum:
      shortLabel = buildAggregateLabel('sum', cleanSubject || 'selected values')
      break
    case OperationOp.Count:
      shortLabel = buildAggregateLabel('count', cleanSubject || 'selected values')
      break
    case OperationOp.FindExtremum:
      shortLabel = buildAggregateLabel('maximum', cleanSubject || 'selected values')
      break
    case OperationOp.DetermineRange:
      shortLabel = buildAggregateLabel('range', cleanSubject || 'selected values')
      break
    case OperationOp.Diff:
      shortLabel = buildBinaryLabel('difference', cleanLeft || 'previous result', cleanRight || 'previous result')
      break
    case OperationOp.Compare:
    case OperationOp.CompareBool:
      shortLabel = buildBinaryLabel('comparison', cleanLeft || 'previous result', cleanRight || 'previous result')
      break
    case OperationOp.Add:
      shortLabel = buildBinaryLabel('sum', cleanLeft || 'previous result', cleanRight || 'previous result')
      break
    case OperationOp.Scale:
      shortLabel = buildScaledLabel(cleanSubject || 'previous result')
      break
    case OperationOp.Nth:
      shortLabel = Number.isFinite(rank ?? NaN)
        ? buildOrdinalLabel(Number(rank), cleanSubject || 'selected values')
        : 'selected value'
      break
    default:
      return null
  }

  return buildSemanticLabel(shortLabel)
}

function ordinal(value: number) {
  const mod100 = value % 100
  if (mod100 >= 11 && mod100 <= 13) return `${value}th`
  const mod10 = value % 10
  if (mod10 === 1) return `${value}st`
  if (mod10 === 2) return `${value}nd`
  if (mod10 === 3) return `${value}rd`
  return `${value}th`
}

import { OperationOp, type DatumValue, type JsonValue, type OperationSpec, type TargetSelector } from '../domain/operation/types'
import {
  buildAggregateLabel,
  buildBinaryLabel,
  buildOrdinalLabel,
  buildScaledLabel,
  buildValuesLabelFromTargets,
  compactSemanticList,
} from '../domain/operation/semanticLabels'
import { refKeyFromScalarValue, resolveFilterRefThresholdFromResults } from '../domain/operation/dataOps'
import type { LogicalExecutionArtifacts, NodeResultKind } from './visual-derived-chart'
import type { VisualExecutionStep } from './nlp-ops'
import { drawSummaryTextBox } from '../operation-new/primitives/drawSummaryTextBox'

export type OperandPhraseContext = {
  mode: 'bare-entity' | 'value' | 'summary'
}

export type SentenceSummaryText = {
  initialText: string
  finalText?: string
  refineOnNodeIds?: string[]
}

export type SummaryGenerationContext = {
  step: VisualExecutionStep
  logicalArtifacts: LogicalExecutionArtifacts | null
}

function opNodeId(op: OperationSpec, fallbackIndex: number): string {
  const metaNodeId = typeof op.meta?.nodeId === 'string' ? op.meta.nodeId.trim() : ''
  if (metaNodeId) return metaNodeId
  const opId = typeof (op as { id?: unknown }).id === 'string' ? String((op as { id?: string }).id ?? '').trim() : ''
  if (opId) return opId
  return `__summary_${fallbackIndex}`
}

function inputNodeIds(op: OperationSpec): string[] {
  return (Array.isArray(op.meta?.inputs) ? op.meta.inputs : [])
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => value.trim())
}

function lowerFirst(value: string) {
  return value.length > 0 ? `${value[0].toLowerCase()}${value.slice(1)}` : value
}

function joinPhrases(values: string[]) {
  if (values.length === 0) return 'the selected values'
  if (values.length === 1) return values[0]
  if (values.length === 2) return `${values[0]} and ${values[1]}`
  return `${values.slice(0, -1).join(', ')}, and ${values[values.length - 1]}`
}

function joinClauses(values: string[]) {
  if (values.length === 0) return ''
  if (values.length === 1) return values[0]
  return values
    .map((value, index) => (index === 0 ? value : lowerFirst(value)))
    .join('; then ')
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

function selectorNodeId(selector: TargetSelector | TargetSelector[] | undefined): string | null {
  if (Array.isArray(selector)) return selectorNodeId(selector[0])
  if (typeof selector === 'string') {
    if (selector.startsWith('ref:')) return selector.slice(4).trim() || null
    return null
  }
  if (typeof selector === 'number' || selector == null) return null
  const id = selector.id
  if (typeof id === 'string') {
    if (id.startsWith('ref:')) return id.slice(4).trim() || null
    if (/^n\d+$/i.test(id.trim())) return id.trim()
  }
  return null
}

function operandKind(
  selector: TargetSelector | TargetSelector[] | undefined,
  artifacts: LogicalExecutionArtifacts | null,
): NodeResultKind | 'source-backed' | null {
  if (Array.isArray(selector)) return operandKind(selector[0], artifacts)
  const nodeId = selectorNodeId(selector)
  if (nodeId) {
    return nodeKind(nodeId, artifacts)
  }
  const literal = firstSelectorTarget(selector)
  return literal ? 'source-backed' : null
}

function selectorTarget(selector: TargetSelector | undefined): string | null {
  if (selector == null) return null
  if (typeof selector === 'string' || typeof selector === 'number') {
    if (typeof selector === 'string' && selector.startsWith('ref:')) return null
    const value = String(selector).trim()
    return value.length > 0 ? value : null
  }
  const target =
    selector.target != null
      ? String(selector.target)
      : selector.category != null
        ? String(selector.category)
        : typeof selector.id === 'string' && !selector.id.startsWith('ref:')
          ? String(selector.id)
          : null
  return target && target.trim().length > 0 ? target.trim() : null
}

function firstSelectorTarget(selector: TargetSelector | TargetSelector[] | undefined): string | null {
  if (Array.isArray(selector)) return firstSelectorTarget(selector[0])
  return selectorTarget(selector)
}

function extractSourceTargetsFromSelectors(
  selectors: TargetSelector | TargetSelector[] | null | undefined,
): string[] {
  if (!selectors) return []
  const list = Array.isArray(selectors) ? selectors : [selectors]
  return list
    .map((selector) => selectorTarget(selector))
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
}

function resultTarget(rows: DatumValue[] | undefined): string | null {
  const first = rows?.find((row) => typeof row.target === 'string' && row.target.trim().length > 0)
  return first ? String(first.target) : null
}

function nodeKind(nodeId: string, artifacts: LogicalExecutionArtifacts | null): NodeResultKind | null {
  return artifacts?.nodeKinds.get(nodeId) ?? null
}

function sourceBackedPhrase(
  nodeId: string,
  mode: OperandPhraseContext['mode'],
  artifacts: LogicalExecutionArtifacts | null,
): string | null {
  const selectors = artifacts?.nodeSourceSelectors.get(nodeId) ?? null
  const targets = extractSourceTargetsFromSelectors(selectors)
  if (targets.length === 0) return null
  if (mode === 'bare-entity') return compactSemanticList(targets)
  return buildValuesLabelFromTargets(targets, { article: true })
}

function aggregateSubjectPhrase(args: {
  op: OperationSpec
  artifacts: LogicalExecutionArtifacts | null
  seen: Set<string>
}) {
  const { op, artifacts, seen } = args
  const inputs = inputNodeIds(op)
  if (inputs.length > 0) {
    return phraseFromInputNodeIds({
      nodeIds: inputs,
      mode: 'bare-entity',
      artifacts,
      seen,
    })
  }
  const nodeId = typeof op.meta?.nodeId === 'string' ? op.meta.nodeId.trim() : ''
  if (nodeId) {
    const sourceBacked = sourceBackedPhrase(nodeId, 'bare-entity', artifacts)
    if (sourceBacked) return sourceBacked
  }
  const field = typeof op.field === 'string' && op.field.trim().length > 0 ? op.field.trim() : 'selected values'
  return field
}

function phraseForRefNode(args: {
  nodeId: string
  context: OperandPhraseContext
  artifacts: LogicalExecutionArtifacts | null
  seen: Set<string>
}): string {
  const { nodeId, context, artifacts, seen } = args
  if (seen.has(nodeId)) return 'the previous result'
  seen.add(nodeId)

  const kind = nodeKind(nodeId, artifacts)
  const op = artifacts?.nodeOps.get(nodeId) ?? null
  if (!kind || !op) return 'the previous result'

  if (kind === 'source-backed') {
    return sourceBackedPhrase(nodeId, context.mode, artifacts) ?? 'the previous result'
  }

  return nounPhraseForOperation({
    op,
    context,
    artifacts,
    seen,
  })
}

function phraseForSelector(args: {
  selector: TargetSelector | TargetSelector[] | undefined
  context: OperandPhraseContext
  artifacts: LogicalExecutionArtifacts | null
  seen: Set<string>
}): string {
  const { selector, context, artifacts, seen } = args
  if (Array.isArray(selector)) {
    const phrases = selector.map((value) => phraseForSelector({ selector: value, context, artifacts, seen }))
    return joinPhrases(phrases)
  }

  const nodeId = selectorNodeId(selector)
  if (nodeId) {
    return phraseForRefNode({ nodeId, context, artifacts, seen })
  }

  const literalTarget = firstSelectorTarget(selector)
  if (!literalTarget) return context.mode === 'value' ? 'the selected value' : 'the selected result'
  if (context.mode === 'value') return `the value of ${literalTarget}`
  return literalTarget
}

function nounPhraseForOperation(args: {
  op: OperationSpec
  context: OperandPhraseContext
  artifacts: LogicalExecutionArtifacts | null
  seen: Set<string>
}): string {
  const { op, context, artifacts, seen } = args
  switch (op.op) {
    case OperationOp.Diff: {
      const leftKind = operandKind(op.targetA, artifacts)
      const rightKind = operandKind(op.targetB, artifacts)
      const leftMode =
        leftKind === 'source-backed' && rightKind === 'source-backed'
          ? 'bare-entity'
          : leftKind === 'source-backed'
            ? 'value'
            : 'summary'
      const rightMode =
        rightKind === 'source-backed' && leftKind === 'source-backed'
          ? 'bare-entity'
          : rightKind === 'source-backed'
            ? 'value'
            : 'summary'
      const left = phraseForSelector({
        selector: op.targetA,
        context: { mode: leftMode },
        artifacts,
        seen,
      })
      const right = phraseForSelector({
        selector: op.targetB,
        context: { mode: rightMode },
        artifacts,
        seen,
      })
      return buildBinaryLabel('difference', left, right, { article: true })
    }
    case OperationOp.DiffByValue:
      return `the differences from ${diffByValueReferencePhrase(op)}`
    case OperationOp.Add:
      return buildBinaryLabel(
        'sum',
        phraseForSelector({
          selector: op.targetA,
          context: { mode: 'summary' },
          artifacts,
          seen,
        }),
        phraseForSelector({
          selector: op.targetB,
          context: { mode: 'summary' },
          artifacts,
          seen,
        }),
        { article: true },
      )
    case OperationOp.Scale: {
      const target = phraseForSelector({
        selector: op.target,
        context: { mode: 'summary' },
        artifacts,
        seen,
      })
      return buildScaledLabel(target, { article: true })
    }
    case OperationOp.Average:
      return buildAggregateLabel('average', aggregateSubjectPhrase({ op, artifacts, seen }), { article: true })
    case OperationOp.Sum:
      return buildAggregateLabel('sum', aggregateSubjectPhrase({ op, artifacts, seen }), { article: true })
    case OperationOp.Count:
      return buildAggregateLabel('count', aggregateSubjectPhrase({ op, artifacts, seen }), { article: true })
    case OperationOp.FindExtremum:
      return buildAggregateLabel(
        op.which === 'min' ? 'minimum' : 'maximum',
        aggregateSubjectPhrase({ op, artifacts, seen }),
        { article: true },
      )
    case OperationOp.Nth: {
      const rawRank = Array.isArray(op.n) ? Number(op.n[0]) : Number(op.n)
      if (Number.isFinite(rawRank)) {
        return buildOrdinalLabel(rawRank, aggregateSubjectPhrase({ op, artifacts, seen }), { article: true })
      }
      return 'the selected value'
    }
    case OperationOp.RetrieveValue:
      return phraseForSelector({
        selector: op.target,
        context: context.mode === 'bare-entity' ? context : { mode: 'value' },
        artifacts,
        seen,
      })
    default:
      return 'the previous result'
  }
}

function phraseFromInputNodeIds(args: {
  nodeIds: string[]
  mode: OperandPhraseContext['mode']
  artifacts: LogicalExecutionArtifacts | null
  seen: Set<string>
}) {
  return joinPhrases(
    args.nodeIds.map((nodeId) =>
      phraseForRefNode({
        nodeId,
        context: { mode: args.mode },
        artifacts: args.artifacts,
        seen: new Set(args.seen),
      }),
    ),
  )
}

function imperativeSentenceForOperation(args: {
  op: OperationSpec
  artifacts: LogicalExecutionArtifacts | null
  refine?: boolean
}): string {
  const { op, artifacts, refine = false } = args
  const seen = new Set<string>()
  const inputs = inputNodeIds(op)

  switch (op.op) {
    case OperationOp.RetrieveValue:
      return `Get the value of ${phraseForSelector({ selector: op.target, context: { mode: 'bare-entity' }, artifacts, seen })}`
    case OperationOp.DiffByValue:
      return `Calculate the difference of every value from ${diffByValueReferencePhrase(op)}`
    case OperationOp.Diff: {
      const leftKind = operandKind(op.targetA, artifacts)
      const rightKind = operandKind(op.targetB, artifacts)
      const leftMode =
        leftKind === 'source-backed' && rightKind === 'source-backed'
          ? 'bare-entity'
          : leftKind === 'source-backed'
            ? 'value'
            : 'summary'
      const rightMode =
        rightKind === 'source-backed' && leftKind === 'source-backed'
          ? 'bare-entity'
          : rightKind === 'source-backed'
            ? 'value'
            : 'summary'
      const left = phraseForSelector({ selector: op.targetA, context: { mode: leftMode }, artifacts, seen })
      const right = phraseForSelector({ selector: op.targetB, context: { mode: rightMode }, artifacts, seen })
      return `Calculate the difference between ${left} and ${right}`
    }
    case OperationOp.Average:
      if (inputs.length > 0) {
        return `Calculate the average of ${phraseFromInputNodeIds({ nodeIds: inputs, mode: 'bare-entity', artifacts, seen })}`
      }
      return 'Calculate the average'
    case OperationOp.Sum:
      if (inputs.length > 0) {
        return `Calculate the sum of ${phraseFromInputNodeIds({ nodeIds: inputs, mode: 'bare-entity', artifacts, seen })}`
      }
      return 'Calculate the sum'
    case OperationOp.Count:
      if (inputs.length > 0) {
        return `Count ${phraseFromInputNodeIds({ nodeIds: inputs, mode: 'bare-entity', artifacts, seen })}`
      }
      return 'Count the selected values'
    case OperationOp.FindExtremum: {
      const base = op.which === 'min' ? 'Get the minimum value' : 'Get the maximum value'
      if (!refine) return base
      const nodeId = typeof op.meta?.nodeId === 'string' ? op.meta.nodeId : typeof (op as { id?: unknown }).id === 'string' ? String((op as { id?: string }).id) : ''
      const target = resultTarget(nodeId ? artifacts?.nodeResults.get(nodeId) : undefined)
      return target ? `${base}, which is ${target}` : base
    }
    case OperationOp.Scale: {
      const factor = Number(op.factor)
      const factorText = Number.isFinite(factor) ? formatExplanationNumber(factor) : 'the specified factor'
      return `Scale ${phraseForSelector({ selector: op.target, context: { mode: 'summary' }, artifacts, seen })} by ${factorText}`
    }
    case OperationOp.Add:
      return `Calculate the sum of ${phraseForSelector({ selector: op.targetA, context: { mode: 'summary' }, artifacts, seen })} and ${phraseForSelector({ selector: op.targetB, context: { mode: 'summary' }, artifacts, seen })}`
    case OperationOp.CompareBool:
      return `Check whether ${phraseForSelector({ selector: op.targetA, context: { mode: 'summary' }, artifacts, seen })} is greater than ${phraseForSelector({ selector: op.targetB, context: { mode: 'summary' }, artifacts, seen })}`
    case OperationOp.Filter:
      if (Array.isArray(op.include) && op.include.length > 0) {
        return `Filter the chart to show ${compactSemanticList(op.include)}`
      }
      if (Array.isArray(op.exclude) && op.exclude.length > 0) {
        return `Filter the chart to exclude ${compactSemanticList(op.exclude)}`
      }
      if (Array.isArray(op.value) && op.value.length > 0) {
        return `Filter the chart to show ${compactSemanticList(op.value as Array<string | number>)}`
      }
      return 'Filter the chart'
    case OperationOp.Sort:
      return `Sort the chart in ${op.order === 'desc' ? 'descending' : 'ascending'} order`
    case OperationOp.Nth: {
      const n = Array.isArray(op.n) ? Number(op.n[0]) : Number(op.n)
      const base = Number.isFinite(n) ? `Get the ${ordinal(n)} value` : 'Get the selected value'
      if (!refine) return base
      const nodeId = typeof op.meta?.nodeId === 'string' ? op.meta.nodeId : typeof (op as { id?: unknown }).id === 'string' ? String((op as { id?: string }).id) : ''
      const target = resultTarget(nodeId ? artifacts?.nodeResults.get(nodeId) : undefined)
      return target ? `${base}, which is ${target}` : base
    }
    case OperationOp.PairDiff:
      return 'Calculate the pairwise difference'
    case OperationOp.LagDiff:
      return 'Calculate the lag difference'
    default:
      return 'Process the selected values'
  }
}

export function buildSentenceSummaryText(context: SummaryGenerationContext): SentenceSummaryText | null {
  const operations = context.step.substeps
    .filter((substep) => substep.kind === 'run-op' && substep.visible !== false)
    .map((substep) =>
      typeof substep.nodeId === 'string' ? context.logicalArtifacts?.nodeOps.get(substep.nodeId.trim()) ?? null : null,
    )
    .filter((op): op is OperationSpec => op != null)

  return buildSummaryTextForOperations({
    operations,
    logicalArtifacts: context.logicalArtifacts,
  })
}

export function buildSummaryTextForOperations(args: {
  operations: OperationSpec[]
  logicalArtifacts: LogicalExecutionArtifacts | null
}): SentenceSummaryText | null {
  const operations = args.operations.filter(
    (op) => op.op && op.op !== OperationOp.Draw && op.op !== OperationOp.Sleep && op.op !== 'text',
  )
  if (operations.length === 0) return null

  const entries = operations.map((op, index) => ({
    nodeId: opNodeId(op, index),
    op,
  }))
  const internalNodeIds = new Set(entries.map((entry) => entry.nodeId))
  const consumedByOtherRunOp = new Set<string>()
  entries.forEach((entry) => {
    inputNodeIds(entry.op).forEach((inputId) => {
      if (internalNodeIds.has(inputId)) {
        consumedByOtherRunOp.add(inputId)
      }
    })
  })
  const sinkEntries = entries.filter((entry) => !consumedByOtherRunOp.has(entry.nodeId))
  const summaryEntries = sinkEntries.length > 0 ? sinkEntries : entries

  const initialText = joinClauses(
    summaryEntries.map((entry) =>
      imperativeSentenceForOperation({
        op: entry.op,
        artifacts: args.logicalArtifacts,
        refine: false,
      }),
    ),
  )
  if (!initialText) return null

  const finalText = joinClauses(
    summaryEntries.map((entry) =>
      imperativeSentenceForOperation({
        op: entry.op,
        artifacts: args.logicalArtifacts,
        refine: true,
      }),
    ),
  )
  const refineOnNodeIds = summaryEntries
    .filter((entry) => entry.op.op === OperationOp.FindExtremum || entry.op.op === OperationOp.Nth)
    .map((entry) => entry.nodeId)

  return {
    initialText,
    finalText: finalText !== initialText ? finalText : undefined,
    refineOnNodeIds: refineOnNodeIds.length > 0 ? refineOnNodeIds : undefined,
  }
}

// Caption text for the evaluation summary box: the same imperative labels as
// buildSummaryTextForOperations, enriched with actual computed numbers once op
// results are available ("Calculate the difference …: 380 − 238.75 = 141.25").
// With an empty results map this returns exactly the label-only text, so one
// builder serves both the pre-run and post-run paints.
export function buildCalculationSummaryText(args: {
  operations: OperationSpec[]
  resultsByNodeId: ReadonlyMap<string, DatumValue[]>
  lastResult?: DatumValue[] | null
}): string {
  const entries = collectSummaryEntries(args.operations)
  if (entries.length === 0) return ''

  // Authored step prose comma-groups big integers ("41,581"); mirror that here
  // without touching the shared formatter used by the explanation sentences.
  const fmt = (value: number, precision?: number) => {
    const text = formatExplanationNumber(value, precision)
    const [head, tail = ''] = text.split('.')
    if (head.replace('-', '').length < 5) return text
    const grouped = head.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    return tail ? `${grouped}.${tail}` : grouped
  }
  const operandValue = (selector: TargetSelector | TargetSelector[] | undefined) => {
    const nodeId = selectorNodeId(selector)
    return nodeId ? firstFiniteValue(args.resultsByNodeId.get(nodeId)) : null
  }

  const clauses = entries.map((entry, index) => {
    const op = entry.op
    let label = imperativeSentenceForOperation({ op, artifacts: null, refine: false })
    const rows =
      args.resultsByNodeId.get(entry.nodeId) ??
      (index === entries.length - 1 && args.lastResult?.length ? args.lastResult : undefined)

    // Per-op calculation suffix. Any missing/non-finite value degrades to the
    // bare label — never "undefined", never a dangling colon.
    let suffix = ''
    const v = firstFiniteValue(rows)
    switch (op.op) {
      case OperationOp.FindExtremum:
      case OperationOp.Average:
      case OperationOp.Sum:
      case OperationOp.Count:
      case OperationOp.Nth:
        if (v != null) suffix = fmt(v, op.precision)
        break
      case OperationOp.RetrieveValue: {
        const numeric = (rows ?? [])
          .map((row) => Number(row?.value))
          .filter((value) => Number.isFinite(value))
        if (numeric.length >= 1 && numeric.length <= 3) {
          suffix = joinPhrases(numeric.map((value) => fmt(value, op.precision)))
        }
        break
      }
      case OperationOp.Diff: {
        const leftSelector = binaryOperandSelector(op, 'left')
        const rightSelector = binaryOperandSelector(op, 'right')
        // With no artifacts, ref operands phrase as "the previous result";
        // when BOTH sides are refs the long form carries zero information
        // ("between the previous result and the previous result") — compress
        // to the bare verb phrase and let the equation tell the story.
        if (selectorNodeId(leftSelector) && selectorNodeId(rightSelector)) label = 'Calculate the difference'
        if (v == null) break
        const left = operandValue(leftSelector)
        const right = operandValue(rightSelector)
        // Unsigned diff may have flipped the operand order; pick the order
        // that keeps the equation arithmetically true, else show result only.
        if (left != null && right != null && Math.abs(left - right - v) < 0.005) {
          suffix = `${fmt(left, op.precision)} − ${fmt(right, op.precision)} = ${fmt(v, op.precision)}`
        } else if (left != null && right != null && Math.abs(right - left - v) < 0.005) {
          suffix = `${fmt(right, op.precision)} − ${fmt(left, op.precision)} = ${fmt(v, op.precision)}`
        } else {
          suffix = fmt(v, op.precision)
        }
        break
      }
      case OperationOp.Add: {
        const leftSelector = binaryOperandSelector(op, 'left')
        const rightSelector = binaryOperandSelector(op, 'right')
        if (selectorNodeId(leftSelector) && selectorNodeId(rightSelector)) label = 'Calculate the sum'
        if (v == null) break
        const left = operandValue(leftSelector)
        const right = operandValue(rightSelector)
        suffix = left != null && right != null && Math.abs(left + right - v) < 0.005
          ? `${fmt(left, op.precision)} + ${fmt(right, op.precision)} = ${fmt(v, op.precision)}`
          : fmt(v, op.precision)
        break
      }
      case OperationOp.Scale: {
        if (v == null) break
        const base = operandValue(op.target)
        const factor = Number(op.factor)
        suffix = base != null && Number.isFinite(factor) && Math.abs(base * factor - v) < 0.005
          ? `${fmt(base, op.precision)} × ${fmt(factor)} = ${fmt(v, op.precision)}`
          : fmt(v, op.precision)
        break
      }
      case OperationOp.PairDiff:
      case OperationOp.LagDiff:
      case OperationOp.DiffByValue:
        // Multi-row results are already visualized per-key on the chart; only
        // a single collapsed value reads well in the caption.
        if (rows?.length === 1 && v != null) suffix = fmt(v, op.precision)
        break
      case OperationOp.CompareBool:
        if (v != null) suffix = v > 0 ? 'yes' : 'no'
        break
      default:
        // filter / sort / others: the label already says everything useful.
        break
    }

    return suffix ? `${label}: ${suffix}` : label
  })

  return joinClauses(clauses)
}

export type ExplanationSummaryText = {
  initialText: string
  finalText?: string
  refineOnNodeIds?: string[]
}

function formatExplanationNumber(value: number, precision?: number) {
  if (!Number.isFinite(value)) return ''
  const digits = typeof precision === 'number' && Number.isFinite(precision)
    ? Math.max(0, Math.min(2, Math.trunc(precision)))
    : 2
  const rounded = Number(value.toFixed(digits))
  let text = rounded.toFixed(digits)
  text = text.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '')
  if (text === '-0') return '0'
  return text
}

type SummaryEntry = {
  nodeId: string
  op: OperationSpec
}

function collectSummaryEntries(operations: OperationSpec[]) {
  const filtered = operations.filter(
    (op) => op.op && op.op !== OperationOp.Draw && op.op !== OperationOp.Sleep && op.op !== 'text',
  )
  const entries = filtered.map((op, index) => ({
    nodeId: opNodeId(op, index),
    op,
  }))
  const internalNodeIds = new Set(entries.map((entry) => entry.nodeId))
  const consumedByOtherRunOp = new Set<string>()
  entries.forEach((entry) => {
    inputNodeIds(entry.op).forEach((inputId) => {
      if (internalNodeIds.has(inputId)) {
        consumedByOtherRunOp.add(inputId)
      }
    })
  })
  const sinkEntries = entries.filter((entry) => !consumedByOtherRunOp.has(entry.nodeId))
  return sinkEntries.length > 0 ? sinkEntries : entries
}

function explanationEntriesMap(operations: OperationSpec[]) {
  const summaryEntries = collectSummaryEntries(operations)
  const allEntries = operations
    .filter((op) => op.op && op.op !== OperationOp.Draw && op.op !== OperationOp.Sleep && op.op !== 'text')
    .map((op, index) => ({
      nodeId: opNodeId(op, index),
      op,
    }))
  return {
    summaryEntries,
    entryMap: new Map(allEntries.map((entry) => [entry.nodeId, entry])),
  }
}

function firstFiniteValue(rows: DatumValue[] | undefined) {
  const row = rows?.find((item) => Number.isFinite(Number(item?.value)))
  return row ? Number(row.value) : null
}

function readableTarget(row: DatumValue | undefined) {
  if (!row) return null
  const target = typeof row.displayTarget === 'string' && row.displayTarget.trim().length > 0
    ? row.displayTarget.trim()
    : typeof row.target === 'string' && row.target.trim().length > 0
      ? row.target.trim()
      : null
  return target && !target.startsWith('__') ? target : null
}

function readableCategory(row: DatumValue | undefined) {
  const category = typeof row?.category === 'string' ? row.category.trim() : ''
  return category.length > 0 && category !== 'value' && category !== 'result' ? category : null
}

function valueDescriptor(op: OperationSpec) {
  const group = typeof op.group === 'string' && op.group.trim().length > 0 ? op.group.trim() : ''
  const field = typeof op.field === 'string' && op.field.trim().length > 0 ? op.field.trim() : ''
  if (group && field) return `${group} ${field}`
  if (group) return `${group} value`
  if (field) return `${field} value`
  return 'value'
}

function directionDescriptor(op: OperationSpec) {
  return op.from === 'right' ? 'right' : 'left'
}

function aggregateSubjectDescriptor(op: OperationSpec) {
  const group = typeof op.group === 'string' && op.group.trim().length > 0 ? op.group.trim() : ''
  const field = typeof op.field === 'string' && op.field.trim().length > 0 ? op.field.trim() : ''
  if (group && field) return `${group} ${field} values`
  if (group) return `${group} values`
  if (field) return `${field} values`
  return 'selected values'
}

function averageSubjectDescriptor(op: OperationSpec) {
  const groups = Array.isArray(op.group)
    ? op.group.map((value) => String(value).trim()).filter((value) => value.length > 0)
    : typeof op.group === 'string' && op.group.trim().length > 0
      ? [op.group.trim()]
      : []
  if (groups.length === 1) return groups[0]
  if (groups.length > 1) return joinPhrases(groups)
  return ''
}

function normalizeExplanationList(value: unknown): string[] {
  const entries = Array.isArray(value) ? value : value == null ? [] : [value]
  return entries
    .map((entry) => String(entry).trim())
    .filter((entry) => entry.length > 0)
}

function quoteExplanationValue(value: string) {
  return `"${value.replaceAll('"', '\\"')}"`
}

function filterFieldDescriptor(op: OperationSpec) {
  const field = typeof op.field === 'string' ? op.field.trim() : ''
  if (!field) return 'values'
  return `${field} values`
}

function compactFilterList(values: string[], fallback: string) {
  if (values.length === 0) return fallback
  if (values.length <= 3) return joinPhrases(values)
  return fallback
}

function inferFilterSelectionKind(args: {
  values: string[]
  rows?: DatumValue[]
  field?: string
}) {
  const fieldHint = String(args.field ?? '').trim().toLowerCase()
  if (fieldHint.includes('group') || fieldHint.includes('series')) return 'groups'
  if (fieldHint.includes('target') || fieldHint.includes('category') || fieldHint.includes('country')) return 'values'

  const rowTargetSet = new Set(
    (args.rows ?? [])
      .map((row) => readableTarget(row))
      .filter((value): value is string => typeof value === 'string' && value.length > 0),
  )
  const rowGroupSet = new Set(
    (args.rows ?? [])
      .map((row) => (typeof row.group === 'string' ? row.group.trim() : ''))
      .filter((value) => value.length > 0),
  )

  const targetMatches = args.values.filter((value) => rowTargetSet.has(value)).length
  const groupMatches = args.values.filter((value) => rowGroupSet.has(value)).length
  if (groupMatches > targetMatches) return 'groups'
  return 'values'
}

function chooseFilterSentence(candidates: string[]) {
  const cleaned = candidates
    .map((candidate) => candidate.trim())
    .filter((candidate, index, list) => candidate.length > 0 && list.indexOf(candidate) === index)
  if (cleaned.length === 0) return 'The chart is filtered.'
  const withinBudget = cleaned.find((candidate) => candidate.length <= 80)
  return withinBudget ?? cleaned.reduce((shortest, candidate) => (candidate.length < shortest.length ? candidate : shortest))
}

function renderScalarExplanationOperand(args: {
  value: JsonValue | undefined
  precision?: number
  aggregateHint?: string
  entryMap: Map<string, SummaryEntry>
  resultsByNodeId: ReadonlyMap<string, DatumValue[]>
}) {
  const { value, precision, aggregateHint, entryMap, resultsByNodeId } = args
  const resolvedRefValue = resolveFilterRefThresholdFromResults(value, resultsByNodeId, aggregateHint)
  if (resolvedRefValue != null) {
    return formatExplanationNumber(resolvedRefValue, precision)
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return formatExplanationNumber(value, precision)
  }

  if (typeof value !== 'string') {
    return ''
  }

  const trimmed = value.trim()
  if (!trimmed) return ''

  const numericValue = Number(trimmed)
  if (Number.isFinite(numericValue)) {
    return formatExplanationNumber(numericValue, precision)
  }

  const refKey = refKeyFromScalarValue(trimmed)
  if (refKey) {
    const entry = entryMap.get(refKey)
    if (entry) {
      return shortPhraseForOperation(entry.op, entryMap, new Set<string>())
    }
    return 'the previous result'
  }

  return quoteExplanationValue(trimmed)
}

function buildFilterExplanationText(op: OperationSpec, rows?: DatumValue[]) {
  return buildFilterExplanationTextWithContext({
    op,
    rows,
    entryMap: new Map<string, SummaryEntry>(),
    resultsByNodeId: new Map<string, DatumValue[]>(),
  })
}

function buildFilterExplanationTextWithContext(args: {
  op: OperationSpec
  rows?: DatumValue[]
  entryMap: Map<string, SummaryEntry>
  resultsByNodeId: ReadonlyMap<string, DatumValue[]>
}) {
  const { op, rows, entryMap, resultsByNodeId } = args
  const fieldLabel = filterFieldDescriptor(op)
  const operator = String(op.operator ?? '').trim().toLowerCase()
  const include = normalizeExplanationList((op as { include?: unknown }).include)
  const exclude = normalizeExplanationList((op as { exclude?: unknown }).exclude)
  const rawValueList = normalizeExplanationList((op as { value?: unknown }).value)
  const groupList = normalizeExplanationList((op as { group?: unknown }).group)

  if (include.length > 0) {
    const semanticKind = inferFilterSelectionKind({ values: include, rows, field: op.field })
    const fallback = semanticKind === 'groups' ? 'selected groups' : 'selected values'
    return `The chart shows ${compactFilterList(include, fallback)} only.`
  }

  if (exclude.length > 0) {
    const semanticKind = inferFilterSelectionKind({ values: exclude, rows, field: op.field })
    const fallback = semanticKind === 'groups' ? 'selected groups' : 'selected values'
    return `The chart excludes ${compactFilterList(exclude, fallback)}.`
  }

  if (!operator && groupList.length > 0) {
    return `The chart shows ${compactFilterList(groupList, 'selected groups')} only.`
  }

  if (operator === 'between' && rawValueList.length >= 2) {
    const [start, end] = rawValueList
    const renderedStart = renderScalarExplanationOperand({
      value: start,
      precision: op.precision,
      aggregateHint: typeof op.aggregate === 'string' ? op.aggregate : undefined,
      entryMap,
      resultsByNodeId,
    })
    const renderedEnd = renderScalarExplanationOperand({
      value: end,
      precision: op.precision,
      aggregateHint: typeof op.aggregate === 'string' ? op.aggregate : undefined,
      entryMap,
      resultsByNodeId,
    })
    const shortSentence = `The chart shows values between ${renderedStart} and ${renderedEnd}.`
    const longSentence = `The chart shows ${fieldLabel} between ${renderedStart} and ${renderedEnd}.`
    return chooseFilterSentence([shortSentence, longSentence])
  }

  if (!operator && rawValueList.length > 0) {
    const semanticKind = inferFilterSelectionKind({ values: rawValueList, rows, field: op.field })
    const fallback = semanticKind === 'groups' ? 'selected groups' : 'selected values'
    return `The chart shows ${compactFilterList(rawValueList, fallback)} only.`
  }

  const rawScalarValue = (op as { value?: JsonValue }).value
  const renderedValue = renderScalarExplanationOperand({
    value: rawScalarValue,
    precision: op.precision,
    aggregateHint: typeof op.aggregate === 'string' ? op.aggregate : undefined,
    entryMap,
    resultsByNodeId,
  })

  switch (operator) {
    case '>':
    case 'gt':
      return chooseFilterSentence([`The chart shows values above ${renderedValue}.`, `The chart shows ${fieldLabel} above ${renderedValue}.`])
    case '>=':
    case 'gte':
      return chooseFilterSentence([`The chart shows values at least ${renderedValue}.`, `The chart shows ${fieldLabel} at least ${renderedValue}.`])
    case '<':
    case 'lt':
      return chooseFilterSentence([`The chart shows values below ${renderedValue}.`, `The chart shows ${fieldLabel} below ${renderedValue}.`])
    case '<=':
    case 'lte':
      return chooseFilterSentence([`The chart shows values at most ${renderedValue}.`, `The chart shows ${fieldLabel} at most ${renderedValue}.`])
    case '==':
    case 'eq':
      return chooseFilterSentence([`The chart shows values equal to ${renderedValue}.`, `The chart shows ${fieldLabel} equal to ${renderedValue}.`])
    case '!=':
      return chooseFilterSentence([`The chart excludes values equal to ${renderedValue}.`, `The chart excludes ${fieldLabel} equal to ${renderedValue}.`])
    case 'in': {
      const semanticKind = inferFilterSelectionKind({ values: rawValueList, rows, field: op.field })
      const fallback = semanticKind === 'groups' ? 'selected groups' : 'selected values'
      return `The chart shows ${compactFilterList(rawValueList, fallback)}.`
    }
    case 'not-in': {
      const semanticKind = inferFilterSelectionKind({ values: rawValueList, rows, field: op.field })
      const fallback = semanticKind === 'groups' ? 'selected groups' : 'selected values'
      return `The chart excludes ${compactFilterList(rawValueList, fallback)}.`
    }
    case 'contains':
      return chooseFilterSentence([
        `The chart shows values containing ${renderedValue}.`,
        `The chart shows ${fieldLabel} containing ${renderedValue}.`,
      ])
    default:
      return 'The chart is filtered.'
  }
}

function diffByValueReferencePhrase(op: OperationSpec): string {
  const literal = (op as OperationSpec & { value?: unknown }).value
  if (typeof literal === 'number' && Number.isFinite(literal)) return String(literal)
  // scalar 기준값은 targetValue: "ref:nX" 로만 선언한다. meta.inputs fallback 없음.
  const targetValue = (op as OperationSpec & { targetValue?: unknown }).targetValue
  if (typeof targetValue === 'string' && targetValue.length > 0) return `the previous result (${targetValue})`
  return 'the reference value'
}

function compareOperatorLabel(operator: string | undefined) {
  switch (String(operator ?? '').toLowerCase()) {
    case '>':
    case 'gt':
      return 'greater than'
    case '>=':
    case 'gte':
      return 'greater than or equal to'
    case '<':
    case 'lt':
      return 'less than'
    case '<=':
    case 'lte':
      return 'less than or equal to'
    case '==':
    case 'eq':
      return 'equal to'
    case '!=':
    case 'neq':
      return 'not equal to'
    default:
      return 'greater than'
  }
}

function binaryOperandSelector(
  op: OperationSpec,
  side: 'left' | 'right',
): TargetSelector | TargetSelector[] | undefined {
  if (side === 'left' && op.targetA != null) return op.targetA
  if (side === 'right' && op.targetB != null) return op.targetB
  const inputs = inputNodeIds(op)
  const fallbackNodeId = side === 'left' ? inputs[0] : inputs[1]
  return fallbackNodeId ? `ref:${fallbackNodeId}` : undefined
}

function phraseForSelectorFromEntries(args: {
  selector: TargetSelector | TargetSelector[] | undefined
  entryMap: Map<string, SummaryEntry>
  seen: Set<string>
  mode: 'entity' | 'summary'
}): string {
  const { selector, entryMap, seen, mode } = args
  if (Array.isArray(selector)) {
    return joinPhrases(
      selector.map((item) =>
        phraseForSelectorFromEntries({
          selector: item,
          entryMap,
          seen: new Set(seen),
          mode,
        }),
      ),
    )
  }

  const refNodeId = selectorNodeId(selector)
  if (refNodeId) {
    if (seen.has(refNodeId)) return 'the previous result'
    const entry = entryMap.get(refNodeId)
    if (!entry) return 'the previous result'
    seen.add(refNodeId)
    return shortPhraseForOperation(entry.op, entryMap, seen)
  }

  const literal = selectorTarget(selector)
  if (!literal) return mode === 'entity' ? 'the selected value' : 'the previous result'
  return mode === 'entity' ? literal : `the value of ${literal}`
}

function shortPhraseForOperation(
  op: OperationSpec,
  entryMap: Map<string, SummaryEntry>,
  seen: Set<string>,
): string {
  switch (op.op) {
    case OperationOp.RetrieveValue:
      return phraseForSelectorFromEntries({ selector: op.target, entryMap, seen, mode: 'entity' })
    case OperationOp.FindExtremum:
      return `the ${op.which === 'min' ? 'minimum' : 'maximum'} ${valueDescriptor(op)}`
    case OperationOp.Nth: {
      const rawRank = Array.isArray(op.n) ? Number(op.n[0]) : Number(op.n)
      return Number.isFinite(rawRank) ? `the ${ordinal(rawRank)} value from ${directionDescriptor(op)}` : 'the selected value'
    }
    case OperationOp.Average:
      return `the average of ${aggregateSubjectDescriptor(op)}`
    case OperationOp.Sum:
      return `the sum of ${aggregateSubjectDescriptor(op)}`
    case OperationOp.Count:
      return `the count of ${aggregateSubjectDescriptor(op)}`
    case OperationOp.Diff:
      return `the difference between ${phraseForSelectorFromEntries({ selector: binaryOperandSelector(op, 'left'), entryMap, seen, mode: 'entity' })} and ${phraseForSelectorFromEntries({ selector: binaryOperandSelector(op, 'right'), entryMap, seen, mode: 'entity' })}`
    case OperationOp.Add:
      return `the sum of ${phraseForSelectorFromEntries({ selector: binaryOperandSelector(op, 'left'), entryMap, seen, mode: 'entity' })} and ${phraseForSelectorFromEntries({ selector: binaryOperandSelector(op, 'right'), entryMap, seen, mode: 'entity' })}`
    case OperationOp.Scale:
      return `the value of ${phraseForSelectorFromEntries({ selector: op.target, entryMap, seen, mode: 'entity' })} scaled by ${formatExplanationNumber(Number(op.factor ?? 1))}`
    default:
      return 'the previous result'
  }
}

function initialExplanationForOperation(op: OperationSpec, entryMap: Map<string, SummaryEntry>) {
  switch (op.op) {
    case OperationOp.RetrieveValue:
      return `Looking up the value of ${phraseForSelectorFromEntries({ selector: op.target, entryMap, seen: new Set(), mode: 'entity' })}.`
    case OperationOp.FindExtremum:
      return `Finding the ${op.which === 'min' ? 'minimum' : 'maximum'} ${valueDescriptor(op)}.`
    case OperationOp.Nth: {
      const rawRank = Array.isArray(op.n) ? Number(op.n[0]) : Number(op.n)
      return Number.isFinite(rawRank)
        ? `Finding the ${ordinal(rawRank)} ${valueDescriptor(op)}.`
        : 'Finding the selected value.'
    }
    case OperationOp.Average:
      return `Calculating the average of ${aggregateSubjectDescriptor(op)}.`
    case OperationOp.Sum:
      return `Calculating the sum of ${aggregateSubjectDescriptor(op)}.`
    case OperationOp.Count:
      return `Counting ${aggregateSubjectDescriptor(op)}.`
    case OperationOp.Diff:
      return `Calculating the difference between ${phraseForSelectorFromEntries({ selector: binaryOperandSelector(op, 'left'), entryMap, seen: new Set(), mode: 'entity' })} and ${phraseForSelectorFromEntries({ selector: binaryOperandSelector(op, 'right'), entryMap, seen: new Set(), mode: 'entity' })}.`
    case OperationOp.Filter:
      return 'Filtering the chart.'
    case OperationOp.Sort:
      return `Sorting the chart in ${op.order === 'desc' ? 'descending' : 'ascending'} order.`
    case OperationOp.CompareBool:
      return 'Checking the comparison.'
    case OperationOp.PairDiff:
      if (typeof op.keyField === 'string' && op.keyField.trim().length > 0) {
        return `Calculating the pairwise difference between ${compactSemanticList([String(op.groupA ?? 'A'), String(op.groupB ?? 'B')])} for each ${op.keyField.trim()}.`
      }
      return `Calculating the pairwise difference between ${compactSemanticList([String(op.groupA ?? 'A'), String(op.groupB ?? 'B')])}.`
    case OperationOp.LagDiff:
      return 'Calculating the lag difference.'
    case OperationOp.Add:
      return `Calculating the sum of ${phraseForSelectorFromEntries({ selector: binaryOperandSelector(op, 'left'), entryMap, seen: new Set(), mode: 'entity' })} and ${phraseForSelectorFromEntries({ selector: binaryOperandSelector(op, 'right'), entryMap, seen: new Set(), mode: 'entity' })}.`
    case OperationOp.Scale:
      return `Scaling ${phraseForSelectorFromEntries({ selector: op.target, entryMap, seen: new Set(), mode: 'entity' })}.`
    default:
      return imperativeSentenceForOperation({ op, artifacts: null, refine: false })
    }
}

function finalExplanationForOperation(args: {
  op: OperationSpec
  rows: DatumValue[] | undefined
  entryMap: Map<string, SummaryEntry>
  resultsByNodeId: ReadonlyMap<string, DatumValue[]>
}): string | undefined {
  const { op, rows, entryMap, resultsByNodeId } = args
  switch (op.op) {
    case OperationOp.RetrieveValue: {
      const numericRows = (rows ?? []).filter((row) => Number.isFinite(Number(row?.value)))
      if (numericRows.length === 0) return undefined
      if (numericRows.length === 1) {
        const target = phraseForSelectorFromEntries({ selector: op.target, entryMap, seen: new Set(), mode: 'entity' })
        return `The value of ${target} is ${formatExplanationNumber(Number(numericRows[0].value), op.precision)}.`
      }
      const targets = numericRows
        .map((row) => readableTarget(row))
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
      const values = numericRows
        .map((row) => formatExplanationNumber(Number(row.value), op.precision))
        .filter((value) => value.length > 0)
      if (!targets.length || !values.length) return undefined
      return `The values of ${joinPhrases(targets)} are ${joinPhrases(values)}.`
    }
    case OperationOp.FindExtremum: {
      const row = rows?.find((item) => Number.isFinite(Number(item?.value)))
      if (!row) return undefined
      return `The ${op.which === 'min' ? 'minimum' : 'maximum'} ${valueDescriptor(op)} is ${formatExplanationNumber(Number(row.value), op.precision)}.`
    }
    case OperationOp.Nth: {
      const row = rows?.find((item) => Number.isFinite(Number(item?.value)))
      const rawRank = Array.isArray(op.n) ? Number(op.n[0]) : Number(op.n)
      if (!row || !Number.isFinite(rawRank)) return undefined
      return `The ${ordinal(rawRank)} value from ${directionDescriptor(op)} is ${formatExplanationNumber(Number(row.value), op.precision)}.`
    }
    case OperationOp.Average: {
      const value = firstFiniteValue(rows)
      if (value == null) return undefined
      const subject = averageSubjectDescriptor(op)
      if (subject) {
        return `The average of ${subject} is ${formatExplanationNumber(value, op.precision)}.`
      }
      return `The average is ${formatExplanationNumber(value, op.precision)}.`
    }
    case OperationOp.Sum: {
      const value = firstFiniteValue(rows)
      if (value == null) return undefined
      return `The sum of ${aggregateSubjectDescriptor(op)} is ${formatExplanationNumber(value)}.`
    }
    case OperationOp.Count: {
      const value = firstFiniteValue(rows)
      if (value == null) return undefined
      return `The count of ${aggregateSubjectDescriptor(op)} is ${formatExplanationNumber(value)}.`
    }
    case OperationOp.Diff: {
      const value = firstFiniteValue(rows)
      if (value == null) return undefined
      const left = phraseForSelectorFromEntries({ selector: binaryOperandSelector(op, 'left'), entryMap, seen: new Set(), mode: 'entity' })
      const right = phraseForSelectorFromEntries({ selector: binaryOperandSelector(op, 'right'), entryMap, seen: new Set(), mode: 'entity' })
      return `The difference between ${left} and ${right} is ${formatExplanationNumber(value, op.precision)}.`
    }
    case OperationOp.DiffByValue: {
      if (!rows?.length) return undefined
      return `Each value's difference from ${diffByValueReferencePhrase(op)} is shown.`
    }
    case OperationOp.Add: {
      const value = firstFiniteValue(rows)
      if (value == null) return undefined
      const left = phraseForSelectorFromEntries({ selector: binaryOperandSelector(op, 'left'), entryMap, seen: new Set(), mode: 'entity' })
      const right = phraseForSelectorFromEntries({ selector: binaryOperandSelector(op, 'right'), entryMap, seen: new Set(), mode: 'entity' })
      return `The sum of ${left} and ${right} is ${formatExplanationNumber(value)}.`
    }
    case OperationOp.Scale: {
      const value = firstFiniteValue(rows)
      if (value == null) return undefined
      const target = phraseForSelectorFromEntries({ selector: op.target, entryMap, seen: new Set(), mode: 'entity' })
      const factor = Number(op.factor)
      const renderedFactor = Number.isFinite(factor) ? formatExplanationNumber(factor, op.precision) : '1'
      return `The value of ${target} scaled by ${renderedFactor} is ${formatExplanationNumber(value, op.precision)}.`
    }
    case OperationOp.CompareBool: {
      const value = firstFiniteValue(rows)
      if (value == null) return undefined
      const left = phraseForSelectorFromEntries({ selector: op.targetA, entryMap, seen: new Set(), mode: 'entity' })
      const right = phraseForSelectorFromEntries({ selector: op.targetB, entryMap, seen: new Set(), mode: 'entity' })
      const comparison = compareOperatorLabel(op.operator)
      return value > 0 ? `${left} is ${comparison} ${right}.` : `${left} is not ${comparison} ${right}.`
    }
    case OperationOp.PairDiff: {
      if (!rows?.length) return undefined
      const keyLabel =
        typeof op.keyField === 'string' && op.keyField.trim().length > 0
          ? op.keyField.trim()
          : typeof op.by === 'string' && op.by.trim().length > 0
            ? op.by.trim()
            : 'target'
      if (rows.length === 1) {
        const row = rows[0]
        const target = readableTarget(row) ?? 'the selected key'
        return `The difference between ${String(op.groupA)} and ${String(op.groupB)} for ${target} is ${formatExplanationNumber(Number(row.value), op.precision)}.`
      }
      return `The pairwise differences between ${String(op.groupA)} and ${String(op.groupB)} are shown for each ${keyLabel}.`
    }
    case OperationOp.LagDiff: {
      if (!rows?.length) return undefined
      if (rows.length === 1) {
        const row = rows[0]
        const target = readableTarget(row) ?? 'the selected value'
        return `The lag difference at ${target} is ${formatExplanationNumber(Number(row.value), op.precision)}.`
      }
      const orderLabel = typeof op.orderField === 'string' && op.orderField.trim().length > 0 ? op.orderField.trim() : 'ordered value'
      return `The lag differences are shown across adjacent ${orderLabel} values.`
    }
    case OperationOp.Filter:
      return buildFilterExplanationTextWithContext({ op, rows, entryMap, resultsByNodeId })
    case OperationOp.Sort:
      return `The chart is sorted in ${op.order === 'desc' ? 'descending' : 'ascending'} order.`
    default:
      return undefined
  }
}

export function buildExplanationTextForOperations(args: {
  operations: OperationSpec[]
  logicalArtifacts?: LogicalExecutionArtifacts | null
  resultsByNodeId?: Map<string, DatumValue[]>
}): ExplanationSummaryText | null {
  const operations = args.operations.filter(
    (op) => op.op && op.op !== OperationOp.Draw && op.op !== OperationOp.Sleep && op.op !== 'text',
  )
  if (operations.length === 0) return null

  const { summaryEntries, entryMap } = explanationEntriesMap(operations)
  if (summaryEntries.length === 0) return null

  const initialText = joinClauses(summaryEntries.map((entry) => initialExplanationForOperation(entry.op, entryMap)))
  if (!initialText) return null

  const resultsByNodeId = args.resultsByNodeId ?? new Map<string, DatumValue[]>()
  const finalSentences = summaryEntries
    .map((entry) =>
      finalExplanationForOperation({
        op: entry.op,
        rows: resultsByNodeId.get(entry.nodeId),
        entryMap,
        resultsByNodeId,
      }),
    )
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)

  const finalText = finalSentences.length > 0 ? joinClauses(finalSentences) : undefined
  const refineOnNodeIds = summaryEntries.map((entry) => entry.nodeId).filter((value) => value.length > 0)

  return {
    initialText,
    finalText,
    refineOnNodeIds: refineOnNodeIds.length > 0 ? refineOnNodeIds : undefined,
  }
}

export { drawSummaryTextBox } from '../operation-new/primitives/drawSummaryTextBox'

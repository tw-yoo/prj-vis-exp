import { OperationOp, type DatumValue, type OperationSpec, type TargetSelector } from '../domain/operation/types'
import {
  buildAggregateLabel,
  buildBinaryLabel,
  buildOrdinalLabel,
  buildScaledLabel,
  buildValuesLabelFromTargets,
  compactSemanticList,
} from '../domain/operation/semanticLabels'
import type { LogicalExecutionArtifacts, NodeResultKind } from './visual-derived-chart'
import type { VisualExecutionStep } from './nlp-ops'

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
    case OperationOp.Compare:
      return buildBinaryLabel(
        'comparison',
        phraseForSelector({
          selector: op.targetA,
          context: { mode: 'bare-entity' },
          artifacts,
          seen,
        }),
        phraseForSelector({
          selector: op.targetB,
          context: { mode: 'bare-entity' },
          artifacts,
          seen,
        }),
        { article: true },
      )
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
    case OperationOp.DetermineRange:
      return buildAggregateLabel('range', aggregateSubjectPhrase({ op, artifacts, seen }), { article: true })
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
    case OperationOp.Compare:
      return `Compare the value of ${phraseForSelector({
        selector: op.targetA,
        context: { mode: 'bare-entity' },
        artifacts,
        seen,
      })} and ${phraseForSelector({
        selector: op.targetB,
        context: { mode: 'bare-entity' },
        artifacts,
        seen,
      })}`
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
      const factorText = Number.isFinite(factor) ? factor.toString() : 'the specified factor'
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
    case OperationOp.SetOp:
      return op.fn === 'intersection' ? 'Calculate the intersection of the selected values' : 'Calculate the union of the selected values'
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

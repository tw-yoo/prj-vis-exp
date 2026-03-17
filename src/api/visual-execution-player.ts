import type { VegaLiteSpec } from '../domain/chart'
import type { OpsSpecGroupMap } from '../domain/operation/opsSpec'
import type { OperationSpec } from '../domain/operation/types'
import { DrawAction, type DrawOp } from '../rendering/draw/types'
import { resolveEncodingFields } from '../rendering/ops/common/resolveEncodingFields'
import type { ExecutionPlan, VisualExecutionPlan, VisualExecutionStep, VisualExecutionSubstep } from './nlp-ops'
import { materializeExecutionGroups } from './nlp-ops'
import {
  buildLogicalExecutionArtifacts,
  buildPreparedSurface,
  resolveSourceBackedSelectors,
  selectDerivedSurfaceForOperation,
  type BuildSurfaceFailureReason,
  type DerivedSurfaceSelection,
  type LogicalExecutionArtifacts,
  type PreparedSurface,
} from './visual-derived-chart'
import { buildSentenceSummaryText } from './operation-summary-text'

export type VisualSurfaceState = 'unknown' | 'source-chart' | 'scalar-panel' | 'derived-chart'

export type VisualSentenceFallbackReason =
  | 'missing-visual-plan'
  | 'missing-step'
  | 'missing-logical-artifacts'
  | 'unsupported-prefilter'
  | 'unsupported-surface'
  | 'unsupported-run-op'
  | BuildSurfaceFailureReason

export type VisualSentencePlaybackResult = {
  sentenceIndex: number
  stepId: string
  usedFallback: boolean
  fallbackReason?: VisualSentenceFallbackReason
  executedSubstepIds: string[]
  finalSurface: VisualSurfaceState
}

export type VisualSubstepExecutionContext = {
  container: HTMLElement
  spec: VegaLiteSpec
  dataRows?: Array<Record<string, unknown>>
  logicalOpsSpec?: OpsSpecGroupMap
  drawPlan?: OpsSpecGroupMap
  executionPlan?: ExecutionPlan
  visualExecutionPlan?: VisualExecutionPlan
  sentenceStep: VisualExecutionStep
  logicalArtifacts: LogicalExecutionArtifacts | null
  currentSurface: VisualSurfaceState
  preparedSurfaces: Map<string, PreparedSurface>
}

type RunOpsCallback = (
  ops: OperationSpec[],
  options: {
    resetRuntime: boolean
    runtimeScope: string
    executionSpec?: VegaLiteSpec
  },
) => Promise<void>

type SentenceGroup = {
  name: string
  ops: OperationSpec[]
}

type ExecutionStrategy = {
  sentenceStep: VisualExecutionStep | null
  fallbackSentence: SentenceGroup | null
}

type SourcePreview = {
  playbackSpec: VegaLiteSpec
}

export type RunVisualSentenceStepArgs = {
  container: HTMLElement
  spec: VegaLiteSpec
  dataRows?: Array<Record<string, unknown>>
  logicalOpsSpec?: OpsSpecGroupMap
  drawPlan?: OpsSpecGroupMap
  executionPlan?: ExecutionPlan
  visualExecutionPlan?: VisualExecutionPlan
  stepIndex?: number
  sentenceIndex?: number
  currentSurface?: VisualSurfaceState
  resetRuntime?: boolean
  renderSourceChart: () => Promise<void>
  renderPlaybackChart: (spec: VegaLiteSpec) => Promise<void>
  runOps: RunOpsCallback
  renderSentenceSummary?: (text: string) => void | Promise<void>
  clearSentenceSummary?: () => void | Promise<void>
}

export type RunVisualExecutionPlanArgs = RunVisualSentenceStepArgs

function cloneSpec(spec: VegaLiteSpec): VegaLiteSpec {
  try {
    return structuredClone(spec)
  } catch {
    return JSON.parse(JSON.stringify(spec)) as VegaLiteSpec
  }
}

function resolveVisualStep(args: {
  visualExecutionPlan?: VisualExecutionPlan
  stepIndex?: number
  sentenceIndex?: number
}): VisualExecutionStep | null {
  const { visualExecutionPlan, stepIndex, sentenceIndex } = args
  if (!visualExecutionPlan?.steps?.length) return null
  if (typeof stepIndex === 'number' && Number.isInteger(stepIndex)) {
    return visualExecutionPlan.steps[stepIndex] ?? null
  }
  if (typeof sentenceIndex === 'number' && Number.isInteger(sentenceIndex)) {
    return visualExecutionPlan.steps.find((step) => step.sentenceIndex === sentenceIndex) ?? null
  }
  return visualExecutionPlan.steps[0] ?? null
}

function resolveFallbackSentenceGroup(args: {
  drawPlan?: OpsSpecGroupMap
  executionPlan?: ExecutionPlan
  visualExecutionPlan?: VisualExecutionPlan
  stepIndex?: number
  sentenceIndex?: number
}): SentenceGroup | null {
  if (!args.drawPlan) return null
  const materialized = materializeExecutionGroups({
    opsSpec: args.drawPlan,
    executionPlan: args.executionPlan,
    visualExecutionPlan: args.visualExecutionPlan,
    preferDrawGroupNames: true,
  })
  if (typeof args.stepIndex === 'number' && Number.isInteger(args.stepIndex)) {
    return materialized.groups[args.stepIndex] ?? null
  }
  if (typeof args.sentenceIndex === 'number' && Number.isInteger(args.sentenceIndex)) {
    return materialized.groups.find((group) => group.name.startsWith(`sentence:${args.sentenceIndex}:`)) ?? null
  }
  return materialized.groups[0] ?? null
}

function resolveExecutionStrategy(args: {
  drawPlan?: OpsSpecGroupMap
  executionPlan?: ExecutionPlan
  visualExecutionPlan?: VisualExecutionPlan
  stepIndex?: number
  sentenceIndex?: number
}): ExecutionStrategy {
  return {
    sentenceStep: resolveVisualStep(args),
    fallbackSentence: resolveFallbackSentenceGroup(args),
  }
}

function detectSurfaceFromOps(ops: OperationSpec[]): VisualSurfaceState {
  const hasScalarPanel = ops.some((op) => op.op === 'draw' && (op as DrawOp).action === DrawAction.ScalarPanel)
  return hasScalarPanel ? 'scalar-panel' : 'source-chart'
}

function buildPrefilterPreview(args: {
  spec: VegaLiteSpec
  dataRows?: Array<Record<string, unknown>>
  substep: VisualExecutionSubstep
}): SourcePreview | null {
  const groups = (args.substep.scope?.groups ?? []).filter(
    (value): value is string => typeof value === 'string' && value.trim().length > 0,
  )
  if (!groups.length) return null

  const resolved = resolveEncodingFields(args.spec)
  if (!resolved?.groupField || !args.dataRows) return null

  const includeSet = new Set(groups.map((value) => value.trim()))
  const filteredValues = args.dataRows.filter((row) => includeSet.has(String(row[resolved.groupField!] ?? '')))
  const playbackSpec = cloneSpec(args.spec)
  playbackSpec.data = { values: filteredValues } as VegaLiteSpec['data']
  return { playbackSpec }
}

function resolvePreparedSurface(context: VisualSubstepExecutionContext, substep: VisualExecutionSubstep) {
  const nodeId = typeof substep.nodeId === 'string' ? substep.nodeId.trim() : ''
  if (!nodeId) return null
  return context.preparedSurfaces.get(nodeId) ?? null
}

async function materializePreparedSurface(args: {
  substep: VisualExecutionSubstep
  context: VisualSubstepExecutionContext
  renderPlaybackChart: (spec: VegaLiteSpec) => Promise<void>
  runOps: RunOpsCallback
  resetRuntime: () => boolean
  selectedSurface?: DerivedSurfaceSelection | null
}) {
  const prepared = buildPreparedSurface({
    spec: args.context.spec,
    artifacts: args.context.logicalArtifacts,
    surfaceType: args.substep.surface?.surfaceType,
    nodeId: args.substep.nodeId,
    templateType: args.selectedSurface?.templateType ?? args.substep.surface?.templateType,
    sourceNodeIds: args.selectedSurface?.sourceNodeIds ?? args.substep.surface?.sourceNodeIds ?? args.substep.sourceNodeIds,
  })
  if (!prepared.ok) {
    return prepared
  }

  args.context.preparedSurfaces.set(prepared.surface.nodeId, prepared.surface)
  await args.renderPlaybackChart(prepared.surface.playbackSpec)
  if (prepared.surface.materializeOps.length > 0) {
    await args.runOps(prepared.surface.materializeOps, {
      resetRuntime: args.resetRuntime(),
      runtimeScope: `visual:${args.context.sentenceStep.id}:${args.substep.id}:materialize`,
      executionSpec: prepared.surface.playbackSpec,
    })
  }

  return prepared
}

function toFallbackReason(reason: BuildSurfaceFailureReason): VisualSentenceFallbackReason {
  return reason
}

function resolveLogicalOp(context: VisualSubstepExecutionContext, substep: VisualExecutionSubstep) {
  const nodeId = typeof substep.nodeId === 'string' ? substep.nodeId.trim() : ''
  if (!nodeId) return null
  return context.logicalArtifacts?.nodeOps.get(nodeId) ?? null
}

function resolveExecutionSurface(args: {
  context: VisualSubstepExecutionContext
  substep: VisualExecutionSubstep
  logicalOp: OperationSpec | null
}): { surfaceType: 'source-chart'; operation: OperationSpec | null } | { surfaceType: 'derived-chart'; selection: DerivedSurfaceSelection; operation: OperationSpec | null } {
  const { context, substep, logicalOp } = args
  if (!logicalOp) {
    return { surfaceType: 'source-chart', operation: null }
  }
  const canonicalOp = resolveSourceBackedSelectors(logicalOp, context.logicalArtifacts)
  const selection = selectDerivedSurfaceForOperation({
    op: logicalOp,
    artifacts: context.logicalArtifacts,
    templateType: substep.surface?.templateType,
    sourceNodeIds: substep.surface?.sourceNodeIds ?? substep.sourceNodeIds,
  })
  if (!selection) {
    return { surfaceType: 'source-chart', operation: canonicalOp }
  }
  return { surfaceType: 'derived-chart', selection, operation: logicalOp }
}

export async function executePrefilterSubstep(args: {
  substep: VisualExecutionSubstep
  context: VisualSubstepExecutionContext
  renderPlaybackChart: (spec: VegaLiteSpec) => Promise<void>
}): Promise<{
  executed: boolean
  nextSurface: VisualSurfaceState
  fallbackReason?: VisualSentenceFallbackReason
}> {
  const preview = buildPrefilterPreview({
    spec: args.context.spec,
    dataRows: args.context.dataRows,
    substep: args.substep,
  })
  if (!preview) {
    return {
      executed: false,
      nextSurface: args.context.currentSurface,
      fallbackReason: 'unsupported-prefilter',
    }
  }

  await args.renderPlaybackChart(preview.playbackSpec)
  return { executed: true, nextSurface: 'source-chart' }
}

export async function executeMaterializeSurfaceSubstep(args: {
  substep: VisualExecutionSubstep
  context: VisualSubstepExecutionContext
  renderSourceChart: () => Promise<void>
  renderPlaybackChart: (spec: VegaLiteSpec) => Promise<void>
  runOps: RunOpsCallback
  resetRuntime: () => boolean
}): Promise<{
  executed: boolean
  nextSurface: VisualSurfaceState
  fallbackReason?: VisualSentenceFallbackReason
}> {
  const logicalOp = resolveLogicalOp(args.context, args.substep)
  const executionSurface = resolveExecutionSurface({
    context: args.context,
    substep: args.substep,
    logicalOp,
  })
  if (executionSurface.surfaceType === 'source-chart') {
    return {
      executed: true,
      nextSurface: args.context.currentSurface,
    }
  }

  const surfaceType = args.substep.surface?.surfaceType
  if (surfaceType === 'source-chart' && !args.substep.nodeId) {
    await args.renderSourceChart()
    return { executed: true, nextSurface: 'source-chart' }
  }

  const prepared = await materializePreparedSurface({
    substep: args.substep,
    context: args.context,
    renderPlaybackChart: args.renderPlaybackChart,
    runOps: args.runOps,
    resetRuntime: args.resetRuntime,
    selectedSurface: executionSurface.selection,
  })
  if (!prepared.ok) {
    return {
      executed: false,
      nextSurface: args.context.currentSurface,
      fallbackReason: toFallbackReason(prepared.reason),
    }
  }

  return {
    executed: true,
    nextSurface: 'derived-chart',
  }
}

export async function executeRunOpSubstep(args: {
  substep: VisualExecutionSubstep
  context: VisualSubstepExecutionContext
  renderSourceChart: () => Promise<void>
  renderPlaybackChart: (spec: VegaLiteSpec) => Promise<void>
  runOps: RunOpsCallback
  resetRuntime: () => boolean
  restartSourceLayer: boolean
}): Promise<{
  executed: boolean
  nextSurface: VisualSurfaceState
  fallbackReason?: VisualSentenceFallbackReason
}> {
  const logicalOp = resolveLogicalOp(args.context, args.substep)
  const executionSurface = resolveExecutionSurface({
    context: args.context,
    substep: args.substep,
    logicalOp,
  })

  if (!executionSurface.operation) {
    return {
      executed: false,
      nextSurface: args.context.currentSurface,
      fallbackReason: 'unsupported-run-op',
    }
  }

  if (executionSurface.surfaceType === 'source-chart') {
    const hasInputs = Array.isArray(executionSurface.operation.meta?.inputs) && executionSurface.operation.meta.inputs.length > 0
    if (args.context.currentSurface !== 'source-chart' || (args.restartSourceLayer && !hasInputs)) {
      await args.renderSourceChart()
    }
    await args.runOps([executionSurface.operation], {
      resetRuntime: args.resetRuntime(),
      runtimeScope: `visual:${args.context.sentenceStep.id}:${args.substep.id}`,
      executionSpec: args.context.spec,
    })
    return { executed: true, nextSurface: 'source-chart' }
  }

  let prepared = resolvePreparedSurface(args.context, args.substep)
  if (!prepared) {
    const materialized = await materializePreparedSurface({
      substep: args.substep,
      context: args.context,
      renderPlaybackChart: args.renderPlaybackChart,
      runOps: args.runOps,
      resetRuntime: args.resetRuntime,
      selectedSurface: executionSurface.selection,
    })
    if (!materialized.ok) {
      return {
        executed: false,
        nextSurface: args.context.currentSurface,
        fallbackReason: toFallbackReason(materialized.reason),
      }
    }
    prepared = materialized.surface
  }

  await args.runOps(prepared.runOps, {
    resetRuntime: args.resetRuntime(),
    runtimeScope: `visual:${args.context.sentenceStep.id}:${args.substep.id}`,
    executionSpec: prepared.playbackSpec,
  })
  return { executed: true, nextSurface: 'derived-chart' }
}

export async function runVisualSentenceStep(args: RunVisualSentenceStepArgs): Promise<VisualSentencePlaybackResult> {
  const strategy = resolveExecutionStrategy(args)
  const sentenceStep = strategy.sentenceStep
  const fallbackSentence = strategy.fallbackSentence

  if (!sentenceStep) {
    if (!fallbackSentence) {
      throw new Error('visual execution step is unavailable')
    }
    if (args.clearSentenceSummary) {
      await args.clearSentenceSummary()
    }
    await args.renderSourceChart()
    await args.runOps(fallbackSentence.ops, {
      resetRuntime: args.resetRuntime ?? true,
      runtimeScope: fallbackSentence.name,
    })
    return {
      sentenceIndex: args.sentenceIndex ?? 1,
      stepId: `fallback-${args.stepIndex ?? 0}`,
      usedFallback: true,
      fallbackReason: 'missing-step',
      executedSubstepIds: [],
      finalSurface: detectSurfaceFromOps(fallbackSentence.ops),
    }
  }

  const executedSubstepIds: string[] = []
  let currentSurface: VisualSurfaceState = args.currentSurface ?? 'unknown'
  let nextResetRuntime = args.resetRuntime ?? true
  let sourceRunCount = 0
  const takeResetRuntime = () => {
    const shouldReset = nextResetRuntime
    nextResetRuntime = false
    return shouldReset
  }
  const context: VisualSubstepExecutionContext = {
    container: args.container,
    spec: args.spec,
    dataRows: args.dataRows,
    logicalOpsSpec: args.logicalOpsSpec,
    drawPlan: args.drawPlan,
    executionPlan: args.executionPlan,
    visualExecutionPlan: args.visualExecutionPlan,
    sentenceStep,
    logicalArtifacts: buildLogicalExecutionArtifacts({
      spec: args.spec,
      dataRows: args.dataRows ?? [],
      logicalOpsSpec: args.logicalOpsSpec,
    }),
    currentSurface,
    preparedSurfaces: new Map<string, PreparedSurface>(),
  }
  const summary = buildSentenceSummaryText({
    step: sentenceStep,
    logicalArtifacts: context.logicalArtifacts,
  })
  let currentSummaryText = ''
  const renderSummary = async (text: string | null | undefined) => {
    if (!text || !args.renderSentenceSummary) return
    currentSummaryText = text
    await args.renderSentenceSummary(text)
  }
  const clearSummary = async () => {
    currentSummaryText = ''
    if (args.clearSentenceSummary) await args.clearSentenceSummary()
  }
  const renderSourceChartWithSummary = async () => {
    await args.renderSourceChart()
    if (currentSummaryText && args.renderSentenceSummary) {
      await args.renderSentenceSummary(currentSummaryText)
    }
  }
  const renderPlaybackChartWithSummary = async (spec: VegaLiteSpec) => {
    await args.renderPlaybackChart(spec)
    if (currentSummaryText && args.renderSentenceSummary) {
      await args.renderSentenceSummary(currentSummaryText)
    }
  }

  const runFallback = async (reason: VisualSentenceFallbackReason) => {
    if (!fallbackSentence) {
      throw new Error(`visual sentence fallback failed: ${reason}`)
    }
    if (!summary) {
      await clearSummary()
    } else {
      await renderSummary(summary.initialText)
    }
    await renderSourceChartWithSummary()
    await args.runOps(fallbackSentence.ops, {
      resetRuntime: args.resetRuntime ?? true,
      runtimeScope: fallbackSentence.name,
    })
    return {
      sentenceIndex: sentenceStep.sentenceIndex,
      stepId: sentenceStep.id,
      usedFallback: true,
      fallbackReason: reason,
      executedSubstepIds: [],
      finalSurface: detectSurfaceFromOps(fallbackSentence.ops),
    } satisfies VisualSentencePlaybackResult
  }

  if (!summary) {
    await clearSummary()
  } else {
    await renderSummary(summary.initialText)
  }

  for (const substep of sentenceStep.substeps) {
    context.currentSurface = currentSurface

    if (substep.kind === 'prefilter') {
      const result = await executePrefilterSubstep({
        substep,
        context,
        renderPlaybackChart: renderPlaybackChartWithSummary,
      })
      if (!result.executed) {
        return runFallback(result.fallbackReason ?? 'unsupported-prefilter')
      }
      currentSurface = result.nextSurface
      executedSubstepIds.push(substep.id)
      continue
    }

    if (substep.kind === 'materialize-surface') {
      const result = await executeMaterializeSurfaceSubstep({
        substep,
        context,
        renderSourceChart: renderSourceChartWithSummary,
        renderPlaybackChart: renderPlaybackChartWithSummary,
        runOps: args.runOps,
        resetRuntime: takeResetRuntime,
      })
      if (!result.executed) {
        return runFallback(result.fallbackReason ?? 'unsupported-surface')
      }
      currentSurface = result.nextSurface
      executedSubstepIds.push(substep.id)
      continue
    }

    if (substep.kind === 'run-op') {
      const result = await executeRunOpSubstep({
        substep,
        context,
        renderSourceChart: renderSourceChartWithSummary,
        renderPlaybackChart: renderPlaybackChartWithSummary,
        runOps: args.runOps,
        resetRuntime: takeResetRuntime,
        restartSourceLayer: sourceRunCount === 0,
      })
      if (!result.executed) {
        return runFallback(result.fallbackReason ?? 'unsupported-run-op')
      }
      currentSurface = result.nextSurface
      if (result.nextSurface === 'source-chart') {
        sourceRunCount += 1
      }
      executedSubstepIds.push(substep.id)
      continue
    }
  }

  if (summary?.finalText) {
    await renderSummary(summary.finalText)
  }

  return {
    sentenceIndex: sentenceStep.sentenceIndex,
    stepId: sentenceStep.id,
    usedFallback: false,
    executedSubstepIds,
    finalSurface: currentSurface,
  }
}

export async function runVisualExecutionPlan(
  args: RunVisualExecutionPlanArgs,
): Promise<VisualSentencePlaybackResult> {
  return runVisualSentenceStep(args)
}

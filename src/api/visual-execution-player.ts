import type { VegaLiteSpec } from '../domain/chart'
import { normalizeOpsGroups, type OpsSpecGroupMap } from '../domain/operation/opsSpec'
import type { OperationSpec } from '../domain/operation/types'
import { DrawAction, type DrawOp } from '../rendering/draw/types'
import type { ExecutionPlan, VisualExecutionPlan, VisualExecutionStep, VisualExecutionSubstep } from './nlp-ops'
import { materializeExecutionGroups } from './nlp-ops'
import { buildDerivedChartSurface } from './visual-derived-chart'

export type VisualSurfaceState = 'unknown' | 'source-chart' | 'scalar-panel' | 'derived-chart'

export type VisualSentenceFallbackReason =
  | 'missing-visual-plan'
  | 'missing-step'
  | 'missing-draw-plan'
  | 'missing-direct-draw-ops'
  | 'unsupported-surface'
  | 'unsupported-run-op'

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
  drawOpsByGroup: Map<string, DrawOp[]>
  sentenceDrawOps: DrawOp[]
  currentSurface: VisualSurfaceState
  preparedDerivedRunOps: Map<string, OperationSpec[]>
  preparedDerivedSpecs: Map<string, VegaLiteSpec>
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
}

export type RunVisualExecutionPlanArgs = RunVisualSentenceStepArgs

const PREFILTER_ACTIONS = new Set<DrawAction>([
  DrawAction.Filter,
  DrawAction.GroupedFilterGroups,
  DrawAction.StackedFilterGroups,
])

function toDrawGroupMap(drawPlan?: OpsSpecGroupMap) {
  const groups = normalizeOpsGroups(drawPlan)
  const out = new Map<string, DrawOp[]>()
  groups.forEach((group) => {
    out.set(
      group.name,
      group.ops.filter((op): op is DrawOp => op.op === 'draw' && typeof (op as DrawOp).action === 'string') as DrawOp[],
    )
  })
  return out
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
    return (
      materialized.groups.find((group) => group.name.startsWith(`sentence:${args.sentenceIndex}:`)) ?? null
    )
  }
  return materialized.groups[0] ?? null
}

function detectSurfaceFromOps(ops: OperationSpec[]): VisualSurfaceState {
  const hasScalarPanel = ops.some(
    (op) => op.op === 'draw' && (op as DrawOp).action === DrawAction.ScalarPanel,
  )
  return hasScalarPanel ? 'scalar-panel' : 'source-chart'
}

function sentenceDrawOpsForStep(step: VisualExecutionStep, drawOpsByGroup: Map<string, DrawOp[]>) {
  return step.groupNames.flatMap((groupName) => drawOpsByGroup.get(groupName) ?? [])
}

function groupDrawOpsForSubstep(substep: VisualExecutionSubstep, drawOpsByGroup: Map<string, DrawOp[]>) {
  return drawOpsByGroup.get(substep.groupName) ?? []
}

function resolveScalarPanelBaseOps(sentenceDrawOps: DrawOp[]) {
  const scalarOps = sentenceDrawOps.filter((op) => op.action === DrawAction.ScalarPanel)
  const baseOps = scalarOps.filter((op) => op.scalarPanel?.mode === 'base')
  if (baseOps.length > 0) return baseOps
  return scalarOps.slice(0, 1)
}

function resolveScalarPanelRunOps(sentenceDrawOps: DrawOp[]) {
  const scalarOps = sentenceDrawOps.filter((op) => op.action === DrawAction.ScalarPanel)
  const diffOps = scalarOps.filter((op) => op.scalarPanel?.mode === 'diff')
  if (diffOps.length > 0) return diffOps
  return scalarOps
}

function supportsDirectScalarSurface(substep: VisualExecutionSubstep, sentenceDrawOps: DrawOp[]) {
  const surfaceType = substep.surface?.surfaceType
  if (surfaceType !== 'derived-chart' && surfaceType !== 'scalar-panel') return false
  return sentenceDrawOps.some((op) => op.action === DrawAction.ScalarPanel)
}

function resolvePreparedDerivedRunOps(context: VisualSubstepExecutionContext, substep: VisualExecutionSubstep) {
  const nodeId = typeof substep.nodeId === 'string' ? substep.nodeId : ''
  if (!nodeId) return null
  const runOps = context.preparedDerivedRunOps.get(nodeId)
  const spec = context.preparedDerivedSpecs.get(nodeId)
  if (!runOps?.length || !spec) return null
  return { runOps, spec }
}

function resolveSourceChartRunOps(groupDrawOps: DrawOp[]) {
  return groupDrawOps.filter(
    (op) =>
      op.action !== DrawAction.Clear &&
      !PREFILTER_ACTIONS.has(op.action) &&
      op.action !== DrawAction.ScalarPanel,
  )
}

export async function executePrefilterSubstep(args: {
  substep: VisualExecutionSubstep
  context: VisualSubstepExecutionContext
  ensureSourceChart: () => Promise<void>
  runOps: RunOpsCallback
  resetRuntime: () => boolean
}): Promise<{ executed: boolean; nextSurface: VisualSurfaceState }> {
  await args.ensureSourceChart()
  const prefilterOps = groupDrawOpsForSubstep(args.substep, args.context.drawOpsByGroup).filter((op) =>
    PREFILTER_ACTIONS.has(op.action),
  )
  if (!prefilterOps.length) {
    return { executed: false, nextSurface: 'source-chart' }
  }
  await args.runOps(prefilterOps, {
    resetRuntime: args.resetRuntime(),
    runtimeScope: `visual:${args.context.sentenceStep.id}:${args.substep.id}`,
  })
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
  const surfaceType = args.substep.surface?.surfaceType
  if (surfaceType === 'source-chart') {
    await args.renderSourceChart()
    return { executed: true, nextSurface: 'source-chart' }
  }

  if (surfaceType === 'derived-chart') {
    const prepared = buildDerivedChartSurface({
      spec: args.context.spec,
      dataRows: args.context.dataRows ?? [],
      logicalOpsSpec: args.context.logicalOpsSpec,
      nodeId: args.substep.nodeId,
      templateType: args.substep.surface?.templateType,
      sourceNodeIds: args.substep.surface?.sourceNodeIds ?? args.substep.sourceNodeIds,
    })
    if (!prepared) {
      return {
        executed: false,
        nextSurface: args.context.currentSurface,
        fallbackReason: 'unsupported-surface',
      }
    }
    if (typeof args.substep.nodeId === 'string' && args.substep.nodeId.trim().length > 0) {
      args.context.preparedDerivedRunOps.set(args.substep.nodeId, prepared.runOps)
      args.context.preparedDerivedSpecs.set(args.substep.nodeId, prepared.spec)
    }
    await args.renderPlaybackChart(prepared.spec)
    return {
      executed: true,
      nextSurface: 'derived-chart',
    }
  }

  if (!supportsDirectScalarSurface(args.substep, args.context.sentenceDrawOps)) {
    return {
      executed: false,
      nextSurface: args.context.currentSurface,
      fallbackReason: 'unsupported-surface',
    }
  }

  const baseOps = resolveScalarPanelBaseOps(args.context.sentenceDrawOps)
  if (!baseOps.length) {
    return {
      executed: false,
      nextSurface: args.context.currentSurface,
      fallbackReason: 'missing-direct-draw-ops',
    }
  }

  await args.runOps(baseOps, {
    resetRuntime: args.resetRuntime(),
    runtimeScope: `visual:${args.context.sentenceStep.id}:${args.substep.id}`,
  })
  return {
    executed: true,
    nextSurface: 'scalar-panel',
  }
}

export async function executeRunOpSubstep(args: {
  substep: VisualExecutionSubstep
  context: VisualSubstepExecutionContext
  ensureSourceChart: () => Promise<void>
  runOps: RunOpsCallback
  resetRuntime: () => boolean
}): Promise<{
  executed: boolean
  nextSurface: VisualSurfaceState
  fallbackReason?: VisualSentenceFallbackReason
}> {
  const preparedDerived = resolvePreparedDerivedRunOps(args.context, args.substep)
  if (preparedDerived) {
    await args.runOps(preparedDerived.runOps, {
      resetRuntime: args.resetRuntime(),
      runtimeScope: `visual:${args.context.sentenceStep.id}:${args.substep.id}`,
      executionSpec: preparedDerived.spec,
    })
    return { executed: true, nextSurface: 'derived-chart' }
  }

  if (args.context.sentenceDrawOps.some((op) => op.action === DrawAction.ScalarPanel)) {
    const runOps = resolveScalarPanelRunOps(args.context.sentenceDrawOps)
    if (!runOps.length) {
      return {
        executed: false,
        nextSurface: args.context.currentSurface,
        fallbackReason: 'missing-direct-draw-ops',
      }
    }
    await args.runOps(runOps, {
        resetRuntime: args.resetRuntime(),
        runtimeScope: `visual:${args.context.sentenceStep.id}:${args.substep.id}`,
      })
    return { executed: true, nextSurface: 'scalar-panel' }
  }

  const surfaceType = args.substep.surface?.surfaceType ?? 'source-chart'
  if (surfaceType !== 'source-chart') {
    return {
      executed: false,
      nextSurface: args.context.currentSurface,
      fallbackReason: 'unsupported-run-op',
    }
  }

  await args.ensureSourceChart()
  const directRunOps = resolveSourceChartRunOps(groupDrawOpsForSubstep(args.substep, args.context.drawOpsByGroup))
  if (!directRunOps.length) {
    return {
      executed: false,
      nextSurface: args.context.currentSurface,
      fallbackReason: 'missing-direct-draw-ops',
    }
  }

  await args.runOps(directRunOps, {
    resetRuntime: args.resetRuntime(),
    runtimeScope: `visual:${args.context.sentenceStep.id}:${args.substep.id}`,
  })
  return { executed: true, nextSurface: 'source-chart' }
}

export async function runVisualSentenceStep(
  args: RunVisualSentenceStepArgs,
): Promise<VisualSentencePlaybackResult> {
  const sentenceStep = resolveVisualStep(args)
  const fallbackSentence = resolveFallbackSentenceGroup(args)

  if (!sentenceStep) {
    if (!fallbackSentence) {
      throw new Error('visual execution step is unavailable')
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

  const drawOpsByGroup = toDrawGroupMap(args.drawPlan)
  const sentenceDrawOps = sentenceDrawOpsForStep(sentenceStep, drawOpsByGroup)
  const executedSubstepIds: string[] = []
  let currentSurface: VisualSurfaceState = args.currentSurface ?? 'unknown'
  let nextResetRuntime = args.resetRuntime ?? true
  const takeResetRuntime = () => {
    const shouldReset = nextResetRuntime
    nextResetRuntime = false
    return shouldReset
  }
  const ensureSourceChart = async () => {
    if (currentSurface === 'source-chart') return
    await args.renderSourceChart()
    currentSurface = 'source-chart'
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
    drawOpsByGroup,
    sentenceDrawOps,
    currentSurface,
    preparedDerivedRunOps: new Map<string, OperationSpec[]>(),
    preparedDerivedSpecs: new Map<string, VegaLiteSpec>(),
  }

  const runFallback = async (reason: VisualSentenceFallbackReason) => {
    if (!fallbackSentence) {
      throw new Error(`visual sentence fallback failed: ${reason}`)
    }
    await args.renderSourceChart()
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

  if (!args.drawPlan) {
    return runFallback('missing-draw-plan')
  }

  for (const substep of sentenceStep.substeps) {
    context.currentSurface = currentSurface
    if (substep.kind === 'prefilter') {
      const result = await executePrefilterSubstep({
        substep,
        context,
        ensureSourceChart,
        runOps: args.runOps,
        resetRuntime: takeResetRuntime,
      })
      currentSurface = result.nextSurface
      executedSubstepIds.push(substep.id)
      continue
    }

    if (substep.kind === 'materialize-surface') {
      const result = await executeMaterializeSurfaceSubstep({
        substep,
        context,
        renderSourceChart: args.renderSourceChart,
        renderPlaybackChart: args.renderPlaybackChart,
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
        ensureSourceChart,
        runOps: args.runOps,
        resetRuntime: takeResetRuntime,
      })
      if (!result.executed) {
        return runFallback(result.fallbackReason ?? 'unsupported-run-op')
      }
      currentSurface = result.nextSurface
      executedSubstepIds.push(substep.id)
      continue
    }
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

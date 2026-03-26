import type { VegaLiteSpec } from '../domain/chart'
import { ChartType, getChartType, type ChartTypeValue } from '../domain/chart'
import { toDatumValuesFromRaw, type RawRow } from '../domain/data/datum'
import type { OpsSpecGroupMap } from '../domain/operation/opsSpec'
import type { DatumValue, OperationSpec } from '../domain/operation/types'
import { DrawAction, type DrawOp } from '../rendering/draw/types'
import { resolveEncodingFields } from '../rendering/ops/common/resolveEncodingFields'
import type { ExecutionPlan, VisualExecutionPlan, VisualExecutionStep, VisualExecutionSubstep } from './nlp-ops'
import { materializeExecutionGroups } from './nlp-ops'
import type { SurfaceManager } from './surface-manager'
import { SurfaceTransitionController, type MultiSurfaceLayoutTarget } from './surface-transition-controller'
import {
  buildLogicalExecutionArtifacts,
  buildPreparedSurface,
  resolveSourceBackedSelectors,
  selectDerivedSurfaceForOperation,
  type BuildSurfaceFailureReason,
  type DerivedSurfaceSelection,
  type LogicalExecutionArtifacts,
  type PreparedSurface,
  type PreparedSurfaceRevealPolicy,
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
  surfaceManager?: SurfaceManager
  logicalOpsSpec?: OpsSpecGroupMap
  drawPlan?: OpsSpecGroupMap
  executionPlan?: ExecutionPlan
  visualExecutionPlan?: VisualExecutionPlan
  sentenceStep: VisualExecutionStep
  logicalArtifacts: LogicalExecutionArtifacts | null
  currentSurface: VisualSurfaceState
  preparedSurfaces: Map<string, PreparedSurface>
  revealedPreparedSurfaces: Set<string>
  skipDelays: boolean
}

type RunOpsCallback = (
  ops: OperationSpec[],
  options: {
    resetRuntime: boolean
    runtimeScope: string
    executionSpec?: VegaLiteSpec
    surfaceId?: string
  },
) => Promise<void>

const SPLIT_REVEAL_DELAY_MS = 1000
const SURFACE_SPLIT_TRANSITION_MS = 440
const SURFACE_TRANSITION_STAGGER_MS = 56
const MIN_PREPARED_SURFACE_REVEAL_MS = 120

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
  surfaceManager?: SurfaceManager
  skipDelays?: boolean
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

function preparedSurfaceRevealKey(prepared: PreparedSurface, surfaceId?: string) {
  return `${surfaceId ?? 'root'}::${prepared.nodeId}`
}

async function ensurePreparedSurfaceReveal(args: {
  context: VisualSubstepExecutionContext
  prepared: PreparedSurface
  surfaceId?: string
}) {
  const key = preparedSurfaceRevealKey(args.prepared, args.surfaceId)
  if (args.context.revealedPreparedSurfaces.has(key)) return
  args.context.revealedPreparedSurfaces.add(key)

  const policy: PreparedSurfaceRevealPolicy | undefined = args.prepared.revealPolicy
  const baseRevealDelayMs = Math.max(
    MIN_PREPARED_SURFACE_REVEAL_MS,
    Math.round(policy?.baseRevealDelayMs ?? 0),
  )
  if (args.context.skipDelays || !(baseRevealDelayMs > 0)) return
  await sleepMs(baseRevealDelayMs)
}

function cloneRecordRows(rows: Array<Record<string, unknown>>): RawRow[] {
  return rows.map((row) => {
    const normalized: RawRow = {}
    Object.entries(row).forEach(([key, value]) => {
      if (value === null || value === undefined) {
        normalized[key] = null
      } else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        normalized[key] = value
      } else {
        normalized[key] = String(value)
      }
    })
    return normalized
  })
}

function buildDatumValuesForSpec(spec: VegaLiteSpec, rows: RawRow[]): DatumValue[] {
  const resolved = resolveEncodingFields(spec)
  if (!resolved) return []
  return toDatumValuesFromRaw(rows, {
    xField: resolved.xField,
    yField: resolved.yField,
    groupField: resolved.groupField ?? undefined,
  })
}

function buildFilteredPlaybackSpec(spec: VegaLiteSpec, rows: RawRow[]): VegaLiteSpec {
  const playbackSpec = cloneSpec(spec)
  playbackSpec.data = { values: cloneRecordRows(rows) } as VegaLiteSpec['data']
  return playbackSpec
}

function sleepMs(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function resolveSurfaceSpec(context: VisualSubstepExecutionContext, surfaceId?: string): VegaLiteSpec {
  if (!surfaceId || surfaceId === 'root') return context.spec
  return context.surfaceManager?.getSurface(surfaceId)?.spec ?? context.spec
}

function resolveSurfaceChartType(context: VisualSubstepExecutionContext, surfaceId?: string): ChartTypeValue | null {
  if (!surfaceId || surfaceId === 'root') return getChartType(context.spec)
  return context.surfaceManager?.getSurface(surfaceId)?.chartType ?? getChartType(context.spec)
}

function resolveSubstepSurfaceId(substep: VisualExecutionSubstep): string | undefined {
  const surfaceId = typeof substep.surface?.surfaceId === 'string' ? substep.surface.surfaceId.trim() : ''
  return surfaceId.length > 0 ? surfaceId : undefined
}

function resolveSurfaceHost(context: VisualSubstepExecutionContext, surfaceId?: string): HTMLElement | null {
  if (!surfaceId || surfaceId === 'root') return context.container
  return (context.surfaceManager?.getSurface(surfaceId)?.hostElement as HTMLElement | null) ?? null
}

function createMultiSurfaceLayoutTarget(args: {
  layoutMode?: 'single' | 'split-horizontal' | 'split-vertical'
  surfaceIds: string[]
}): MultiSurfaceLayoutTarget {
  return {
    orientation: args.layoutMode === 'split-vertical' ? 'vertical' : 'horizontal',
    surfaceIds: [...args.surfaceIds],
  }
}

function createSurfaceTransitionController(context: VisualSubstepExecutionContext): SurfaceTransitionController | null {
  const stageElement =
    context.container.parentElement instanceof HTMLElement ? context.container.parentElement : context.container
  if (!(stageElement instanceof HTMLElement)) return null
  return new SurfaceTransitionController({ stageElement })
}

function applySurfaceScopeToOps(ops: OperationSpec[], surfaceId?: string): OperationSpec[] {
  if (!surfaceId) return ops
  return ops.map((op) => {
    if (typeof op.surfaceId === 'string' && op.surfaceId.trim().length > 0) return op
    return {
      ...op,
      surfaceId,
    }
  })
}

function buildSurfaceActionOps(substep: VisualExecutionSubstep): OperationSpec[] | null {
  const action = substep.surface?.surfaceAction
  if (action === 'split') {
    return [
      {
        op: 'draw',
        action: DrawAction.Split,
        split: substep.surface?.splitSpec,
        surfaceId: resolveSubstepSurfaceId(substep) ?? 'root',
      } as DrawOp as OperationSpec,
    ]
  }
  if (action === 'merge') {
    return [
      {
        op: 'draw',
        action: DrawAction.Unsplit,
        surfaceId: resolveSubstepSurfaceId(substep) ?? 'root',
      } as DrawOp as OperationSpec,
    ]
  }
  return null
}

async function materializePreparedSurface(args: {
  substep: VisualExecutionSubstep
  context: VisualSubstepExecutionContext
  renderPlaybackChart: (spec: VegaLiteSpec) => Promise<void>
  runOps: RunOpsCallback
  resetRuntime: () => boolean
  selectedSurface?: DerivedSurfaceSelection | null
  surfaceId?: string
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
  if (!args.surfaceId || args.surfaceId === 'root') {
    await args.renderPlaybackChart(prepared.surface.playbackSpec)
  }
  if (prepared.surface.materializeOps.length > 0) {
    await args.runOps(applySurfaceScopeToOps(prepared.surface.materializeOps, args.surfaceId), {
      resetRuntime: args.resetRuntime(),
      runtimeScope: `visual:${args.context.sentenceStep.id}:${args.substep.id}:materialize`,
      executionSpec: prepared.surface.playbackSpec,
      surfaceId: args.surfaceId,
    })
  }

  return prepared
}

export async function executeSurfaceActionSubstep(args: {
  substep: VisualExecutionSubstep
  context: VisualSubstepExecutionContext
  runOps: RunOpsCallback
  resetRuntime: () => boolean
}): Promise<{
  executed: boolean
  nextSurface: VisualSurfaceState
  fallbackReason?: VisualSentenceFallbackReason
}> {
  const action = args.substep.surface?.surfaceAction
  const surfaceManager = args.context.surfaceManager
  if (!action || !surfaceManager) {
    return {
      executed: false,
      nextSurface: args.context.currentSurface,
      fallbackReason: 'unsupported-surface',
    }
  }

  if (action === 'split') {
    const branchSurfaceIds = args.substep.surface?.branchSurfaceIds
    const leftId = branchSurfaceIds?.left?.trim()
    const rightId = branchSurfaceIds?.right?.trim()
    if (!leftId || !rightId) {
      return {
        executed: false,
        nextSurface: args.context.currentSurface,
        fallbackReason: 'unsupported-surface',
      }
    }
    const baseRows = cloneRecordRows(args.context.dataRows ?? [])
    const parentSurfaceId = args.substep.surface?.parentSurfaceId?.trim() || 'root'
    const baseSpec = resolveSurfaceSpec(args.context, parentSurfaceId)
    const sourceHost = resolveSurfaceHost(args.context, parentSurfaceId)
    const transitionController = createSurfaceTransitionController(args.context)
    const sourceSnapshot = transitionController && sourceHost ? transitionController.captureSurfaceSnapshot(sourceHost) : null
    const leftRows = cloneRecordRows(baseRows)
    const rightRows = cloneRecordRows(baseRows)
    const specA = buildFilteredPlaybackSpec(baseSpec, leftRows)
    const specB = buildFilteredPlaybackSpec(baseSpec, rightRows)
    surfaceManager.splitSurface(args.substep.surface?.layoutMode === 'split-vertical' ? 'vertical' : 'horizontal', {
      idA: leftId,
      idB: rightId,
      specA,
      specB,
      dataA: buildDatumValuesForSpec(specA, leftRows),
      dataB: buildDatumValuesForSpec(specB, rightRows),
    })
    await args.runOps([], {
      resetRuntime: args.resetRuntime(),
      runtimeScope: `visual:${args.context.sentenceStep.id}:${args.substep.id}:split-left`,
      executionSpec: specA,
      surfaceId: leftId,
    })
    await args.runOps([], {
      resetRuntime: false,
      runtimeScope: `visual:${args.context.sentenceStep.id}:${args.substep.id}:split-right`,
      executionSpec: specB,
      surfaceId: rightId,
    })
    const leftHost = resolveSurfaceHost(args.context, leftId)
    const rightHost = resolveSurfaceHost(args.context, rightId)
    if (transitionController && sourceHost && leftHost && rightHost) {
      await transitionController.animateSplit({
        sourceHost,
        sourceSnapshot: sourceSnapshot ?? undefined,
        targetHosts: [leftHost, rightHost],
        layout: createMultiSurfaceLayoutTarget({
          layoutMode: args.substep.surface?.layoutMode,
          surfaceIds: [leftId, rightId],
        }),
        durationMs: SURFACE_SPLIT_TRANSITION_MS,
        staggerMs: SURFACE_TRANSITION_STAGGER_MS,
      })
    }
    return {
      executed: true,
      nextSurface: 'source-chart',
    }
  }

  if (action === 'merge') {
    const branchSurfaceIds = args.substep.surface?.branchSurfaceIds
    const leftId = branchSurfaceIds?.left?.trim()
    const rightId = branchSurfaceIds?.right?.trim()
    const mergeTargetSurfaceId = args.substep.surface?.mergeTargetSurfaceId?.trim() || 'root'
    if (!leftId || !rightId) {
      return {
        executed: false,
        nextSurface: args.context.currentSurface,
        fallbackReason: 'unsupported-surface',
      }
    }
    const mergeSpec = resolveSurfaceSpec(args.context, mergeTargetSurfaceId)
    const mergedRows = cloneRecordRows(args.context.dataRows ?? [])
    const mergeChartType =
      resolveSurfaceChartType(args.context, mergeTargetSurfaceId) ?? getChartType(mergeSpec) ?? ChartType.SIMPLE_BAR
    surfaceManager.mergeSurfaces(
      leftId,
      rightId,
      mergeSpec,
      mergeChartType,
      buildDatumValuesForSpec(mergeSpec, mergedRows),
    )
    return {
      executed: true,
      nextSurface: 'source-chart',
    }
  }

  const surfaceOps = buildSurfaceActionOps(args.substep)
  if (!surfaceOps) {
    return {
      executed: false,
      nextSurface: args.context.currentSurface,
      fallbackReason: 'unsupported-surface',
    }
  }
  const surfaceId = resolveSubstepSurfaceId(args.substep)
  await args.runOps(surfaceOps, {
    resetRuntime: args.resetRuntime(),
    runtimeScope: `visual:${args.context.sentenceStep.id}:${args.substep.id}:${action}`,
    executionSpec: args.context.spec,
    surfaceId,
  })
  return {
    executed: true,
    nextSurface: args.context.currentSurface,
  }
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
  const surfaceId = resolveSubstepSurfaceId(args.substep)
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
    if (!surfaceId || surfaceId === 'root') {
      await args.renderSourceChart()
    }
    return { executed: true, nextSurface: 'source-chart' }
  }

  const prepared = await materializePreparedSurface({
    substep: args.substep,
    context: args.context,
    renderPlaybackChart: args.renderPlaybackChart,
    runOps: args.runOps,
    resetRuntime: args.resetRuntime,
    selectedSurface: executionSurface.selection,
    surfaceId,
  })
  if (!prepared.ok) {
    return {
      executed: false,
      nextSurface: args.context.currentSurface,
      fallbackReason: toFallbackReason(prepared.reason),
    }
  }

  if (surfaceId && surfaceId !== 'root') {
    await args.runOps([], {
      resetRuntime: false,
      runtimeScope: `visual:${args.context.sentenceStep.id}:${args.substep.id}:surface-render`,
      executionSpec: prepared.surface.playbackSpec,
      surfaceId,
    })
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
  const surfaceId = resolveSubstepSurfaceId(args.substep)
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
    if (
      (!surfaceId || surfaceId === 'root') &&
      (args.context.currentSurface !== 'source-chart' || (args.restartSourceLayer && !hasInputs))
    ) {
      await args.renderSourceChart()
    }
    await args.runOps(applySurfaceScopeToOps([executionSurface.operation], surfaceId), {
      resetRuntime: args.resetRuntime(),
      runtimeScope: `visual:${args.context.sentenceStep.id}:${args.substep.id}`,
      executionSpec: resolveSurfaceSpec(args.context, surfaceId),
      surfaceId,
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
      surfaceId,
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

  await ensurePreparedSurfaceReveal({
    context: args.context,
    prepared,
    surfaceId,
  })

  await args.runOps(applySurfaceScopeToOps(prepared.runOps, surfaceId), {
    resetRuntime: args.resetRuntime(),
    runtimeScope: `visual:${args.context.sentenceStep.id}:${args.substep.id}`,
    executionSpec: prepared.playbackSpec,
    surfaceId,
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
  let pendingSplitReveal = false
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
    surfaceManager: args.surfaceManager,
    currentSurface,
    preparedSurfaces: new Map<string, PreparedSurface>(),
    revealedPreparedSurfaces: new Set<string>(),
    skipDelays: args.skipDelays ?? false,
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

    if (substep.kind === 'surface-action') {
      const result = await executeSurfaceActionSubstep({
        substep,
        context,
        runOps: args.runOps,
        resetRuntime: takeResetRuntime,
      })
      if (!result.executed) {
        return runFallback(result.fallbackReason ?? 'unsupported-surface')
      }
      currentSurface = result.nextSurface
      if (substep.surface?.surfaceAction === 'split') {
        pendingSplitReveal = true
      }
      executedSubstepIds.push(substep.id)
      continue
    }

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
      if (pendingSplitReveal && !args.skipDelays && resolveSubstepSurfaceId(substep) && resolveSubstepSurfaceId(substep) !== 'root') {
        await sleepMs(SPLIT_REVEAL_DELAY_MS)
        pendingSplitReveal = false
      }
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
      if (pendingSplitReveal && !args.skipDelays && resolveSubstepSurfaceId(substep) && resolveSubstepSurfaceId(substep) !== 'root') {
        await sleepMs(SPLIT_REVEAL_DELAY_MS)
        pendingSplitReveal = false
      }
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

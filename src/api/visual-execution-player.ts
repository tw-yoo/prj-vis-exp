import type { ChartSpec } from '../domain/chart'
import { ChartType, getChartType, type ChartTypeValue } from '../domain/chart'
import { toDatumValuesFromRaw, type RawRow } from '../domain/data/datum'
import type { OpsSpecGroupMap } from '../domain/operation/opsSpec'
import { OperationOp, type DatumValue, type OperationSpec } from '../domain/operation/types'
import { DrawAction, type DrawOp } from '../rendering/draw/types'
import { resolveEncodingFields } from '../rendering/ops/common/resolveEncodingFields'
import type { ExecutionPlan, VisualExecutionPlan, VisualExecutionStep, VisualExecutionSubstep } from './nlp-ops'
import { materializeExecutionGroups } from './nlp-ops'
import type { SurfaceManager } from './surface-manager'
import { SurfaceTransitionController, type MultiSurfaceLayoutTarget } from './surface-transition-controller'
import { applySplitSharedYAxisPolicy } from '../operation-next/splitSurfaceVisuals'
import type { OperationRuntimeSnapshot, SerializableChainState } from '../operation-next/executionState'
import {
  buildPlaybackSpecFromBaseSpec,
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
  spec: ChartSpec
  currentRootSpec: ChartSpec
  currentRootSpecMode: 'base' | 'playback'
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
    executionSpec?: ChartSpec
    surfaceId?: string
    nextRunHeadOp?: OperationSpec
    initialChainState?: SerializableChainState | null
    runtimeSnapshot?: OperationRuntimeSnapshot | null
  },
) => Promise<void>

const SPLIT_REVEAL_DELAY_MS = 1000
const SURFACE_SPLIT_TRANSITION_MS = 440
const SURFACE_TRANSITION_STAGGER_MS = 56
const MIN_PREPARED_SURFACE_REVEAL_MS = 120
/**
 * Gap between re-rendering the source chart and starting the next op's
 * animation. Without it, a sequence like ops2(filter+avg) → ops3(filter+avg)
 * snaps from the filtered view back to the source and immediately starts the
 * next filter — the viewer never sees the source state, which reads as a
 * jarring jump. A short pause lets the source re-render settle visually
 * before the next op's transition kicks in.
 */
const SOURCE_RESET_PRE_OP_PAUSE_MS = 350
const SPLIT_DEBUG_PREFIX = '[split-simple-bar-debug]'

function isSplitDebugEnabled() {
  return Boolean((globalThis as typeof globalThis & { __OPERATION_NEXT_DEBUG__?: unknown }).__OPERATION_NEXT_DEBUG__)
}

function splitDebug(label: string, payload: Record<string, unknown>) {
  if (!isSplitDebugEnabled()) return
  try {
    console.info(SPLIT_DEBUG_PREFIX, label, JSON.stringify(payload))
  } catch {
    console.info(SPLIT_DEBUG_PREFIX, label, payload)
  }
}

function summarizeDebugOp(op: OperationSpec | null | undefined) {
  if (!op) return null
  const raw = op as OperationSpec & { id?: unknown; surfaceId?: unknown }
  return {
    op: op.op,
    id: typeof raw.id === 'string' ? raw.id : null,
    surfaceId: typeof raw.surfaceId === 'string' ? raw.surfaceId : null,
    target: op.target ?? null,
    targetA: op.targetA ?? null,
    targetB: op.targetB ?? null,
    field: op.field ?? null,
    group: op.group ?? null,
    inputs: op.meta?.inputs ?? [],
  }
}

function summarizeDebugSubstep(substep: VisualExecutionSubstep) {
  const raw = substep as VisualExecutionSubstep & { surfaceId?: unknown }
  return {
    id: substep.id,
    kind: substep.kind,
    nodeId: substep.nodeId ?? null,
    surfaceId: (typeof raw.surfaceId === 'string' ? raw.surfaceId : null) ?? substep.surface?.surfaceId ?? null,
    surfaceAction: substep.surface?.surfaceAction ?? null,
    surfaceType: substep.surface?.surfaceType ?? null,
    templateType: substep.surface?.templateType ?? null,
  }
}

function summarizeDebugContext(context: VisualSubstepExecutionContext) {
  const layout = context.surfaceManager?.getLayout()
  return {
    currentSurface: context.currentSurface,
    currentRootSpecMode: context.currentRootSpecMode,
    layoutType: layout?.type ?? null,
    activeSurfaceIds: context.surfaceManager?.getActiveSurfaces().map((surface) => surface.id) ?? [],
    skipDelays: context.skipDelays,
  }
}

type SentenceGroup = {
  name: string
  ops: OperationSpec[]
}

type ExecutionStrategy = {
  sentenceStep: VisualExecutionStep | null
  fallbackSentence: SentenceGroup | null
}

type SourcePreview = {
  playbackSpec: ChartSpec
}

export type RunVisualSentenceStepArgs = {
  container: HTMLElement
  spec: ChartSpec
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
  renderPlaybackChart: (spec: ChartSpec) => Promise<void>
  runOps: RunOpsCallback
  surfaceManager?: SurfaceManager
  skipDelays?: boolean
  renderSentenceSummary?: (text: string) => void | Promise<void>
  clearSentenceSummary?: () => void | Promise<void>
  /**
   * When the workbench resumes an ops group from a cached checkpoint
   * (out-of-order ops navigation), these prime the FIRST runOps call so the
   * runner threads ChainState forward from the prior group instead of
   * starting fresh. Subsequent substeps inside this run continue naturally
   * via the runner's internal chain.
   */
  initialChainState?: SerializableChainState | null
  runtimeSnapshot?: OperationRuntimeSnapshot | null
}

export type RunVisualExecutionPlanArgs = RunVisualSentenceStepArgs

function cloneSpec(spec: ChartSpec): ChartSpec {
  try {
    return structuredClone(spec)
  } catch {
    return JSON.parse(JSON.stringify(spec)) as ChartSpec
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

function isGroupedOrStackedBarSpec(spec: ChartSpec) {
  const chartType = getChartType(spec)
  return chartType === ChartType.GROUPED_BAR || chartType === ChartType.STACKED_BAR
}

function isScalarAggregateOperation(op: OperationSpec | null) {
  return op?.op === OperationOp.Average || op?.op === OperationOp.Sum || op?.op === OperationOp.Count
}

function isNodeRefText(value: string) {
  const trimmed = value.trim()
  return trimmed.startsWith('ref:') || /^n\d+$/i.test(trimmed)
}

function operationUsesResultReference(op: OperationSpec | null) {
  if (!op) return false
  return (
    selectorHasRef(op.targetA) ||
    selectorHasRef(op.targetB) ||
    selectorHasRef(op.target) ||
    (Array.isArray(op.meta?.inputs) && op.meta.inputs.length > 0)
  )
}

function shouldKeepSourceChartForOperation(op: OperationSpec | null, spec?: ChartSpec) {
  if (op?.op === OperationOp.PairDiff) return true
  if (spec && isGroupedOrStackedBarSpec(spec) && isScalarAggregateOperation(op)) return true
  if (spec && isGroupedOrStackedBarSpec(spec) && op?.op === OperationOp.Diff && operationUsesResultReference(op)) return true
  return false
}

function isSplitLayoutActive(context: VisualSubstepExecutionContext) {
  return context.surfaceManager?.getLayout()?.type === 'split-horizontal'
}

function selectorHasRef(selector: unknown): boolean {
  if (selector == null) return false
  if (Array.isArray(selector)) return selector.some(selectorHasRef)
  if (typeof selector === 'string') return selector.startsWith('ref:')
  if (typeof selector === 'object') {
    const id = (selector as { id?: unknown }).id
    if (typeof id === 'string' && isNodeRefText(id)) return true
    const target = (selector as { target?: unknown; category?: unknown }).target ?? (selector as { category?: unknown }).category
    return typeof target === 'string' && target.startsWith('ref:')
  }
  return false
}

function isSplitSourceOperation(op: OperationSpec | null) {
  if (!op) return false
  if (op.op === OperationOp.Filter) return true
  if (isScalarAggregateOperation(op)) return true
  if (op.op === OperationOp.Diff) {
    return selectorHasRef(op.targetA) || selectorHasRef(op.targetB) || (Array.isArray(op.meta?.inputs) && op.meta.inputs.length > 0)
  }
  return false
}

function isSplitCrossSurfaceDiffOperation(op: OperationSpec | null) {
  if (!op || op.op !== OperationOp.Diff) return false
  return operationUsesResultReference(op)
}

function findNextLogicalOperation(
  context: VisualSubstepExecutionContext,
  substeps: VisualExecutionSubstep[],
  startIndex: number,
) {
  for (let index = startIndex + 1; index < substeps.length; index += 1) {
    const candidate = substeps[index]
    if (candidate.kind === 'fallback') continue
    const logicalOp = resolveLogicalOp(context, candidate)
    if (logicalOp) return logicalOp
  }
  return null
}

function shouldSkipSplitMergeBeforeScalarDiff(args: {
  context: VisualSubstepExecutionContext
  substeps: VisualExecutionSubstep[]
  substepIndex: number
  substep: VisualExecutionSubstep
}) {
  if (args.substep.kind !== 'surface-action') return false
  if (args.substep.surface?.surfaceAction !== 'merge') return false
  if (!isSplitLayoutActive(args.context)) return false
  const nextLogicalOp = findNextLogicalOperation(args.context, args.substeps, args.substepIndex)
  return isSplitCrossSurfaceDiffOperation(nextLogicalOp)
}

function findNextRunOpSubstep(
  substeps: VisualExecutionSubstep[],
  startIndex: number,
): VisualExecutionSubstep | null {
  return substeps.slice(startIndex + 1).find((candidate) => candidate.kind === 'run-op') ?? null
}

function buildPrefilterPreview(args: {
  baseSpec: ChartSpec
  dataRows?: Array<Record<string, unknown>>
  substep: VisualExecutionSubstep
  logicalArtifacts: LogicalExecutionArtifacts | null
}): SourcePreview | null {
  const groups = (args.substep.scope?.groups ?? []).filter(
    (value): value is string => typeof value === 'string' && value.trim().length > 0,
  )
  const includeSet = new Set(groups.map((value) => value.trim()))
  const nodeId = typeof args.substep.nodeId === 'string' ? args.substep.nodeId.trim() : ''
  if (nodeId) {
    const inputRows = args.logicalArtifacts?.nodeInputs.get(nodeId) ?? []
    const scopedRows = inputRows.filter((row) => {
      if (!includeSet.size) return true
      return includeSet.has(String(row.group ?? row.series ?? ''))
    })
    if (scopedRows.length) {
      const chartType = getChartType(args.baseSpec)
      const isLineFamily =
        args.logicalArtifacts?.chartFamily === 'line' ||
        chartType === ChartType.MULTI_LINE ||
        chartType === ChartType.SIMPLE_LINE
      const isBarFamily =
        args.logicalArtifacts?.chartFamily === 'bar' ||
        chartType === ChartType.SIMPLE_BAR ||
        chartType === ChartType.GROUPED_BAR ||
        chartType === ChartType.STACKED_BAR
      if (isLineFamily) {
        return {
          playbackSpec: buildPlaybackSpecFromBaseSpec({
            family: 'line',
            rows: scopedRows,
            baseSpec: args.baseSpec,
          }),
        }
      }
      if (isBarFamily) {
        return {
          playbackSpec: buildPlaybackSpecFromBaseSpec({
            family: 'bar',
            rows: scopedRows,
            baseSpec: args.baseSpec,
          }),
        }
      }
    }
  }

  if (!groups.length) return null

  const resolved = resolveEncodingFields(args.baseSpec)
  if (!resolved?.groupField || !args.dataRows) return null

  const filteredValues = args.dataRows.filter((row) => includeSet.has(String(row[resolved.groupField!] ?? '')))
  const playbackSpec = cloneSpec(args.baseSpec)
  playbackSpec.data = { values: filteredValues } as ChartSpec['data']
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

function buildDatumValuesForSpec(spec: ChartSpec, rows: RawRow[]): DatumValue[] {
  const resolved = resolveEncodingFields(spec)
  if (!resolved) return []
  return toDatumValuesFromRaw(rows, {
    xField: resolved.xField,
    yField: resolved.yField,
    groupField: resolved.groupField ?? undefined,
  }, {
    panelField: resolved.panelField,
  })
}

function buildFilteredPlaybackSpec(spec: ChartSpec, rows: RawRow[]): ChartSpec {
  const playbackSpec = cloneSpec(spec)
  playbackSpec.data = { values: cloneRecordRows(rows) } as ChartSpec['data']
  return playbackSpec
}

function sleepMs(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function resolveSurfaceSpec(context: VisualSubstepExecutionContext, surfaceId?: string): ChartSpec {
  if (!surfaceId || surfaceId === 'root') return context.currentRootSpec
  return context.surfaceManager?.getSurface(surfaceId)?.spec ?? context.spec
}

function resolveSurfaceChartType(context: VisualSubstepExecutionContext, surfaceId?: string): ChartTypeValue | null {
  if (!surfaceId || surfaceId === 'root') return getChartType(context.currentRootSpec)
  return context.surfaceManager?.getSurface(surfaceId)?.chartType ?? getChartType(context.spec)
}

function isAggregateReuseCandidate(op: OperationSpec | null, spec?: ChartSpec) {
  if (!op) return false
  if (op.op !== 'average' && op.op !== 'sum' && op.op !== 'count') return false
  if (Array.isArray(op.meta?.inputs) && op.meta.inputs.length > 0) return true
  return Boolean(spec && isGroupedOrStackedBarSpec(spec) && (op.group != null || op.groupA != null || op.groupB != null))
}

function shouldReuseCurrentRootSourceSurface(args: {
  context: VisualSubstepExecutionContext
  substep: VisualExecutionSubstep
  logicalOp: OperationSpec | null
}) {
  const surfaceId = resolveSubstepSurfaceId(args.substep)
  if (surfaceId && surfaceId !== 'root') return false
  if (args.context.currentSurface !== 'source-chart') return false
  if (args.context.currentRootSpecMode !== 'playback') return false
  return isAggregateReuseCandidate(args.logicalOp, args.context.currentRootSpec)
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
  renderPlaybackChart: (spec: ChartSpec) => Promise<void>
  runOps: RunOpsCallback
  resetRuntime: () => boolean
  selectedSurface?: DerivedSurfaceSelection | null
  surfaceId?: string
}) {
  splitDebug('visual.materializePreparedSurface-start', {
    context: summarizeDebugContext(args.context),
    substep: summarizeDebugSubstep(args.substep),
    surfaceId: args.surfaceId ?? null,
    selectedSurface: args.selectedSurface
      ? {
          templateType: args.selectedSurface.templateType,
          sourceNodeIds: args.selectedSurface.sourceNodeIds,
        }
      : null,
  })
  const prepared = buildPreparedSurface({
    spec: args.context.spec,
    baseSpec: args.context.currentRootSpec,
    artifacts: args.context.logicalArtifacts,
    surfaceType: args.substep.surface?.surfaceType,
    nodeId: args.substep.nodeId,
    templateType: args.selectedSurface?.templateType ?? args.substep.surface?.templateType,
    sourceNodeIds: args.selectedSurface?.sourceNodeIds ?? args.substep.surface?.sourceNodeIds ?? args.substep.sourceNodeIds,
  })
  if (!prepared.ok) {
    splitDebug('visual.materializePreparedSurface-failed', {
      reason: prepared.reason,
      substep: summarizeDebugSubstep(args.substep),
    })
    return prepared
  }

  args.context.preparedSurfaces.set(prepared.surface.nodeId, prepared.surface)
  if (!args.surfaceId || args.surfaceId === 'root') {
    splitDebug('visual.materializePreparedSurface-renderPlaybackChart', {
      nodeId: prepared.surface.nodeId,
      surfaceId: args.surfaceId ?? null,
      materializeOps: prepared.surface.materializeOps.map(summarizeDebugOp),
    })
    await args.renderPlaybackChart(prepared.surface.playbackSpec)
  }
  if (prepared.surface.materializeOps.length > 0) {
    splitDebug('visual.materializePreparedSurface-runMaterializeOps', {
      nodeId: prepared.surface.nodeId,
      surfaceId: args.surfaceId ?? null,
      materializeOps: prepared.surface.materializeOps.map(summarizeDebugOp),
    })
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
  splitDebug('visual.surfaceAction-start', {
    context: summarizeDebugContext(args.context),
    substep: summarizeDebugSubstep(args.substep),
    action: action ?? null,
  })
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
    splitDebug('visual.surfaceAction-split-before-manager', {
      context: summarizeDebugContext(args.context),
      leftId,
      rightId,
      baseRows: baseRows.length,
    })
    surfaceManager.splitSurface(args.substep.surface?.layoutMode === 'split-vertical' ? 'vertical' : 'horizontal', {
      idA: leftId,
      idB: rightId,
      specA,
      specB,
      dataA: buildDatumValuesForSpec(specA, leftRows),
      dataB: buildDatumValuesForSpec(specB, rightRows),
    })
    splitDebug('visual.surfaceAction-split-after-manager', {
      context: summarizeDebugContext(args.context),
      leftId,
      rightId,
    })
    splitDebug('visual.surfaceAction-split-render-left', {
      leftId,
      operation: [],
    })
    await args.runOps([], {
      resetRuntime: args.resetRuntime(),
      runtimeScope: `visual:${args.context.sentenceStep.id}:${args.substep.id}:split-left`,
      executionSpec: specA,
      surfaceId: leftId,
    })
    splitDebug('visual.surfaceAction-split-render-right', {
      rightId,
      operation: [],
    })
    await args.runOps([], {
      resetRuntime: false,
      runtimeScope: `visual:${args.context.sentenceStep.id}:${args.substep.id}:split-right`,
      executionSpec: specB,
      surfaceId: rightId,
    })
    applySplitSharedYAxisPolicy(surfaceManager)
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

/**
 * Find a logical successor of `currentOp` by scanning the full ops graph
 * (`logicalArtifacts.nodeOps`) for any op whose `meta.inputs` contains the
 * current op's nodeId. Lets filter (and other) appliers see their downstream
 * op even when substep/sentence splits scatter the chain across separate
 * `runChartOps` calls. Returns the first match; if multiple consumers exist,
 * the policy is conservative and picks one.
 */
function findLogicalSuccessorOp(
  context: VisualSubstepExecutionContext,
  currentOp: OperationSpec | null,
): OperationSpec | undefined {
  if (!currentOp) return undefined
  const currentNodeId = typeof currentOp.meta?.nodeId === 'string' ? currentOp.meta.nodeId : currentOp.id
  if (!currentNodeId) return undefined
  const nodeOps = context.logicalArtifacts?.nodeOps
  if (!nodeOps) return undefined
  for (const op of nodeOps.values()) {
    const inputs = op.meta?.inputs
    if (Array.isArray(inputs) && inputs.some((input) => String(input) === String(currentNodeId))) {
      return op
    }
  }
  return undefined
}

function resolveExecutionSurface(args: {
  context: VisualSubstepExecutionContext
  substep: VisualExecutionSubstep
  logicalOp: OperationSpec | null
}): { surfaceType: 'source-chart'; operation: OperationSpec | null } | { surfaceType: 'derived-chart'; selection: DerivedSurfaceSelection; operation: OperationSpec | null } {
  const { context, substep, logicalOp } = args
  splitDebug('visual.resolveExecutionSurface-start', {
    context: summarizeDebugContext(context),
    substep: summarizeDebugSubstep(substep),
    logicalOp: summarizeDebugOp(logicalOp),
    splitSourceOperation: isSplitSourceOperation(logicalOp),
  })
  if (!logicalOp) {
    splitDebug('visual.resolveExecutionSurface-decision', { decision: 'source-chart:no-logical-op' })
    return { surfaceType: 'source-chart', operation: null }
  }
  const canonicalOp = resolveSourceBackedSelectors(logicalOp, context.logicalArtifacts)
  if (isSplitLayoutActive(context) && isSplitSourceOperation(logicalOp)) {
    splitDebug('visual.resolveExecutionSurface-decision', {
      decision: 'source-chart:split-source-operation',
      canonicalOp: summarizeDebugOp(canonicalOp),
    })
    return { surfaceType: 'source-chart', operation: canonicalOp }
  }
  if (shouldReuseCurrentRootSourceSurface({ context, substep, logicalOp })) {
    splitDebug('visual.resolveExecutionSurface-decision', {
      decision: 'source-chart:reuse-current-root',
      canonicalOp: summarizeDebugOp(canonicalOp),
    })
    return { surfaceType: 'source-chart', operation: canonicalOp }
  }
  const selection = selectDerivedSurfaceForOperation({
    op: logicalOp,
    artifacts: context.logicalArtifacts,
    templateType: substep.surface?.templateType,
    sourceNodeIds: substep.surface?.sourceNodeIds ?? substep.sourceNodeIds,
  })
  if (!selection) {
    splitDebug('visual.resolveExecutionSurface-decision', {
      decision: 'source-chart:no-derived-selection',
      canonicalOp: summarizeDebugOp(canonicalOp),
    })
    return { surfaceType: 'source-chart', operation: canonicalOp }
  }
  splitDebug('visual.resolveExecutionSurface-decision', {
    decision: 'derived-chart',
    operation: summarizeDebugOp(logicalOp),
    selection: {
      templateType: selection.templateType,
      sourceNodeIds: selection.sourceNodeIds,
    },
  })
  return { surfaceType: 'derived-chart', selection, operation: logicalOp }
}

export async function executePrefilterSubstep(args: {
  substep: VisualExecutionSubstep
  context: VisualSubstepExecutionContext
  renderPlaybackChart: (spec: ChartSpec) => Promise<void>
}): Promise<{
  executed: boolean
  nextSurface: VisualSurfaceState
  fallbackReason?: VisualSentenceFallbackReason
}> {
  splitDebug('visual.prefilter-start', {
    context: summarizeDebugContext(args.context),
    substep: summarizeDebugSubstep(args.substep),
  })
  const preview = buildPrefilterPreview({
    baseSpec: args.context.currentRootSpec,
    dataRows: args.context.dataRows,
    substep: args.substep,
    logicalArtifacts: args.context.logicalArtifacts,
  })
  if (!preview) {
    splitDebug('visual.prefilter-no-preview', {
      substep: summarizeDebugSubstep(args.substep),
    })
    return {
      executed: false,
      nextSurface: args.context.currentSurface,
      fallbackReason: 'unsupported-prefilter',
    }
  }

  splitDebug('visual.prefilter-renderPlaybackChart', {
    substep: summarizeDebugSubstep(args.substep),
  })
  await args.renderPlaybackChart(preview.playbackSpec)
  return { executed: true, nextSurface: 'source-chart' }
}

export async function executeMaterializeSurfaceSubstep(args: {
  substep: VisualExecutionSubstep
  context: VisualSubstepExecutionContext
  renderSourceChart: () => Promise<void>
  renderPlaybackChart: (spec: ChartSpec) => Promise<void>
  runOps: RunOpsCallback
  resetRuntime: () => boolean
}): Promise<{
  executed: boolean
  nextSurface: VisualSurfaceState
  fallbackReason?: VisualSentenceFallbackReason
}> {
  const logicalOp = resolveLogicalOp(args.context, args.substep)
  const surfaceId = resolveSubstepSurfaceId(args.substep)
  splitDebug('visual.materializeSubstep-start', {
    context: summarizeDebugContext(args.context),
    substep: summarizeDebugSubstep(args.substep),
    logicalOp: summarizeDebugOp(logicalOp),
    surfaceId: surfaceId ?? null,
  })
  const executionSurface = resolveExecutionSurface({
    context: args.context,
    substep: args.substep,
    logicalOp,
  })
  if (executionSurface.surfaceType === 'source-chart') {
    splitDebug('visual.materializeSubstep-skip-source-chart', {
      context: summarizeDebugContext(args.context),
      substep: summarizeDebugSubstep(args.substep),
      operation: summarizeDebugOp(executionSurface.operation),
    })
    return {
      executed: true,
      nextSurface: args.context.currentSurface,
    }
  }

  const surfaceType = args.substep.surface?.surfaceType
  if (surfaceType === 'source-chart' && !args.substep.nodeId) {
    if (!surfaceId || surfaceId === 'root') {
      splitDebug('visual.materializeSubstep-renderSourceChart', {
        substep: summarizeDebugSubstep(args.substep),
        surfaceId: surfaceId ?? null,
      })
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
    splitDebug('visual.materializeSubstep-run-empty-surface-render', {
      surfaceId,
      preparedNodeId: prepared.surface.nodeId,
    })
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
  renderPlaybackChart: (spec: ChartSpec) => Promise<void>
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
  splitDebug('visual.runOp-start', {
    context: summarizeDebugContext(args.context),
    substep: summarizeDebugSubstep(args.substep),
    logicalOp: summarizeDebugOp(logicalOp),
    surfaceId: surfaceId ?? null,
    restartSourceLayer: args.restartSourceLayer,
  })
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
    const splitSourceOperation = isSplitLayoutActive(args.context) && isSplitSourceOperation(executionSurface.operation)
    const splitCrossSurfaceDiff = isSplitLayoutActive(args.context) && isSplitCrossSurfaceDiffOperation(executionSurface.operation)
    const executionSurfaceId = splitCrossSurfaceDiff ? undefined : surfaceId
    const hasInputs = Array.isArray(executionSurface.operation.meta?.inputs) && executionSurface.operation.meta.inputs.length > 0
    const shouldRenderSource =
      !splitSourceOperation &&
      (!executionSurfaceId || executionSurfaceId === 'root') &&
      (args.context.currentSurface !== 'source-chart' || (args.restartSourceLayer && !hasInputs))
    splitDebug('visual.runOp-source-decision', {
      context: summarizeDebugContext(args.context),
      operation: summarizeDebugOp(executionSurface.operation),
      surfaceId: surfaceId ?? null,
      executionSurfaceId: executionSurfaceId ?? null,
      splitSourceOperation,
      splitCrossSurfaceDiff,
      hasInputs,
      shouldRenderSource,
    })
    if (shouldRenderSource) {
      splitDebug('visual.runOp-renderSourceChart', {
        operation: summarizeDebugOp(executionSurface.operation),
      })
      await args.renderSourceChart()
      // Give the viewer a beat to register "we're back at the source chart"
      // before the next op's animation begins. Filter is the worst offender —
      // it dims/rescales immediately on dispatch, so without the pause the
      // chart appears to skip the source-reset entirely. Honors skipDelays so
      // silent materialization paths (chunked-output replay) stay fast.
      if (!args.context.skipDelays) {
        await sleepMs(SOURCE_RESET_PRE_OP_PAUSE_MS)
      }
    }
    splitDebug('visual.runOp-runOps-source', {
      operation: summarizeDebugOp(executionSurface.operation),
      executionSurfaceId: executionSurfaceId ?? null,
    })
    await args.runOps(applySurfaceScopeToOps([executionSurface.operation], executionSurfaceId), {
      resetRuntime: args.resetRuntime(),
      runtimeScope: `visual:${args.context.sentenceStep.id}:${args.substep.id}`,
      executionSpec: resolveSurfaceSpec(args.context, executionSurfaceId),
      surfaceId: executionSurfaceId,
      nextRunHeadOp: findLogicalSuccessorOp(args.context, executionSurface.operation),
    })
    return { executed: true, nextSurface: 'source-chart' }
  }

  let prepared = resolvePreparedSurface(args.context, args.substep)
  if (!prepared) {
    splitDebug('visual.runOp-derived-materialize-needed', {
      context: summarizeDebugContext(args.context),
      substep: summarizeDebugSubstep(args.substep),
      operation: summarizeDebugOp(executionSurface.operation),
      surfaceId: surfaceId ?? null,
    })
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

  splitDebug('visual.runOp-runOps-derived', {
    operation: summarizeDebugOp(executionSurface.operation),
    surfaceId: surfaceId ?? null,
    preparedNodeId: prepared.nodeId,
    preparedRunOps: prepared.runOps.map(summarizeDebugOp),
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
  // Single-shot priming for the first runOps call in this group — workbench
  // passes the prior group's ChainState/runtimeSnapshot here when resuming
  // out-of-order. Subsequent substeps within this group continue via the
  // runner's own chain (no extra plumbing needed).
  let pendingInitialChainState = args.initialChainState ?? null
  let pendingRuntimeSnapshot = args.runtimeSnapshot ?? null
  const takeFirstRunPriming = () => {
    const primed = {
      initialChainState: pendingInitialChainState,
      runtimeSnapshot: pendingRuntimeSnapshot,
    }
    pendingInitialChainState = null
    pendingRuntimeSnapshot = null
    return primed
  }
  const wrappedRunOps: RunOpsCallback = async (ops, opts) => {
    const primed = takeFirstRunPriming()
    await args.runOps(ops, {
      ...opts,
      initialChainState: opts.initialChainState ?? primed.initialChainState,
      runtimeSnapshot: opts.runtimeSnapshot ?? primed.runtimeSnapshot,
    })
  }
  const context: VisualSubstepExecutionContext = {
    container: args.container,
    spec: args.spec,
    currentRootSpec: cloneSpec(args.spec),
    currentRootSpecMode: 'base',
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
    context.currentRootSpec = cloneSpec(args.spec)
    context.currentRootSpecMode = 'base'
    if (currentSummaryText && args.renderSentenceSummary) {
      await args.renderSentenceSummary(currentSummaryText)
    }
  }
  const renderPlaybackChartWithSummary = async (spec: ChartSpec) => {
    await args.renderPlaybackChart(spec)
    context.currentRootSpec = cloneSpec(spec)
    context.currentRootSpecMode = 'playback'
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
    await wrappedRunOps(fallbackSentence.ops, {
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

  for (let substepIndex = 0; substepIndex < sentenceStep.substeps.length; substepIndex += 1) {
    const substep = sentenceStep.substeps[substepIndex]
    context.currentSurface = currentSurface

    if (substep.kind === 'surface-action') {
      if (
        shouldSkipSplitMergeBeforeScalarDiff({
          context,
          substeps: sentenceStep.substeps,
          substepIndex,
          substep,
        })
      ) {
        splitDebug('visual.surfaceAction-skip-merge-before-split-diff', {
          context: summarizeDebugContext(context),
          substep: summarizeDebugSubstep(substep),
          nextLogicalOp: summarizeDebugOp(findNextLogicalOperation(context, sentenceStep.substeps, substepIndex)),
        })
        currentSurface = 'source-chart'
        executedSubstepIds.push(substep.id)
        continue
      }
      const result = await executeSurfaceActionSubstep({
        substep,
        context,
        runOps: wrappedRunOps,
        resetRuntime: takeResetRuntime,
      })
      if (!result.executed) {
        return runFallback(result.fallbackReason ?? 'unsupported-surface')
      }
      currentSurface = result.nextSurface
      // Arm the reveal delay only when split layout actually came online —
      // belt-and-suspenders in case a future change has the split substep
      // succeed without actually activating the layout.
      if (substep.surface?.surfaceAction === 'split' && isSplitLayoutActive(context)) {
        pendingSplitReveal = true
      }
      executedSubstepIds.push(substep.id)
      continue
    }

    if (substep.kind === 'prefilter') {
      const nextRunOpSubstep = findNextRunOpSubstep(sentenceStep.substeps, substepIndex)
      const nextLogicalOp = nextRunOpSubstep ? resolveLogicalOp(context, nextRunOpSubstep) : null
      if (
        shouldKeepSourceChartForOperation(nextLogicalOp, context.currentRootSpec) ||
        (isSplitLayoutActive(context) && isSplitSourceOperation(nextLogicalOp))
      ) {
        splitDebug('visual.prefilter-skip-source-preserved', {
          context: summarizeDebugContext(context),
          substep: summarizeDebugSubstep(substep),
          nextLogicalOp: summarizeDebugOp(nextLogicalOp),
          keepSource: shouldKeepSourceChartForOperation(nextLogicalOp, context.currentRootSpec),
          splitSourceOperation: isSplitLayoutActive(context) && isSplitSourceOperation(nextLogicalOp),
        })
        currentSurface = 'source-chart'
        executedSubstepIds.push(substep.id)
        continue
      }
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
        runOps: wrappedRunOps,
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
        runOps: wrappedRunOps,
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

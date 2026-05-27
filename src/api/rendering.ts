import { RenderChartUseCase } from '../application/usecases/renderChartUseCase'
import { BrowserChartRenderPort } from '../adapters/out/chart-renderer/browserChartRenderPort'
import { getChartType, normalizeSpec, type ChartSpec, type VegaLiteSpec, type ChartTypeValue, ChartType } from '../domain/chart'
import {
  renderChart as renderChartLegacy,
} from '../rendering/renderChart'
import type { ChartSurfaceRef } from '../application/ports/outbound'
import { attachInstance, detachInstance, getAttachedInstance } from '../rendering-new/chartInstance'
import { SimpleLineChartInstance } from '../rendering-new/instances/simpleLineInstance'
import { SimpleBarChartInstance, type BarDatum } from '../rendering-new/instances/simpleBarInstance'
import { ensureMultipleLineChartInstance } from '../rendering-new/instances/multipleLineInstance'
import { ensureGroupedBarChartInstance } from '../rendering-new/instances/groupedBarInstance'
import { ensureStackedBarChartInstance } from '../rendering-new/instances/stackedBarInstance'
import type { SerializableChainState } from '../operation-next/executionState'

export function toDomSurface(container: HTMLElement): ChartSurfaceRef {
  return { kind: 'dom', handle: container }
}

export async function renderChart(command: { surface: ChartSurfaceRef; spec: ChartSpec }): Promise<void>
export async function renderChart(container: HTMLElement, spec: ChartSpec): Promise<unknown>
export async function renderChart(
  arg1: HTMLElement | { surface: ChartSurfaceRef; spec: ChartSpec },
  arg2?: ChartSpec,
): Promise<unknown> {
  if (arg1 instanceof HTMLElement) {
    return renderChartLegacy(arg1, arg2 as ChartSpec)
  }
  const useCase = new RenderChartUseCase(new BrowserChartRenderPort())
  await useCase.execute(arg1)
  return undefined
}

export { getChartType, normalizeSpec, ChartType }
export type { ChartSpec, VegaLiteSpec, ChartTypeValue }

/**
 * Tear down everything that `renderChart` / `runChartOps` may have written
 * onto `host` so the next `renderChart(host, spec)` call rebuilds from a
 * truly clean baseline — used by the review page's "Reset chart" button.
 *
 * Why this exists: rendering is idempotent (per the CLAUDE.md "skeleton
 * stability" rule). When the user clicks "Reset chart" after running some
 * ops, calling `renderChart` again with the *same* spec returns NO-OP from
 * `ChartInstance.ensureRendered` (specKey unchanged + svg still in the
 * host), so the annotation overlays and any persisted instance state
 * (`activeTargets`, `outOfScopeOpacity`) from the prior ops would stay
 * intact. This helper short-circuits that idempotence:
 *
 *   1. `detachInstance(host)` drops the cached ChartInstance, so the next
 *      `renderChart` builds a brand-new one with default state.
 *   2. `host.innerHTML = ''` removes the SVG and every annotation node.
 *   3. Clearing the operation-next focus dataset attribute prevents the
 *      next `runChartOps` from thinking the host is still in a focused
 *      state mid-restore.
 *
 * Not idempotent-friendly — callers should only invoke this when they
 * explicitly want a forced fresh render (Reset, Re-render after spec edit).
 * For normal navigation between rows the ordinary `renderChart` path is
 * sufficient because a different chart_id changes the specKey naturally.
 */
export function resetChartHost(host: HTMLElement): void {
  detachInstance(host)
  host.innerHTML = ''
  if (host.dataset.operationNextFocusState) {
    delete host.dataset.operationNextFocusState
  }
}

/**
 * Re-attach the simple-line ChartInstance to an SVG that already exists in
 * `host` (typically because the workbench just restored a cached chunk-scene
 * SVG via `host.innerHTML = ...`). Avoids triggering a fresh build that would
 * wipe the cached SVG.
 *
 * `chainState` is the SerializableChainState from the chunk-scene checkpoint
 * — it lets us reconstruct the post-filter scale state (yDomain rescale,
 * activeTargets) so the next applier sees scale.domain() and activeTargets
 * matching what the cached SVG visually represents.
 *
 * Returns true when rehydration succeeded; false when the SVG structure was
 * unexpected (caller can fall back to a full re-render).
 *
 * NB: this is a workbench-internal hook for the out-of-order ops navigation
 * fix. It is not part of the general rendering API and should not be reused
 * by other features without careful review of how cached SVG state and
 * ChainState combine.
 */
export function rehydrateSimpleLineInstanceFromCheckpoint(
  host: HTMLElement,
  spec: ChartSpec,
  chainState: SerializableChainState | null,
): boolean {
  const existing = getAttachedInstance(host)
  let instance: SimpleLineChartInstance
  if (existing && existing.chartTypeKey === 'simple-line') {
    instance = existing as SimpleLineChartInstance
  } else {
    // Fresh instance: skip ensureSimpleLineChartInstance because its
    // ensureRendered path would clear the cached SVG we just restored.
    instance = new SimpleLineChartInstance(host)
    attachInstance(host, instance)
  }

  const cachedScales = deriveSimpleLineCachedScales(instance, chainState)
  return instance.rehydrateFromHost(spec, cachedScales)
}

function deriveSimpleLineCachedScales(
  instance: SimpleLineChartInstance,
  chainState: SerializableChainState | null,
): {
  yDomain?: [number, number]
  xDomain?: [number, number] | [Date, Date]
  xLabelDomain?: string[]
  activeTargets?: Set<string> | null
} {
  if (!chainState) return {}

  const cached: {
    yDomain?: [number, number]
    xDomain?: [number, number] | [Date, Date]
    xLabelDomain?: string[]
    activeTargets?: Set<string> | null
  } = {}

  if (chainState.scaleState?.currentDomain) {
    cached.yDomain = chainState.scaleState.currentDomain
  }

  const filterCtx = chainState.filterContext
  if (filterCtx && filterCtx.retainedTargets.length > 0 && instance.points.length > 0) {
    const retained = new Set(filterCtx.retainedTargets)
    cached.activeTargets = retained
    const inScope = instance.points.filter((p) => retained.has(p.target))
    const xType = instance.resolvedEncoding?.xType
    if (xType === 'temporal' && inScope.length > 0) {
      const times = inScope
        .map((p) => (p.xValue instanceof Date ? p.xValue.getTime() : NaN))
        .filter(Number.isFinite)
      if (times.length > 0) {
        cached.xDomain = [new Date(Math.min(...times)), new Date(Math.max(...times))]
      }
    } else if (xType === 'quantitative' && inScope.length > 0) {
      const nums = inScope.map((p) => Number(p.xValue)).filter(Number.isFinite)
      if (nums.length > 0) {
        const min = Math.min(...nums)
        const max = Math.max(...nums)
        cached.xDomain = [min, max === min ? max + 1 : max]
      }
    } else if (inScope.length > 0) {
      cached.xLabelDomain = inScope.map((p) => p.xLabel)
    }
  }

  return cached
}

/**
 * Re-attach the simple-bar ChartInstance to a cached SVG after the workbench
 * restored it via `host.innerHTML = ...`. Mirrors the simple-line variant.
 */
export function rehydrateSimpleBarInstanceFromCheckpoint(
  host: HTMLElement,
  spec: ChartSpec,
  chainState: SerializableChainState | null,
): boolean {
  const existing = getAttachedInstance(host)
  let instance: SimpleBarChartInstance
  if (existing && existing.chartTypeKey === 'simple-bar') {
    instance = existing as SimpleBarChartInstance
  } else {
    instance = new SimpleBarChartInstance(host)
    attachInstance(host, instance)
  }

  const cachedScales = deriveSimpleBarCachedScales(instance, chainState)
  return instance.rehydrateFromHost(spec, cachedScales)
}

function deriveSimpleBarCachedScales(
  instance: SimpleBarChartInstance,
  chainState: SerializableChainState | null,
): {
  yDomain?: [number, number]
  xLabelDomain?: string[]
  activeTargets?: Set<string> | null
} {
  if (!chainState) return {}

  const cached: {
    yDomain?: [number, number]
    xLabelDomain?: string[]
    activeTargets?: Set<string> | null
  } = {}

  if (chainState.scaleState?.currentDomain) {
    cached.yDomain = chainState.scaleState.currentDomain
  }

  const filterCtx = chainState.filterContext
  if (filterCtx && filterCtx.retainedTargets.length > 0 && instance.barData.length > 0) {
    const retained = new Set(filterCtx.retainedTargets)
    cached.activeTargets = retained
    // For ordinal x-axis (bar): xLabelDomain narrows to in-scope categories so
    // the next applier reads positions consistent with the cached SVG which
    // shows only those bars at non-dim opacity.
    const inScope = instance.barData.filter((d: BarDatum) => retained.has(d.target))
    if (inScope.length > 0) {
      cached.xLabelDomain = inScope.map((d) => d.target)
    }
  }

  return cached
}

/**
 * Multi-line / grouped-bar / stacked-bar variants do NOT need a per-instance
 * rehydrate method — their `ensureRendered` already re-acquires `svg` and
 * `annotationLayer` from the host when the cached selection is detached. We
 * only need to restore `activeTargets` from ChainState so the next applier
 * does not see a stale filter scope.
 */
export function rehydrateMultipleLineInstanceFromCheckpoint(
  host: HTMLElement,
  spec: ChartSpec,
  chainState: SerializableChainState | null,
): boolean {
  const instance = ensureMultipleLineChartInstance(host, spec)
  instance.activeTargets = chainState?.filterContext?.retainedTargets
    ? new Set(chainState.filterContext.retainedTargets)
    : null
  return true
}

export function rehydrateGroupedBarInstanceFromCheckpoint(
  host: HTMLElement,
  spec: ChartSpec,
  chainState: SerializableChainState | null,
): boolean {
  const instance = ensureGroupedBarChartInstance(host, spec)
  instance.activeTargets = chainState?.filterContext?.retainedTargets
    ? new Set(chainState.filterContext.retainedTargets)
    : null
  return true
}

export function rehydrateStackedBarInstanceFromCheckpoint(
  host: HTMLElement,
  spec: ChartSpec,
  chainState: SerializableChainState | null,
): boolean {
  const instance = ensureStackedBarChartInstance(host, spec)
  instance.activeTargets = chainState?.filterContext?.retainedTargets
    ? new Set(chainState.filterContext.retainedTargets)
    : null
  return true
}

/**
 * Unified dispatcher used by the workbench: re-attach the appropriate
 * ChartInstance to a cached SVG, restoring instance side-state from the
 * chunk-scene checkpoint's ChainState. Mirrors the switch pattern in
 * `renderChart.ts` and `runChartOps.ts`.
 *
 * Returns true if rehydration succeeded; false if the chart type is unknown
 * or the SVG structure was unexpected (caller should fall back).
 */
export function rehydrateChartInstanceFromCheckpoint(
  host: HTMLElement,
  chartType: ChartTypeValue,
  spec: ChartSpec,
  chainState: SerializableChainState | null,
): boolean {
  switch (chartType) {
    case ChartType.SIMPLE_LINE:
      return rehydrateSimpleLineInstanceFromCheckpoint(host, spec, chainState)
    case ChartType.SIMPLE_BAR:
      return rehydrateSimpleBarInstanceFromCheckpoint(host, spec, chainState)
    case ChartType.MULTI_LINE:
      return rehydrateMultipleLineInstanceFromCheckpoint(host, spec, chainState)
    case ChartType.GROUPED_BAR:
      return rehydrateGroupedBarInstanceFromCheckpoint(host, spec, chainState)
    case ChartType.STACKED_BAR:
      return rehydrateStackedBarInstanceFromCheckpoint(host, spec, chainState)
    default:
      console.warn('[rendering] rehydrateChartInstanceFromCheckpoint: unknown chartType', chartType)
      return false
  }
}

export { SnapshotStrip } from '../rendering/snapshotStrip'
export { captureSvgSnapshot } from '../rendering/utils/svgSnapshot'
export { consumeDerivedChartState } from '../rendering/utils/derivedChartState'
export { getRuntimeChartState } from '../rendering/utils/runtimeChartState'
export {
  assertDrawCapabilityForOp,
  BarDrawHandler,
  clearAnnotations,
  collectSeriesAggregates,
  collectTargetSeriesValues,
  createBarSegmentOp,
  createDimOp,
  createDrawInteractionController,
  createEmptyInteractionSession,
  createFilterOp,
  createGroupedCompareMacroOps,
  createGroupedToStackedOp,
  createGroupedToSimpleOp,
  createHighlightOp,
  createLineOp,
  createLineTraceOp,
  createMultiLineToGroupedOp,
  createMultiLineToStackedOp,
  createRectOp,
  createSeriesFilterOp,
  createSplitOp,
  createStackedCompositionLabelOps,
  createStackedToGroupedOp,
  createStackedToSimpleOp,
  createTextOp,
  createUnsplitOp,
  DrawAction,
  DrawInteractionTools,
  DrawRectModes,
  DrawTextModes,
  getChartContext,
  getDrawActionLabel,
  getRuntimeDrawSupportDecision,
  GroupedBarDrawHandler,
  interactionSessionReducer,
  MultiLineDrawHandler,
  runGenericDraw,
  runOpsPlan,
  runTimeline,
  serializeSessionToOperationSpec,
  SimpleLineDrawHandler,
  StackedBarDrawHandler,
  TimelineStepKind,
  type BarSegmentCommit,
  type DrawInteractionControllerState,
  type DrawInteractionHit,
  type DrawInteractionTool,
  type DrawLineSpec,
  type DrawOp,
  type DrawRectSpec,
  type NormalizedPoint,
  type PointerClientPoint,
  type SeriesFilterMode,
  type TimelineStep,
} from '../rendering'

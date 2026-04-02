import { RenderChartUseCase } from '../application/usecases/renderChartUseCase'
import { BrowserChartRenderPort } from '../adapters/out/chart-renderer/browserChartRenderPort'
import { getChartType, normalizeSpec, type ChartSpec, type VegaLiteSpec, type ChartTypeValue, ChartType } from '../domain/chart'
import {
  renderChart as renderChartLegacy,
} from '../rendering/renderChart'
import type { ChartSurfaceRef } from '../application/ports/outbound'

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

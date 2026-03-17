import * as d3 from 'd3'
import type { DatumValue, OperationSpec } from '../../types'
import {
  renderMultipleLineChart,
  type MultiLineSpec,
  getMultipleLineStoredData,
  tagMultipleLineMarks,
  renderSplitMultipleLineChart,
  getMultipleLineSplitDomain,
} from '../../rendering/line/multipleLineRenderer.ts'
import { toDatumValuesFromRaw, type RawRow } from '../../rendering/ops/common/datum.ts'
import type { OpsSpecInput } from '../../rendering/ops/common/opsSpec.ts'
import { DrawAction, type DrawOp } from '../../rendering/draw/types.ts'
import { MultiLineDrawHandler } from '../../rendering/draw/line/MultiLineDrawHandler.ts'
import { clearAnnotations } from '../../rendering/common/d3Helpers.ts'
import { runChartOperationsCommon } from './runChartOperationsCommon.ts'
import { runMultipleLineDrawPlan } from '../../rendering/ops/executor/runMultipleLineDrawPlan.ts'
import { MULTI_LINE_AUTO_DRAW_PLANS } from '../../rendering/ops/visual/line/multiple/multipleLineAutoDrawPlanBuilder.ts'
import type { RunChartOpsOptions } from './runChartOps.ts'
import { convertMultiLineToGroupedBar, convertMultiLineToStackedBar } from '../../rendering/line/multiLineToBarTransforms.ts'
import { resolveMultiLineEncoding } from '../../rendering/line/multipleLineRenderer.ts'
import { createChartScopedWorkingSet } from './chartScopedWorkingSet.ts'
import { LEGACY_SPLIT_DRAW_ACTIONS, SPLIT_VIEW_ENABLED } from './drawActionPolicy.ts'
import { convertMultiLineToSimpleLine } from '../../rendering/line/multiLineToSimpleLineTransform.ts'
import { handleSimpleLineDraw } from './simpleLineOps.ts'
import { SimpleLineDrawHandler } from '../../rendering/draw/line/SimpleLineDrawHandler.ts'

function toDatumValues(raw: RawRow[], xField: string, yField: string): DatumValue[] {
  return toDatumValuesFromRaw(raw, { xField, yField })
}

function resolveTargetSeriesFromOp(op: DrawOp): string | null {
  if (op.select?.keys?.length === 1) return String(op.select.keys[0])
  if ((op as any).groupFilter?.groups?.length === 1) return String((op as any).groupFilter.groups[0])
  if ((op as any).groupFilter?.include?.length === 1) return String((op as any).groupFilter.include[0])
  if ((op as any).groupFilter?.keep?.length === 1) return String((op as any).groupFilter.keep[0])
  return null
}

async function handleMultipleLineDraw(
  container: HTMLElement,
  handler: MultiLineDrawHandler,
  drawOp: DrawOp,
  spec: MultiLineSpec,
) {
  // Handle group=1 cases: convert to simple line then dispatch
  if (
    drawOp.action === DrawAction.Filter ||
    drawOp.action === DrawAction.Sort ||
    drawOp.action === DrawAction.Sum ||
    drawOp.action === DrawAction.LineToBar ||
    drawOp.action === DrawAction.LineTrace
  ) {
    const seriesKey = resolveTargetSeriesFromOp(drawOp)
    if (seriesKey) {
      const simpleLineSpec = await convertMultiLineToSimpleLine(container, spec, seriesKey)
      const lineHandler = new SimpleLineDrawHandler(container)
      await handleSimpleLineDraw(container, lineHandler, drawOp, simpleLineSpec)
      return
    }
    // No group=1: for LineTrace fall through to handler.run(); for others → NA
    if (drawOp.action === DrawAction.LineTrace) {
      await handler.run(drawOp)
      return
    }
    if (drawOp.action !== DrawAction.Filter) {
      console.warn(`draw: multi-line ${drawOp.action} requires group=1 (NA otherwise)`, drawOp)
      return
    }
    // Filter with no group=1: fall through to existing multi-line handler
  }

  if (drawOp.action === DrawAction.Split) {
    if (!SPLIT_VIEW_ENABLED) {
      console.warn('draw:split is disabled in the active runtime', drawOp)
      return
    }
    if (!drawOp.split) {
      console.warn('draw:split requires split spec', drawOp)
      return
    }
    await renderSplitMultipleLineChart(container, spec, drawOp.split)
    return
  }
  if (drawOp.action === DrawAction.Unsplit) {
    if (!SPLIT_VIEW_ENABLED) {
      console.warn('draw:unsplit is disabled in the active runtime', drawOp)
      return
    }
    await renderMultipleLineChart(container, spec)
    return
  }
  if (drawOp.action === DrawAction.MultiLineToStacked) {
    await convertMultiLineToStackedBar(container, spec)
    return
  }
  if (drawOp.action === DrawAction.MultiLineToGrouped) {
    await convertMultiLineToGroupedBar(container, spec)
    return
  }
  if (drawOp.action === DrawAction.Clear) {
    clearAnnotations(d3.select(container).select('svg'))
    await handler.run(drawOp)
    return
  }
  // Legacy inconsistency: line handlers still use an explicit allow-list until the shared draw dispatch is unified.
  if (
    drawOp.action === DrawAction.Highlight ||
    drawOp.action === DrawAction.Dim ||
    drawOp.action === DrawAction.Text ||
    drawOp.action === DrawAction.Rect ||
    drawOp.action === DrawAction.Line ||
    drawOp.action === DrawAction.Filter
  ) {
    await handler.run(drawOp)
    return
  }
  console.warn('draw: unsupported action for multiple line', drawOp.action)
}

export async function runMultipleLineOps(
  container: HTMLElement,
  vlSpec: MultiLineSpec,
  opsSpec: OpsSpecInput,
  options?: RunChartOpsOptions,
) {
  const encoding = resolveMultiLineEncoding(vlSpec)
  if (!encoding) {
    console.warn('runMultipleLineOps: missing x/y encoding; some operations may be unavailable')
  }
  const { getOperationInput, handleOperationResult, clearChartWorking } = createChartScopedWorkingSet({
    getChartScopedData: (chartId, currentWorking) => {
      const domain = getMultipleLineSplitDomain(container, chartId)
      if (!domain || domain.size === 0) return currentWorking
      const domainSet = new Set(domain)
      return currentWorking.filter((datum) => domainSet.has(String(datum.target)))
    },
  })

  return runChartOperationsCommon<MultiLineSpec>({
    container,
    spec: vlSpec,
    opsSpec,
    render: renderMultipleLineChart,
    postRender: async (host, spec) => tagMultipleLineMarks(host, spec),
    getWorkingData: (_, spec) => {
      const raw = getMultipleLineStoredData(container) || []
      if (!encoding) return []
      return toDatumValues(raw, encoding.xField, encoding.yField)
    },
    createHandler: () => new MultiLineDrawHandler(container),
    handleDrawOp: async (host, handler, drawOp) => {
      await handleMultipleLineDraw(host, handler as MultiLineDrawHandler, drawOp, vlSpec)
      if (LEGACY_SPLIT_DRAW_ACTIONS.has(drawOp.action)) {
        clearChartWorking()
      }
    },
    clearAnnotations: ({ svg }) => clearAnnotations(svg),
    autoDrawPlans: MULTI_LINE_AUTO_DRAW_PLANS,
    getOperationInput,
    handleOperationResult,
    runDrawPlan: async (drawPlan, handler) => {
      await runMultipleLineDrawPlan(container, drawPlan, { handler: handler as MultiLineDrawHandler })
    },
    onOperationCompleted: options?.onOperationCompleted,
    runtimeScope: options?.runtimeScope ?? 'ops',
    resetRuntime: options?.resetRuntime ?? true,
    initialRenderMode: options?.initialRenderMode ?? 'always',
  })
}

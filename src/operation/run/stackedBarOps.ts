import { type DatumValue, type OperationSpec, type JsonValue } from '../../types'
import { clearAnnotations } from '../../rendering/common/d3Helpers.ts'
import { runChartOperationsCommon } from './runChartOperationsCommon.ts'
import { StackedBarDrawHandler } from '../../rendering/draw/bar/StackedBarDrawHandler.ts'
import { DrawAction, type DrawSplitSpec } from '../../rendering/draw/types.ts'
import type { DrawOp } from '../../rendering/draw/types.ts'
import {
  renderStackedBarChart,
  renderSplitStackedBarChart,
  type StackedSpec,
  getStackedBarStoredData,
  getStackedBarOriginalData,
  getStackedBarSplitDomain,
} from '../../rendering/bar/stackedBarRenderer.ts'
import { toDatumValuesFromRaw, type RawRow } from '../../rendering/ops/common/datum.ts'
import type { OpsSpecInput } from '../../rendering/ops/common/opsSpec.ts'
import { runStackedBarDrawPlan } from '../../rendering/ops/executor/runStackedBarDrawPlan.ts'
import { convertStackedToGrouped } from '../../rendering/bar/stackGroupTransforms.ts'
import { convertStackedToDiverging } from '../../rendering/bar/stackGroupTransforms.ts'
import { convertStackedToSimple } from '../../rendering/bar/toSimpleTransforms.ts'
import { aggregateDatumValuesByTarget } from '../../rendering/ops/common/workingData.ts'
import { STACKED_BAR_AUTO_DRAW_PLANS } from '../../rendering/ops/visual/bar/stacked/stackedBarAutoDrawPlanBuilder.ts'
import {
  handleGroupFilter,
  shouldAggregateWhenMultipleGroups,
  shouldUseSeriesScopedInput,
} from './barOpsCommon.ts'
import type { RunChartOpsOptions } from './runChartOps.ts'
import { createChartScopedWorkingSet } from './chartScopedWorkingSet.ts'
import { LEGACY_SPLIT_DRAW_ACTIONS, SURFACE_SPLIT_ENABLED } from './drawActionPolicy.ts'
import { storeDerivedChartState } from '../../rendering/utils/derivedChartState.ts'
import { ChartType } from '../../domain/chart'

function toStackedDatumValues(raw: JsonValue[], spec: StackedSpec): DatumValue[] {
  const normalized = raw.filter((item): item is RawRow => typeof item === 'object' && item !== null)
  return toDatumValuesFromRaw(
    normalized,
    {
      xField: spec.encoding.x.field,
      yField: spec.encoding.y.field,
      groupField: spec.encoding.color?.field,
    },
    {
      groupFallback: (row: RawRow) => {
        const candidate = row?.group ?? row?.color ?? row?.series ?? null
        if (candidate == null) return null
        return String(candidate)
      },
    },
  )
}

async function handleStackedBarDraw(
  container: HTMLElement,
  handler: StackedBarDrawHandler,
  drawOp: DrawOp,
  spec: StackedSpec,
) {
  if (drawOp.action === DrawAction.Split) {
    if (SURFACE_SPLIT_ENABLED) {
      // SurfaceManager 기반 split은 runChartOps 레벨에서 처리됨
      console.debug('draw:split handled at runChartOps level', drawOp)
      return
    }
    if (!drawOp.split || typeof drawOp.split !== 'object') {
      console.warn('draw:split requires split spec', drawOp)
      return
    }
    await renderSplitStackedBarChart(container, spec, drawOp.split as DrawSplitSpec)
    return
  }
  if (drawOp.action === DrawAction.Unsplit) {
    if (SURFACE_SPLIT_ENABLED) {
      // SurfaceManager 기반 unsplit은 runChartOps 레벨에서 처리됨
      console.debug('draw:unsplit handled at runChartOps level', drawOp)
      return
    }
    await renderStackedBarChart(container, spec)
    return
  }
  if (drawOp.action === DrawAction.StackedToGrouped) {
    await convertStackedToGrouped(container, spec, drawOp.stackGroup)
    return
  }
  if (drawOp.action === DrawAction.StackedToDiverging) {
    await convertStackedToDiverging(container, spec)
    return
  }
  if (drawOp.action === DrawAction.StackedToSimple) {
    if (!drawOp.toSimple?.series) {
      console.warn('stacked-to-simple: missing toSimple.series', drawOp)
      return
    }
    await convertStackedToSimple(container, spec, drawOp.toSimple)
    return
  }
  if (drawOp.action === DrawAction.StackedFilterGroups) {
    await handler.run(drawOp)
    // Auto-convert to simple if group=1
    const gf = (drawOp as any).groupFilter
    const candidates = gf?.groups ?? gf?.include ?? gf?.keep
    const selectedSeries: string | number | null =
      candidates?.length === 1
        ? candidates[0]
        : drawOp.select?.keys?.length === 1
          ? drawOp.select.keys[0]
          : null
    if (selectedSeries != null) {
      const simpleSpec = await convertStackedToSimple(container, spec, { series: selectedSeries })
      if (simpleSpec) {
        storeDerivedChartState(container, ChartType.SIMPLE_BAR, simpleSpec)
      }
    }
    return
  }
  await handler.run(drawOp)
}

export async function runStackedBarOps(
  container: HTMLElement,
  vlSpec: StackedSpec,
  opsSpec: OpsSpecInput,
  options?: RunChartOpsOptions,
) {
  const { getOperationInput, handleOperationResult, clearChartWorking } = createChartScopedWorkingSet({
    getChartScopedData: (chartId, currentWorking) => {
      const domain = getStackedBarSplitDomain(container, chartId)
      if (!domain || domain.size === 0) return currentWorking
      const domainSet = new Set(domain)
      return currentWorking.filter((datum) => domainSet.has(String(datum.target)))
    },
    selectOperationInput: ({ operation, currentWorking, chartScoped }) => {
      if (!operation.chartId) return currentWorking
      const hasGroup = operation.group != null && String(operation.group).trim() !== ''
      if (hasGroup || shouldUseSeriesScopedInput(operation)) return chartScoped
      return shouldAggregateWhenMultipleGroups(chartScoped) ? aggregateDatumValuesByTarget(chartScoped) : chartScoped
    },
  })

  return runChartOperationsCommon<StackedSpec>({
    container,
    spec: vlSpec,
    opsSpec,
    render: renderStackedBarChart,
    postRender: async () => {},
    getWorkingData: () => {
      const raw = (getStackedBarStoredData(container) || []) as JsonValue[]
      return toStackedDatumValues(raw, vlSpec)
    },
    createHandler: () => new StackedBarDrawHandler(container),
    handleDrawOp: async (host, handler, drawOp) => {
      await handleStackedBarDraw(host, handler as StackedBarDrawHandler, drawOp, vlSpec)
      if (LEGACY_SPLIT_DRAW_ACTIONS.has(drawOp.action)) {
        clearChartWorking()
      }
    },
    clearAnnotations: ({ svg }) => clearAnnotations(svg),
    getOperationInput,
    handleOperationResult,
    runDrawPlan: async (drawPlan, handler) => {
      await runStackedBarDrawPlan(container, drawPlan, { handler: handler as StackedBarDrawHandler })
    },
    autoDrawPlans: STACKED_BAR_AUTO_DRAW_PLANS,
    onOperationCompleted: options?.onOperationCompleted,
    runtimeScope: options?.runtimeScope ?? 'ops',
    resetRuntime: options?.resetRuntime ?? true,
    initialRenderMode: options?.initialRenderMode ?? 'always',
  })
}

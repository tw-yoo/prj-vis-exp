import { type DatumValue, type OperationSpec, type JsonValue } from '../../types'
import { clearAnnotations } from '../../rendering/common/d3Helpers.ts'
import { runChartOperationsCommon } from './runChartOperationsCommon.ts'
import { DrawAction, type DrawSplitSpec } from '../../rendering/draw/types.ts'
import { GroupedBarDrawHandler } from '../../rendering/draw/bar/GroupedBarDrawHandler.ts'
import type { DrawOp } from '../../rendering/draw/types.ts'
import {
  renderGroupedBarChart,
  renderSplitGroupedBarChart,
  type GroupedSpec,
  getGroupedBarStoredData,
  getGroupedBarOriginalData,
  getGroupedBarSplitState,
} from '../../rendering/bar/groupedBarRenderer.ts'
import { toDatumValuesFromRaw, type RawRow } from '../../rendering/ops/common/datum.ts'
import type { OpsSpecInput } from '../../rendering/ops/common/opsSpec.ts'
import { runGroupedBarDrawPlan } from '../../rendering/ops/executor/runGroupedBarDrawPlan.ts'
import { convertGroupedToStacked } from '../../rendering/bar/stackGroupTransforms.ts'
import { convertGroupedToSimple } from '../../rendering/bar/toSimpleTransforms.ts'
import { aggregateDatumValuesByTarget } from '../../rendering/ops/common/workingData.ts'
import { GROUPED_BAR_AUTO_DRAW_PLANS } from '../../rendering/ops/visual/bar/grouped/groupedBarAutoDrawPlanBuilder.ts'
import {
  handleGroupFilter,
  shouldAggregateWhenSingleGroup,
  shouldUseSeriesScopedInput,
} from './barOpsCommon.ts'
import type { RunChartOpsOptions } from './runChartOps.ts'
import { createChartScopedWorkingSet } from './chartScopedWorkingSet.ts'
import { LEGACY_SPLIT_DRAW_ACTIONS, SURFACE_SPLIT_ENABLED } from './drawActionPolicy.ts'
import { storeDerivedChartState } from '../../rendering/utils/derivedChartState.ts'
import { ChartType } from '../../domain/chart'

function toGroupedDatumValues(raw: JsonValue[], spec: GroupedSpec): DatumValue[] {
  const normalized = raw.filter((item): item is RawRow => typeof item === 'object' && item !== null)
  return toDatumValuesFromRaw(normalized, {
    xField: spec.encoding.x.field,
    yField: spec.encoding.y.field,
    groupField: spec.encoding.color?.field,
  })
}

async function handleGroupedBarDraw(
  container: HTMLElement,
  handler: GroupedBarDrawHandler,
  drawOp: DrawOp,
  spec: GroupedSpec,
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
    await renderSplitGroupedBarChart(container, spec, drawOp.split as DrawSplitSpec)
    return
  }
  if (drawOp.action === DrawAction.Unsplit) {
    if (SURFACE_SPLIT_ENABLED) {
      // SurfaceManager 기반 unsplit은 runChartOps 레벨에서 처리됨
      console.debug('draw:unsplit handled at runChartOps level', drawOp)
      return
    }
    await renderGroupedBarChart(container, spec)
    return
  }
  if (drawOp.action === DrawAction.GroupedToStacked) {
    await convertGroupedToStacked(container, spec, drawOp.stackGroup)
    return
  }
  if (drawOp.action === DrawAction.GroupedToSimple) {
    if (!drawOp.toSimple?.series) {
      console.warn('grouped-to-simple: missing toSimple.series', drawOp)
      return
    }
    await convertGroupedToSimple(container, spec, drawOp.toSimple)
    return
  }
  if (drawOp.action === DrawAction.GroupedFilterGroups) {
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
      const simpleSpec = await convertGroupedToSimple(container, spec, { series: selectedSeries })
      if (simpleSpec) {
        storeDerivedChartState(container, ChartType.SIMPLE_BAR, simpleSpec)
      }
    }
    return
  }
  await handler.run(drawOp)
}

export async function runGroupedBarOps(
  container: HTMLElement,
  vlSpec: GroupedSpec,
  opsSpec: OpsSpecInput,
  options?: RunChartOpsOptions,
) {
  const { getOperationInput, handleOperationResult, clearChartWorking } = createChartScopedWorkingSet({
    getChartScopedData: (chartId, currentWorking) => {
      const splitState = getGroupedBarSplitState(container)
      if (!splitState) return currentWorking
      const domain = splitState.domains[chartId]
      if (!domain || domain.size === 0) return currentWorking
      const rawRows = (getGroupedBarStoredData(container) || []) as JsonValue[]
      const filtered = rawRows.filter((row) => {
        if (!row || typeof row !== 'object') return false
        const value = (row as RawRow)[splitState.field]
        if (value == null) return false
        return domain.has(String(value))
      })
      return toGroupedDatumValues(filtered, vlSpec)
    },
    selectOperationInput: ({ operation, currentWorking, chartScoped }) => {
      if (!operation.chartId) return currentWorking
      const hasGroup = operation.group != null && String(operation.group).trim() !== ''
      if (hasGroup || shouldUseSeriesScopedInput(operation)) return chartScoped
      return shouldAggregateWhenSingleGroup(chartScoped) ? aggregateDatumValuesByTarget(chartScoped) : chartScoped
    },
  })

  return runChartOperationsCommon<GroupedSpec>({
    container,
    spec: vlSpec,
    opsSpec,
    render: renderGroupedBarChart,
    postRender: async () => {},
    getWorkingData: () => {
      const raw = (getGroupedBarStoredData(container) || []) as JsonValue[]
      return toGroupedDatumValues(raw, vlSpec)
    },
    createHandler: () => new GroupedBarDrawHandler(container),
    handleDrawOp: async (host, handler, drawOp) => {
      await handleGroupedBarDraw(host, handler as GroupedBarDrawHandler, drawOp, vlSpec)
      if (LEGACY_SPLIT_DRAW_ACTIONS.has(drawOp.action)) {
        clearChartWorking()
      }
    },
    clearAnnotations: ({ svg }) => clearAnnotations(svg),
    getOperationInput,
    handleOperationResult,
    runDrawPlan: async (drawPlan, handler) => {
      await runGroupedBarDrawPlan(container, drawPlan, { handler: handler as GroupedBarDrawHandler })
    },
    autoDrawPlans: GROUPED_BAR_AUTO_DRAW_PLANS,
    onOperationCompleted: options?.onOperationCompleted,
    runtimeScope: options?.runtimeScope ?? 'ops',
    resetRuntime: options?.resetRuntime ?? true,
    initialRenderMode: options?.initialRenderMode ?? 'always',
  })
}

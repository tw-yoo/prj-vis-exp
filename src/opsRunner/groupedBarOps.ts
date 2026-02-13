import type { DatumValue, OperationSpec, JsonValue } from '../types'
import { clearAnnotations } from '../renderer/common/d3Helpers.ts'
import { runChartOperationsCommon } from './runChartOperationsCommon.ts'
import { runGenericDraw } from '../renderer/draw/genericDraw.ts'
import { DrawAction, type DrawSplitSpec } from '../renderer/draw/types.ts'
import { GroupedBarDrawHandler } from '../renderer/draw/bar/GroupedBarDrawHandler.ts'
import type { DrawOp } from '../renderer/draw/types.ts'
import {
  renderGroupedBarChart,
  renderSplitGroupedBarChart,
  type GroupedSpec,
  getGroupedBarStoredData,
  getGroupedBarOriginalData,
  getGroupedBarSplitState,
} from '../renderer/bar/groupedBarRenderer.ts'
import { toDatumValuesFromRaw, type RawRow } from '../renderer/ops/common/datum.ts'
import { runGroupedBarDrawPlan } from '../renderer/ops/executor/runGroupedBarDrawPlan.ts'
import { convertGroupedToStacked } from '../renderer/bar/stackGroupTransforms.ts'
import { aggregateDatumValuesByTarget } from '../renderer/ops/common/workingData.ts'
import {
  handleGroupFilter,
  shouldAggregateWhenSingleGroup,
} from './barOpsCommon.ts'

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
  if (drawOp.action === DrawAction.GroupedToStacked) {
    await convertGroupedToStacked(container, spec, drawOp.stackGroup)
    return
  }
  handler.run(drawOp)
  runGenericDraw(container, drawOp)
}

export async function runGroupedBarOps(
  container: HTMLElement,
  vlSpec: GroupedSpec,
  opsSpec: OperationSpec | OperationSpec[],
) {
  const chartWorking = new Map<string, DatumValue[]>()
  const filterRawByChartDomain = (chartId: string, rawRows: JsonValue[]) => {
    const splitState = getGroupedBarSplitState(container)
    if (!splitState) return rawRows
    const domain = splitState.domains[chartId]
    if (!domain || domain.size === 0) return rawRows
    return rawRows.filter((row) => {
      if (!row || typeof row !== 'object') return false
      const value = (row as RawRow)[splitState.field]
      if (value == null) return false
      return domain.has(String(value))
    })
  }

  const getOperationInput = (operation: OperationSpec, currentWorking: DatumValue[]) => {
    const chartId = operation.chartId
    const hasGroup = operation.group != null && String(operation.group).trim() !== ''
    const chartScoped =
      chartId == null
        ? currentWorking
        : chartWorking.get(chartId) ??
          toGroupedDatumValues(filterRawByChartDomain(chartId, getGroupedBarStoredData(container) as JsonValue[]), vlSpec)
    if (chartId && !chartWorking.has(chartId)) {
      chartWorking.set(chartId, chartScoped)
    }
    if (hasGroup) return chartScoped
    return shouldAggregateWhenSingleGroup(chartScoped) ? aggregateDatumValuesByTarget(chartScoped) : chartScoped
  }

  const handleOperationResult = (operation: OperationSpec, result: DatumValue[], currentWorking: DatumValue[]) => {
    const chartId = operation.chartId
    if (chartId) {
      chartWorking.set(chartId, result)
      return currentWorking
    }
    chartWorking.clear()
    return result
  }

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
    splitHandler: async (host, spec, handler, drawOp) => {
      if (drawOp.action === DrawAction.Split) {
        if (!drawOp.split || typeof drawOp.split !== 'object') {
          console.warn('draw:split requires split spec', drawOp)
          return true
        }
        await renderSplitGroupedBarChart(host, spec, drawOp.split as DrawSplitSpec)
        chartWorking.clear()
        return true
      }
      if (drawOp.action === DrawAction.Unsplit) {
        await renderGroupedBarChart(host, spec)
        chartWorking.clear()
        return true
      }
      const handled = await handleGroupFilter(host, spec, drawOp, {
        action: DrawAction.GroupedFilterGroups,
        getGroupField: (spec) => spec.encoding.color?.field,
        getOriginalData: getGroupedBarOriginalData,
        render: renderGroupedBarChart,
      })
      if (handled) chartWorking.clear()
      return handled
    },
    handleDrawOp: async (host, handler, drawOp) =>
      handleGroupedBarDraw(host, handler as GroupedBarDrawHandler, drawOp, vlSpec),
    clearAnnotations: ({ svg }) => clearAnnotations(svg),
    getOperationInput,
    handleOperationResult,
    runDrawPlan: async (drawPlan, handler) => {
      await runGroupedBarDrawPlan(container, drawPlan, { handler: handler as GroupedBarDrawHandler })
    },
  })
}

import type { DatumValue, OperationSpec, JsonValue } from '../types'
import { clearAnnotations } from '../renderer/common/d3Helpers.ts'
import { runChartOperationsCommon } from './runChartOperationsCommon.ts'
import { StackedBarDrawHandler } from '../renderer/draw/bar/StackedBarDrawHandler.ts'
import { runGenericDraw } from '../renderer/draw/genericDraw.ts'
import { DrawAction, type DrawSplitSpec } from '../renderer/draw/types.ts'
import type { DrawOp } from '../renderer/draw/types.ts'
import {
  renderStackedBarChart,
  renderSplitStackedBarChart,
  type StackedSpec,
  getStackedBarStoredData,
  getStackedBarOriginalData,
  getStackedBarSplitDomain,
} from '../renderer/bar/stackedBarRenderer.ts'
import { toDatumValuesFromRaw, type RawRow } from '../renderer/ops/common/datum.ts'
import { runStackedBarDrawPlan } from '../renderer/ops/executor/runStackedBarDrawPlan.ts'
import { convertStackedToGrouped } from '../renderer/bar/stackGroupTransforms.ts'
import { aggregateDatumValuesByTarget } from '../renderer/ops/common/workingData.ts'
import {
  handleGroupFilter,
  shouldAggregateWhenMultipleGroups,
} from './barOpsCommon.ts'

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
  if (drawOp.action === DrawAction.StackedToGrouped) {
    await convertStackedToGrouped(container, spec, drawOp.stackGroup)
    return
  }
  handler.run(drawOp)
  runGenericDraw(container, drawOp)
}

export async function runStackedBarOps(
  container: HTMLElement,
  vlSpec: StackedSpec,
  opsSpec: OperationSpec | OperationSpec[],
) {
  const chartWorking = new Map<string, DatumValue[]>()
  const filterByChartDomain = (chartId: string, currentWorking: DatumValue[]) => {
    const domain = getStackedBarSplitDomain(container, chartId)
    if (!domain || domain.size === 0) return currentWorking
    const domainSet = new Set(domain)
    return currentWorking.filter((datum) => domainSet.has(String(datum.target)))
  }

  const getOperationInput = (operation: OperationSpec, currentWorking: DatumValue[]) => {
    const chartId = operation.chartId
    const hasGroup = operation.group != null && String(operation.group).trim() !== ''
    const chartScoped = chartId
      ? chartWorking.get(chartId) ?? filterByChartDomain(chartId, currentWorking)
      : currentWorking
    if (chartId && !chartWorking.has(chartId)) {
      chartWorking.set(chartId, chartScoped)
    }
    if (hasGroup) return chartScoped
    return shouldAggregateWhenMultipleGroups(chartScoped) ? aggregateDatumValuesByTarget(chartScoped) : chartScoped
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
    splitHandler: async (host, spec, handler, drawOp) => {
      if (drawOp.action === DrawAction.Split) {
        if (!drawOp.split || typeof drawOp.split !== 'object') {
          console.warn('draw:split requires split spec', drawOp)
          return true
        }
        await renderSplitStackedBarChart(host, spec, drawOp.split as DrawSplitSpec)
        chartWorking.clear()
        return true
      }
      if (drawOp.action === DrawAction.Unsplit) {
        await renderStackedBarChart(host, spec)
        chartWorking.clear()
        return true
      }
      const handled = await handleGroupFilter(host, spec, drawOp, {
        action: DrawAction.StackedFilterGroups,
        getGroupField: (spec) => spec.encoding.color?.field,
        getOriginalData: getStackedBarOriginalData,
        render: renderStackedBarChart,
      })
      if (handled) chartWorking.clear()
      return handled
    },
    handleDrawOp: async (host, handler, drawOp) =>
      handleStackedBarDraw(host, handler as StackedBarDrawHandler, drawOp, vlSpec),
    clearAnnotations: ({ svg }) => clearAnnotations(svg),
    getOperationInput,
    handleOperationResult,
    runDrawPlan: async (drawPlan, handler) => {
      await runStackedBarDrawPlan(container, drawPlan, { handler: handler as StackedBarDrawHandler })
    },
  })
}

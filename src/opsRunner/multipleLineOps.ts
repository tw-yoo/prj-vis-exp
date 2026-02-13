import * as d3 from 'd3'
import type { DatumValue, OperationSpec } from '../types'
import {
  renderMultipleLineChart,
  type MultiLineSpec,
  getMultipleLineStoredData,
  tagMultipleLineMarks,
  renderSplitMultipleLineChart,
  getMultipleLineSplitDomain,
} from '../renderer/line/multipleLineRenderer.ts'
import { toDatumValuesFromRaw } from '../renderer/ops/common/datum.ts'
import { DrawAction, type DrawOp } from '../renderer/draw/types.ts'
import { MultiLineDrawHandler } from '../renderer/draw/line/MultiLineDrawHandler.ts'
import { clearAnnotations } from '../renderer/common/d3Helpers.ts'
import { runChartOperationsCommon } from './runChartOperationsCommon.ts'
import { runMultipleLineDrawPlan } from '../renderer/ops/executor/runMultipleLineDrawPlan.ts'
import { MULTI_LINE_AUTO_DRAW_PLANS } from '../renderer/ops/visual/line/multiple/autoDrawPlanRegistry.ts'

function toDatumValues(raw: any[], xField: string, yField: string): DatumValue[] {
  return toDatumValuesFromRaw(raw as any, { xField, yField })
}

function handleMultipleLineDraw(container: HTMLElement, handler: MultiLineDrawHandler, drawOp: DrawOp) {
  if (drawOp.action === DrawAction.Clear) {
    clearAnnotations(d3.select(container).select('svg'))
    handler.run(drawOp)
    return
  }
  if (
    drawOp.action === DrawAction.Highlight ||
    drawOp.action === DrawAction.Dim ||
    drawOp.action === DrawAction.LineTrace ||
    drawOp.action === DrawAction.Text ||
    drawOp.action === DrawAction.Rect ||
    drawOp.action === DrawAction.Line
  ) {
    handler.run(drawOp)
    return
  }
  console.warn('draw: unsupported action for multiple line', drawOp.action)
}

async function handleMultipleLineSplit(container: HTMLElement, spec: MultiLineSpec, drawOp: DrawOp) {
  if (drawOp.action === DrawAction.Split) {
    if (!drawOp.split) {
      console.warn('draw:split requires split spec', drawOp)
      return true
    }
    await renderSplitMultipleLineChart(container, spec, drawOp.split)
    return true
  }
  if (drawOp.action === DrawAction.Unsplit) {
    await renderMultipleLineChart(container, spec)
    return true
  }
  return false
}

export async function runMultipleLineOps(
  container: HTMLElement,
  vlSpec: MultiLineSpec,
  opsSpec: OperationSpec | OperationSpec[],
) {
  const chartWorking = new Map<string, DatumValue[]>()
  const filterByChartDomain = (chartId: string, currentWorking: DatumValue[]) => {
    const domain = getMultipleLineSplitDomain(container, chartId)
    if (!domain || domain.size === 0) return currentWorking
    const domainSet = new Set(domain)
    return currentWorking.filter((datum) => domainSet.has(String(datum.target)))
  }
  const deriveOperationInput = (operation: OperationSpec, currentWorking: DatumValue[]) => {
    const chartId = operation.chartId
    if (!chartId) return currentWorking
    if (chartWorking.has(chartId)) return chartWorking.get(chartId)!
    const subset = filterByChartDomain(chartId, currentWorking)
    chartWorking.set(chartId, subset)
    return subset
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

  return runChartOperationsCommon<MultiLineSpec>({
    container,
    spec: vlSpec,
    opsSpec,
    render: renderMultipleLineChart,
    postRender: async (host, spec) => tagMultipleLineMarks(host, spec),
    getWorkingData: (_, spec) => {
      const raw = getMultipleLineStoredData(container) || []
      return toDatumValues(raw, spec.encoding.x.field, spec.encoding.y.field)
    },
    createHandler: () => new MultiLineDrawHandler(container),
    splitHandler: async (host, spec, handler, drawOp) => {
      const handled = await handleMultipleLineSplit(host, spec, drawOp)
      if (handled) {
        handler = new MultiLineDrawHandler(host)
        chartWorking.clear()
      }
      return handled
    },
    handleDrawOp: (host, handler, drawOp) =>
      handleMultipleLineDraw(host, handler as MultiLineDrawHandler, drawOp),
    clearAnnotations: ({ svg }) => clearAnnotations(svg),
    autoDrawPlans: MULTI_LINE_AUTO_DRAW_PLANS,
    getOperationInput: deriveOperationInput,
    handleOperationResult,
    runDrawPlan: async (drawPlan, handler) => {
      await runMultipleLineDrawPlan(container, drawPlan, { handler: handler as MultiLineDrawHandler })
    },
  })
}

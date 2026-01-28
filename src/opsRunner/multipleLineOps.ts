import * as d3 from 'd3'
import type { DatumValue, OperationSpec } from '../types'
import {
  renderMultipleLineChart,
  type MultiLineSpec,
  getMultipleLineStoredData,
  tagMultipleLineMarks,
} from '../renderer/line/multipleLineRenderer.ts'
import { toDatumValuesFromRaw } from '../renderer/ops/common/datum.ts'
import { DrawAction, type DrawOp } from '../renderer/draw/types.ts'
import { MultiLineDrawHandler } from '../renderer/draw/line/MultiLineDrawHandler.ts'
import { clearAnnotations } from '../renderer/common/d3Helpers.ts'
import { runChartOperationsCommon } from './runChartOperationsCommon.ts'
import { runMultipleLineDrawPlan } from '../renderer/ops/executor/runMultipleLineDrawPlan.ts'

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

export async function runMultipleLineOps(
  container: HTMLElement,
  vlSpec: MultiLineSpec,
  opsSpec: OperationSpec | OperationSpec[],
) {
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
    handleDrawOp: (host, handler, drawOp) =>
      handleMultipleLineDraw(host, handler as MultiLineDrawHandler, drawOp),
    clearAnnotations: ({ svg }) => clearAnnotations(svg),
    runDrawPlan: async (drawPlan, handler) => {
      await runMultipleLineDrawPlan(container, drawPlan, { handler: handler as MultiLineDrawHandler })
    },
  })
}

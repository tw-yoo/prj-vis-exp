import type { DatumValue, OperationSpec } from '../types'
import * as d3 from 'd3'
import {
  renderSimpleLineChart,
  type LineSpec,
  getSimpleLineStoredData,
  tagSimpleLineMarks,
} from '../renderer/line/simpleLineRenderer.ts'
import { toDatumValuesFromRaw } from '../renderer/ops/common/datum.ts'
import { DrawAction, type DrawOp } from '../renderer/draw/types.ts'
import { SimpleLineDrawHandler } from '../renderer/draw/line/SimpleLineDrawHandler.ts'
import { clearAnnotations } from '../renderer/common/d3Helpers.ts'
import { runChartOperationsCommon } from './runChartOperationsCommon.ts'
import { runSimpleLineDrawPlan } from '../renderer/ops/executor/runSimpleLineDrawPlan.ts'

function toDatumValues(rawData: any[], xField: string, yField: string): DatumValue[] {
  return toDatumValuesFromRaw(rawData as any, { xField, yField })
}

function handleSimpleLineDraw(container: HTMLElement, handler: SimpleLineDrawHandler, drawOp: DrawOp) {
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
  console.warn('draw: unsupported action for simple line', drawOp.action)
}

export async function runSimpleLineOps(container: HTMLElement, vlSpec: LineSpec, opsSpec: OperationSpec | OperationSpec[]) {
  return runChartOperationsCommon<LineSpec>({
    container,
    spec: vlSpec,
    opsSpec,
    render: renderSimpleLineChart,
    postRender: async (host, spec) => tagSimpleLineMarks(host, spec),
    getWorkingData: (host, spec) => {
      const raw = getSimpleLineStoredData(host) || []
      return toDatumValues(raw, spec.encoding.x.field, spec.encoding.y.field)
    },
    createHandler: (host) => new SimpleLineDrawHandler(host),
    handleDrawOp: (host, handler, drawOp) => handleSimpleLineDraw(host, handler as SimpleLineDrawHandler, drawOp),
    clearAnnotations: ({ svg }) => clearAnnotations(svg),
    runDrawPlan: async (drawPlan, handler) => {
      await runSimpleLineDrawPlan(container, drawPlan, { handler: handler as SimpleLineDrawHandler })
    },
  })
}

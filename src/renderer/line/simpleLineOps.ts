import type { DatumValue, OperationSpec } from '../../types'
import { OperationOp } from '../../types'
import { renderSimpleLineChart, type LineSpec, getSimpleLineStoredData, tagSimpleLineMarks } from './simpleLineRenderer'
import { STANDARD_DATA_OP_HANDLERS } from '../ops/common/dataHandlers'
import { toDatumValuesFromRaw } from '../ops/common/datum'
import { executeDataOperation } from '../ops/common/executeDataOp'
import { normalizeOpsList } from '../ops/common/opsSpec'
import { DrawAction, type DrawOp } from '../draw/types'
import { SimpleLineDrawHandler } from '../draw/line/SimpleLineDrawHandler'
import { clearAnnotations } from '../common/d3Helpers'
import { SvgElements } from '../interfaces'
import * as d3 from 'd3'
import { runSleepDraw } from '../ops/common/sleepDraw'

type DrawSelect = { by?: 'key' | 'mark'; keys?: string[]; mark?: string }
function toDatumValues(rawData: any[], xField: string, yField: string): DatumValue[] {
  return toDatumValuesFromRaw(rawData as any, { xField, yField })
}

function handleDraw(container: HTMLElement | undefined, data: DatumValue[], op: DrawOp) {
  if (!container) return data
  const handler = new SimpleLineDrawHandler(container)
  if (!op.action) return data
  switch (op.action) {
    case DrawAction.Clear: {
      clearAnnotations(d3.select(container).select(SvgElements.Svg))
      handler.run(op as any)
      return data
    }
    case DrawAction.Highlight:
    case DrawAction.Dim:
    case DrawAction.LineTrace:
    case DrawAction.Text:
    case DrawAction.Rect:
    case DrawAction.Line: {
      handler.run(op as any)
      return data
    }
    default: {
      console.warn('draw: unsupported action for simple line', op.action)
    }
  }
  return data
}

export async function runSimpleLineOps(container: HTMLElement, vlSpec: LineSpec, opsSpec: any) {
  const hasSvg = !!container.querySelector('svg')
  if (!hasSvg) {
    await renderSimpleLineChart(container, vlSpec)
  } else {
    await tagSimpleLineMarks(container, vlSpec)
  }
  const raw = getSimpleLineStoredData(container) || []
  const xField = vlSpec.encoding.x.field
  const yField = vlSpec.encoding.y.field
  const base = toDatumValues(raw, xField, yField)
  const opsArray = normalizeOpsList(opsSpec as any)
  let working: DatumValue[] = base
  for (const op of opsArray) {
    if (op.op === OperationOp.Draw) {
      const drawOp = op as DrawOp
      if (drawOp.action === DrawAction.Sleep) {
        await runSleepDraw(drawOp.sleep)
        continue
      }
      handleDraw(container, working, drawOp)
      continue
    }
    const executed = executeDataOperation(working, op, STANDARD_DATA_OP_HANDLERS)
    if (!executed) continue
    working = executed.result
  }
  return working
}

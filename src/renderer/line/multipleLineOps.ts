// @ts-nocheck
import * as d3 from 'd3'
import type { DatumValue } from '../../types'
import { OperationOp } from '../../types'
import { STANDARD_DATA_OP_HANDLERS } from '../ops/common/dataHandlers'
import { toDatumValuesFromRaw } from '../ops/common/datum'
import { executeDataOperation } from '../ops/common/executeDataOp'
import { normalizeOpsList } from '../ops/common/opsSpec'
import { clearAnnotations } from '../common/d3Helpers'
import { runGenericDraw } from '../draw/genericDraw'
import { MultiLineDrawHandler } from '../draw/line/MultiLineDrawHandler'
import { DrawAction, type DrawOp as DrawOpType } from '../draw/types'
import { SvgElements } from '../interfaces'
import { renderMultipleLineChart, type MultiLineSpec, getMultipleLineStoredData, tagMultipleLineMarks } from './multipleLineRenderer'
import { runSleepDraw } from '../ops/common/sleepDraw'

function handleDraw(container: HTMLElement | undefined, data: DatumValue[], op: DrawOpType) {
  if (!container || !op.action) return data
  const handler = new MultiLineDrawHandler(container)
  handler.run(op as any)
  runGenericDraw(container, op as any)
  return data
}

export async function runMultipleLineOps(container: HTMLElement, vlSpec: MultiLineSpec, opsSpec: any) {
  const hasSvg = !!container.querySelector('svg')
  if (!hasSvg) {
    await renderMultipleLineChart(container, vlSpec)
  } else {
    await tagMultipleLineMarks(container, vlSpec)
  }
  const raw = getMultipleLineStoredData(container) || []
  const xField = vlSpec.encoding.x.field
  const yField = vlSpec.encoding.y.field
  const colorField = vlSpec.encoding.color?.field
  const base = toDatumValuesFromRaw(raw as any, { xField, yField, groupField: colorField })
  const opsArray = normalizeOpsList(opsSpec as any)
  let working: DatumValue[] = base
  for (const op of opsArray) {
    if (op.op === OperationOp.Draw) {
      const drawOp = op as DrawOpType
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
  clearAnnotations(d3.select(container).select(SvgElements.Svg))
  return working
}

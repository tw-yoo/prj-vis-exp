// @ts-nocheck
import * as d3 from 'd3'
import type { DatumValue } from '../types'
import { OperationOp } from '../types'
import { STANDARD_DATA_OP_HANDLERS } from '../renderer/ops/common/dataHandlers.ts'
import { toDatumValuesFromRaw } from '../renderer/ops/common/datum.ts'
import { executeDataOperation } from '../renderer/ops/common/executeDataOp.ts'
import { normalizeOpsList } from '../renderer/ops/common/opsSpec.ts'
import { clearAnnotations } from '../renderer/common/d3Helpers.ts'
import { runGenericDraw } from '../renderer/draw/genericDraw.ts'
import { MultiLineDrawHandler } from '../renderer/draw/line/MultiLineDrawHandler.ts'
import { DrawAction, type DrawOp as DrawOpType } from '../renderer/draw/types.ts'
import { SvgElements } from '../renderer/interfaces'
import { renderMultipleLineChart, type MultiLineSpec, getMultipleLineStoredData, tagMultipleLineMarks } from '../renderer/line/multipleLineRenderer.ts'
import { runSleepOp } from '../renderer/ops/common/sleepOp.ts'

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
    if (op.op === OperationOp.Sleep) {
      await runSleepOp(op)
      continue
    }

    if (op.op === OperationOp.Draw) {
      const drawOp = op as DrawOpType
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

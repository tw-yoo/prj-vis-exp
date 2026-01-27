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
import { GroupedBarDrawHandler } from '../renderer/draw/bar/GroupedBarDrawHandler.ts'
import { DrawAction, type DrawOp as DrawOpType } from '../renderer/draw/types.ts'
import { SvgElements } from '../renderer/interfaces'
import { renderGroupedBarChart, type GroupedSpec, getGroupedBarStoredData } from '../renderer/bar/groupedBarRenderer.ts'
import { runSleepOp } from '../renderer/ops/common/sleepOp.ts'

function handleDraw(container: HTMLElement | undefined, data: DatumValue[], op: DrawOpType) {
  if (!container || !op.action) return data
  const handler = new GroupedBarDrawHandler(container)
  handler.run(op as any)
  runGenericDraw(container, op as any)
  return data
}

export async function runGroupedBarOps(container: HTMLElement, vlSpec: GroupedSpec, opsSpec: any) {
  await renderGroupedBarChart(container, vlSpec)
  const raw = getGroupedBarStoredData(container) || []
  const xField = vlSpec.encoding.x.field
  const yField = vlSpec.encoding.y.field
  const colorField = vlSpec.encoding.color?.field
  const base = toDatumValuesFromRaw(raw as any, { xField, yField, groupField: colorField })
  const opsArray = normalizeOpsList(opsSpec as any)
  let working: DatumValue[] = base
  for (let index = 0; index < opsArray.length; index += 1) {
    const op = opsArray[index]
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

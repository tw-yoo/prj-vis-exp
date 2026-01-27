// @ts-nocheck
import type { DatumValue, OperationSpec } from '../types'
import { OperationOp } from '../types'
import { clearAnnotations } from '../renderer/common/d3Helpers.ts'
import { BarDrawHandler } from '../renderer/draw/BarDrawHandler.ts'
import { DrawAction, type DrawSplitSpec, type DrawOp } from '../renderer/draw/types.ts'
import { runGenericDraw } from '../renderer/draw/genericDraw.ts'
import { isDrawOp } from '../renderer/ops/operationPipeline.ts'
import { runSimpleBarDrawPlan } from '../renderer/ops/executor/runSimpleBarDrawPlan.ts'
import { buildSimpleBarRetrieveValueDrawPlan } from '../renderer/ops/visual/bar/simple/retrieveValue.visual.ts'
import {
  resetRuntimeResults,
  storeRuntimeResult,
} from '../logic/dataOps.ts'
import { STANDARD_DATA_OP_HANDLERS } from '../renderer/ops/common/dataHandlers.ts'
import { getPlotContext } from '../renderer/ops/common/chartContext.ts'
import { executeDataOperation } from '../renderer/ops/common/executeDataOp.ts'
import { normalizeOpsList, type OpsSpecInput } from '../renderer/ops/common/opsSpec.ts'
import { runtimeKeyFor } from '../renderer/ops/common/runtime.ts'
import { toWorkingDatumValuesFromStore } from '../renderer/ops/common/workingData.ts'
import { runSleepOp } from '../renderer/ops/common/sleepOp.ts'
import {
  renderSimpleBarChart,
  renderSplitSimpleBarChart,
  type SimpleBarSpec,
  getSimpleBarStoredData,
} from '../renderer/bar/simpleBarRenderer.ts'
import {buildSimpleBarSortDrawPlan} from "../renderer/ops/visual/bar/simple/sort.visual.ts";

function toWorkingDatumValues(container: HTMLElement, vlSpec: SimpleBarSpec) {
  const ctx = getPlotContext(container)
  const raw = (getSimpleBarStoredData(container) || []) as any
  return toWorkingDatumValuesFromStore({
    raw,
    specXField: vlSpec.encoding.x.field,
    specYField: vlSpec.encoding.y.field,
    ctxXField: ctx.xField,
    ctxYField: ctx.yField,
  })
}

const AUTO_DRAW_PLANS: Record<string, (result: DatumValue[], op: OperationSpec) => any[] | null> = {
  [OperationOp.RetrieveValue]: (result, op) => buildSimpleBarRetrieveValueDrawPlan(result, op as any),
  [OperationOp.Sort]: (result, op) => buildSimpleBarSortDrawPlan(result, op as any),
}

/**
 * Run a list of operations against a rendered simple bar chart in the given container.
 * Rendering is invoked first to ensure the chart and data store are prepared.
 */
export async function runSimpleBarOps(
  container: HTMLElement,
  vlSpec: SimpleBarSpec,
  opsSpec: OpsSpecInput,
): Promise<DatumValue[]> {

  await renderSimpleBarChart(container, vlSpec)

  const baseData = toWorkingDatumValues(container, vlSpec)
  const opsList = normalizeOpsList(opsSpec)

  resetRuntimeResults()
  clearAnnotations(getPlotContext(container).svg)

  let working: DatumValue[] = baseData
  let handler = new BarDrawHandler(container)

  for (let index = 0; index < opsList.length; index += 1) {
    const operation = opsList[index]

    if (operation.op === OperationOp.Sleep) {
      await runSleepOp(operation)
      continue
    }

    if (isDrawOp(operation)) {
      const drawOp = operation as any
      if (drawOp.action === DrawAction.Split) {
        if (!drawOp.split) {
          console.warn('draw:split requires split spec', drawOp)
          continue
        }
        await renderSplitSimpleBarChart(container, vlSpec, drawOp.split as DrawSplitSpec)
        handler = new BarDrawHandler(container)
        continue
      }
      if (drawOp.action === DrawAction.Unsplit) {
        await renderSimpleBarChart(container, vlSpec)
        handler = new BarDrawHandler(container)
        continue
      }
      handler.run(drawOp)
      runGenericDraw(container, drawOp)
      continue
    }

    const executed =
        executeDataOperation(working, operation, STANDARD_DATA_OP_HANDLERS, AUTO_DRAW_PLANS)

    if (!executed) { console.warn(`Unsupported operation: ${operation.op}`); continue }

    storeRuntimeResult(runtimeKeyFor(operation, index), executed.result)
    working = executed.result

    if (executed.drawPlan) {
      await runSimpleBarDrawPlan(container, executed.drawPlan as any, { handler })
    }
  }

  return working
}

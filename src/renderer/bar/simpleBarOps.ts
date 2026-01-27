// @ts-nocheck
import type { DatumValue, OperationSpec } from '../../types'
import { OperationOp } from '../../types'
import { clearAnnotations } from '../common/d3Helpers'
import { BarDrawHandler } from '../draw/BarDrawHandler'
import { DrawAction, type DrawSplitSpec, type DrawOp } from '../draw/types'
import { runGenericDraw } from '../draw/genericDraw'
import { isDrawOp } from '../ops/operationPipeline'
import { runSimpleBarDrawPlan } from '../ops/executor/runSimpleBarDrawPlan'
import { buildSimpleBarRetrieveValueDrawPlan } from '../ops/visual/bar/simple/retrieveValue.visual'
import {
  resetRuntimeResults,
  storeRuntimeResult,
} from '../../logic/dataOps'
import { STANDARD_DATA_OP_HANDLERS } from '../ops/common/dataHandlers'
import { getPlotContext } from '../ops/common/chartContext'
import { executeDataOperation } from '../ops/common/executeDataOp'
import { normalizeOpsList, type OpsSpecInput } from '../ops/common/opsSpec'
import { runtimeKeyFor } from '../ops/common/runtime'
import { toWorkingDatumValuesFromStore } from '../ops/common/workingData'
import { runSleepDraw } from '../ops/common/sleepDraw'
import {
  renderSimpleBarChart,
  renderSplitSimpleBarChart,
  type SimpleBarSpec,
  getSimpleBarStoredData,
} from './simpleBarRenderer'

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

    if (isDrawOp(operation)) {
      const drawOp = operation as any
      if (drawOp.action === DrawAction.Sleep) {
        await runSleepDraw((drawOp as DrawOp).sleep)
        continue
      }
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

    const executed = executeDataOperation(working, operation, STANDARD_DATA_OP_HANDLERS, AUTO_DRAW_PLANS)
    if (!executed) {
      console.warn(`Unsupported operation: ${operation.op}`)
      continue
    }
    storeRuntimeResult(runtimeKeyFor(operation, index), executed.result)
    working = executed.result
    if (executed.drawPlan) {
      await runSimpleBarDrawPlan(container, executed.drawPlan as any, { handler })
    }
  }

  return working
}

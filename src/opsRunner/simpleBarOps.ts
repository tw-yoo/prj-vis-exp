// @ts-nocheck
import type { DatumValue, OperationSpec } from '../types'
import { OperationOp } from '../types'
import { BarDrawHandler } from '../renderer/draw/BarDrawHandler.ts'
import { DrawAction, type DrawSplitSpec, type DrawOp } from '../renderer/draw/types.ts'
import { runSimpleBarDrawPlan } from '../renderer/ops/executor/runSimpleBarDrawPlan.ts'
import { buildSimpleBarRetrieveValueDrawPlan } from '../renderer/ops/visual/bar/simple/retrieveValue.visual.ts'
import { buildSimpleBarSortDrawPlan } from '../renderer/ops/visual/bar/simple/sort.visual.ts'
import { normalizeOpsList, type OpsSpecInput } from '../renderer/ops/common/opsSpec.ts'
import { getPlotContext } from '../renderer/ops/common/chartContext.ts'
import { toWorkingDatumValuesFromStore } from '../renderer/ops/common/workingData.ts'
import { runChartOperationsCommon } from './runChartOperationsCommon.ts'
import {
  renderSimpleBarChart,
  renderSplitSimpleBarChart,
  type SimpleBarSpec,
  getSimpleBarStoredData,
} from '../renderer/bar/simpleBarRenderer.ts'
import { resetRuntimeResults } from '../logic/dataOps.ts'
import { clearAnnotations } from '../renderer/common/d3Helpers.ts'

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

async function handleSimpleBarSplit(
  container: HTMLElement,
  spec: SimpleBarSpec,
  drawOp: DrawOp,
) {
  if (drawOp.action === DrawAction.Split) {
    if (!drawOp.split) {
      console.warn('draw:split requires split spec', drawOp)
      return true
    }
    await renderSplitSimpleBarChart(container, spec, drawOp.split as DrawSplitSpec)
    return true
  }
  if (drawOp.action === DrawAction.Unsplit) {
    await renderSimpleBarChart(container, spec)
    return true
  }
  return false
}

export async function runSimpleBarOps(container: HTMLElement, vlSpec: SimpleBarSpec, opsSpec: OpsSpecInput) {
  resetRuntimeResults()

  return runChartOperationsCommon<SimpleBarSpec>({
    container,
    spec: vlSpec,
    opsSpec,
    render: renderSimpleBarChart,
    postRender: async () => {},
    getWorkingData: (host, spec) => toWorkingDatumValues(host, spec),
    createHandler: (host) => new BarDrawHandler(host),
    splitHandler: async (host, spec, handler, drawOp) => {
      const handled = await handleSimpleBarSplit(host, spec, drawOp)
      if (handled) {
        handler = new BarDrawHandler(host)
      }
      return handled
    },
    clearAnnotations: ({ container: host }) => clearAnnotations(getPlotContext(host).svg),
    autoDrawPlans: AUTO_DRAW_PLANS,
    runDrawPlan: async (drawPlan, handler) => {
      await runSimpleBarDrawPlan(container, drawPlan, { handler })
    },
  })
}

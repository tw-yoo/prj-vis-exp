import type { DatumValue, OperationSpec } from '../../types'
import { BarDrawHandler } from '../../rendering/draw/BarDrawHandler.ts'
import { DrawAction, type DrawSplitSpec, type DrawOp } from '../../rendering/draw/types.ts'
import { runSimpleBarDrawPlan } from '../../rendering/ops/executor/runSimpleBarDrawPlan.ts'
import { SIMPLE_BAR_AUTO_DRAW_PLANS } from '../../rendering/ops/visual/bar/simple/simpleBarAutoDrawPlanBuilder.ts'
import { normalizeOpsList, type OpsSpecInput } from '../../rendering/ops/common/opsSpec.ts'
import { getPlotContext } from '../../rendering/ops/common/chartContext.ts'
import { toWorkingDatumValuesFromStore } from '../../rendering/ops/common/workingData.ts'
import { runChartOperationsCommon } from './runChartOperationsCommon.ts'
import {
  renderSimpleBarChart,
  renderSplitSimpleBarChart,
  type SimpleBarSpec,
  getSimpleBarStoredData,
  getSimpleBarSplitDomain,
} from '../../rendering/bar/simpleBarRenderer.ts'
import { clearAnnotations } from '../../rendering/common/d3Helpers.ts'
import type { RunChartOpsOptions } from './runChartOps.ts'
import { createChartScopedWorkingSet } from './chartScopedWorkingSet.ts'
import { LEGACY_SPLIT_DRAW_ACTIONS, SPLIT_VIEW_ENABLED } from './drawActionPolicy.ts'

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

async function handleSimpleBarDraw(
  container: HTMLElement,
  handler: BarDrawHandler,
  spec: SimpleBarSpec,
  drawOp: DrawOp,
) {
  if (drawOp.action === DrawAction.Split) {
    if (!SPLIT_VIEW_ENABLED) {
      console.warn('draw:split is disabled in the active runtime', drawOp)
      return
    }
    if (!drawOp.split) {
      console.warn('draw:split requires split spec', drawOp)
      return
    }
    await renderSplitSimpleBarChart(container, spec, drawOp.split as DrawSplitSpec)
    return
  }
  if (drawOp.action === DrawAction.Unsplit) {
    if (!SPLIT_VIEW_ENABLED) {
      console.warn('draw:unsplit is disabled in the active runtime', drawOp)
      return
    }
    await renderSimpleBarChart(container, spec)
    return
  }
  await handler.run(drawOp)
}

export async function runSimpleBarOps(
  container: HTMLElement,
  vlSpec: SimpleBarSpec,
  opsSpec: OpsSpecInput,
  options?: RunChartOpsOptions,
) {
  const { getOperationInput, handleOperationResult, clearChartWorking } = createChartScopedWorkingSet({
    getChartScopedData: (chartId, currentWorking) => {
      const domain = getSimpleBarSplitDomain(container, chartId)
      if (!domain || domain.size === 0) return currentWorking
      const domainSet = new Set(domain)
      return currentWorking.filter((datum) => domainSet.has(String(datum.target)))
    },
  })

  return runChartOperationsCommon<SimpleBarSpec>({
    container,
    spec: vlSpec,
    opsSpec,
    render: renderSimpleBarChart,
    postRender: async () => {},
    getWorkingData: (host, spec) => toWorkingDatumValues(host, spec),
    createHandler: (host) => new BarDrawHandler(host),
    handleDrawOp: async (host, handler, drawOp) => {
      await handleSimpleBarDraw(host, handler as BarDrawHandler, vlSpec, drawOp)
      if (LEGACY_SPLIT_DRAW_ACTIONS.has(drawOp.action)) {
        clearChartWorking()
      }
    },
    clearAnnotations: ({ container: host }) => clearAnnotations(getPlotContext(host).svg),
    autoDrawPlans: SIMPLE_BAR_AUTO_DRAW_PLANS,
    getOperationInput,
    handleOperationResult,
    runDrawPlan: async (drawPlan, handler) => {
      await runSimpleBarDrawPlan(container, drawPlan, { handler: handler as BarDrawHandler })
    },
    onOperationCompleted: options?.onOperationCompleted,
    runtimeScope: options?.runtimeScope ?? 'ops',
    resetRuntime: options?.resetRuntime ?? true,
    initialRenderMode: options?.initialRenderMode ?? 'always',
  })
}

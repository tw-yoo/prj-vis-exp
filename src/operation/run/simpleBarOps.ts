import type { DatumValue, OperationSpec } from '../../types'
import { BarDrawHandler } from '../../rendering/draw/BarDrawHandler.ts'
import { DrawAction, type DrawSplitSpec, type DrawOp } from '../../rendering/draw/types.ts'
import { runSimpleBarDrawPlan } from '../../rendering/ops/executor/runSimpleBarDrawPlan.ts'
import { SIMPLE_BAR_AUTO_DRAW_PLANS } from '../../rendering/ops/visual/bar/simple/autoDrawPlanRegistry.ts'
import { normalizeOpsList, type OpsSpecInput } from '../../rendering/ops/common/opsSpec.ts'
import { getPlotContext } from '../../rendering/ops/common/chartContext.ts'
import { runSleepOp } from '../../rendering/ops/common/sleepOp.ts'
import { toWorkingDatumValuesFromStore } from '../../rendering/ops/common/workingData.ts'
import { runChartOperationsCommon } from './runChartOperationsCommon.ts'
import {
  renderSimpleBarChart,
  renderSplitSimpleBarChart,
  renderSumSimpleBarChart,
  type SimpleBarSpec,
  getSimpleBarStoredData,
  getSimpleBarSplitDomain,
} from '../../rendering/bar/simpleBarRenderer.ts'
import { clearAnnotations } from '../../rendering/common/d3Helpers.ts'
import type { RunChartOpsOptions } from './runChartOps.ts'

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

function resolveSumValue(container: HTMLElement, spec: SimpleBarSpec, sumSpec?: DrawOp['sum']) {
  if (sumSpec && Number.isFinite(sumSpec.value)) {
    return sumSpec
  }
  const stored = getSimpleBarStoredData(container)
  const valueField = spec.encoding.y.field
  const total = stored
    .map((d) => Number(d[valueField]))
    .filter(Number.isFinite)
    .reduce((acc, v) => acc + v, 0)
  if (!Number.isFinite(total)) {
    return null
  }
  return { value: total, label: sumSpec?.label ?? 'Sum' }
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
    await runSleepOp({ seconds: 1 })
    return true
  }
  if (drawOp.action === DrawAction.Unsplit) {
    await renderSimpleBarChart(container, spec)
    return true
  }
  if (drawOp.action === DrawAction.Sum) {
    const sumSpec = drawOp.sum
    const resolvedSum = resolveSumValue(container, spec, sumSpec)
    if (!resolvedSum) {
      console.warn('draw:sum could not resolve sum value', drawOp)
      return true
    }
    await renderSumSimpleBarChart(container, spec, resolvedSum)
    return true
  }
  return false
}

export async function runSimpleBarOps(
  container: HTMLElement,
  vlSpec: SimpleBarSpec,
  opsSpec: OpsSpecInput,
  options?: RunChartOpsOptions,
) {
  const chartWorking = new Map<string, DatumValue[]>()
  const filterByChartDomain = (chartId: string, currentWorking: DatumValue[]) => {
    const domain = getSimpleBarSplitDomain(container, chartId)
    if (!domain || domain.size === 0) return currentWorking
    const domainSet = new Set(domain)
    return currentWorking.filter((datum) => domainSet.has(String(datum.target)))
  }
  const deriveOperationInput = (operation: OperationSpec, currentWorking: DatumValue[]) => {
    const chartId = operation.chartId
    if (!chartId) return currentWorking
    if (chartWorking.has(chartId)) return chartWorking.get(chartId)!
    const subset = filterByChartDomain(chartId, currentWorking)
    chartWorking.set(chartId, subset)
    return subset
  }
  const handleOperationResult = (operation: OperationSpec, result: DatumValue[], currentWorking: DatumValue[]) => {
    const chartId = operation.chartId
    if (chartId) {
      chartWorking.set(chartId, result)
      return currentWorking
    }
    chartWorking.clear()
    return result
  }

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
        chartWorking.clear()
      }
      return handled
    },
    clearAnnotations: ({ container: host }) => clearAnnotations(getPlotContext(host).svg),
    autoDrawPlans: SIMPLE_BAR_AUTO_DRAW_PLANS,
    getOperationInput: deriveOperationInput,
    handleOperationResult,
    runDrawPlan: async (drawPlan, handler) => {
      await runSimpleBarDrawPlan(container, drawPlan, { handler: handler as BarDrawHandler })
    },
    onOperationCompleted: options?.onOperationCompleted,
    runtimeScope: options?.runtimeScope ?? 'ops',
    resetRuntime: options?.resetRuntime ?? true,
  })
}

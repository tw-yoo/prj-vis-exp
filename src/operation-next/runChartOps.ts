import { ChartType, prepareChartRuntimeSpec, type ChartSpec } from '../domain/chart'
import { normalizeOpsGroups, type OpsSpecInput } from '../domain/operation/opsSpec'
import { renderChart } from '../rendering/renderChart'
import { runGroupedBarOperations } from './runners/groupedBar'
import { runMultipleLineOperations } from './runners/multipleLine'
import { runSimpleBarOperations } from './runners/simpleBar'
import { runSimpleLineOperations } from './runners/simpleLine'
import { runStackedBarOperations } from './runners/stackedBar'
import { assertKnownOperationNextChartType } from './runners/shared'
import type { ChartOperationRunner, RunChartOpsOptions } from './types'

const DEBUG_PREFIX = '[operation-next-debug]'

function debugNow() {
  return typeof performance === 'undefined' ? Date.now() : Number(performance.now().toFixed(1))
}

function debugLog(label: string, payload: unknown) {
  try {
    console.info(DEBUG_PREFIX, label, JSON.stringify(payload))
  } catch {
    console.info(DEBUG_PREFIX, label, payload)
  }
}

function summarizeChartDom(container: HTMLElement) {
  const svg = container.querySelector('svg')
  const seriesValues = Array.from(container.querySelectorAll<SVGElement>('[data-series]'))
    .map((node) => node.getAttribute('data-series') ?? '')
    .filter((series) => series.length > 0)
  return {
    focusState: container.dataset.operationNextFocusState ?? null,
    visibility: container.style.visibility || '(default)',
    svgCount: container.querySelectorAll('svg').length,
    renderEpoch: svg?.getAttribute('data-render-epoch') ?? null,
    pathCount: container.querySelectorAll('path').length,
    dataPathCount: container.querySelectorAll('path[data-series]').length,
    circleCount: container.querySelectorAll('circle').length,
    series: Array.from(new Set(seriesValues)).sort(),
  }
}

function resolveRunner(chartType: ReturnType<typeof assertKnownOperationNextChartType>): ChartOperationRunner {
  switch (chartType) {
    case ChartType.SIMPLE_BAR:
      return runSimpleBarOperations
    case ChartType.STACKED_BAR:
      return runStackedBarOperations
    case ChartType.GROUPED_BAR:
      return runGroupedBarOperations
    case ChartType.SIMPLE_LINE:
      return runSimpleLineOperations
    case ChartType.MULTI_LINE:
      return runMultipleLineOperations
    default:
      throw new Error(`operation-next: missing runner for chart type "${chartType}"`)
  }
}

async function restoreDirtyOperationNextChart(container: HTMLElement, spec: ChartSpec) {
  const focusState = container.dataset.operationNextFocusState
  debugLog('restore-check', {
    t: debugNow(),
    focusState: focusState ?? null,
    dom: summarizeChartDom(container),
  })
  if (!focusState) return false

  const previousVisibility = container.style.visibility
  container.style.visibility = 'hidden'
  debugLog('restore-start', {
    t: debugNow(),
    focusState,
    previousVisibility: previousVisibility || '(default)',
    domBefore: summarizeChartDom(container),
  })
  try {
    await renderChart(container, spec)
  } finally {
    container.style.visibility = previousVisibility
    delete container.dataset.operationNextFocusState
    debugLog('restore-end', {
      t: debugNow(),
      restoredVisibility: container.style.visibility || '(default)',
      domAfter: summarizeChartDom(container),
    })
  }
  return true
}

export async function runChartOps(
  container: HTMLElement,
  spec: ChartSpec,
  opsSpec: OpsSpecInput,
  options?: RunChartOpsOptions,
) {
  debugLog('run-start', {
    t: debugNow(),
    options,
    dom: summarizeChartDom(container),
  })
  const restored = await restoreDirtyOperationNextChart(container, spec)
  const runtime = await prepareChartRuntimeSpec(spec)
  const chartType = assertKnownOperationNextChartType(runtime.chartType)
  const groups = normalizeOpsGroups(opsSpec)
  const runner = resolveRunner(chartType)

  debugLog('run-dispatch', {
    t: debugNow(),
    restored,
    chartType,
    groups: groups.map((group) => ({
      name: group.name,
      ops: group.ops.map((operation) => operation.op ?? '(unknown)'),
    })),
    dom: summarizeChartDom(container),
  })

  return runner({
    container,
    originalSpec: spec,
    runtimeSpec: runtime.spec,
    chartType,
    opsSpec,
    groups,
    options,
  })
}

export type { RunChartOpsOptions }

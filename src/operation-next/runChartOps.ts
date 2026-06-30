import { ChartType, prepareChartRuntimeSpec, type ChartSpec } from '../domain/chart'
import { normalizeOpsGroups, type OpsSpecInput } from '../domain/operation/opsSpec'
import { assertKnownOperationNextChartType } from './runners/shared'
import type { ChartOperationRunner, RunChartOpsOptions } from './types'
import { initializeOperationRuntime } from './executionState'
import { collectReferencedResultIds } from './diffEndpoint'
import { DEFAULT_POLICY } from './tensionPolicy'
import { runSimpleLineOperationsNew } from '../operation-new/runSimpleLine'
import { runSimpleBarOperationsNew } from '../operation-new/runSimpleBar'
import { runStackedBarOperationsNew } from '../operation-new/runStackedBar'
import { runGroupedBarOperationsNew } from '../operation-new/runGroupedBar'
import { runMultipleLineOperationsNew } from '../operation-new/runMultipleLine'

const DEBUG_PREFIX = '[operation-next-debug]'

function isOperationNextDebugEnabled() {
  return Boolean((globalThis as typeof globalThis & { __OPERATION_NEXT_DEBUG__?: boolean }).__OPERATION_NEXT_DEBUG__)
}

function debugNow() {
  return typeof performance === 'undefined' ? Date.now() : Number(performance.now().toFixed(1))
}

function debugLog(label: string, payload: unknown) {
  if (!isOperationNextDebugEnabled()) return
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
      // SIMPLE_BAR routes to the new ChartInstance-backed runner in
      // src/operation-new/. Other chart types stay on existing runners.
      console.info('[operation-new] dispatcher: runChartOps → SIMPLE_BAR → new runner (src/operation-new/)')
      return runSimpleBarOperationsNew
    case ChartType.STACKED_BAR:
      // STACKED_BAR routes to the new ChartInstance-backed runner in
      // src/operation-new/. The wrapper attaches an instance for idempotent
      // ensureRendered, then delegates to the existing runner.
      console.info('[operation-new] dispatcher: runChartOps → STACKED_BAR → new runner (src/operation-new/)')
      return runStackedBarOperationsNew
    case ChartType.GROUPED_BAR:
      // GROUPED_BAR routes to the new ChartInstance-backed runner.
      console.info('[operation-new] dispatcher: runChartOps → GROUPED_BAR → new runner (src/operation-new/)')
      return runGroupedBarOperationsNew
    case ChartType.SIMPLE_LINE:
      // SIMPLE_LINE routes to the new ChartInstance-backed runner in
      // src/operation-new/. Other chart types stay on existing runners.
      console.info('[operation-new] dispatcher: runChartOps → SIMPLE_LINE → new runner (src/operation-new/)')
      return runSimpleLineOperationsNew
    case ChartType.MULTI_LINE:
      // MULTI_LINE routes to the new ChartInstance-backed runner.
      console.info('[operation-new] dispatcher: runChartOps → MULTI_LINE → new runner (src/operation-new/)')
      return runMultipleLineOperationsNew
    default:
      throw new Error(`operation-next: missing runner for chart type "${chartType}"`)
  }
}

function clearOperationNextFocusState(container: HTMLElement) {
  const focusState = container.dataset.operationNextFocusState
  debugLog('restore-check', {
    t: debugNow(),
    focusState: focusState ?? null,
    dom: summarizeChartDom(container),
  })
  if (!focusState) return false
  delete container.dataset.operationNextFocusState
  container.querySelector('svg')?.removeAttribute('data-operation-next-focus-state')
  debugLog('restore-skip-rerender', {
    t: debugNow(),
    focusState,
    domAfter: summarizeChartDom(container),
  })
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
  const restored = clearOperationNextFocusState(container)
  initializeOperationRuntime(options)
  const runtime = await prepareChartRuntimeSpec(spec)
  const chartType = assertKnownOperationNextChartType(runtime.chartType)
  const groups = normalizeOpsGroups(opsSpec)
  const runner = resolveRunner(chartType)
  const referencedResultIds = Array.from(new Set([
    ...(options?.referencedResultIds ?? []),
    ...collectReferencedResultIds(groups),
  ]))
  const runOptions = {
    ...options,
    referencedResultIds,
    tensionPolicy: options?.tensionPolicy ?? DEFAULT_POLICY,
  }

  debugLog('run-dispatch', {
    t: debugNow(),
    restored,
    chartType,
    groups: groups.map((group) => ({
      name: group.name,
      ops: group.ops.map((operation) => operation.op ?? '(unknown)'),
    })),
    policy: runOptions.tensionPolicy,
    dom: summarizeChartDom(container),
  })

  const outcome = await runner({
    container,
    originalSpec: spec,
    runtimeSpec: runtime.spec,
    chartType,
    opsSpec,
    groups,
    options: runOptions,
  })

  return outcome
}

export type { RunChartOpsOptions }
export type { OperationNextRunOutcome, OperationRuntimeSnapshot, SerializableChainState } from './executionState'

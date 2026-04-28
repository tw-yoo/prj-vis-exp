import { ChartType, prepareChartRuntimeSpec, type ChartSpec } from '../domain/chart'
import { normalizeOpsGroups, type OpsSpecInput } from '../domain/operation/opsSpec'
import { renderChart } from '../rendering/renderChart'
import {
  captureMarkPresentationSnapshot,
  playPresentationTransition,
} from '../runtime/presentationTransitionController'
import { runGroupedBarOperations } from './runners/groupedBar'
import { runMultipleLineOperations } from './runners/multipleLine'
import { runSimpleBarOperations } from './runners/simpleBar'
import { runSimpleLineOperations } from './runners/simpleLine'
import { runStackedBarOperations } from './runners/stackedBar'
import { assertKnownOperationNextChartType } from './runners/shared'
import type { ChartOperationRunner, RunChartOpsOptions } from './types'
import { initializeOperationRuntime } from './executionState'
import { collectReferencedResultIds } from './diffEndpoint'
import { DEFAULT_POLICY } from './tensionPolicy'

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

  // Capture the current emphasis state (dimmed marks, annotations) before
  // hiding the container. The overlay will fade out over the fresh render,
  // eliminating the visual flash that occurred when visibility was restored.
  const snapshot = captureMarkPresentationSnapshot(container)

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
    // Fade the captured state out over the freshly rendered chart so
    // the transition into the reset state is smooth rather than abrupt.
    playPresentationTransition(container, snapshot)
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

  return runner({
    container,
    originalSpec: spec,
    runtimeSpec: runtime.spec,
    chartType,
    opsSpec,
    groups,
    options: runOptions,
  })
}

export type { RunChartOpsOptions }
export type { OperationNextRunOutcome, OperationRuntimeSnapshot, SerializableChainState } from './executionState'

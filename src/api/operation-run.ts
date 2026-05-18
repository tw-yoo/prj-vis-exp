import { runChartOps as runChartOpsNext } from '../operation-next/runChartOps'
import type { OpsSpecInput, OperationSpec } from './types'
import type { ChartSpec } from '../domain/chart'
import type { OperationCompletedEvent } from '../application/usecases/runChartOperationsUseCase'
import type { OperationNextRunOutcome, RunChartOpsOptions } from '../operation-next/runChartOps'
import { normalizeOpsGroups } from '../domain/operation/opsSpec'
import { isOperationNextRunOutcome } from '../operation-next/executionState'
import { buildExplanationTextForOperations } from './operation-summary-text'
import { renderChartExplanation } from './chart-explanation'

function renderFinalExplanationForOps(container: HTMLElement, opsSpec: OpsSpecInput, result: unknown) {
  if (!isOperationNextRunOutcome(result)) return
  if (container.querySelector('svg .chart-explanation-text')) return
  const operations = normalizeOpsGroups(opsSpec).flatMap((group) => group.ops)
  const summary = buildExplanationTextForOperations({
    operations,
    resultsByNodeId: new Map(Object.entries(result.runtimeSnapshot)),
  })
  if (summary?.finalText) {
    renderChartExplanation(container, { text: summary.finalText })
  }
}

async function runChartOpsAndRenderExplanation(
  container: HTMLElement,
  spec: ChartSpec,
  opsSpec: OpsSpecInput,
  options?: RunChartOpsOptions,
) {
  const result = await runChartOpsNext(container, spec, opsSpec, options)
  renderFinalExplanationForOps(container, opsSpec, result)
  return result
}

export async function runChartOps(
    command: {
      container: HTMLElement
      spec: ChartSpec
      opsSpec: OpsSpecInput
      options?: RunChartOpsOptions
}): Promise<unknown>
export async function runChartOps(
  container: HTMLElement,
  spec: ChartSpec,
  opsSpec: OpsSpecInput,
  options?: RunChartOpsOptions,
): Promise<unknown>
export async function runChartOps(
  arg1: HTMLElement | { container: HTMLElement; spec: ChartSpec; opsSpec: OpsSpecInput; options?: RunChartOpsOptions },
  arg2?: ChartSpec,
  arg3?: OpsSpecInput,
  arg4?: RunChartOpsOptions,
): Promise<unknown> {
  if (arg1 instanceof HTMLElement) {
    return runChartOpsAndRenderExplanation(arg1, arg2 as ChartSpec, arg3 as OpsSpecInput, arg4)
  }
  return runChartOpsAndRenderExplanation(arg1.container, arg1.spec, arg1.opsSpec, arg1.options)
}

export type RunChartOpsCommand = {
  container: HTMLElement
  spec: ChartSpec
  opsSpec: OpsSpecInput
  options?: RunChartOpsOptions
}

export type RunChartOpsResult = {
  finalWorkingData: OperationSpec[] | unknown
}

export type { RunChartOpsOptions, OperationCompletedEvent, OperationNextRunOutcome }

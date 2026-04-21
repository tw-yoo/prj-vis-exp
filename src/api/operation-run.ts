import { runChartOps as runChartOpsNext } from '../operation-next/runChartOps'
import type { OpsSpecInput, OperationSpec } from './types'
import type { ChartSpec } from '../domain/chart'
import type { OperationCompletedEvent } from '../application/usecases/runChartOperationsUseCase'
import type { RunChartOpsOptions } from '../operation-next/runChartOps'

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
    return runChartOpsNext(arg1, arg2 as ChartSpec, arg3 as OpsSpecInput, arg4)
  }
  return runChartOpsNext(arg1.container, arg1.spec, arg1.opsSpec, arg1.options)
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

export type { RunChartOpsOptions, OperationCompletedEvent }

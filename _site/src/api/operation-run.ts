import { runChartOps as runChartOpsLegacy } from '../operation/run/runChartOps'
import type { OpsSpecInput, OperationSpec } from './types'
import type { VegaLiteSpec } from '../domain/chart'
import type { OperationCompletedEvent } from '../application/usecases/runChartOperationsUseCase'
import type { RunChartOpsOptions } from '../operation/run/runChartOps'

export async function runChartOps(command: {
  container: HTMLElement
  spec: VegaLiteSpec
  opsSpec: OpsSpecInput
  options?: RunChartOpsOptions
}): Promise<unknown>
export async function runChartOps(
  container: HTMLElement,
  spec: VegaLiteSpec,
  opsSpec: OpsSpecInput,
  options?: RunChartOpsOptions,
): Promise<unknown>
export async function runChartOps(
  arg1: HTMLElement | { container: HTMLElement; spec: VegaLiteSpec; opsSpec: OpsSpecInput; options?: RunChartOpsOptions },
  arg2?: VegaLiteSpec,
  arg3?: OpsSpecInput,
  arg4?: RunChartOpsOptions,
): Promise<unknown> {
  if (arg1 instanceof HTMLElement) {
    return runChartOpsLegacy(arg1, arg2 as VegaLiteSpec, arg3 as OpsSpecInput, arg4)
  }
  return runChartOpsLegacy(arg1.container, arg1.spec, arg1.opsSpec, arg1.options)
}

export type RunChartOpsCommand = {
  container: HTMLElement
  spec: VegaLiteSpec
  opsSpec: OpsSpecInput
  options?: RunChartOpsOptions
}

export type RunChartOpsResult = {
  finalWorkingData: OperationSpec[] | unknown
}

export type { RunChartOpsOptions, OperationCompletedEvent }

import { runChartOps as runChartOpsLegacy } from '../operation/run/runChartOps'
import type { OpsSpecInput, OperationSpec } from './types'
import type { VegaLiteSpec } from '../domain/chart'

export async function runChartOps(command: {
  container: HTMLElement
  spec: VegaLiteSpec
  opsSpec: OpsSpecInput
}): Promise<unknown>
export async function runChartOps(container: HTMLElement, spec: VegaLiteSpec, opsSpec: OpsSpecInput): Promise<unknown>
export async function runChartOps(
  arg1: HTMLElement | { container: HTMLElement; spec: VegaLiteSpec; opsSpec: OpsSpecInput },
  arg2?: VegaLiteSpec,
  arg3?: OpsSpecInput,
): Promise<unknown> {
  if (arg1 instanceof HTMLElement) {
    return runChartOpsLegacy(arg1, arg2 as VegaLiteSpec, arg3 as OpsSpecInput)
  }
  return runChartOpsLegacy(arg1.container, arg1.spec, arg1.opsSpec)
}

export type RunChartOpsCommand = {
  container: HTMLElement
  spec: VegaLiteSpec
  opsSpec: OpsSpecInput
}

export type RunChartOpsResult = {
  finalWorkingData: OperationSpec[] | unknown
}

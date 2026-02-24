import { ChartType, getChartType, type VegaLiteSpec, type ChartTypeValue } from '../../domain/chart'
import { renderVegaLiteChart } from '../../rendering/chartRenderer.ts'
import { assertDrawCapabilities } from '../../rendering/draw/capabilityGuard.ts'
import { normalizeSpec } from '../../domain/chart/normalizeSpec'
import { normalizeOpsGroups, type OpsSpecInput } from '../../domain/operation/opsSpec'
import { runSimpleBarOps } from './simpleBarOps.ts'
import { runStackedBarOps } from './stackedBarOps.ts'
import { runGroupedBarOps } from './groupedBarOps.ts'
import { runSimpleLineOps } from './simpleLineOps.ts'
import { runMultipleLineOps } from './multipleLineOps.ts'
import type { SimpleBarSpec } from '../../rendering/bar/simpleBarRenderer.ts'
import type { StackedSpec } from '../../rendering/bar/stackedBarRenderer.ts'
import type { GroupedSpec } from '../../rendering/bar/groupedBarRenderer.ts'
import type { LineSpec } from '../../rendering/line/simpleLineRenderer.ts'
import type { MultiLineSpec } from '../../rendering/line/multipleLineRenderer.ts'
import type { OperationCompletedEvent } from '../../application/usecases/runChartOperationsUseCase'

export type RunChartOpsOptions = {
  onOperationCompleted?: (event: OperationCompletedEvent) => Promise<void> | void
  runtimeScope?: string
  resetRuntime?: boolean
}

async function runChartOpsForSingleGroup(
  container: HTMLElement,
  chartType: ChartTypeValue | null,
  normalized: VegaLiteSpec,
  opsSpec: OpsSpecInput,
  options?: RunChartOpsOptions,
) {
  switch (chartType) {
    case ChartType.SIMPLE_BAR:
      return runSimpleBarOps(container, normalized as SimpleBarSpec, opsSpec, options)
    case ChartType.STACKED_BAR:
      return runStackedBarOps(container, normalized as StackedSpec, opsSpec, options)
    case ChartType.GROUPED_BAR:
      return runGroupedBarOps(container, normalized as GroupedSpec, opsSpec, options)
    case ChartType.SIMPLE_LINE:
      return runSimpleLineOps(container, normalized as LineSpec, opsSpec, options)
    case ChartType.MULTI_LINE:
      return runMultipleLineOps(container, normalized as MultiLineSpec, opsSpec, options)
    default:
      console.warn('runChartOps: unknown chart type, running plain render then no-op ops')
      await renderVegaLiteChart(container, normalized)
      return normalized
  }
}

export async function runChartOps(
  container: HTMLElement,
  spec: VegaLiteSpec,
  opsSpec: OpsSpecInput,
  options?: RunChartOpsOptions,
) {
  const chartType = getChartType(spec)
  const normalized = normalizeSpec(spec)
  assertDrawCapabilities(chartType, opsSpec)
  const groups = normalizeOpsGroups(opsSpec)

  if (groups.length <= 1) {
    return runChartOpsForSingleGroup(container, chartType, normalized, opsSpec, options)
  }

  let lastResult: unknown = normalized
  let operationOffset = 0
  for (let index = 0; index < groups.length; index += 1) {
    const group = groups[index]
    const groupName = group.name || `ops${index + 1}`
    lastResult = await runChartOpsForSingleGroup(
      container,
      chartType,
      normalized,
      group.ops,
      {
        ...options,
        runtimeScope: groupName,
        resetRuntime: index === 0 ? options?.resetRuntime ?? true : false,
        onOperationCompleted: options?.onOperationCompleted
          ? async (event) => {
              await options.onOperationCompleted?.({
                ...event,
                operationIndex: operationOffset + event.operationIndex,
              })
            }
          : undefined,
      },
    )
    operationOffset += group.ops.length
  }
  return lastResult
}

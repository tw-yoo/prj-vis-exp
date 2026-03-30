import type { ChartTypeValue, ChartSpec } from '../../domain/chart'

export type RuntimeChartState = {
  chartType: ChartTypeValue
  spec: ChartSpec
  renderer: 'd3'
}

const runtimeStateStore = new WeakMap<HTMLElement, RuntimeChartState>()

export function storeRuntimeChartState(container: HTMLElement, state: RuntimeChartState) {
  runtimeStateStore.set(container, state)
  ;(container as HTMLElement & { __chartRuntimeState?: RuntimeChartState }).__chartRuntimeState = state
}

export function getRuntimeChartState(container: HTMLElement): RuntimeChartState | null {
  return runtimeStateStore.get(container) ?? null
}

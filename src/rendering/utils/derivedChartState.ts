import type { ChartTypeValue } from '../../domain/chart'
import type { ChartSpec } from '../../domain/chart'

type DerivedChartState = {
  chartType: ChartTypeValue
  spec: ChartSpec
}

const derivedChartStateStore = new WeakMap<HTMLElement, DerivedChartState>()

export function storeDerivedChartState(
  container: HTMLElement,
  chartType: ChartTypeValue,
  spec: ChartSpec,
): void {
  derivedChartStateStore.set(container, { chartType, spec })
}

export function consumeDerivedChartState(
  container: HTMLElement,
): { chartType: ChartTypeValue; spec: ChartSpec } | null {
  const state = derivedChartStateStore.get(container) ?? null
  if (!state) return null
  derivedChartStateStore.delete(container)
  return state
}

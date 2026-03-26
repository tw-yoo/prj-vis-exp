import type { ChartTypeValue } from '../../domain/chart'
import type { VegaLiteSpec } from '../../domain/chart'

const DERIVED_CHART_TYPE_KEY = 'derivedChartType'
const DERIVED_SPEC_KEY = 'derivedSpec'

export function storeDerivedChartState(
  container: HTMLElement,
  chartType: ChartTypeValue,
  spec: VegaLiteSpec,
): void {
  container.dataset[DERIVED_CHART_TYPE_KEY] = chartType
  container.dataset[DERIVED_SPEC_KEY] = JSON.stringify(spec)
}

export function consumeDerivedChartState(
  container: HTMLElement,
): { chartType: ChartTypeValue; spec: VegaLiteSpec } | null {
  const chartType = container.dataset[DERIVED_CHART_TYPE_KEY] as ChartTypeValue | undefined
  const specJson = container.dataset[DERIVED_SPEC_KEY]
  if (!chartType || !specJson) return null
  delete container.dataset[DERIVED_CHART_TYPE_KEY]
  delete container.dataset[DERIVED_SPEC_KEY]
  try {
    const spec = JSON.parse(specJson) as VegaLiteSpec
    return { chartType, spec }
  } catch {
    return null
  }
}

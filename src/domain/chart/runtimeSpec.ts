import { UnsupportedChartSpecError } from './errors'
import { ChartType, type ChartTypeValue, type VegaLiteSpec } from './types'
import { getChartType } from './chartType'
import { normalizeSpec } from './normalizeSpec'
import { INTERNAL_LAYOUT_HINTS_KEY, type ChartLayoutHints } from './layoutHints'
import { loadRowsFromVegaLiteData } from '../../rendering/vegaLite/dataLoader'
import { ensureStableOrdinalColorMapping } from '../../rendering/vegaLite/colorScaleStability'

function cloneSpec<T>(value: T): T {
  try {
    return structuredClone(value)
  } catch {
    return JSON.parse(JSON.stringify(value)) as T
  }
}

function isSupportedChartType(chartType: ChartTypeValue | null): chartType is ChartTypeValue {
  return chartType === ChartType.SIMPLE_BAR ||
    chartType === ChartType.STACKED_BAR ||
    chartType === ChartType.GROUPED_BAR ||
    chartType === ChartType.SIMPLE_LINE ||
    chartType === ChartType.MULTI_LINE
}

export function assertSupportedChartSpec(spec: VegaLiteSpec): ChartTypeValue {
  const chartType = getChartType(spec)
  if (isSupportedChartType(chartType)) return chartType
  throw new UnsupportedChartSpecError(spec, 'only the five D3 chart types are supported')
}

export async function prepareChartRuntimeSpec(
  spec: VegaLiteSpec,
): Promise<{ chartType: ChartTypeValue; spec: VegaLiteSpec }> {
  const chartType = assertSupportedChartSpec(spec)
  const layoutHints: ChartLayoutHints = {
    explicitWidth: Object.prototype.hasOwnProperty.call(spec as Record<string, unknown>, 'width'),
    explicitHeight: Object.prototype.hasOwnProperty.call(spec as Record<string, unknown>, 'height'),
    explicitPadding: Object.prototype.hasOwnProperty.call(spec as Record<string, unknown>, 'padding'),
    explicitAutosize: Object.prototype.hasOwnProperty.call(spec as Record<string, unknown>, 'autosize'),
  }
  const normalized = normalizeSpec(cloneSpec(spec))
  const stabilized = await ensureStableOrdinalColorMapping(normalized as Record<string, unknown>, {
    loadRows: async (data) => loadRowsFromVegaLiteData(data as VegaLiteSpec['data']),
    legendBehavior: 'presentOnly',
  })
  ;(stabilized as Record<string, unknown>)[INTERNAL_LAYOUT_HINTS_KEY] = layoutHints
  return {
    chartType,
    spec: stabilized as VegaLiteSpec,
  }
}

import { ChartType, prepareChartRuntimeSpec, type ChartSpec } from '../domain/chart'
import { renderSimpleBarChart, type SimpleBarSpec } from './bar/simpleBarRenderer'
import { renderStackedBarChart, type StackedSpec } from './bar/stackedBarRenderer'
import { renderGroupedBarChart, type GroupedSpec } from './bar/groupedBarRenderer'
import { type LineSpec } from './line/simpleLineRenderer'
import { renderMultipleLineChart, type MultiLineSpec } from './line/multipleLineRenderer'
import { attachChartHoverTooltip } from './common/chartHoverTooltip'
import { renderSimpleLineChartNew } from '../rendering-new/renderSimpleLine'

export async function renderChart(container: HTMLElement, spec: ChartSpec) {
  const prepared = await prepareChartRuntimeSpec(spec)
  const chartType = prepared.chartType
  const normalized = prepared.spec

  let rendered: unknown
  switch (chartType) {
    case ChartType.SIMPLE_BAR:
      rendered = await renderSimpleBarChart(container, normalized as SimpleBarSpec)
      break
    case ChartType.STACKED_BAR:
      rendered = await renderStackedBarChart(container, normalized as StackedSpec)
      break
    case ChartType.GROUPED_BAR:
      rendered = await renderGroupedBarChart(container, normalized as GroupedSpec)
      break
    case ChartType.SIMPLE_LINE:
      // SIMPLE_LINE routes to the new stateful ChartInstance pipeline in
      // src/rendering-new/. Other chart types stay on the existing renderers.
      console.info('[operation-new] dispatcher: renderChart → SIMPLE_LINE → new pipeline (src/rendering-new/)')
      rendered = await renderSimpleLineChartNew(container, normalized as LineSpec)
      break
    case ChartType.MULTI_LINE:
      rendered = await renderMultipleLineChart(container, normalized as MultiLineSpec)
      break
    default:
      throw new Error(`Unsupported chart type: ${String(chartType)}`)
  }

  attachChartHoverTooltip(container)
  return rendered
}

import { ChartType, prepareChartRuntimeSpec, type ChartSpec } from '../domain/chart'
import { type SimpleBarSpec } from './bar/simpleBarRenderer'
import { type StackedSpec } from './bar/stackedBarRenderer'
import { type GroupedSpec } from './bar/groupedBarRenderer'
import { type LineSpec } from './line/simpleLineRenderer'
import { type MultiLineSpec } from './line/multipleLineRenderer'
import { attachChartHoverTooltip } from './common/chartHoverTooltip'
import { renderSimpleLineChartNew } from '../rendering-new/renderSimpleLine'
import { renderSimpleBarChartNew } from '../rendering-new/renderSimpleBar'
import { renderStackedBarChartNew } from '../rendering-new/renderStackedBar'
import { renderGroupedBarChartNew } from '../rendering-new/renderGroupedBar'
import { renderMultipleLineChartNew } from '../rendering-new/renderMultipleLine'

export async function renderChart(container: HTMLElement, spec: ChartSpec) {
  const prepared = await prepareChartRuntimeSpec(spec)
  const chartType = prepared.chartType
  const normalized = prepared.spec

  let rendered: unknown
  switch (chartType) {
    case ChartType.SIMPLE_BAR:
      // SIMPLE_BAR routes to the new stateful ChartInstance pipeline in
      // src/rendering-new/. Other chart types stay on existing renderers.
      console.info('[operation-new] dispatcher: renderChart → SIMPLE_BAR → new pipeline (src/rendering-new/)')
      rendered = await renderSimpleBarChartNew(container, normalized as SimpleBarSpec)
      break
    case ChartType.STACKED_BAR:
      // STACKED_BAR routes to the new ChartInstance-backed pipeline in
      // src/rendering-new/. The instance provides idempotent ensureRendered
      // so substeps don't trigger a full SVG rebuild.
      console.info('[operation-new] dispatcher: renderChart → STACKED_BAR → new pipeline (src/rendering-new/)')
      rendered = await renderStackedBarChartNew(container, normalized as StackedSpec)
      break
    case ChartType.GROUPED_BAR:
      // GROUPED_BAR routes to the new ChartInstance-backed pipeline.
      console.info('[operation-new] dispatcher: renderChart → GROUPED_BAR → new pipeline (src/rendering-new/)')
      rendered = await renderGroupedBarChartNew(container, normalized as GroupedSpec)
      break
    case ChartType.SIMPLE_LINE:
      // SIMPLE_LINE routes to the new stateful ChartInstance pipeline in
      // src/rendering-new/. Other chart types stay on the existing renderers.
      console.info('[operation-new] dispatcher: renderChart → SIMPLE_LINE → new pipeline (src/rendering-new/)')
      rendered = await renderSimpleLineChartNew(container, normalized as LineSpec)
      break
    case ChartType.MULTI_LINE:
      // MULTI_LINE routes to the new ChartInstance-backed pipeline.
      console.info('[operation-new] dispatcher: renderChart → MULTI_LINE → new pipeline (src/rendering-new/)')
      rendered = await renderMultipleLineChartNew(container, normalized as MultiLineSpec)
      break
    default:
      throw new Error(`Unsupported chart type: ${String(chartType)}`)
  }

  attachChartHoverTooltip(container)
  return rendered
}

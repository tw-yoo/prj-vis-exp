import {ChartType, type VegaLiteSpec} from '../utils/chartRenderer'
import { getChartType, renderVegaLiteChart } from '../utils/chartRenderer'
import { renderSimpleBarChart, runSimpleBarOps } from './bar/simpleBarRenderer'
import { renderStackedBarChart, runStackedBarOps } from './bar/stackedBarRenderer'
import { renderGroupedBarChart, runGroupedBarOps } from './bar/groupedBarRenderer'
import { renderSimpleLineChart, runSimpleLineOps } from './line/simpleLineRenderer'
import { renderMultipleLineChart, runMultipleLineOps } from './line/multipleLineRenderer'

function normalizeSpec(spec: VegaLiteSpec): VegaLiteSpec {
  const clone: VegaLiteSpec = { ...spec }
  clone.width = clone.width ?? 600
  clone.height = clone.height ?? 300
  clone.padding = clone.padding ?? { left: 60, right: 20, top: 40, bottom: 70 }
  clone.config = {
    ...(clone.config || {}),
    axis: {
      labelFontSize: 11,
      titleFontSize: 13,
      titlePadding: 10,
      labelPadding: 5,
      labelLimit: 0,
      ...(clone.config as any)?.axis,
    },
    legend: {
      ...(clone.config as any)?.legend,
      labelFontSize: 11,
      titleFontSize: 12,
    },
    view: { ...(clone.config as any)?.view, stroke: 'transparent' },
    range: {
      category: [
        '#60a5fa',
        '#fb7185',
        '#f59e0b',
        '#10b981',
        '#c084fc',
        '#f472b6',
        '#22d3ee',
        '#a3e635',
        '#f97316',
      ],
      ...(clone.config as any)?.range,
    },
  }
  return clone
}

export async function renderChart(container: HTMLElement, spec: VegaLiteSpec) {
  const chartType = getChartType(spec)
  const normalized = normalizeSpec(spec)
  switch (chartType) {
    case 'Simple bar chart':
      return renderSimpleBarChart(container, normalized as any)
    case 'Stacked bar chart':
      return renderStackedBarChart(container, normalized as any)
    case 'Grouped bar chart':
    case 'Multiple bar chart':
      return renderGroupedBarChart(container, normalized as any)
    case 'Simple line chart':
      return renderSimpleLineChart(container, normalized as any)
    case 'Multi line chart':
      return renderMultipleLineChart(container, normalized as any)
    default:
      console.warn('renderChart: unknown chart type, falling back to plain Vega-Lite')
      return renderVegaLiteChart(container, normalized)
  }
}

export async function runChartOps(container: HTMLElement, spec: VegaLiteSpec, opsSpec: any) {
  const chartType = getChartType(spec)
  const normalized = normalizeSpec(spec)
  switch (chartType) {
    case ChartType.SIMPLE_BAR:
      return runSimpleBarOps(container, normalized as any, opsSpec)
    case ChartType.STACKED_BAR:
      return runStackedBarOps(container, normalized as any, opsSpec)
    case ChartType.MULTIPLE_BAR:
    case ChartType.GROUPED_BAR:
      return runGroupedBarOps(container, normalized as any, opsSpec)
    case ChartType.SIMPLE_LINE:
      return runSimpleLineOps(container, normalized as any, opsSpec)
    case ChartType.MULTI_LINE:
      return runMultipleLineOps(container, normalized as any, opsSpec)
    default:
      console.warn('runChartOps: unknown chart type, running plain render then no-op ops')
      await renderVegaLiteChart(container, normalized)
      return normalized
  }
}

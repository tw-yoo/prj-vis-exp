import {getChartType, renderVegaLiteChart, type VegaLiteSpec} from '../utils/chartRenderer'
import {renderSimpleBarChart} from './bar/simpleBarRenderer'
import {renderStackedBarChart} from './bar/stackedBarRenderer'
import {renderGroupedBarChart} from './bar/groupedBarRenderer'
import {renderSimpleLineChart} from './line/simpleLineRenderer'
import {renderMultipleLineChart} from './line/multipleLineRenderer'

export function normalizeSpec(spec: VegaLiteSpec): VegaLiteSpec {
  const clone: VegaLiteSpec = { ...spec }
  clone.width = clone.width ?? 600
  clone.height = clone.height ?? 300
  clone.padding = clone.padding ?? { left: 60, right: 20, top: 40, bottom: 70 }

  // If the spec uses column/row facets, keep per-facet width small and avoid fit autosize warning.
  const hasFacet =
    !!(clone.encoding as any)?.column ||
    !!(clone.facet as any)?.column ||
    !!(clone.facet as any)?.row ||
    !!(clone.repeat as any)?.column
  if (hasFacet) {
    clone.width = clone.width && clone.width < 200 ? clone.width : 140
    clone.autosize = { type: 'none', contains: 'padding' }
  }
  clone.config = {
    ...(clone.config || {}),
    axis: {
      labelFontSize: 11,
      titleFontSize: 13,
      titlePadding: 10,
      labelPadding: 5,
      labelLimit: 0,
      domainColor: '#000000',
      tickColor: '#000000',
      labelColor: '#000000',
      titleColor: '#000000',
      ...(clone.config as any)?.axis,
    },
    axisX: {
      domainColor: '#000000',
      tickColor: '#000000',
      labelColor: '#000000',
      titleColor: '#000000',
      ...((clone.config as any)?.axisX || {}),
    },
    axisY: {
      domainColor: '#000000',
      tickColor: '#000000',
      labelColor: '#000000',
      titleColor: '#000000',
      ...((clone.config as any)?.axisY || {}),
    },
    legend: {
      labelColor: '#000000',
      titleColor: '#000000',
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
  // Limit width to host container to avoid overly wide faceted/grouped charts
  const hostWidthRaw = Math.max(0, container.getBoundingClientRect?.().width || container.clientWidth || 0)
  const hostWidth = hostWidthRaw > 0 ? Math.min(hostWidthRaw, 800) : 800
  const hasFacet =
    !!(normalized.encoding as any)?.column ||
    !!(normalized.facet as any)?.column ||
    !!(normalized.facet as any)?.row ||
    !!(normalized.repeat as any)?.column

  if (hostWidth > 0) {
    if (hasFacet) {
      // width is per facet cell; keep it small and within host
      const maxPerCell = Math.min(100, hostWidth - 20)
      normalized.width = Math.max(60, maxPerCell)
      // avoid Vega warning: autosize fit not supported for faceted charts
      normalized.autosize = { type: 'none', contains: 'padding' }
    } else {
      normalized.width = Math.min(normalized.width ?? hostWidth, hostWidth - 10)
    }
  }

  switch (chartType) {
    case 'Simple bar chart':
      return renderSimpleBarChart(container, normalized as any)
    case 'Stacked bar chart':
      return renderStackedBarChart(container, normalized as any)
    case 'Grouped bar chart':
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

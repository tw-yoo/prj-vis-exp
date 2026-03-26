import { ChartType, getChartType, type VegaLiteSpec } from '../domain/chart'
import { normalizeSpec as normalizeSpecDomain } from '../domain/chart/normalizeSpec'
import { renderVegaLiteChart } from './chartRenderer'
import { renderSimpleBarChart, type SimpleBarSpec } from './bar/simpleBarRenderer'
import { renderStackedBarChart, type StackedSpec } from './bar/stackedBarRenderer'
import { renderGroupedBarChart, type GroupedSpec } from './bar/groupedBarRenderer'
import { renderSimpleLineChart, type LineSpec } from './line/simpleLineRenderer'
import { renderMultipleLineChart, type MultiLineSpec } from './line/multipleLineRenderer'

type NormalizableSpec = VegaLiteSpec & {
  encoding?: Record<string, unknown>
  facet?: Record<string, unknown>
  repeat?: Record<string, unknown>
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function hasFacet(spec: NormalizableSpec) {
  const encoding = asRecord(spec.encoding)
  const facet = asRecord(spec.facet)
  const repeat = asRecord(spec.repeat)
  return !!encoding?.column || !!facet?.column || !!facet?.row || !!repeat?.column
}

export function normalizeSpec(spec: VegaLiteSpec): VegaLiteSpec {
  return normalizeSpecDomain(spec)
}

export async function renderChart(container: HTMLElement, spec: VegaLiteSpec) {
  const chartType = getChartType(spec)
  const normalized = normalizeSpec(spec)
  const hostWidthRaw = Math.max(0, container.getBoundingClientRect?.().width || container.clientWidth || 0)
  const hostWidth = hostWidthRaw > 0 ? Math.min(hostWidthRaw, 800) : 800
  const hasFacetChart = hasFacet(normalized as NormalizableSpec)

  if (hostWidth > 0) {
    if (hasFacetChart) {
      const maxPerCell = Math.min(100, hostWidth - 20)
      normalized.width = Math.max(60, maxPerCell)
      normalized.autosize = { type: 'none', contains: 'padding' }
    } else {
      normalized.width = Math.min(normalized.width ?? hostWidth, hostWidth - 10)
    }
  }

  switch (chartType) {
    case ChartType.SIMPLE_BAR:
      return renderSimpleBarChart(container, normalized as SimpleBarSpec)
    case ChartType.STACKED_BAR:
      return renderStackedBarChart(container, normalized as StackedSpec)
    case ChartType.GROUPED_BAR:
      return renderGroupedBarChart(container, normalized as GroupedSpec)
    case ChartType.SIMPLE_LINE:
      return renderSimpleLineChart(container, normalized as LineSpec)
    case ChartType.MULTI_LINE:
      return renderMultipleLineChart(container, normalized as MultiLineSpec)
    default:
      console.warn('renderChart: unknown chart type, falling back to plain Vega-Lite')
      return renderVegaLiteChart(container, normalized)
  }
}

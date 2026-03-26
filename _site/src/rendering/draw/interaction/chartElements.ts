import { DataAttributes, SvgClassNames, SvgElements } from '../../interfaces'

const MARK_SELECTOR = [
  `${SvgElements.Rect}[${DataAttributes.Target}][${DataAttributes.Value}]`,
  `${SvgElements.Path}[${DataAttributes.Target}][${DataAttributes.Value}]`,
  `${SvgElements.Circle}[${DataAttributes.Target}][${DataAttributes.Value}]`,
].join(', ')

export type ChartElementDatum = {
  id: string
  target: string
  value: number
  series?: string
  chartId?: string
}

export type SeriesAggregate = {
  series: string
  count: number
  sum: number
  average: number
}

export type TargetSeriesValue = {
  id: string
  target: string
  series: string
  value: number
  chartId?: string
}

type CollectOptions = {
  chartId?: string
  target?: string
}

function isVisible(node: Element) {
  const style = window.getComputedStyle(node)
  if (style.display === 'none' || style.visibility === 'hidden') return false
  const opacity = Number(style.opacity)
  if (Number.isFinite(opacity) && opacity <= 0) return false
  return true
}

function parseDatum(node: Element): ChartElementDatum | null {
  if (node.classList.contains(SvgClassNames.Annotation)) return null
  const id = (node.getAttribute(DataAttributes.Id) ?? '').trim()
  const target = (node.getAttribute(DataAttributes.Target) ?? '').trim()
  const rawValue = node.getAttribute(DataAttributes.Value)
  const value = rawValue == null ? NaN : Number(rawValue)
  if (!id || !target || !Number.isFinite(value)) return null
  const seriesRaw = node.getAttribute(DataAttributes.Series)
  const series = seriesRaw && seriesRaw.trim().length > 0 ? seriesRaw.trim() : undefined
  const chartIdRaw = node.getAttribute(DataAttributes.ChartId)
  const chartId = chartIdRaw && chartIdRaw.trim().length > 0 ? chartIdRaw.trim() : undefined
  return { id, target, value, series, chartId }
}

export function collectChartElementData(container: HTMLElement, options: CollectOptions = {}): ChartElementDatum[] {
  const { chartId, target } = options
  return Array.from(container.querySelectorAll<SVGElement>(MARK_SELECTOR))
    .filter((node) => isVisible(node))
    .map((node) => parseDatum(node))
    .filter((datum): datum is ChartElementDatum => !!datum)
    .filter((datum) => (chartId ? datum.chartId === chartId : true))
    .filter((datum) => (target ? datum.target === target : true))
}

export function collectSeriesAggregates(container: HTMLElement, options: CollectOptions = {}): SeriesAggregate[] {
  const map = new Map<string, { sum: number; count: number }>()
  collectChartElementData(container, options).forEach((datum) => {
    if (!datum.series) return
    const prev = map.get(datum.series) ?? { sum: 0, count: 0 }
    prev.sum += datum.value
    prev.count += 1
    map.set(datum.series, prev)
  })
  return Array.from(map.entries()).map(([series, stat]) => ({
    series,
    count: stat.count,
    sum: stat.sum,
    average: stat.count > 0 ? stat.sum / stat.count : 0,
  }))
}

export function collectTargetSeriesValues(
  container: HTMLElement,
  target: string,
  chartId?: string,
): TargetSeriesValue[] {
  return collectChartElementData(container, { chartId, target })
    .filter((datum) => !!datum.series)
    .map((datum) => ({
      id: datum.id,
      target: datum.target,
      series: datum.series as string,
      value: datum.value,
      chartId: datum.chartId,
    }))
}


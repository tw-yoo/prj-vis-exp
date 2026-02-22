import { getChartContext, type ChartContext } from '../../common/d3Helpers'

export function getPlotContext(container: HTMLElement): ChartContext {
  return getChartContext(container, { preferPlotArea: true })
}


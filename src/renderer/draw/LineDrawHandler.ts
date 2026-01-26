import * as d3 from 'd3'
import type { JsonValue } from '../../types'
import { SvgElements } from '../interfaces'
import { BaseDrawHandler } from './BaseDrawHandler'
import { DrawMark, type DrawSelect } from './types'

/**
 * Draw handler for line charts.
 * Expects paths to carry either id or data-series to match select.keys.
 * Extend/override for stroke-width or point highlighting as needed.
 */
export class LineDrawHandler extends BaseDrawHandler {
  protected selectElements(select?: DrawSelect, chartId?: string) {
    const svg = d3.select(this.container).select(SvgElements.Svg)
    const scope = chartId ? svg.selectAll(`[data-chart-id="${String(chartId)}"]`) : svg
    const mark = select?.mark || DrawMark.Path
    const selection = scope.selectAll<SVGElement, JsonValue>(mark)
    return this.filterByKeys(selection, select?.keys)
  }

  protected allMarks(chartId?: string) {
    const svg = d3.select(this.container).select(SvgElements.Svg)
    const scope = chartId ? svg.selectAll(`[data-chart-id="${String(chartId)}"]`) : svg
    return scope.selectAll<SVGElement, JsonValue>(SvgElements.Path)
  }

  protected defaultColor() {
    return '#4f46e5'
  }
}

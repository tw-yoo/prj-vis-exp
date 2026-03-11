import * as d3 from 'd3'
import type { JsonValue } from '../../types'
import { DataAttributes, SvgElements } from '../interfaces'
import { BaseDrawHandler } from './BaseDrawHandler'
import { DrawMark, type DrawSelect } from './types'

/**
 * Draw handler for line charts.
 * Expects paths to carry either id or data-series to match select.keys.
 * Extend/override for stroke-width or point highlighting as needed.
 */
export class LineDrawHandler extends BaseDrawHandler {
  protected lineMarkSelector(mark?: DrawMark) {
    switch (mark) {
      case DrawMark.Circle:
        // Vega-Lite line points are commonly rendered as <path aria-roledescription="point">.
        return `${SvgElements.Circle}[aria-roledescription="point"], ${SvgElements.Path}[aria-roledescription="point"], .mark-symbol path`
      case DrawMark.Path:
        return `${SvgElements.Path}[aria-roledescription="line mark"], ${SvgElements.Path}[aria-roledescription="line"], ${SvgElements.Path}`
      case DrawMark.Rect:
        return `${SvgElements.Rect}`
      default:
        return `${SvgElements.Path},${SvgElements.Circle},${SvgElements.Rect}`
    }
  }

  protected selectElements(select?: DrawSelect, chartId?: string) {
    const svg = d3.select(this.container).select(SvgElements.Svg)
    const scope = chartId ? svg.selectAll(`[${DataAttributes.ChartId}="${String(chartId)}"]`) : svg
    const mark = select?.mark || DrawMark.Circle
    const selection = this.filterDataMarks(scope.selectAll<SVGElement, JsonValue>(this.lineMarkSelector(mark)))
    return this.filterBySelect(selection, select)
  }

  protected allMarks(chartId?: string) {
    const svg = d3.select(this.container).select(SvgElements.Svg)
    const scope = chartId ? svg.selectAll(`[${DataAttributes.ChartId}="${String(chartId)}"]`) : svg
    return this.filterDataMarks(scope.selectAll<SVGElement, JsonValue>(`${SvgElements.Path},${SvgElements.Circle},${SvgElements.Rect}`))
  }

  protected defaultColor() {
    return '#4f46e5'
  }
}

import * as d3 from 'd3'
import { BaseDrawHandler } from './BaseDrawHandler'
import { DrawMark, type DrawSelect } from './types'

/**
 * Draw handler for line charts.
 * Expects paths to carry either id or data-series to match select.keys.
 * Extend/override for stroke-width or point highlighting as needed.
 */
export class LineDrawHandler extends BaseDrawHandler {
  protected selectElements(select?: DrawSelect) {
    const svg = d3.select(this.container).select('svg')
    const mark = select?.mark || DrawMark.Path
    if (!select?.keys?.length) return svg.selectAll<SVGElement, unknown>(mark)
    const keySet = new Set(select.keys.map(String))
    return svg.selectAll<SVGElement, unknown>(mark).filter(function () {
      const idAttr = (this as Element).getAttribute('data-series') || (this as Element).id
      return idAttr != null && keySet.has(String(idAttr))
    })
  }

  protected allMarks() {
    return d3.select(this.container).select('svg').selectAll<SVGElement, unknown>('path')
  }

  protected defaultColor() {
    return '#4f46e5'
  }
}

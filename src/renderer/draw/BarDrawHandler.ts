import * as d3 from 'd3'
import { BaseDrawHandler } from './BaseDrawHandler'
import { DrawMark, type DrawSelect } from './types'

/**
 * Draw handler for bar-like charts.
 * Relies on data-target / data-id attributes set on rect marks.
 */
export class BarDrawHandler extends BaseDrawHandler {
  protected selectElements(select?: DrawSelect) {
    const svg = d3.select(this.container).select('svg')
    const mark = select?.mark || DrawMark.Rect
    if (!select?.keys?.length) return svg.selectAll<SVGElement, unknown>(mark)
    const keySet = new Set(select.keys.map(String))
    return svg.selectAll<SVGElement, unknown>(mark).filter(function () {
      const targetAttr = (this as Element).getAttribute('data-target') || (this as Element).getAttribute('data-id')
      return targetAttr != null && keySet.has(String(targetAttr))
    })
  }

  protected allMarks() {
    return d3.select(this.container).select('svg').selectAll<SVGElement, unknown>('rect')
  }

  protected defaultColor() {
    return '#69b3a2'
  }
}

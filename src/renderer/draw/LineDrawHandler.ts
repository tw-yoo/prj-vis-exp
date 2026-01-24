import * as d3 from 'd3'
import type { JsonValue } from '../../types'
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
    const selection = svg.selectAll<SVGElement, JsonValue>(mark)
    return this.filterByKeys(selection, select?.keys)
  }

  protected allMarks() {
    return d3.select(this.container).select('svg').selectAll<SVGElement, JsonValue>('path')
  }

  protected defaultColor() {
    return '#4f46e5'
  }
}

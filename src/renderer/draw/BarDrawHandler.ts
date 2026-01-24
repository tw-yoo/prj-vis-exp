import * as d3 from 'd3'
import type { JsonValue } from '../../types'
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
    const selection = svg.selectAll<SVGElement, JsonValue>(mark)
    return this.filterByKeys(selection, select?.keys)
  }

  protected allMarks() {
    return d3.select(this.container).select('svg').selectAll<SVGElement, JsonValue>('rect')
  }

  protected defaultColor() {
    return '#69b3a2'
  }
}

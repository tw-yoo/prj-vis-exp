import type { JsonValue } from '../../../types'
import { SvgElements } from '../../interfaces'
import { LineDrawHandler } from '../LineDrawHandler'
import { type DrawSelect } from '../types'

export class MultiLineDrawHandler extends LineDrawHandler {
  protected override selectElements(select?: DrawSelect, chartId?: string) {
    const scope = this.selectScope(chartId)
    const selection = scope.selectAll<SVGElement, JsonValue>(`${SvgElements.Path},${SvgElements.Circle},${SvgElements.Rect}`)
    return this.filterByKeys(selection, select?.keys)
  }

  protected override allMarks(chartId?: string) {
    const scope = this.selectScope(chartId)
    return scope.selectAll<SVGElement, JsonValue>(`${SvgElements.Path},${SvgElements.Circle},${SvgElements.Rect}`)
  }
}

import type { JsonValue } from '../../../types'
import { SvgElements } from '../../interfaces'
import { BarDrawHandler } from '../BarDrawHandler'
import { type DrawSelect } from '../types'

export class GroupedBarDrawHandler extends BarDrawHandler {
  protected override selectElements(select?: DrawSelect, chartId?: string) {
    const scope = this.selectScope(chartId)
    const selection = scope.selectAll<SVGElement, JsonValue>(`${SvgElements.Rect},${SvgElements.Path}`)
    return this.filterByKeys(selection, select?.keys)
  }

  protected override allMarks(chartId?: string) {
    const scope = this.selectScope(chartId)
    return scope.selectAll<SVGElement, JsonValue>(`${SvgElements.Rect},${SvgElements.Path}`)
  }
}

import * as d3 from 'd3'
import { DrawAction, type DrawOp, type DrawSelect } from './types'

/**
 * Common draw handler that knows how to:
 * - select marks by keys/mark type
 * - clear/reset styling
 * - highlight/dim marks
 *
 * Subclasses override how marks are selected and what "all marks" means.
 */
export abstract class BaseDrawHandler {
  protected container: HTMLElement

  constructor(container: HTMLElement) {
    this.container = container
  }

  protected abstract selectElements(select?: DrawSelect): d3.Selection<SVGElement, unknown, any, any>
  protected abstract allMarks(): d3.Selection<SVGElement, unknown, any, any>
  protected defaultColor(): string {
    return '#69b3a2'
  }

  clear() {
    this.allMarks().attr('fill', this.defaultColor()).attr('opacity', 1)
    this.clearAnnotations()
  }

  highlight(op: DrawOp) {
    const color = op.style?.color || '#ef4444'
    this.selectElements(op.select).attr('fill', color).attr('opacity', 1)
  }

  dim(op: DrawOp) {
    const opacity = op.style?.opacity ?? 0.25
    const selectedNodes = new Set(this.selectElements(op.select).nodes())
    this.allMarks().attr('opacity', function () {
      return selectedNodes.has(this as any) ? 1 : opacity
    })
  }

  run(op: DrawOp) {
    switch (op.action) {
      case DrawAction.Clear:
        this.clear()
        break
      case DrawAction.Highlight:
        this.highlight(op)
        break
      case DrawAction.Dim:
        this.dim(op)
        break
      default:
        console.warn('Unsupported draw action', op.action, op)
    }
  }

  protected clearAnnotations() {
    d3.select(this.container).select('svg').selectAll('.annotation').remove()
  }
}

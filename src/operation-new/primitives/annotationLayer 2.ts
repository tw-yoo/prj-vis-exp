import type * as d3 from 'd3'
import { DataAttributes, SvgAttributes } from '../../rendering/interfaces'
import type { SimpleLineChartInstance } from '../../rendering-new/instances/simpleLineInstance'

export interface AnnotationViewport {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Reads the chart's margin + plot dims from the SVG and returns the annotation
 * viewport. `extraRight` extends the right edge so labels and arrows that
 * spill past the plot can still be placed.
 */
export function resolveAnnotationViewport(
  instance: SimpleLineChartInstance,
  extraRight = 96,
): AnnotationViewport {
  const svgNode = instance.svg.node()
  const marginLeft = instance.layout.marginLeft
  const marginTop = instance.layout.marginTop
  const plotWidth = instance.layout.plotWidth
  const plotHeight = instance.layout.plotHeight
  const desired = { x: marginLeft, y: marginTop, width: plotWidth + extraRight, height: plotHeight }
  const viewBox = svgNode?.viewBox?.baseVal
  if (!viewBox || viewBox.width <= 0 || viewBox.height <= 0) return desired
  const x = Math.max(desired.x, viewBox.x)
  const y = Math.max(desired.y, viewBox.y)
  const right = Math.min(desired.x + desired.width, viewBox.x + viewBox.width)
  const bottom = Math.min(desired.y + desired.height, viewBox.y + viewBox.height)
  return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) }
}

export function readNumberAttr(node: Element, attr: string): number | null {
  const value = Number(node.getAttribute(attr))
  return Number.isFinite(value) ? value : null
}

/** Converts a point's CX/CY (which are in skeleton-local coords) to SVG-root coords. */
export function pointToRootCoords(
  point: SVGCircleElement,
  instance: SimpleLineChartInstance,
): { x: number; y: number; value: number; target: string } {
  const cx = readNumberAttr(point, SvgAttributes.CX) ?? 0
  const cy = readNumberAttr(point, SvgAttributes.CY) ?? 0
  return {
    x: instance.layout.marginLeft + cx,
    y: instance.layout.marginTop + cy,
    value: Number(point.getAttribute(DataAttributes.Value)),
    target: point.getAttribute(DataAttributes.Target) ?? point.getAttribute(DataAttributes.Id) ?? '',
  }
}

export function findPointByTarget(
  instance: SimpleLineChartInstance,
  target: string,
): d3.Selection<SVGCircleElement, unknown, null, undefined> {
  // Filter the cached pointMarks; fall back to a document query if cached
  // selection is empty (e.g. after rescale, the bound data is still valid).
  return instance.pointMarks.filter(function () {
    const node = this as SVGCircleElement
    return node.getAttribute(DataAttributes.Target) === target || node.getAttribute(DataAttributes.Id) === target
  }) as unknown as d3.Selection<SVGCircleElement, unknown, null, undefined>
}

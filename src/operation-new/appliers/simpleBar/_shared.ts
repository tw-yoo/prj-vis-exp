import type * as d3 from 'd3'
import type { TargetSelector } from '../../../domain/operation/types'
import { DataAttributes, SvgAttributes } from '../../../rendering/interfaces'
import type { BarDatum, SimpleBarChartInstance } from '../../../rendering-new/instances/simpleBarInstance'
import { readNumberAttr, type AnnotationViewport } from '../../primitives/annotationLayer'

/** Resolve the annotation viewport for a simple-bar instance. */
export function resolveBarAnnotationViewport(
  instance: SimpleBarChartInstance,
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

/** Returns the bound `BarDatum.target` value list considered "in scope" for a selector. */
export function selectorTargetKey(
  selector: TargetSelector | TargetSelector[] | undefined,
): string | null {
  const entry = Array.isArray(selector) ? selector[0] : selector
  if (entry == null) return null
  if (typeof entry === 'string' || typeof entry === 'number') return String(entry)
  const target = entry.target ?? entry.category ?? entry.id
  return target == null ? null : String(target)
}

/** Filter the cached bars selection down to the matching bar (or empty). */
export function findBarByTarget(
  instance: SimpleBarChartInstance,
  target: string,
): d3.Selection<SVGRectElement, BarDatum, SVGGElement, unknown> {
  return instance.bars.filter(function () {
    const node = this as SVGRectElement
    return (
      node.getAttribute(DataAttributes.Target) === target ||
      node.getAttribute(DataAttributes.Id) === target
    )
  })
}

/** Skeleton-local geometry of a bar (rect attrs are already relative to the skeleton g). */
export interface BarMetrics {
  rect: SVGRectElement
  centerX: number
  topY: number
  value: number
  width: number
}

/** Reads attrs from a rect and converts to **SVG-root** coords (margin offsets applied). */
export function readBarMetrics(rect: SVGRectElement, instance: SimpleBarChartInstance): BarMetrics {
  const x = readNumberAttr(rect, SvgAttributes.X) ?? 0
  const y = readNumberAttr(rect, SvgAttributes.Y) ?? 0
  const height = readNumberAttr(rect, SvgAttributes.Height) ?? 0
  const width = readNumberAttr(rect, SvgAttributes.Width) ?? 0
  const value = Number(rect.getAttribute(DataAttributes.Value))
  // For positive bars the top is at y; for negative bars the top of the
  // value-segment is at y + height (D3 sets y to the zero line and extends
  // downward for negative values).
  const barTopY = value >= 0 ? y : y + height
  return {
    rect,
    centerX: instance.layout.marginLeft + x + width / 2,
    topY: instance.layout.marginTop + barTopY,
    value: Number.isFinite(value) ? value : 0,
    width,
  }
}

/**
 * Convert a numeric y-value to an SVG-root y coordinate via the instance's
 * current yScale, then apply the skeleton's marginTop. The result is in the
 * same coord system as `BarMetrics.topY`.
 */
export function valueToRootY(instance: SimpleBarChartInstance, value: number): number {
  return instance.layout.marginTop + instance.yScale(value)
}

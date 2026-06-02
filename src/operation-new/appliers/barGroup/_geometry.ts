import type * as d3 from 'd3'
import type { DatumValue } from '../../../domain/operation/types'
import { DataAttributes, SvgAttributes } from '../../../rendering/interfaces'
import { readNumberAttr, type AnnotationViewport } from '../../primitives/annotationLayer'
import type { ChartInstance } from '../../../rendering-new/chartInstance'

/**
 * Shared geometry helpers for the grouped + stacked bar appliers.
 *
 * Every reader is **compaction-safe**: it reads the live DOM (the SVG
 * `data-m-left` attribute + each rect's accumulated transform chain) rather
 * than `instance.layout.marginLeft`, which drifts on a compacted shared-y-axis
 * split surface. This mirrors the fix already in `simpleBar/average.ts` and
 * `simpleBar/diff.ts`.
 */

/** Minimal structural view of a grouped/stacked instance for geometry reads. */
export interface BarGroupGeometryInstance {
  host: HTMLElement
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>
  layout: { marginLeft: number; marginTop: number; plotWidth: number; plotHeight: number }
  mainBars(): d3.Selection<SVGRectElement, unknown, d3.BaseType, unknown>
}

/** A full grouped/stacked `ChartInstance` (so it satisfies the
 *  `OperationApplier<TInstance extends ChartInstance>` constraint) plus the
 *  bar-specific `mainBars()`. Both `GroupedBarChartInstance` and
 *  `StackedBarChartInstance` satisfy it, and it is assignable to the minimal
 *  `BarGroupGeometryInstance` the geometry helpers accept. */
export interface BarGroupApplierInstance extends ChartInstance {
  mainBars(): d3.Selection<SVGRectElement, unknown, d3.BaseType, unknown>
}

/**
 * Sum of `translate(x,y)` transforms from `node` up to (not including) the
 * <svg> root. Reads the live DOM transforms, so it stays correct on compacted /
 * faceted / split surfaces where `instance.layout` has drifted. Mirrors the
 * (module-private) `accumulatedTranslate` in
 * `operation-next/runners/barGroupShared.ts`.
 */
export function accumulatedTranslate(node: Element): { x: number; y: number } {
  let x = 0
  let y = 0
  let cur: Element | null = node
  while (cur && cur.tagName.toLowerCase() !== 'svg') {
    const transform = cur.getAttribute('transform') ?? ''
    const match = transform.match(/translate\(\s*([-\d.eE]+)[ ,]+([-\d.eE]+)\s*\)/)
    if (match) {
      x += Number(match[1])
      y += Number(match[2])
    }
    cur = cur.parentElement
  }
  return { x, y }
}

/**
 * The SVG `data-m-left` attribute is the source of truth for the plot's left
 * edge in the SVG's own coordinate system — it stays accurate on a compacted
 * shared-y-axis split surface where `instance.layout.marginLeft` was mutated
 * for cross-surface alignment. Mirrors `simpleBar/average.ts`.
 */
export function resolveBarMarginLeft(instance: BarGroupGeometryInstance): number {
  const attr = instance.svg.node()?.getAttribute(DataAttributes.MarginLeft)
  const n = attr == null ? NaN : Number(attr)
  return Number.isFinite(n) ? n : instance.layout.marginLeft
}

/** Plot left/right edges in SVG-root x, using the compaction-safe marginLeft. */
export function resolveBarPlotBounds(instance: BarGroupGeometryInstance): { x1: number; x2: number } {
  const x1 = resolveBarMarginLeft(instance)
  return { x1, x2: x1 + instance.layout.plotWidth }
}

/**
 * Annotation viewport clamped to the SVG viewBox. Shared across grouped /
 * stacked appliers (lifted from the per-applier `viewport()` copies).
 */
export function barAnnotationViewport(
  instance: BarGroupGeometryInstance,
  extraRight = 96,
): AnnotationViewport {
  const svgNode = instance.svg.node()
  const marginLeft = resolveBarMarginLeft(instance)
  const { marginTop, plotWidth, plotHeight } = instance.layout
  const desired = { x: marginLeft, y: marginTop, width: plotWidth + extraRight, height: plotHeight }
  const viewBox = svgNode?.viewBox?.baseVal
  if (!viewBox || viewBox.width <= 0 || viewBox.height <= 0) return desired
  const x = Math.max(desired.x, viewBox.x)
  const y = Math.max(desired.y, viewBox.y)
  const right = Math.min(desired.x + desired.width, viewBox.x + viewBox.width)
  const bottom = Math.min(desired.y + desired.height, viewBox.y + viewBox.height)
  return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) }
}

export interface BarRootMetrics {
  rect: SVGRectElement
  /** Bar center in SVG-root x. */
  centerX: number
  /** Value-side top in SVG-root y (y+height for negative bars). */
  topY: number
  value: number
  width: number
}

/**
 * Bar geometry in SVG-root coords via the live transform chain (panel offsets +
 * skeleton margin included), so it stays correct on compacted/faceted layouts.
 * Mirrors the legacy `barRootMetrics` but returns the value-side top so labels
 * land above the visible end of negative bars too.
 */
export function barRootMetrics(rect: SVGRectElement): BarRootMetrics {
  const offset = accumulatedTranslate(rect)
  const x = readNumberAttr(rect, SvgAttributes.X) ?? 0
  const y = readNumberAttr(rect, SvgAttributes.Y) ?? 0
  const height = readNumberAttr(rect, SvgAttributes.Height) ?? 0
  const width = readNumberAttr(rect, SvgAttributes.Width) ?? 0
  const value = Number(rect.getAttribute(DataAttributes.Value))
  const localTop = value >= 0 ? y : y + height
  return {
    rect,
    centerX: offset.x + x + width / 2,
    topY: offset.y + localTop,
    value: Number.isFinite(value) ? value : 0,
    width,
  }
}

export function rectCenterRootX(rect: SVGRectElement): number {
  return barRootMetrics(rect).centerX
}

export function rectTopRootY(rect: SVGRectElement): number {
  return barRootMetrics(rect).topY
}

/**
 * The rendered bars matching a datum's (target, group/series). Mirrors the
 * legacy `findBarsByDatum` (target via `data-target`/`data-id`; series via
 * `data-series`/`data-group-value`).
 */
export function findBarsByDatum(
  instance: BarGroupGeometryInstance,
  datum: DatumValue,
): SVGRectElement[] {
  const target = datum.target == null ? null : String(datum.target)
  const group =
    datum.group != null ? String(datum.group) : datum.series != null ? String(datum.series) : null
  return (instance.mainBars().nodes() as SVGRectElement[]).filter((node) => {
    if (target != null) {
      const tMatch =
        node.getAttribute(DataAttributes.Target) === target ||
        node.getAttribute(DataAttributes.Id) === target
      if (!tMatch) return false
    }
    if (group != null) {
      const gMatch =
        node.getAttribute(DataAttributes.Series) === group ||
        node.getAttribute(DataAttributes.GroupValue) === group
      if (!gMatch) return false
    }
    return true
  })
}

/**
 * Project a numeric value to an SVG-root y by a two-sample linear fit across
 * the rendered bars' (value, top) pairs. Grouped/stacked instances expose no
 * `yScale`, so this reads the drawn geometry directly — self-consistent (same
 * `accumulatedTranslate` basis) with where bar tops/labels land. Falls back to
 * the plot vertical center when fewer than two distinct-value bars exist.
 *
 * (For stacked bars a segment's top encodes its cumulative position, so this is
 * an approximation there — same caveat the legacy stacked retrieveValue line
 * fit carries. Group-scoped stacked averages convert to a simple bar first, so
 * the common path is exact.)
 */
export function valueToRootYForBars(instance: BarGroupGeometryInstance, value: number): number {
  const bars = instance.mainBars().nodes() as SVGRectElement[]
  const fallback = instance.layout.marginTop + instance.layout.plotHeight / 2
  if (bars.length < 2) return fallback
  let minV = Number.POSITIVE_INFINITY
  let maxV = Number.NEGATIVE_INFINITY
  let yAtMin = 0
  let yAtMax = 0
  for (const rect of bars) {
    const v = Number(rect.getAttribute(DataAttributes.Value))
    if (!Number.isFinite(v)) continue
    const top = barRootMetrics(rect).topY
    if (v < minV) {
      minV = v
      yAtMin = top
    }
    if (v > maxV) {
      maxV = v
      yAtMax = top
    }
  }
  if (!Number.isFinite(minV) || !Number.isFinite(maxV) || minV === maxV) return fallback
  const t = (value - minV) / (maxV - minV)
  return yAtMin + (yAtMax - yAtMin) * t
}

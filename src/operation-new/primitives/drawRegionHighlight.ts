import type * as d3 from 'd3'
import { DataAttributes, SvgAttributes, SvgClassNames, SvgElements } from '../../rendering/interfaces'
import { DURATIONS, EASINGS } from '../../rendering/common/d3Helpers'

/** Highlighter yellow — translucent so the marks underneath stay readable. */
const REGION_HIGHLIGHT_FILL = '#facc15'
const REGION_HIGHLIGHT_OPACITY = 0.28
const REGION_PAD_X_PX = 4

export interface RegionHighlightOptions {
  layer: d3.Selection<SVGGElement, unknown, null, undefined>
  cssClass: string
  /** Root-SVG x extent of the region (already padded by the caller or not). */
  x0: number
  x1: number
  /** Root-SVG y extent (typically the plot area's top/bottom). */
  y0: number
  y1: number
  /** Stamped for nodeId-scoped cleanup. */
  nodeId?: string | null
  /** Extra horizontal padding around [x0,x1]. Default 4px. */
  padX?: number
}

/**
 * Translucent "highlighter" band over a chart region — used when a selection
 * op picks a whole x-position (e.g. findExtremum over pairDiff-derived rows
 * selects a Period, not one bar segment). Recoloring the marks red implies a
 * VALUE selection; the band reads as "this column/region is the answer".
 *
 * Inserted as the annotation layer's FIRST child so Δ arrows / labels drawn
 * by earlier ops stay crisp on top of it. Fade-in only.
 */
export async function drawRegionHighlight(opts: RegionHighlightOptions): Promise<void> {
  const { layer, cssClass, y0, y1, nodeId } = opts
  const pad = opts.padX ?? REGION_PAD_X_PX
  const x = Math.min(opts.x0, opts.x1) - pad
  const width = Math.abs(opts.x1 - opts.x0) + pad * 2

  const band = layer
    .insert(SvgElements.Rect, ':first-child')
    .attr(SvgAttributes.Class, `${SvgClassNames.Annotation} ${cssClass} region-highlight`)
    .attr(SvgAttributes.X, x)
    .attr(SvgAttributes.Y, Math.min(y0, y1))
    .attr(SvgAttributes.Width, Math.max(0, width))
    .attr(SvgAttributes.Height, Math.abs(y1 - y0))
    .attr('rx', 4)
    .attr(SvgAttributes.Fill, REGION_HIGHLIGHT_FILL)
    .style(SvgAttributes.Opacity, 0)
    .style('pointer-events', 'none')
  if (nodeId) band.attr(DataAttributes.AnnotationNodeId, nodeId)

  try {
    await band
      .transition()
      .duration(DURATIONS.HIGHLIGHT)
      .ease(EASINGS.SMOOTH)
      .style(SvgAttributes.Opacity, REGION_HIGHLIGHT_OPACITY)
      .end()
  } catch {
    /* interrupted */
  }
}

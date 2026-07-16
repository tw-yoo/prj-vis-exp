import * as d3 from 'd3'
import { SvgAttributes, SvgClassNames, SvgElements } from '../../rendering/interfaces'
import { COLORS, DURATIONS, EASINGS } from '../../rendering/common/d3Helpers'

export type BadgeAnchor = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'top-center-above' | 'top-right-above'

export interface ResultBadgeLayout {
  marginLeft: number
  marginTop: number
  plotWidth: number
  plotHeight: number
}

export interface ResultBadgeOptions {
  /** Annotation layer to append the badge into. */
  layer: d3.Selection<SVGGElement, unknown, null, undefined>
  /** Class name unique to this op (used for cleanup / context fade). */
  cssClass: string
  /** Display text (e.g. "Count: 5", "Yes", "Total: 100"). */
  text: string
  /** Layout from ChartInstance — used to position relative to the plot box. */
  layout: ResultBadgeLayout
  /** Default 'top-right'. */
  anchor?: BadgeAnchor
  /** Default `COLORS.TEXT_DARK`. */
  color?: string
  /** Pixel inset from the plot edge in the chosen corner. Default 8. */
  inset?: number
  /** Font size. Default 14. */
  fontSize?: number
  /**
   * Extra vertical offset (px) applied AFTER the anchor position — a second
   * badge slot. Lets two coexisting badges share a corner without overlap
   * (e.g. `add`'s running total on the first row, `scale`'s result one row
   * below). Default 0.
   */
  offsetY?: number
}

/**
 * Terminal-op result badge — a single SVG text label parked in a corner of the
 * plot area. Used by scalar / boolean ops (count, compareBool, sum, add, scale)
 * that produce a single value with no inherent chart-position to anchor to.
 *
 * Idempotent: removes any prior badge with the same `cssClass` before drawing.
 * Fade-in animation only (no shape transition).
 */
export async function drawResultBadge(opts: ResultBadgeOptions): Promise<void> {
  const {
    layer,
    cssClass,
    text,
    layout,
    anchor = 'top-right',
    color = COLORS.TEXT_DARK,
    inset = 8,
    fontSize = 14,
    offsetY = 0,
  } = opts

  // Drop prior badge of the same op so re-runs don't stack labels.
  layer.selectAll<SVGElement, unknown>(`.${cssClass}`).interrupt().remove()

  const leftEdge = layout.marginLeft + inset
  const rightEdge = layout.marginLeft + layout.plotWidth - inset
  const topEdge = layout.marginTop + inset + fontSize
  const bottomEdge = layout.marginTop + layout.plotHeight - inset

  let x: number
  let y: number
  let textAnchor: 'start' | 'end' | 'middle'

  switch (anchor) {
    case 'top-left':
      x = leftEdge
      y = topEdge
      textAnchor = 'start'
      break
    case 'bottom-left':
      x = leftEdge
      y = bottomEdge
      textAnchor = 'start'
      break
    case 'bottom-right':
      x = rightEdge
      y = bottomEdge
      textAnchor = 'end'
      break
    case 'top-center-above':
      x = layout.marginLeft + layout.plotWidth / 2
      y = Math.max(fontSize + 4, layout.marginTop - 8)
      textAnchor = 'middle'
      break
    case 'top-right-above':
      // Right-aligned in the top margin band ABOVE the plot (arithmetic
      // results), clearing both the marks below and the centered count/sum.
      x = layout.marginLeft + layout.plotWidth - inset
      y = Math.max(fontSize + 4, layout.marginTop - 8)
      textAnchor = 'end'
      break
    case 'top-right':
    default:
      x = rightEdge
      y = topEdge
      textAnchor = 'end'
      break
  }

  const label = layer
    .append(SvgElements.Text)
    .attr(SvgAttributes.Class, `${SvgClassNames.TextAnnotation} ${cssClass}`)
    .attr(SvgAttributes.X, x)
    .attr(SvgAttributes.Y, y + offsetY)
    .attr(SvgAttributes.TextAnchor, textAnchor)
    .attr(SvgAttributes.FontSize, fontSize)
    .attr(SvgAttributes.FontWeight, 700)
    .attr(SvgAttributes.Fill, color)
    .style(SvgAttributes.Opacity, 0)
    .text(text)

  try {
    await label
      .transition()
      .duration(DURATIONS.LABEL_FADE_IN)
      .ease(EASINGS.SMOOTH)
      .style(SvgAttributes.Opacity, 1)
      .end()
  } catch {
    /* interrupted */
  }
}

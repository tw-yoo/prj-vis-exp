import * as d3 from 'd3'
import { SvgAttributes, SvgClassNames, SvgElements } from '../../rendering/interfaces'
import { COLORS, DURATIONS, EASINGS } from '../../rendering/common/d3Helpers'

/**
 * Mirror of `src/operation-new/primitives/drawResultBadge.ts`. Kept duplicated
 * because operation-new and operation-next intentionally don't import each
 * other's primitives. Update both files together.
 */

export type BadgeAnchor = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'top-center-above'

export interface ResultBadgeLayout {
  marginLeft: number
  marginTop: number
  plotWidth: number
  plotHeight: number
}

export interface ResultBadgeOptions {
  layer: d3.Selection<SVGGElement, unknown, null, undefined>
  cssClass: string
  text: string
  layout: ResultBadgeLayout
  anchor?: BadgeAnchor
  color?: string
  inset?: number
  fontSize?: number
}

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
  } = opts

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
      // Centered text sitting in the top margin band ABOVE the plot, used by
      // bar-chart count/sum to summarize the chart with a prominent label.
      x = layout.marginLeft + layout.plotWidth / 2
      y = Math.max(fontSize + 4, layout.marginTop - 8)
      textAnchor = 'middle'
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
    .attr(SvgAttributes.Y, y)
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

import type * as d3 from 'd3'
import { SvgAttributes, SvgClassNames, SvgElements } from '../../rendering/interfaces'
import { COLORS, DURATIONS, EASINGS, STYLES } from '../../rendering/common/d3Helpers'
import { placeOperationTextLabel } from './placeLabel'
import type { AnnotationViewport } from './annotationLayer'

export type ReferenceLineStyle = 'solid' | 'guideline'

export interface ReferenceLineOptions {
  layer: d3.Selection<SVGGElement, unknown, null, undefined>
  cssClass: string
  x1: number
  x2: number
  y: number
  color?: string
  style?: ReferenceLineStyle
  label?: string
  svg?: d3.Selection<SVGSVGElement, unknown, null, undefined>
  viewport?: AnnotationViewport
}

/**
 * Horizontal reference line that animates from x1 → x2, then optionally fades
 * in a collision-aware label near the right endpoint.
 *   1. Line draws out (DURATIONS.GUIDELINE_DRAW).
 *   2. Label placed (collision-avoidance reads stable DOM).
 *   3. Label fades in (DURATIONS.LABEL_FADE_IN).
 */
export async function drawReferenceLine(opts: ReferenceLineOptions): Promise<void> {
  const { layer, cssClass, x1, x2, y, label, svg, viewport } = opts
  const color = opts.color ?? COLORS.ANNOTATION_RED
  const lineStyle = opts.style ?? 'solid'

  const lineSelection = layer
    .append(SvgElements.Line)
    .attr(SvgAttributes.Class, `${SvgClassNames.LineAnnotation} ${cssClass}`)
    .attr(SvgAttributes.X1, x1)
    .attr(SvgAttributes.X2, x1)
    .attr(SvgAttributes.Y1, y)
    .attr(SvgAttributes.Y2, y)
    .attr(SvgAttributes.Stroke, color)
    .attr(SvgAttributes.StrokeWidth, lineStyle === 'guideline' ? STYLES.GUIDELINE.strokeWidth : 2)

  if (lineStyle === 'guideline') {
    lineSelection.attr(SvgAttributes.StrokeDasharray, STYLES.GUIDELINE.strokeDasharray)
  }

  try {
    await lineSelection
      .transition()
      .duration(DURATIONS.GUIDELINE_DRAW)
      .ease(EASINGS.SMOOTH)
      .attr(SvgAttributes.X2, x2)
      .end()
  } catch {
    /* interrupted */
  }

  if (!label || !svg || !viewport) return

  const preferredX = x2 - 4
  const preferredY = Math.max(12, y - 8)

  const labelSelection = layer
    .append(SvgElements.Text)
    .attr(SvgAttributes.Class, `${SvgClassNames.TextAnnotation} ${cssClass}`)
    .attr(SvgAttributes.X, preferredX)
    .attr(SvgAttributes.Y, preferredY)
    .attr(SvgAttributes.TextAnchor, 'end')
    .attr(SvgAttributes.FontSize, 12)
    .attr(SvgAttributes.FontWeight, 700)
    .attr(SvgAttributes.Fill, color)
    .style(SvgAttributes.Opacity, 0)
    .text(label)

  placeOperationTextLabel({
    svg,
    text: labelSelection,
    preferred: { x: preferredX, y: preferredY },
    viewport,
  })

  try {
    await labelSelection
      .transition()
      .duration(DURATIONS.LABEL_FADE_IN)
      .ease(EASINGS.SMOOTH)
      .style(SvgAttributes.Opacity, 1)
      .end()
  } catch {
    /* interrupted */
  }
}

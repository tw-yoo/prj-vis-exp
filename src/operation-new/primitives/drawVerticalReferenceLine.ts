import * as d3 from 'd3'
import { SvgAttributes, SvgClassNames, SvgElements } from '../../rendering/interfaces'
import { COLORS, DURATIONS, EASINGS, STYLES } from '../../rendering/common/d3Helpers'
import { placeOperationTextLabel } from './placeLabel'
import type { AnnotationViewport } from './annotationLayer'

export type VerticalReferenceLineStyle = 'solid' | 'guideline'

/** Mirror of `REF_LINE_ANCHOR_VALUE_ATTR` for vertical lines. The anchor is an
 *  x-axis value (category for ordinal, numeric for linear). A follow-up rescale
 *  re-derives the new pixel x using the (new) xScale and slides the annotation. */
export const VREF_LINE_ANCHOR_VALUE_ATTR = 'data-vanchor-value'

export interface VerticalReferenceLineOptions {
  layer: d3.Selection<SVGGElement, unknown, null, undefined>
  cssClass: string
  /** Pixel y where the line starts (typically top of the plot). */
  y1: number
  /** Pixel y where the line ends (typically the data point or plot bottom). */
  y2: number
  /** Pixel x of the vertical line. */
  x: number
  color?: string
  style?: VerticalReferenceLineStyle
  label?: string
  svg?: d3.Selection<SVGSVGElement, unknown, null, undefined>
  viewport?: AnnotationViewport
  /** Data-space x value the line represents (typically a category label or
   *  numeric x). Stamped onto line + label so a later rescale can recompute the
   *  pixel x via the new xScale. */
  anchorValue?: string | number
}

/**
 * Vertical reference line that animates from y1 → y2, then optionally fades in
 * a collision-aware label near the bottom (x-axis side).
 *   1. Line draws down/up (DURATIONS.GUIDELINE_DRAW).
 *   2. Label placed (collision-avoidance reads stable DOM).
 *   3. Label fades in (DURATIONS.LABEL_FADE_IN).
 */
export async function drawVerticalReferenceLine(opts: VerticalReferenceLineOptions): Promise<void> {
  const { layer, cssClass, y1, y2, x, label, svg, viewport, anchorValue } = opts
  const color = opts.color ?? COLORS.ANNOTATION_RED
  const lineStyle = opts.style ?? 'solid'

  const lineSelection = layer
    .append(SvgElements.Line)
    .attr(SvgAttributes.Class, `${SvgClassNames.LineAnnotation} ${cssClass}`)
    .attr(SvgAttributes.X1, x)
    .attr(SvgAttributes.X2, x)
    .attr(SvgAttributes.Y1, y1)
    .attr(SvgAttributes.Y2, y1)
    .attr(SvgAttributes.Stroke, color)
    .attr(SvgAttributes.StrokeWidth, lineStyle === 'guideline' ? STYLES.GUIDELINE.strokeWidth : 2)

  if (anchorValue !== undefined && anchorValue !== null) {
    lineSelection.attr(VREF_LINE_ANCHOR_VALUE_ATTR, String(anchorValue))
  }

  if (lineStyle === 'guideline') {
    lineSelection.attr(SvgAttributes.StrokeDasharray, STYLES.GUIDELINE.strokeDasharray)
  }

  try {
    await lineSelection
      .transition()
      .duration(DURATIONS.GUIDELINE_DRAW)
      .ease(EASINGS.SMOOTH)
      .attr(SvgAttributes.Y2, y2)
      .end()
  } catch {
    /* interrupted */
  }

  if (!label || !svg || !viewport) return

  // Place label just below the bottom of the line by default (x-axis side).
  // The horizontal helper places at right end; the vertical mirror places at
  // bottom end (toward the x-axis tick).
  const lineBottom = Math.max(y1, y2)
  const preferredX = x
  const preferredY = lineBottom + 14

  const labelSelection = layer
    .append(SvgElements.Text)
    .attr(SvgAttributes.Class, `${SvgClassNames.TextAnnotation} ${cssClass}`)
    .attr(SvgAttributes.X, preferredX)
    .attr(SvgAttributes.Y, preferredY)
    .attr(SvgAttributes.TextAnchor, 'middle')
    .attr(SvgAttributes.FontSize, 12)
    .attr(SvgAttributes.FontWeight, 700)
    .attr(SvgAttributes.Fill, color)
    .style(SvgAttributes.Opacity, 0)
    .text(label)

  if (anchorValue !== undefined && anchorValue !== null) {
    labelSelection.attr(VREF_LINE_ANCHOR_VALUE_ATTR, String(anchorValue))
    // Remember the line x this label was aligned to so a later rescale can
    // preserve the label's horizontal offset (collision-avoidance may shift
    // the label away from the line; we still want to track the line).
    labelSelection.attr('data-anchor-line-x', String(x))
  }

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

/**
 * Slides any vertical reference line + label that carries `data-vanchor-value`
 * to the new x position derived from the (already-mutated) xScale + marginLeft,
 * matching the duration the caller passes to `transitionChartScale`. Returns
 * promises so callers can `Promise.all([transitionChartScale(...), ...])`
 * to keep the vref shift in lockstep with the axis rescale.
 *
 * Op-agnostic — any prior op that drew a vref with `anchorValue` is eligible,
 * so cross-op chains preserve their anchors without each applier needing to
 * know about the others.
 *
 * `xScale` should map a data-space x value (string for ordinal, number for
 * linear) to a plot-local x pixel; the caller adds `marginLeft` here.
 */
export function transitionPersistentVerticalRefLines(args: {
  layer:
    | d3.Selection<SVGGElement, unknown, null, undefined>
    | d3.Selection<SVGGElement, unknown, d3.BaseType, unknown>
  xScale: (value: string | number) => number | undefined
  marginLeft: number
  duration: number
}): Promise<void>[] {
  const { layer, xScale, marginLeft, duration } = args
  const promises: Promise<void>[] = []

  const lines = (layer as d3.Selection<SVGGElement, unknown, null, undefined>).selectAll<SVGLineElement, unknown>(
    `line[${VREF_LINE_ANCHOR_VALUE_ATTR}]`,
  )
  lines.each(function () {
    const raw = this.getAttribute(VREF_LINE_ANCHOR_VALUE_ATTR)
    if (raw == null) return
    const localX = xScale(raw)
    if (localX == null || !Number.isFinite(localX)) return
    const newX = marginLeft + localX
    promises.push(
      d3
        .select(this)
        .transition()
        .duration(duration)
        .ease(EASINGS.SMOOTH)
        .attr(SvgAttributes.X1, newX)
        .attr(SvgAttributes.X2, newX)
        .end()
        .catch(() => undefined),
    )
  })

  const labels = (layer as d3.Selection<SVGGElement, unknown, null, undefined>).selectAll<SVGTextElement, unknown>(
    `text[${VREF_LINE_ANCHOR_VALUE_ATTR}]`,
  )
  labels.each(function () {
    const raw = this.getAttribute(VREF_LINE_ANCHOR_VALUE_ATTR)
    if (raw == null) return
    const localX = xScale(raw)
    if (localX == null || !Number.isFinite(localX)) return
    const newLineX = marginLeft + localX
    // Preserve the label's horizontal offset relative to its line (collision-
    // avoidance may have shifted it; we want to keep that delta).
    const currentX = Number(this.getAttribute(SvgAttributes.X))
    const currentLineX = Number(this.getAttribute('data-anchor-line-x') ?? currentX)
    const deltaX = Number.isFinite(currentX) && Number.isFinite(currentLineX) ? currentX - currentLineX : 0
    const newLabelX = newLineX + deltaX
    promises.push(
      d3
        .select(this)
        .transition()
        .duration(duration)
        .ease(EASINGS.SMOOTH)
        .attr(SvgAttributes.X, newLabelX)
        .end()
        .catch(() => undefined),
    )
    this.setAttribute('data-anchor-line-x', String(newLineX))
  })

  return promises
}

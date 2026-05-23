import * as d3 from 'd3'
import { SvgAttributes, SvgClassNames, SvgElements } from '../../rendering/interfaces'
import { COLORS, DURATIONS, EASINGS, STYLES } from '../../rendering/common/d3Helpers'
import { placeOperationTextLabel } from './placeLabel'
import type { AnnotationViewport } from './annotationLayer'

export type ReferenceLineStyle = 'solid' | 'guideline'

/** Attr applied to ref line + its label so a later rescale can slide them
 * to the new y in lockstep with the chart's axis transition. Picked up by
 * `transitionPersistentRefLines`. */
export const REF_LINE_ANCHOR_VALUE_ATTR = 'data-anchor-value'

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
  /** Data-space y value the line represents. When supplied, it's stamped onto
   *  the line + label so a follow-up rescale can re-derive the new pixel y
   *  using the (new) yScale and slide the annotation along with the axes. */
  anchorValue?: number
}

/**
 * Horizontal reference line that animates from x1 → x2, then optionally fades
 * in a collision-aware label near the right endpoint.
 *   1. Line draws out (DURATIONS.GUIDELINE_DRAW).
 *   2. Label placed (collision-avoidance reads stable DOM).
 *   3. Label fades in (DURATIONS.LABEL_FADE_IN).
 */
export async function drawReferenceLine(opts: ReferenceLineOptions): Promise<void> {
  const { layer, cssClass, x1, x2, y, label, svg, viewport, anchorValue } = opts
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

  if (anchorValue !== undefined && Number.isFinite(anchorValue)) {
    lineSelection.attr(REF_LINE_ANCHOR_VALUE_ATTR, String(anchorValue))
  }

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

  if (anchorValue !== undefined && Number.isFinite(anchorValue)) {
    labelSelection.attr(REF_LINE_ANCHOR_VALUE_ATTR, String(anchorValue))
    // Remember the line y this label was aligned to so a later rescale can
    // preserve the label's offset (collision-avoidance may shift the label
    // away from the line; we still want to track the line).
    labelSelection.attr('data-anchor-line-y', String(y))
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
 * Slides any reference line + label that carries `data-anchor-value` to the
 * new y position derived from the (already-mutated) yScale + marginTop, using
 * the same `duration` the caller passes to `transitionChartScale`. Returns an
 * array of promises so callers can `Promise.all([transitionChartScale(...), ...])`
 * to sync the ref-line shift with the axis rescale.
 *
 * Op-agnostic — any prior op that drew a ref line with `anchorValue` is
 * eligible, so cross-op chains (e.g. ops1.diffByValue → ops2.filter) preserve
 * their anchors without each applier having to know about the others.
 */
export function transitionPersistentRefLines(args: {
  layer: d3.Selection<SVGGElement, unknown, null, undefined> | d3.Selection<SVGGElement, unknown, d3.BaseType, unknown>
  yScale: (value: number) => number
  marginTop: number
  duration: number
}): Promise<void>[] {
  const { layer, yScale, marginTop, duration } = args
  const promises: Promise<void>[] = []

  const lines = (layer as d3.Selection<SVGGElement, unknown, null, undefined>)
    .selectAll<SVGLineElement, unknown>(`line[${REF_LINE_ANCHOR_VALUE_ATTR}]`)
  lines.each(function () {
    const raw = this.getAttribute(REF_LINE_ANCHOR_VALUE_ATTR)
    const v = raw != null ? Number(raw) : NaN
    if (!Number.isFinite(v)) return
    const newY = marginTop + yScale(v)
    if (!Number.isFinite(newY)) return
    promises.push(
      d3.select(this)
        .transition()
        .duration(duration)
        .ease(EASINGS.SMOOTH)
        .attr(SvgAttributes.Y1, newY)
        .attr(SvgAttributes.Y2, newY)
        .end()
        .catch(() => undefined),
    )
  })

  const labels = (layer as d3.Selection<SVGGElement, unknown, null, undefined>)
    .selectAll<SVGTextElement, unknown>(`text[${REF_LINE_ANCHOR_VALUE_ATTR}]`)
  labels.each(function () {
    const raw = this.getAttribute(REF_LINE_ANCHOR_VALUE_ATTR)
    const v = raw != null ? Number(raw) : NaN
    if (!Number.isFinite(v)) return
    const newLineY = marginTop + yScale(v)
    if (!Number.isFinite(newLineY)) return
    // Preserve the label's vertical offset relative to its line (the label is
    // typically placed slightly above the line — keep that delta).
    const currentY = Number(this.getAttribute(SvgAttributes.Y))
    const currentLineY = Number(this.getAttribute('data-anchor-line-y') ?? currentY + 8)
    const deltaY = currentY - currentLineY
    const newLabelY = newLineY + deltaY
    promises.push(
      d3.select(this)
        .transition()
        .duration(duration)
        .ease(EASINGS.SMOOTH)
        .attr(SvgAttributes.Y, newLabelY)
        .end()
        .catch(() => undefined),
    )
    // Remember the line y we just aligned to so the NEXT rescale can recompute
    // the delta correctly even if the label was moved by collision avoidance.
    this.setAttribute('data-anchor-line-y', String(newLineY))
  })

  return promises
}

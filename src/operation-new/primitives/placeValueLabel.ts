import type * as d3 from 'd3'
import { SvgAttributes, SvgClassNames, SvgElements } from '../../rendering/interfaces'
import { COLORS } from '../../rendering/common/d3Helpers'
import { placeOperationTextLabel } from './placeLabel'
import type { AnnotationViewport } from './annotationLayer'

export interface PlaceValueLabelOptions {
  /** Annotation `<g>` layer to append into. */
  layer: d3.Selection<SVGGElement, unknown, null, undefined>
  /** Owning SVG (drives collision search / viewport clamp). */
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>
  /** Plot/annotation viewport bounds (resolveBar/AnnotationViewport). */
  viewport: AnnotationViewport
  /** Preferred position — usually just ABOVE the bar top / point. */
  preferred: { x: number; y: number }
  text: string
  /** Annotation css class (e.g. `operation-next-extremum`). */
  className: string
  fill?: string
  fontSize?: number
  fontWeight?: number
  /** Text anchor. Default `middle` (value labels centered over the mark). */
  textAnchor?: 'start' | 'middle' | 'end'
  /**
   * Optional anchor element. **Leave null for bars** — `placeOperationTextLabel`
   * IGNORES the anchor as an obstacle, so passing the bar would let the label
   * land inside it (the "weird place" symptom). With `null` the bar stays a hard
   * obstacle and the label is pushed clear of it.
   */
  anchorElement?: Element | null
  /** Extra data-* attributes to stamp (e.g. node id / target). */
  dataAttrs?: Array<[string, string]>
}

/**
 * Append a value / computed text label and position it with the shared
 * collision-aware placer so it never overlaps bars, reference lines, or other
 * labels (the "Difference overlaps 3.48" + "label inside the tall bar" bugs).
 *
 * The label is returned at `opacity: 0` — the CALLER owns the fade-in transition
 * so existing `Promise.all(transitions)` batching is preserved. Default fill is
 * `COLORS.TEXT_DARK` (legible on any bar fill; fixes the red-on-red case).
 */
export function placeValueLabel(
  opts: PlaceValueLabelOptions,
): d3.Selection<SVGTextElement, unknown, null, undefined> {
  const node = opts.layer
    .append(SvgElements.Text)
    .attr(SvgAttributes.Class, `${SvgClassNames.TextAnnotation} ${opts.className}`)
    .attr(SvgAttributes.X, opts.preferred.x)
    .attr(SvgAttributes.Y, opts.preferred.y)
    .attr(SvgAttributes.TextAnchor, opts.textAnchor ?? 'middle')
    .attr(SvgAttributes.FontSize, opts.fontSize ?? 12)
    .attr(SvgAttributes.FontWeight, opts.fontWeight ?? 700)
    .attr(SvgAttributes.Fill, opts.fill ?? COLORS.TEXT_DARK)
    .style(SvgAttributes.Opacity, 0)
    .text(opts.text)

  if (opts.dataAttrs) {
    for (const [key, value] of opts.dataAttrs) node.attr(key, value)
  }

  // A value label's natural home is just ABOVE its bar top / point. For a tall
  // bar (value near the y-axis max) the top sits at the plot top, so that
  // natural spot is ABOVE the plot area — outside `opts.viewport` (whose top is
  // marginTop). The collision placer then penalizes it (scoreWeightOutside) and
  // its final clamp shoves it back into the plot, where the tall bar fills the
  // space, so the label spirals into the gap BESIDE the bar at mid-height (the
  // "weird position" symptom on findExtremum / retrieveValue / diff of a max
  // bar). The chart renders with overflow:visible and the top margin is empty,
  // so extend the viewport upward by one label row's worth (capped by the
  // available margin) and let the label live there. Normal (short-bar) labels
  // are unaffected — their preferred spot is already inside the viewport.
  const TOP_HEADROOM_PX = 36
  const headroom = Math.max(0, Math.min(TOP_HEADROOM_PX, opts.viewport.y - 4))
  const viewport: AnnotationViewport =
    headroom > 0
      ? {
          x: opts.viewport.x,
          y: opts.viewport.y - headroom,
          width: opts.viewport.width,
          height: opts.viewport.height + headroom,
        }
      : opts.viewport

  placeOperationTextLabel({
    svg: opts.svg,
    text: node,
    preferred: opts.preferred,
    anchorElement: opts.anchorElement ?? null,
    viewport,
  })

  return node
}

import * as d3 from 'd3'
import { SvgAttributes, SvgClassNames, SvgElements } from '../../rendering/interfaces'
import { COLORS, DURATIONS, EASINGS, STYLES } from '../../rendering/common/d3Helpers'
import { placeOperationTextLabel } from '../textPlacement'
import type { AnnotationViewport } from './annotationLayer'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Visual style of the reference line.
 *
 * - `'solid'`    : plain stroke, used for filter threshold and average lines
 *                  when they are the primary annotation.
 * - `'guideline'`: dashed + reduced opacity, used when a prior operation's
 *                  reference line stays visible as contextual background after
 *                  a subsequent operation has run.
 */
export type ReferenceLineStyle = 'solid' | 'guideline'

export interface ReferenceLineOptions {
  /** The annotation <g> layer to draw into (from ensureAnnotationLayer). */
  layer: d3.Selection<SVGGElement, unknown, null, undefined>

  /**
   * CSS class applied to both the line and its label.
   * Should include the operation-specific class (e.g. FILTER_ANNOTATION_CLASS)
   * so each annotate step can clear its own elements without touching others.
   */
  cssClass: string

  /** Line start x (typically marginLeft). */
  x1: number

  /** Line end x — the line animates from x1 to x2. */
  x2: number

  /** Pixel y position of the line (constant; line is horizontal). */
  y: number

  /** Stroke colour. Defaults to red (#ef4444). */
  color?: string

  /** Line style. Defaults to 'solid'. */
  style?: ReferenceLineStyle

  // ---- Optional label --------------------------------------------------

  /**
   * Text content for the label drawn near the right end of the line.
   * Omit to draw the line only.
   */
  label?: string

  /**
   * SVG root element — required when `label` is provided so that
   * placeOperationTextLabel can measure obstacle positions.
   */
  svg?: d3.Selection<SVGSVGElement, unknown, null, undefined>

  /**
   * Viewport bounds for collision-aware label placement.
   * Required when `label` is provided.
   */
  viewport?: AnnotationViewport
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

const DEFAULT_COLOR = COLORS.ANNOTATION_RED

/**
 * Draws a horizontal reference line that animates from x1 → x2, then
 * optionally fades in a collision-aware label near the right endpoint.
 *
 * Animation order:
 *   1. Line draws out (DURATIONS.GUIDELINE_DRAW).
 *   2. Label is placed (collision avoidance runs after line is settled).
 *   3. Label fades in (DURATIONS.LABEL_FADE_IN).
 *
 * Steps are sequential so that label placement reads stable DOM geometry.
 * Interrupted transitions are silently ignored (standard D3 pattern).
 */
export async function drawReferenceLine(opts: ReferenceLineOptions): Promise<void> {
  const { layer, cssClass, x1, x2, y, label, svg, viewport } = opts
  const color = opts.color ?? DEFAULT_COLOR
  const lineStyle = opts.style ?? 'solid'

  // -- 1. Draw line --------------------------------------------------------

  const lineSelection = layer
    .append(SvgElements.Line)
    .attr(SvgAttributes.Class, `${SvgClassNames.LineAnnotation} ${cssClass}`)
    .attr(SvgAttributes.X1, x1)
    .attr(SvgAttributes.X2, x1)   // start collapsed; animates to x2
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
    // Interrupted transitions are acceptable (e.g. rapid operation replays).
  }

  // -- 2. Draw label (optional) -------------------------------------------

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

  // Collision-aware repositioning — runs after line transition is complete
  // so the line element is included in obstacle detection.
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
    // Interrupted transitions are acceptable.
  }
}

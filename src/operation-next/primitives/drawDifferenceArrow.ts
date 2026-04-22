import * as d3 from 'd3'
import { SvgAttributes, SvgClassNames, SvgElements } from '../../rendering/interfaces'
import { COLORS, DURATIONS, EASINGS } from '../../rendering/common/d3Helpers'
import { placeOperationTextLabel } from '../textPlacement'
import type { AnnotationViewport } from './annotationLayer'

// ---------------------------------------------------------------------------
// Shared geometry constants
// ---------------------------------------------------------------------------

/** Pixels between the circle edge and the arrow shaft start/end. */
const ENDPOINT_PADDING_PX = 8

/** Length of each arrow head line from the tip. */
const HEAD_LENGTH_PX = 10

/** Half-width of the arrow head (perpendicular spread from the shaft). */
const HEAD_HALF_WIDTH_PX = 5

/** Arrow head size for vertical double-headed arrows. */
const VERTICAL_HEAD_SIZE_PX = 8

/**
 * Delay before arrow heads fade in, relative to the shaft animation start.
 * Kept slightly shorter than the shaft duration so the head appears just
 * as the shaft finishes drawing.
 */
const HEAD_FADE_DELAY_MS = 700
const HEAD_FADE_DURATION_MS = 200

// ---------------------------------------------------------------------------
// drawVerticalComparisonArrow
// ---------------------------------------------------------------------------

export interface VerticalComparisonArrowOptions {
  /** Annotation <g> layer (from ensureAnnotationLayer). */
  layer: d3.Selection<SVGGElement, unknown, null, undefined>

  /**
   * CSS class applied to all elements drawn by this call.
   * Callers use their operation-specific class so the elements can be
   * cleared independently of other annotations.
   */
  cssClass: string

  /** X position of the arrow (typically right of the plot area). */
  x: number

  /** Y coordinate of the top endpoint of the arrow. */
  topY: number

  /** Y coordinate of the bottom endpoint of the arrow. */
  bottomY: number

  /** Stroke colour. Defaults to red (#ef4444). */
  color?: string

  /** Label drawn to the right of the arrow mid-point (e.g. "Difference: 12.3"). */
  label?: string

  /** SVG root — required when label is provided. */
  svg?: d3.Selection<SVGSVGElement, unknown, null, undefined>

  /** Viewport for collision-aware label placement. */
  viewport?: AnnotationViewport

  /**
   * Horizontal reference lines drawn in Phase 1 (before the vertical arrow).
   * Each line grows from `startX` → `x` (the arrow column) at the given `y`.
   * These are animated concurrently with `phaseOnePromises`.
   */
  refLines?: Array<{ startX: number; y: number }>

  /**
   * Additional transition promises to await during Phase 1 (concurrently with
   * reference line animations). Pass value-label `.end().catch(()=>{})` promises
   * here so they complete before the vertical arrow appears.
   */
  phaseOnePromises?: Promise<void>[]
}

/**
 * Draws a vertical double-headed comparison arrow spanning topY → bottomY at
 * a fixed x position, optionally preceded by horizontal reference lines.
 *
 * Used by the **diff** operation (simpleBar, simpleLine, multipleLine) to show
 * the magnitude of the gap between two reference values.
 *
 * Animation sequence:
 *   Phase 1 — reference lines grow from startX → x, and any caller-provided
 *             promises (e.g. value-label fade-ins) complete concurrently.
 *   Phase 2 — vertical shaft expands from midpoint to topY/bottomY.
 *   Phase 3 — arrowheads appear; difference label is placed.
 */
export async function drawVerticalComparisonArrow(
  opts: VerticalComparisonArrowOptions,
): Promise<void> {
  const { layer, cssClass, x, topY, bottomY, label, svg, viewport } = opts
  const color = opts.color ?? COLORS.ANNOTATION_RED

  // -- Phase 1: horizontal reference lines + concurrent caller promises ----
  const phase1: Promise<void>[] = [...(opts.phaseOnePromises ?? [])]

  if (opts.refLines) {
    for (const { startX, y } of opts.refLines) {
      const refLine = layer
        .append(SvgElements.Line)
        .attr(SvgAttributes.Class, `${SvgClassNames.LineAnnotation} ${cssClass}`)
        .attr(SvgAttributes.X1, startX)
        .attr(SvgAttributes.X2, startX)   // collapsed; animates to x
        .attr(SvgAttributes.Y1, y)
        .attr(SvgAttributes.Y2, y)
        .attr(SvgAttributes.Stroke, color)
        .attr(SvgAttributes.StrokeWidth, 2)

      phase1.push(
        refLine
          .transition()
          .duration(DURATIONS.HIGHLIGHT)
          .ease(EASINGS.SMOOTH)
          .attr(SvgAttributes.X2, x)
          .end()
          .catch(() => { /* interrupted */ }),
      )
    }
  }

  if (phase1.length > 0) await Promise.all(phase1)

  // -- Phase 2: vertical arrow shaft ---------------------------------------
  const shaft = layer
    .append(SvgElements.Line)
    .attr(SvgAttributes.Class, `${SvgClassNames.LineAnnotation} ${cssClass}`)
    .attr(SvgAttributes.X1, x)
    .attr(SvgAttributes.X2, x)
    .attr(SvgAttributes.Y1, (topY + bottomY) / 2)  // start collapsed at midpoint
    .attr(SvgAttributes.Y2, (topY + bottomY) / 2)
    .attr(SvgAttributes.Stroke, color)
    .attr(SvgAttributes.StrokeWidth, 2)

  try {
    await shaft
      .transition()
      .duration(DURATIONS.HIGHLIGHT)
      .ease(EASINGS.SMOOTH)
      .attr(SvgAttributes.Y1, topY)
      .attr(SvgAttributes.Y2, bottomY)
      .end()
  } catch { /* interrupted */ }

  // -- Phase 3: arrowheads (double-headed: 2 at top, 2 at bottom) ----------
  const heads = [
    { x1: x, y1: topY,    x2: x - VERTICAL_HEAD_SIZE_PX, y2: topY    + VERTICAL_HEAD_SIZE_PX },
    { x1: x, y1: topY,    x2: x + VERTICAL_HEAD_SIZE_PX, y2: topY    + VERTICAL_HEAD_SIZE_PX },
    { x1: x, y1: bottomY, x2: x - VERTICAL_HEAD_SIZE_PX, y2: bottomY - VERTICAL_HEAD_SIZE_PX },
    { x1: x, y1: bottomY, x2: x + VERTICAL_HEAD_SIZE_PX, y2: bottomY - VERTICAL_HEAD_SIZE_PX },
  ]

  layer
    .selectAll<SVGLineElement, (typeof heads)[number]>(`line.${cssClass}.arrow-head-enter`)
    .data(heads)
    .enter()
    .append(SvgElements.Line)
    .attr(SvgAttributes.Class, `${SvgClassNames.LineAnnotation} ${cssClass} arrow-head`)
    .attr(SvgAttributes.X1, (d) => d.x1)
    .attr(SvgAttributes.Y1, (d) => d.y1)
    .attr(SvgAttributes.X2, (d) => d.x2)
    .attr(SvgAttributes.Y2, (d) => d.y2)
    .attr(SvgAttributes.Stroke, color)
    .attr(SvgAttributes.StrokeWidth, 2)

  // -- Difference label (optional) -----------------------------------------
  if (!label || !svg || !viewport) return

  const labelX = x + 12
  const labelY = (topY + bottomY) / 2

  const labelNode = layer
    .append(SvgElements.Text)
    .attr(SvgAttributes.Class, `${SvgClassNames.TextAnnotation} ${cssClass} difference-label`)
    .attr(SvgAttributes.X, labelX)
    .attr(SvgAttributes.Y, labelY)
    .attr(SvgAttributes.DominantBaseline, 'middle')
    .attr(SvgAttributes.FontSize, 12)
    .attr(SvgAttributes.FontWeight, 700)
    .attr(SvgAttributes.Fill, color)
    .text(label)

  placeOperationTextLabel({
    svg,
    text: labelNode,
    preferred: { x: labelX, y: labelY },
    viewport,
  })
}

// ---------------------------------------------------------------------------
// drawDirectionalArrow
// ---------------------------------------------------------------------------

export interface DirectionalArrowOptions {
  /** Annotation <g> layer (from ensureAnnotationLayer). */
  layer: d3.Selection<SVGGElement, unknown, null, undefined>

  /**
   * CSS class applied to all elements drawn by this call.
   * Arrow heads get an additional `arrow-head` sub-class.
   */
  cssClass: string

  /** Raw start point (e.g. centre of the source circle in SVG coordinates). */
  fromX: number
  fromY: number

  /** Raw end point (e.g. centre of the target circle in SVG coordinates). */
  toX: number
  toY: number

  /** Stroke colour. Defaults to cyan (#0ea5e9) as used by lagDiff. */
  color?: string

  /** Shaft stroke-width. Defaults to 2; set to 4 when strengthening. */
  strokeWidth?: number

  /** Label drawn perpendicular to the arrow mid-point. */
  label?: string

  /** SVG root — required when label is provided. */
  svg?: d3.Selection<SVGSVGElement, unknown, null, undefined>

  /** Viewport for collision-aware label placement. */
  viewport?: AnnotationViewport

  /**
   * Written as `data-target` on the shaft element.
   * Required so TASK 9's strengthenLagDiffArrow / strengthenPairDiffArrow can
   * select this specific arrow by target key without positional lookup.
   */
  targetKey?: string

  /**
   * Written as `data-prev-target` on the shaft element.
   * Used by lagDiff arrows where the arrow represents the step from
   * prevTarget → target.
   */
  prevTargetKey?: string
}

/**
 * Draws a directional (single-headed) arrow from `from` to `to`, offset by
 * ENDPOINT_PADDING_PX so the shaft does not overlap point markers.
 *
 * Used by **lagDiff** and **pairDiff** operations to represent the direction
 * and magnitude of change between consecutive or paired data points.
 *
 * Arrow head geometry uses the normalized unit vector of the shaft, so the
 * chevron always points in the direction of travel regardless of angle.
 *
 * Animation:
 *   1. Shaft draws from start to end (DURATIONS.HIGHLIGHT).
 *   2. Arrow head lines fade in after a short delay (HEAD_FADE_DELAY_MS).
 *
 * Returns an array of transition Promises so the caller can batch them with
 * Promise.all when drawing many arrows simultaneously.
 */
export function drawDirectionalArrow(opts: DirectionalArrowOptions): Promise<void>[] {
  const { layer, cssClass, fromX, fromY, toX, toY, label, svg, viewport } = opts
  const color = opts.color ?? COLORS.ANNOTATION_BLUE
  const strokeWidth = opts.strokeWidth ?? 2

  const dx = toX - fromX
  const dy = toY - fromY
  const distance = Math.hypot(dx, dy)

  // Skip degenerate arrows (same point or nearly so).
  if (distance < 1) return []

  // Unit vector along the shaft, and its perpendicular (for head and label).
  const ux = dx / distance
  const uy = dy / distance
  const perpX = -uy
  const perpY = ux

  // Inset shaft endpoints so arrows don't overlap the circle markers.
  const startX = fromX + ux * ENDPOINT_PADDING_PX
  const startY = fromY + uy * ENDPOINT_PADDING_PX
  const endX   = toX   - ux * ENDPOINT_PADDING_PX
  const endY   = toY   - uy * ENDPOINT_PADDING_PX

  // Arrow head chevron base point (recessed from the tip along the shaft).
  const headBaseX = endX - ux * HEAD_LENGTH_PX
  const headBaseY = endY - uy * HEAD_LENGTH_PX

  const transitions: Promise<void>[] = []

  // -- Shaft ---------------------------------------------------------------
  const shaftSelection = layer
    .append(SvgElements.Line)
    .attr(SvgAttributes.Class, `${SvgClassNames.LineAnnotation} ${cssClass}`)
    .attr(SvgAttributes.X1, startX)
    .attr(SvgAttributes.Y1, startY)
    .attr(SvgAttributes.X2, startX)   // collapsed; animates to endX/endY
    .attr(SvgAttributes.Y2, startY)
    .attr(SvgAttributes.Stroke, color)
    .attr(SvgAttributes.StrokeWidth, strokeWidth)
    .style(SvgAttributes.Opacity, 0.9)

  // Attach target keys so strengthen steps can select this element by datum.
  if (opts.targetKey != null) {
    shaftSelection.attr('data-target', opts.targetKey)
  }
  if (opts.prevTargetKey != null) {
    shaftSelection.attr('data-prev-target', opts.prevTargetKey)
  }

  transitions.push(
    shaftSelection
      .transition()
      .duration(DURATIONS.HIGHLIGHT)
      .ease(EASINGS.SMOOTH)
      .attr(SvgAttributes.X2, endX)
      .attr(SvgAttributes.Y2, endY)
      .end()
      .catch(() => { /* interrupted */ }),
  )

  // -- Arrow head (chevron, single-headed, pointing at toX/toY) -----------
  const headPoints = [
    { x1: endX, y1: endY, x2: headBaseX + perpX * HEAD_HALF_WIDTH_PX, y2: headBaseY + perpY * HEAD_HALF_WIDTH_PX },
    { x1: endX, y1: endY, x2: headBaseX - perpX * HEAD_HALF_WIDTH_PX, y2: headBaseY - perpY * HEAD_HALF_WIDTH_PX },
  ]

  headPoints.forEach((head) => {
    // Attach data-target to arrow heads so strengthen selectors (which use
    // `line.CLASS[data-target="X"]`) can select both shaft and heads together.
    const headEl = layer
      .append(SvgElements.Line)
      .attr(SvgAttributes.Class, `${SvgClassNames.LineAnnotation} ${cssClass} arrow-head`)
      .attr(SvgAttributes.X1, head.x1)
      .attr(SvgAttributes.Y1, head.y1)
      .attr(SvgAttributes.X2, head.x2)
      .attr(SvgAttributes.Y2, head.y2)
      .attr(SvgAttributes.Stroke, color)
      .attr(SvgAttributes.StrokeWidth, strokeWidth)
      .style(SvgAttributes.Opacity, 0)

    if (opts.targetKey != null) headEl.attr('data-target', opts.targetKey)

    transitions.push(
      headEl
        .transition()
        .delay(HEAD_FADE_DELAY_MS)
        .duration(HEAD_FADE_DURATION_MS)
        .style(SvgAttributes.Opacity, 0.9)
        .end()
        .catch(() => { /* interrupted */ }),
    )
  })

  // -- Label (optional, offset perpendicular to the shaft mid-point) ------
  if (label && svg && viewport) {
    const labelX = (fromX + toX) / 2 + perpX * 18
    const labelY = (fromY + toY) / 2 + perpY * 18

    const labelNode = layer
      .append(SvgElements.Text)
      .attr(SvgAttributes.Class, `${SvgClassNames.TextAnnotation} ${cssClass}`)
      .attr(SvgAttributes.X, labelX)
      .attr(SvgAttributes.Y, Math.max(12, labelY))
      .attr(SvgAttributes.TextAnchor, 'middle')
      .attr(SvgAttributes.DominantBaseline, 'middle')
      .attr(SvgAttributes.FontSize, 12)
      .attr(SvgAttributes.FontWeight, 700)
      .attr(SvgAttributes.Fill, color)
      .style(SvgAttributes.Opacity, 0)
      .text(label)

    placeOperationTextLabel({
      svg,
      text: labelNode,
      preferred: { x: labelX, y: Math.max(12, labelY) },
      viewport,
    })

    transitions.push(
      labelNode
        .transition()
        .delay(HEAD_FADE_DELAY_MS)
        .duration(DURATIONS.LABEL_FADE_IN)
        .style(SvgAttributes.Opacity, 1)
        .end()
        .catch(() => { /* interrupted */ }),
    )
  }

  return transitions
}

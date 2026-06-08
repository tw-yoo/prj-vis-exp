import type * as d3 from 'd3'
import { SvgAttributes, SvgClassNames, SvgElements } from '../../rendering/interfaces'
import { COLORS, DURATIONS, EASINGS } from '../../rendering/common/d3Helpers'
import { placeOperationTextLabel } from './placeLabel'
import { annotationFontSize, type AnnotationViewport } from './annotationLayer'

const ENDPOINT_PADDING_PX = 8
const HEAD_LENGTH_PX = 10
const HEAD_HALF_WIDTH_PX = 5
const VERTICAL_HEAD_SIZE_PX = 8
const HEAD_FADE_DELAY_MS = 700
const HEAD_FADE_DURATION_MS = 200

export interface VerticalComparisonArrowOptions {
  layer: d3.Selection<SVGGElement, unknown, null, undefined>
  cssClass: string
  x: number
  topY: number
  bottomY: number
  color?: string
  label?: string
  svg?: d3.Selection<SVGSVGElement, unknown, null, undefined>
  viewport?: AnnotationViewport
  refLines?: Array<{ startX: number; y: number }>
  phaseOnePromises?: Promise<void>[]
}

/**
 * Vertical double-headed arrow spanning topY..bottomY at x.
 *   Phase 1 — ref lines grow startX → x + caller phaseOnePromises run.
 *   Phase 2 — vertical shaft expands from midpoint.
 *   Phase 3 — arrowheads appear; difference label placed.
 */
export async function drawVerticalComparisonArrow(opts: VerticalComparisonArrowOptions): Promise<void> {
  const { layer, cssClass, x, topY, bottomY, label, svg, viewport } = opts
  const color = opts.color ?? COLORS.ANNOTATION_RED

  const phase1: Promise<void>[] = [...(opts.phaseOnePromises ?? [])]

  if (opts.refLines) {
    for (const { startX, y } of opts.refLines) {
      const refLine = layer
        .append(SvgElements.Line)
        .attr(SvgAttributes.Class, `${SvgClassNames.LineAnnotation} ${cssClass}`)
        .attr(SvgAttributes.X1, startX)
        .attr(SvgAttributes.X2, startX)
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
          .catch(() => {}),
      )
    }
  }
  if (phase1.length > 0) await Promise.all(phase1)

  const shaft = layer
    .append(SvgElements.Line)
    .attr(SvgAttributes.Class, `${SvgClassNames.LineAnnotation} ${cssClass}`)
    .attr(SvgAttributes.X1, x)
    .attr(SvgAttributes.X2, x)
    .attr(SvgAttributes.Y1, (topY + bottomY) / 2)
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
  } catch {
    /* interrupted */
  }

  const heads = [
    { x1: x, y1: topY, x2: x - VERTICAL_HEAD_SIZE_PX, y2: topY + VERTICAL_HEAD_SIZE_PX },
    { x1: x, y1: topY, x2: x + VERTICAL_HEAD_SIZE_PX, y2: topY + VERTICAL_HEAD_SIZE_PX },
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

  if (!label || !svg || !viewport) return

  const labelX = x + 12
  const labelY = (topY + bottomY) / 2
  const labelNode = layer
    .append(SvgElements.Text)
    .attr(SvgAttributes.Class, `${SvgClassNames.TextAnnotation} ${cssClass} difference-label`)
    .attr(SvgAttributes.X, labelX)
    .attr(SvgAttributes.Y, labelY)
    .attr(SvgAttributes.DominantBaseline, 'middle')
    .attr(SvgAttributes.FontSize, annotationFontSize(svg.node()))
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

export interface DirectionalArrowOptions {
  layer: d3.Selection<SVGGElement, unknown, null, undefined>
  cssClass: string
  fromX: number
  fromY: number
  toX: number
  toY: number
  color?: string
  strokeWidth?: number
  label?: string
  svg?: d3.Selection<SVGSVGElement, unknown, null, undefined>
  viewport?: AnnotationViewport
  targetKey?: string
  prevTargetKey?: string
}

/**
 * Single-headed directional arrow with endpoint padding so the shaft doesn't
 * overlap point markers. Returns Promise[] for batched awaiting (one shaft +
 * two head fades + optional label).
 */
export function drawDirectionalArrow(opts: DirectionalArrowOptions): Promise<void>[] {
  const { layer, cssClass, fromX, fromY, toX, toY, label, svg, viewport } = opts
  const color = opts.color ?? COLORS.ANNOTATION_BLUE
  const strokeWidth = opts.strokeWidth ?? 2

  const dx = toX - fromX
  const dy = toY - fromY
  const distance = Math.hypot(dx, dy)
  if (distance < 1) return []

  const ux = dx / distance
  const uy = dy / distance
  const perpX = -uy
  const perpY = ux
  const startX = fromX + ux * ENDPOINT_PADDING_PX
  const startY = fromY + uy * ENDPOINT_PADDING_PX
  const endX = toX - ux * ENDPOINT_PADDING_PX
  const endY = toY - uy * ENDPOINT_PADDING_PX
  const headBaseX = endX - ux * HEAD_LENGTH_PX
  const headBaseY = endY - uy * HEAD_LENGTH_PX

  const transitions: Promise<void>[] = []

  const shaft = layer
    .append(SvgElements.Line)
    .attr(SvgAttributes.Class, `${SvgClassNames.LineAnnotation} ${cssClass}`)
    .attr(SvgAttributes.X1, startX)
    .attr(SvgAttributes.Y1, startY)
    .attr(SvgAttributes.X2, startX)
    .attr(SvgAttributes.Y2, startY)
    .attr(SvgAttributes.Stroke, color)
    .attr(SvgAttributes.StrokeWidth, strokeWidth)
    .style(SvgAttributes.Opacity, 0.9)
  if (opts.targetKey != null) shaft.attr('data-target', opts.targetKey)
  if (opts.prevTargetKey != null) shaft.attr('data-prev-target', opts.prevTargetKey)

  transitions.push(
    shaft
      .transition()
      .duration(DURATIONS.HIGHLIGHT)
      .ease(EASINGS.SMOOTH)
      .attr(SvgAttributes.X2, endX)
      .attr(SvgAttributes.Y2, endY)
      .end()
      .catch(() => {}),
  )

  const headPoints = [
    { x1: endX, y1: endY, x2: headBaseX + perpX * HEAD_HALF_WIDTH_PX, y2: headBaseY + perpY * HEAD_HALF_WIDTH_PX },
    { x1: endX, y1: endY, x2: headBaseX - perpX * HEAD_HALF_WIDTH_PX, y2: headBaseY - perpY * HEAD_HALF_WIDTH_PX },
  ]
  headPoints.forEach((head) => {
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
        .catch(() => {}),
    )
  })

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
      .attr(SvgAttributes.FontSize, annotationFontSize(svg.node()))
      .attr(SvgAttributes.FontWeight, 700)
      .attr(SvgAttributes.Fill, color)
      .style(SvgAttributes.Opacity, 0)
      .text(label)
    if (opts.targetKey != null) labelNode.attr('data-target', opts.targetKey)
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
        .catch(() => {}),
    )
  }

  return transitions
}

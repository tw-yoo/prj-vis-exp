import { SvgAttributes, SvgClassNames, SvgElements } from '../interfaces'
import { COLORS } from '../common/d3Helpers'
import { escapePrimitiveKey, primitiveDiff, type PrimitiveImpl, type SvgSelection } from './types'

export interface DifferenceArrowParams {
  y1: number
  y2: number
  placement: 'right-edge' | 'inline'
  x?: number
  arrowHead: 'double' | 'single-up' | 'single-down'
  label: { text: string; position: 'mid' | 'top' | 'bottom' }
  color?: string
}

const HEAD_SIZE = 8

/** F2 difference-arrow primitive for right-edge and inline delta encoding. */
export const differenceArrowPrimitive: PrimitiveImpl<DifferenceArrowParams> = {
  async apply(svg, params, ctx, withTransition) {
    const semanticKey = differenceArrowSemanticKey(params)
    const layer = ensurePrimitiveLayer(svg)
    const x = params.placement === 'inline' && Number.isFinite(params.x ?? NaN)
      ? Number(params.x)
      : ctx.plot.w + 32
    const topY = Math.min(params.y1, params.y2)
    const bottomY = Math.max(params.y1, params.y2)
    const midY = (topY + bottomY) / 2
    const color = params.color ?? COLORS.ANNOTATION_RED

    const shaft = layer
      .selectAll<SVGLineElement, DifferenceArrowParams>(`line[data-semantic-key="${escapePrimitiveKey(semanticKey)}"].difference-arrow-shaft`)
      .data([params])
      .join(SvgElements.Line)
      .attr('data-semantic-key', semanticKey)
      .attr(SvgAttributes.Class, `${SvgClassNames.LineAnnotation} difference-arrow-shaft`)
      .attr(SvgAttributes.X1, x)
      .attr(SvgAttributes.X2, x)
      .attr(SvgAttributes.Stroke, color)
      .attr(SvgAttributes.StrokeWidth, 2)

    if (withTransition) {
      shaft.attr(SvgAttributes.Y1, midY).attr(SvgAttributes.Y2, midY).transition().duration(300).attr(SvgAttributes.Y1, topY).attr(SvgAttributes.Y2, bottomY)
    } else {
      shaft.attr(SvgAttributes.Y1, topY).attr(SvgAttributes.Y2, bottomY)
    }

    const heads = buildArrowHeads(x, topY, bottomY, params.arrowHead)
    layer
      .selectAll<SVGLineElement, (typeof heads)[number]>(`line[data-semantic-key="${escapePrimitiveKey(semanticKey)}"].difference-arrow-head`)
      .data(heads)
      .join(SvgElements.Line)
      .attr('data-semantic-key', semanticKey)
      .attr(SvgAttributes.Class, `${SvgClassNames.LineAnnotation} difference-arrow-head`)
      .attr(SvgAttributes.X1, (datum) => datum.x1)
      .attr(SvgAttributes.Y1, (datum) => datum.y1)
      .attr(SvgAttributes.X2, (datum) => datum.x2)
      .attr(SvgAttributes.Y2, (datum) => datum.y2)
      .attr(SvgAttributes.Stroke, color)
      .attr(SvgAttributes.StrokeWidth, 2)

    const labelY = params.label.position === 'top' ? topY : params.label.position === 'bottom' ? bottomY : midY
    layer
      .selectAll<SVGTextElement, DifferenceArrowParams>(`text[data-semantic-key="${escapePrimitiveKey(semanticKey)}"]`)
      .data([params])
      .join(SvgElements.Text)
      .attr('data-semantic-key', semanticKey)
      .attr(SvgAttributes.Class, `${SvgClassNames.TextAnnotation} difference-arrow-label`)
      .attr(SvgAttributes.X, x + 12)
      .attr(SvgAttributes.Y, labelY)
      .attr(SvgAttributes.DominantBaseline, 'middle')
      .attr(SvgAttributes.FontSize, 12)
      .attr(SvgAttributes.FontWeight, 700)
      .attr(SvgAttributes.Fill, color)
      .text(params.label.text)
  },
  async remove(svg, semanticKey) {
    svg.selectAll(`[data-semantic-key="${escapePrimitiveKey(semanticKey)}"]`).remove()
  },
  diff: primitiveDiff,
}

export function differenceArrowSemanticKey(params: DifferenceArrowParams): string {
  const xPart = params.placement === 'inline' ? `:x=${params.x ?? 'auto'}` : ''
  return `f2:diff:y1=${params.y1}:y2=${params.y2}:placement=${params.placement}${xPart}`
}

function ensurePrimitiveLayer(svg: SvgSelection) {
  const existing = svg.select<SVGGElement>('g.rendering-primitive-layer')
  if (!existing.empty()) return existing
  return svg.append(SvgElements.Group).attr(SvgAttributes.Class, `${SvgClassNames.AnnotationLayer} rendering-primitive-layer`)
}

function buildArrowHeads(x: number, topY: number, bottomY: number, mode: DifferenceArrowParams['arrowHead']) {
  const heads: Array<{ x1: number; y1: number; x2: number; y2: number }> = []
  if (mode === 'double' || mode === 'single-up') {
    heads.push({ x1: x, y1: topY, x2: x - HEAD_SIZE, y2: topY + HEAD_SIZE })
    heads.push({ x1: x, y1: topY, x2: x + HEAD_SIZE, y2: topY + HEAD_SIZE })
  }
  if (mode === 'double' || mode === 'single-down') {
    heads.push({ x1: x, y1: bottomY, x2: x - HEAD_SIZE, y2: bottomY - HEAD_SIZE })
    heads.push({ x1: x, y1: bottomY, x2: x + HEAD_SIZE, y2: bottomY - HEAD_SIZE })
  }
  return heads
}

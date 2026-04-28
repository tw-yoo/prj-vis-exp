import { SvgAttributes, SvgClassNames, SvgElements } from '../interfaces'
import { escapePrimitiveKey, primitiveDiff, type PrimitiveImpl } from './types'

export interface TextLabelParams {
  text: string
  anchor: { x: number; y: number }
  role: 'value' | 'axis' | 'caption' | 'legend'
}

export interface AxisRelabelParams {
  axis: 'x' | 'y'
  labels: string[]
}

/** F5 textual augmentation primitive for value labels, captions, and relabeling hooks. */
export const textAnnotationPrimitive: PrimitiveImpl<TextLabelParams> = {
  async apply(svg, params) {
    const semanticKey = textAnnotationSemanticKey(params)
    const layer = svg.select<SVGGElement>('g.rendering-primitive-layer').empty()
      ? svg.append(SvgElements.Group).attr(SvgAttributes.Class, `${SvgClassNames.AnnotationLayer} rendering-primitive-layer`)
      : svg.select<SVGGElement>('g.rendering-primitive-layer')
    layer
      .selectAll<SVGTextElement, TextLabelParams>(`text[data-semantic-key="${escapePrimitiveKey(semanticKey)}"]`)
      .data([params])
      .join(SvgElements.Text)
      .attr('data-semantic-key', semanticKey)
      .attr(SvgAttributes.Class, `${SvgClassNames.TextAnnotation} primitive-text-${params.role}`)
      .attr(SvgAttributes.X, params.anchor.x)
      .attr(SvgAttributes.Y, params.anchor.y)
      .attr(SvgAttributes.FontSize, 12)
      .attr(SvgAttributes.FontWeight, params.role === 'value' ? 700 : 500)
      .text(params.text)
  },
  async remove(svg, semanticKey) {
    svg.selectAll(`[data-semantic-key="${escapePrimitiveKey(semanticKey)}"]`).remove()
  },
  diff: primitiveDiff,
}

export function createTextLabel(params: TextLabelParams) {
  return params
}

export function relabelAxis(params: AxisRelabelParams) {
  return params
}

export function textAnnotationSemanticKey(params: TextLabelParams): string {
  return `f5:text:role=${params.role}:x=${params.anchor.x}:y=${params.anchor.y}:text=${params.text}`
}

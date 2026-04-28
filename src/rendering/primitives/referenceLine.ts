import { SvgAttributes, SvgClassNames, SvgElements } from '../interfaces'
import { COLORS } from '../common/d3Helpers'
import { escapePrimitiveKey, primitiveDiff, type PrimitiveImpl, type SvgSelection } from './types'

export type ReferenceLineScope =
  | { kind: 'full' }
  | { kind: 'xRange'; xStart: number; xEnd: number }
  | { kind: 'xGroup'; group: string }

export interface ReferenceLineParams {
  y: number
  scope: ReferenceLineScope
  style: 'solid' | 'dashed'
  label?: { text: string; align: 'start' | 'middle' | 'end' }
  color?: string
}

/** F1 reference-line primitive for full, local, ranged, and dashed anchors. */
export const referenceLinePrimitive: PrimitiveImpl<ReferenceLineParams> = {
  async apply(svg, params, ctx, withTransition) {
    const semanticKey = referenceLineSemanticKey(params)
    const layer = ensurePrimitiveLayer(svg)
    const { x1, x2 } = resolveScopeX(params.scope, ctx.plot.w)
    const line = layer
      .selectAll<SVGLineElement, ReferenceLineParams>(`line[data-semantic-key="${escapePrimitiveKey(semanticKey)}"]`)
      .data([params])
      .join(SvgElements.Line)
      .attr('data-semantic-key', semanticKey)
      .attr(SvgAttributes.Class, `${SvgClassNames.LineAnnotation} primitive-reference-line`)
      .attr(SvgAttributes.X1, x1)
      .attr(SvgAttributes.Y1, params.y)
      .attr(SvgAttributes.Y2, params.y)
      .attr(SvgAttributes.Stroke, params.color ?? COLORS.ANNOTATION_RED)
      .attr(SvgAttributes.StrokeWidth, 2)
      .attr(SvgAttributes.StrokeDasharray, params.style === 'dashed' ? '4 4' : null)

    if (withTransition) {
      line.attr(SvgAttributes.X2, x1).transition().duration(300).attr(SvgAttributes.X2, x2)
    } else {
      line.attr(SvgAttributes.X2, x2)
    }

    if (params.label) {
      const labelX = params.label.align === 'start' ? x1 : params.label.align === 'middle' ? (x1 + x2) / 2 : x2
      layer
        .selectAll<SVGTextElement, ReferenceLineParams>(`text[data-semantic-key="${escapePrimitiveKey(semanticKey)}"]`)
        .data([params])
        .join(SvgElements.Text)
        .attr('data-semantic-key', semanticKey)
        .attr(SvgAttributes.Class, `${SvgClassNames.TextAnnotation} primitive-reference-line-label`)
        .attr(SvgAttributes.X, labelX)
        .attr(SvgAttributes.Y, Math.max(12, params.y - 8))
        .attr(SvgAttributes.TextAnchor, params.label.align)
        .attr(SvgAttributes.FontSize, 12)
        .attr(SvgAttributes.FontWeight, 700)
        .attr(SvgAttributes.Fill, params.color ?? COLORS.ANNOTATION_RED)
        .text(params.label.text)
    }
  },
  async remove(svg, semanticKey) {
    svg.selectAll(`[data-semantic-key="${escapePrimitiveKey(semanticKey)}"]`).remove()
  },
  diff: primitiveDiff,
}

export function referenceLineSemanticKey(params: ReferenceLineParams): string {
  const scope =
    params.scope.kind === 'full'
      ? 'full'
      : params.scope.kind === 'xRange'
        ? `x[${params.scope.xStart}..${params.scope.xEnd}]`
        : `group=${params.scope.group}`
  return `f1:reference:y=${params.y}:scope=${scope}:style=${params.style}`
}

function ensurePrimitiveLayer(svg: SvgSelection) {
  const existing = svg.select<SVGGElement>('g.rendering-primitive-layer')
  if (!existing.empty()) return existing
  return svg.append(SvgElements.Group).attr(SvgAttributes.Class, `${SvgClassNames.AnnotationLayer} rendering-primitive-layer`)
}

function resolveScopeX(scope: ReferenceLineScope, plotWidth: number) {
  if (scope.kind === 'xRange') return { x1: scope.xStart, x2: scope.xEnd }
  return { x1: 0, x2: plotWidth }
}

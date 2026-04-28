import type * as d3 from 'd3'
import { OPACITIES } from '../common/d3Helpers'
import { primitiveDiff, type PrimitiveImpl } from './types'

export type SalienceLevel = 'highlight' | 'dim' | 'grayscale' | 'remove'

export type MarkSalienceSelection =
  | { kind: 'predicate'; predicate: (node: SVGElement) => boolean }
  | { kind: 'datumKeys'; keys: string[] }

export interface MarkSalienceParams {
  selection: MarkSalienceSelection
  level: SalienceLevel
  reversible: boolean
}

/** F3 salience primitive for highlight, dim, grayscale, and remove policies. */
export const markSaliencePrimitive: PrimitiveImpl<MarkSalienceParams> = {
  async apply(svg, params) {
    const marks = svg.selectAll<SVGElement, unknown>('rect, circle, path')
    applyMarkSalience({ marks, ...params })
  },
  async remove(svg) {
    svg.selectAll<SVGElement, unknown>('rect, circle, path')
      .style('opacity', null)
      .style('filter', null)
      .style('display', null)
  },
  diff: primitiveDiff,
}

export function markSalienceSemanticKey(params: MarkSalienceParams): string {
  const targetPart = params.selection.kind === 'datumKeys' ? params.selection.keys.slice().sort().join(',') : 'predicate'
  return `f3:salience:level=${params.level}:targets=[${targetPart}]`
}

export function applyMarkSalience(args: MarkSalienceParams & { marks: d3.Selection<SVGElement, unknown, d3.BaseType, unknown> }) {
  const { marks, selection, level } = args
  const selected = selection.kind === 'predicate'
    ? selection.predicate
    : (node: SVGElement) => selection.keys.includes(node.getAttribute('data-id') ?? node.getAttribute('data-target') ?? '')

  marks.each(function () {
    const node = this as SVGElement
    const inScope = selected(node)
    if (level === 'remove') {
      node.style.display = inScope ? '' : 'none'
      return
    }
    node.style.display = ''
    node.style.opacity = level === 'highlight'
      ? inScope ? String(OPACITIES.FULL) : String(OPACITIES.DIM)
      : level === 'dim'
        ? inScope ? String(OPACITIES.FULL) : String(OPACITIES.DIM)
        : String(inScope ? OPACITIES.FULL : 0.35)
    node.style.filter = level === 'grayscale' && !inScope ? 'grayscale(1)' : ''
  })
}

export function strengthenAnnotation(args: { svg: d3.Selection<SVGSVGElement, unknown, null, undefined>; semanticKey: string }) {
  args.svg
    .selectAll<SVGElement, unknown>(`[data-semantic-key="${args.semanticKey.replace(/"/g, '\\"')}"]`)
    .attr('stroke-width', 3)
    .style('opacity', '1')
}

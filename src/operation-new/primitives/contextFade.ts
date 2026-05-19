import type * as d3 from 'd3'
import { SvgAttributes, SvgClassNames } from '../../rendering/interfaces'
import { STYLES } from '../../rendering/common/d3Helpers'
import type { AnnotationRecord } from '../../operation-next/chainState'

const CONTEXT_TRANSITION_MS = 200
const FILTER_CONTEXT_OPACITY = 0.4
const LABEL_CONTEXT_OPACITY = 0.6

/**
 * Fades prior persistent annotations (filter, diff, lagDiff, …) to a context
 * style — dashed + reduced opacity for the filter threshold line, plain
 * reduced opacity for other anchor lines, and 0.6 opacity for all prior text
 * labels. Fire-and-forget; safe to call before drawing the new annotation.
 *
 * The fade is op-agnostic — it reads what was drawn from `annotationRecords`
 * rather than naming any particular operation.
 */
export function applyAnnotationContextFade(
  layer: d3.Selection<SVGGElement, unknown, d3.BaseType, unknown>,
  annotationRecords: AnnotationRecord[],
  filterClass: string,
): void {
  const hasFilter = annotationRecords.some((r) => r.cssClass === filterClass && r.persistent)
  if (hasFilter) {
    layer
      .selectAll<SVGLineElement, unknown>(`line.${filterClass}`)
      .interrupt()
      .transition()
      .duration(CONTEXT_TRANSITION_MS)
      .style(SvgAttributes.Opacity, FILTER_CONTEXT_OPACITY)
      .attr(SvgAttributes.StrokeDasharray, STYLES.GUIDELINE.strokeDasharray)
  }

  for (const record of annotationRecords) {
    if (record.persistent && record.cssClass !== filterClass) {
      layer
        .selectAll<SVGLineElement, unknown>(`line.${record.cssClass}`)
        .interrupt()
        .transition()
        .duration(CONTEXT_TRANSITION_MS)
        .style(SvgAttributes.Opacity, FILTER_CONTEXT_OPACITY)
    }
  }

  layer
    .selectAll<SVGTextElement, unknown>(`text.${SvgClassNames.TextAnnotation}`)
    .interrupt()
    .transition()
    .duration(CONTEXT_TRANSITION_MS)
    .style(SvgAttributes.Opacity, LABEL_CONTEXT_OPACITY)
}

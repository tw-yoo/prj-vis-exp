import type * as d3 from 'd3'
import { SvgAttributes, SvgClassNames } from '../../rendering/interfaces'
import { STYLES } from '../../rendering/common/d3Helpers'
import type { AnnotationRecord } from '../../operation-next/chainState'
import { RESULT_REF_ATTRIBUTE } from '../../operation-next/diffEndpoint'

const CONTEXT_TRANSITION_MS = 200
const REMOVAL_TRANSITION_MS = 200
const FILTER_CONTEXT_OPACITY = 0.4
const LABEL_CONTEXT_OPACITY = 0.6

/**
 * Decides whether to fade-to-context or fade-out-and-remove each prior
 * annotation, based on whether its `operationId` is still referenced by the
 * current op or any future op (`referencedResultIds`).
 *
 *   - **Still referenced** (or no operationId on the record / no
 *     referencedResultIds passed): fade to context style — text to 0.6 opacity,
 *     filter threshold line to dashed + 0.4 opacity, other anchor lines to 0.4.
 *     Annotation stays in the DOM.
 *   - **Stale** (operationId exists AND not in referencedResultIds): fade
 *     opacity to 0 and remove from DOM. The corresponding records are also
 *     dropped from `annotationRecords` so they don't leak forward.
 *
 * Calls are fire-and-forget; safe to invoke before drawing new annotations.
 *
 * @param layer              The annotation `<g>` element selection.
 * @param annotationRecords  Records accumulated by earlier operations this
 *                           chain. **Mutated** to drop stale entries.
 * @param filterClass        CSS class of the filter annotation (chart-type-specific).
 * @param referencedResultIds Operation IDs (without `ref:` prefix) consumed by
 *                           the current op or any future op. Pass `undefined`
 *                           to preserve the legacy fade-to-context behaviour
 *                           across the board.
 */
export function applyAnnotationContextFade(
  layer: d3.Selection<SVGGElement, unknown, d3.BaseType, unknown>,
  annotationRecords: AnnotationRecord[],
  filterClass: string,
  referencedResultIds?: string[],
): void {
  const referencedSet = referencedResultIds == null
    ? null
    : new Set(referencedResultIds.map((id) => String(id).replace(/^ref:/, '').trim()).filter((id) => id.length > 0))

  const isStillReferenced = (record: AnnotationRecord) => {
    if (referencedSet == null) return true
    if (record.operationId == null) return true
    return referencedSet.has(record.operationId)
  }

  // 1. Fade-and-remove stale persistent annotations. We scan TWO sources
  //    because the review/workbench path runs each ops group in a separate
  //    `runChartOps` call, so `annotationRecords` is empty at the start of
  //    each call — but the DOM still carries prior annotations on the reused
  //    chart instance. Records cover the in-call case (multiple ops in one
  //    group); DOM scan covers the cross-call case.
  //
  // Note: removal is SYNCHRONOUS. An earlier attempt used a transition fade-
  // to-0 then remove, but queuing those transitions in the same task as the
  // following drawReferenceLine's line transition caused d3 to never fire the
  // line transition's 'end' event in some browser/scheduler conditions —
  // appliers hung indefinitely. Direct .remove() avoids the conflict.
  const staleClasses = new Set<string>()
  for (const record of annotationRecords) {
    if (!record.persistent) continue
    if (isStillReferenced(record)) continue
    if (record.operationId == null) continue
    staleClasses.add(record.cssClass)
    layer
      .selectAll<SVGElement, unknown>(`.${record.cssClass}[${RESULT_REF_ATTRIBUTE}="${record.operationId}"]`)
      .interrupt()
      .remove()
  }
  if (referencedSet != null) {
    layer
      .selectAll<SVGElement, unknown>(`[${RESULT_REF_ATTRIBUTE}]`)
      .filter(function () {
        const ref = this.getAttribute(RESULT_REF_ATTRIBUTE)
        return ref != null && !referencedSet.has(ref)
      })
      .interrupt()
      .remove()
  }
  if (staleClasses.size > 0) {
    for (let index = annotationRecords.length - 1; index >= 0; index -= 1) {
      const record = annotationRecords[index]
      if (record.persistent && record.operationId != null && staleClasses.has(record.cssClass) && !isStillReferenced(record)) {
        annotationRecords.splice(index, 1)
      }
    }
  }

  // 2. Fade-to-context for still-referenced persistent filter annotations.
  const hasReferencedFilter = annotationRecords.some(
    (r) => r.cssClass === filterClass && r.persistent && isStillReferenced(r),
  )
  if (hasReferencedFilter) {
    layer
      .selectAll<SVGLineElement, unknown>(`line.${filterClass}`)
      .interrupt()
      .transition()
      .duration(CONTEXT_TRANSITION_MS)
      .style(SvgAttributes.Opacity, FILTER_CONTEXT_OPACITY)
      .attr(SvgAttributes.StrokeDasharray, STYLES.GUIDELINE.strokeDasharray)
  }

  // 3. Fade-to-context for other still-referenced persistent anchor lines.
  for (const record of annotationRecords) {
    if (record.persistent && record.cssClass !== filterClass && isStillReferenced(record)) {
      layer
        .selectAll<SVGLineElement, unknown>(`line.${record.cssClass}`)
        .interrupt()
        .transition()
        .duration(CONTEXT_TRANSITION_MS)
        .style(SvgAttributes.Opacity, FILTER_CONTEXT_OPACITY)
    }
  }

  // 4. Fade remaining text annotations to context opacity (skipping the ones
  //    already being removed in step 1).
  layer
    .selectAll<SVGTextElement, unknown>(`text.${SvgClassNames.TextAnnotation}`)
    .filter(function () {
      const ref = this.getAttribute(RESULT_REF_ATTRIBUTE)
      if (ref != null && referencedSet != null && !referencedSet.has(ref)) return false
      return true
    })
    .interrupt()
    .transition()
    .duration(CONTEXT_TRANSITION_MS)
    .style(SvgAttributes.Opacity, LABEL_CONTEXT_OPACITY)
}

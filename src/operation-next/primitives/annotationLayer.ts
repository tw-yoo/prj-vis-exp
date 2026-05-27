import * as d3 from 'd3'
import { DataAttributes, SvgAttributes, SvgClassNames, SvgElements } from '../../rendering/interfaces'
import { STYLES } from '../../rendering/common/d3Helpers'
import type { AnnotationRecord } from '../chainState'
import { RESULT_REF_ATTRIBUTE } from '../diffEndpoint'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * CSS class applied to the single annotation <g> that sits above chart marks.
 * Exported so runners and other primitives can reference a consistent class name
 * rather than duplicating the string literal.
 */
export const ANNOTATION_LAYER_CLASS = 'operation-next-annotation-layer'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Bounding box of the annotation-safe area inside the SVG.
 * `width` intentionally extends `extraRight` pixels past the plot boundary
 * to give room for labels and arrows that spill beyond the axis.
 */
export interface AnnotationViewport {
  x: number
  y: number
  width: number
  height: number
}

function resolveSvgViewBox(
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
): AnnotationViewport | null {
  const node = svg.node()
  const viewBox = node?.viewBox?.baseVal
  if (viewBox && viewBox.width > 0 && viewBox.height > 0) {
    return { x: viewBox.x, y: viewBox.y, width: viewBox.width, height: viewBox.height }
  }

  const raw = svg.attr(SvgAttributes.ViewBox)?.trim() ?? ''
  const parts = raw.split(/\s+/).map(Number)
  if (parts.length === 4 && parts.every(Number.isFinite) && parts[2] > 0 && parts[3] > 0) {
    return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] }
  }

  return null
}

// ---------------------------------------------------------------------------
// ensureAnnotationLayer
// ---------------------------------------------------------------------------

/**
 * Returns the existing annotation layer <g> (raising it above marks if needed),
 * or creates one if it does not yet exist.
 *
 * All operation-next annotations must be drawn into this layer so they always
 * render above chart marks and can be independently selected/cleared.
 */
export function ensureAnnotationLayer(
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
): d3.Selection<SVGGElement, unknown, null, undefined> {
  const existing = svg.select<SVGGElement>(`g.${ANNOTATION_LAYER_CLASS}`)
  if (!existing.empty()) return existing.raise()
  return svg
    .append(SvgElements.Group)
    .attr(SvgAttributes.Class, `${SvgClassNames.AnnotationLayer} ${ANNOTATION_LAYER_CLASS}`)
    .raise()
}

// ---------------------------------------------------------------------------
// resolveAnnotationViewport
// ---------------------------------------------------------------------------

/**
 * Reads the chart's margin and plot-size data attributes from the SVG element
 * and returns the annotation-safe bounding box.
 *
 * @param extraRight  Extra pixels added to the right of the plot area.
 *                    Defaults to 96 px — enough room for right-edge labels and arrows.
 */
export function resolveAnnotationViewport(
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
  extraRight = 96,
): AnnotationViewport {
  const marginLeft = Number(svg.attr(DataAttributes.MarginLeft) ?? 0)
  const marginTop = Number(svg.attr(DataAttributes.MarginTop) ?? 0)
  const plotWidth = Number(svg.attr(DataAttributes.PlotWidth) ?? 0)
  const plotHeight = Number(svg.attr(DataAttributes.PlotHeight) ?? 0)
  const desired = {
    x: marginLeft,
    y: marginTop,
    width: plotWidth + extraRight,
    height: plotHeight,
  }
  const viewBox = resolveSvgViewBox(svg)
  if (!viewBox) return desired

  const x = Math.max(desired.x, viewBox.x)
  const y = Math.max(desired.y, viewBox.y)
  const right = Math.min(desired.x + desired.width, viewBox.x + viewBox.width)
  const bottom = Math.min(desired.y + desired.height, viewBox.y + viewBox.height)
  return {
    x,
    y,
    width: Math.max(0, right - x),
    height: Math.max(0, bottom - y),
  }
}

// ---------------------------------------------------------------------------
// readNumberAttr
// ---------------------------------------------------------------------------

/**
 * Reads a numeric attribute from a DOM element.
 * Returns null (instead of NaN) when the value is missing or non-numeric,
 * making guard conditions at call sites simpler to read.
 */
export function readNumberAttr(node: Element, attr: string): number | null {
  const value = Number(node.getAttribute(attr))
  return Number.isFinite(value) ? value : null
}

// ---------------------------------------------------------------------------
// applyAnnotationContextTransitions
// ---------------------------------------------------------------------------

/**
 * Applies visual transitions at the start of a new annotation phase when prior
 * annotations from earlier operations are still present in the layer. Has two
 * modes, decided per-annotation:
 *
 *   - **Still referenced**: annotations whose `operationId` is in
 *     `referencedResultIds` (i.e. the current op or a future op consumes that
 *     result) fade to context style — text to 0.6 opacity, filter threshold
 *     lines to dashed + 0.4 opacity, other lines to 0.4 — and stay in the DOM.
 *   - **Stale**: annotations whose `operationId` is NOT in
 *     `referencedResultIds` fade to opacity 0 and are removed from the DOM. The
 *     corresponding records are also dropped from `annotationRecords` so they
 *     don't leak forward through the chain.
 *
 * Annotations without an `operationId` (legacy / pre-instrumented records)
 * fall back to the previous fade-to-context behavior so they aren't
 * accidentally yanked. The DOM-level fallback uses the same conservative rule:
 * elements without a `data-operation-result-ref` attribute keep the older
 * behavior.
 *
 * @param layer              The annotation `<g>` element selection.
 * @param annotationRecords  Records accumulated by earlier operations this
 *                           chain. **Mutated** to drop stale entries.
 * @param filterClass        The CSS class of the filter annotation
 *                           (chart-type-specific).
 * @param referencedResultIds Operation IDs (without the `ref:` prefix) that the
 *                           current op or any future op consumes. Pass an empty
 *                           array if no consumers remain — all prior records
 *                           with an operationId will fade out and be removed.
 *                           Pass `undefined` to preserve the legacy
 *                           fade-to-context behavior across the board.
 */
export function applyAnnotationContextTransitions(
  layer: d3.Selection<SVGGElement, unknown, d3.BaseType, unknown>,
  annotationRecords: AnnotationRecord[],
  filterClass: string,
  referencedResultIds?: string[],
): void {
  const CONTEXT_TRANSITION_MS = 200
  const REMOVAL_TRANSITION_MS = 200
  const FILTER_CONTEXT_OPACITY = 0.4
  const LABEL_CONTEXT_OPACITY = 0.6

  const referencedSet = referencedResultIds == null
    ? null
    : new Set(referencedResultIds.map((id) => String(id).replace(/^ref:/, '').trim()).filter((id) => id.length > 0))

  const isStillReferenced = (record: AnnotationRecord) => {
    if (referencedSet == null) return true
    if (record.operationId == null) return true
    return referencedSet.has(record.operationId)
  }

  // 1. Fade-and-remove stale persistent annotations (those whose operationId
  //    is no longer referenced). Select by data-operation-result-ref so only
  //    nodes belonging to the stale op are touched.
  const staleClasses = new Set<string>()
  for (const record of annotationRecords) {
    if (!record.persistent) continue
    if (isStillReferenced(record)) continue
    if (record.operationId == null) continue
    staleClasses.add(record.cssClass)
    layer
      .selectAll<SVGElement, unknown>(`.${record.cssClass}[${RESULT_REF_ATTRIBUTE}="${record.operationId}"]`)
      .interrupt()
      .transition()
      .duration(REMOVAL_TRANSITION_MS)
      .style(SvgAttributes.Opacity, 0)
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

  // 2. If a still-referenced persistent filter annotation remains, fade its
  //    threshold line to guideline style (dashed + reduced opacity).
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

  // 3. Other still-referenced persistent anchor lines fade to context opacity
  //    (no dashed style).
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
  //    already removed in step 1).
  layer
    .selectAll<SVGTextElement, unknown>(`text.${SvgClassNames.TextAnnotation}`)
    .filter(function () {
      const ref = this.getAttribute(RESULT_REF_ATTRIBUTE)
      if (ref != null && referencedSet != null && !referencedSet.has(ref)) {
        // Stale text already in the process of being removed in step 1.
        return false
      }
      return true
    })
    .interrupt()
    .transition()
    .duration(CONTEXT_TRANSITION_MS)
    .style(SvgAttributes.Opacity, LABEL_CONTEXT_OPACITY)
}

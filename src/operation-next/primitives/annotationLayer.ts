import * as d3 from 'd3'
import { DataAttributes, SvgAttributes, SvgClassNames, SvgElements } from '../../rendering/interfaces'
import { STYLES } from '../../rendering/common/d3Helpers'
import type { AnnotationRecord } from '../chainState'

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
  return {
    x: marginLeft,
    y: marginTop,
    width: plotWidth + extraRight,
    height: plotHeight,
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
 * Applies visual "context fading" at the start of a new annotation phase when
 * prior annotations from earlier operations are still present in the layer.
 *
 * Two effects run in parallel (fire-and-forget; no await needed):
 *
 *   1. **Filter threshold line → guideline style**: if a persistent filter
 *      annotation is in the records, the corresponding `<line>` elements are
 *      transitioned to reduced opacity (0.4) and a dashed stroke so they read
 *      as reference context rather than an active result.
 *
 *   2. **Previous text labels → context opacity**: all existing
 *      `text.text-annotation` nodes in the layer are faded to 0.6 so the
 *      upcoming new label stands out as the primary result.
 *
 * Call this at the TOP of `annotateAverage`, `annotateFindExtremum`, etc. —
 * before appending any new SVG elements — so the fade runs concurrently with
 * the draw of the new annotation rather than sequentially.
 *
 * @param layer            The annotation `<g>` element selection.
 * @param annotationRecords Records accumulated by earlier operations this chain.
 * @param filterClass      The CSS class of the filter annotation (chart-type-specific).
 */
export function applyAnnotationContextTransitions(
  layer: d3.Selection<SVGGElement, unknown, d3.BaseType, unknown>,
  annotationRecords: AnnotationRecord[],
  filterClass: string,
): void {
  const CONTEXT_TRANSITION_MS = 200
  const FILTER_CONTEXT_OPACITY = 0.4
  const LABEL_CONTEXT_OPACITY = 0.6

  // 1. If a persistent filter annotation exists, fade its threshold line to
  //    guideline style (dashed + reduced opacity) so it becomes subordinate context.
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

  // 2. Other persistent anchor classes (diff, lagDiff, pairDiff, …): fade their
  //    lines to reduced opacity without applying the dashed guideline style,
  //    so they recede into context without changing their visual character.
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

  // 3. Fade all existing text annotations to context opacity so the new label
  //    is immediately visually prominent.
  layer
    .selectAll<SVGTextElement, unknown>(`text.${SvgClassNames.TextAnnotation}`)
    .interrupt()
    .transition()
    .duration(CONTEXT_TRANSITION_MS)
    .style(SvgAttributes.Opacity, LABEL_CONTEXT_OPACITY)
}

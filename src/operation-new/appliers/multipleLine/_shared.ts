import type * as d3 from 'd3'
import { DataAttributes, SvgAttributes, SvgElements } from '../../../rendering/interfaces'
import type { MultipleLineChartInstance } from '../../../rendering-new/instances/multipleLineInstance'

export interface PointMetrics {
  x: number
  y: number
  value: number
  target: string
  series: string
}

/**
 * Find a `<circle data-target>` matching the requested target (and optional
 * series). When series is provided, we restrict to that series so multi-line
 * charts pick the right line's point.
 */
export function findMultiLinePoint(
  instance: MultipleLineChartInstance,
  target: string,
  series?: string | null,
): SVGCircleElement | null {
  const candidates = instance.svg
    .selectAll<SVGCircleElement, unknown>(
      `${SvgElements.Circle}[${DataAttributes.Target}], ${SvgElements.Circle}[${DataAttributes.Id}]`,
    )
    .nodes()
  for (const candidate of candidates) {
    const candidateTarget = candidate.getAttribute(DataAttributes.Target) ?? candidate.getAttribute(DataAttributes.Id)
    if (candidateTarget !== target) continue
    if (series != null && series !== '') {
      const candidateSeries = candidate.getAttribute(DataAttributes.Series) ?? ''
      if (candidateSeries !== series) continue
    }
    return candidate
  }
  return null
}

export function pointMetrics(point: SVGCircleElement, instance: MultipleLineChartInstance): PointMetrics {
  const cx = Number(point.getAttribute(SvgAttributes.CX))
  const cy = Number(point.getAttribute(SvgAttributes.CY))
  return {
    x: instance.layout.marginLeft + (Number.isFinite(cx) ? cx : 0),
    y: instance.layout.marginTop + (Number.isFinite(cy) ? cy : 0),
    value: Number(point.getAttribute(DataAttributes.Value)),
    target: point.getAttribute(DataAttributes.Target) ?? point.getAttribute(DataAttributes.Id) ?? '',
    series: point.getAttribute(DataAttributes.Series) ?? '',
  }
}

/**
 * Annotation viewport rectangle for multi-line charts — the plot area plus a
 * small right-side overhang so labels at the right edge can sit just past
 * the plot box without being clipped by viewport math.
 */
export function annotationViewport(instance: MultipleLineChartInstance) {
  return {
    x: instance.layout.marginLeft,
    y: instance.layout.marginTop,
    width: instance.layout.plotWidth + 96,
    height: instance.layout.plotHeight,
  }
}

/**
 * Selection of every data circle on the chart (across series). Convenience
 * wrapper over the public instance method for callers that want to drop a
 * `.transition()` directly without going through transitionFilterScope.
 */
export function allPoints(
  instance: MultipleLineChartInstance,
): d3.Selection<SVGCircleElement, unknown, d3.BaseType, unknown> {
  return instance.pointMarks()
}

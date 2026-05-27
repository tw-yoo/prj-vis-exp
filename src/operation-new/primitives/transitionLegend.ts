import * as d3 from 'd3'
import { DataAttributes, SvgAttributes, SvgClassNames } from '../../rendering/interfaces'
import { DURATIONS, EASINGS, OPACITIES } from '../../rendering/common/d3Helpers'

/**
 * Smoothly transitions the chart's color legend in response to a series-
 * scope change. Surviving series rows slide to their new position (closing
 * the gap left by removed series); out-of-scope rows fade to opacity 0.
 *
 * This is the operation-new counterpart to validation/data/e2/e2_q2.js's
 * legend smooth-update pattern (Round 6): the user expects the legend to
 * REFLECT the current subset, not stay frozen with stale series rows.
 *
 * Implementation notes:
 *   - Rows are identified by `data-series` attribute (stamped by
 *     `renderColorLegend` since the markKey rollout). Both the row's
 *     `<circle>` and `<text>` carry the same attribute, so we transition
 *     them together as a single visual unit.
 *   - The legend's title row (if present) lacks `data-series` so it's
 *     naturally skipped — title stays put.
 *   - New row Y positions are derived from the EXISTING row Y positions in
 *     DOM order: the i-th surviving series moves to the i-th original Y,
 *     so the chart's row height / title-gap math is captured implicitly
 *     without us having to recompute it.
 *
 * @param svg            Root SVG selection containing the `g.color-legend`.
 * @param activeSeries   Set of series keys to keep (out-of-scope = fade out).
 * @param duration       Transition duration (default DURATIONS.AXIS_RESCALE).
 * @param ease           Easing function (default EASINGS.SMOOTH).
 */
export async function transitionLegendScope(args: {
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined> | d3.Selection<SVGSVGElement, unknown, d3.BaseType, unknown>
  activeSeries: Set<string>
  duration?: number
  ease?: (t: number) => number
}): Promise<void> {
  const { svg, activeSeries } = args
  const duration = args.duration ?? DURATIONS.AXIS_RESCALE
  const ease = args.ease ?? EASINGS.SMOOTH

  const legend = svg.select<SVGGElement>(`g.${SvgClassNames.ColorLegend}`)
  if (legend.empty()) return

  // Collect all legend-row circle nodes in DOM order. The circle's `cy` is
  // the canonical row anchor — the matching <text> shares the same `y`.
  const circleNodes = legend
    .selectAll<SVGCircleElement, unknown>(`circle[${DataAttributes.Series}]`)
    .nodes()
  if (circleNodes.length === 0) return

  // Original row Y positions, in DOM order. The i-th surviving series will
  // move to rowYs[i] so the legend "closes up" without us re-deriving the
  // base render's rowGap/titleGap layout.
  const rowYs = circleNodes.map((c) => Number(c.getAttribute(SvgAttributes.CY)))

  // Surviving series in DOM order (preserves original ordering even if the
  // caller's Set has insertion-order semantics inverted from the base render).
  const survivingSeries: string[] = []
  circleNodes.forEach((c) => {
    const s = c.getAttribute(DataAttributes.Series) ?? ''
    if (activeSeries.has(s)) survivingSeries.push(s)
  })

  const seriesToNewY = new Map<string, number>()
  survivingSeries.forEach((s, i) => {
    const targetY = rowYs[i]
    if (targetY != null) seriesToNewY.set(s, targetY)
  })

  console.info('[operation-new] transitionLegendScope', {
    activeCount: activeSeries.size,
    survivingCount: survivingSeries.length,
    totalRows: circleNodes.length,
  })

  const parent = legend.transition().duration(duration).ease(ease) as unknown as d3.Transition<
    d3.BaseType,
    unknown,
    d3.BaseType,
    unknown
  >
  const inheritT = parent as never

  // Apply to BOTH circles and text rows via a single selector pass.
  legend
    .selectAll<SVGElement, unknown>(`[${DataAttributes.Series}]`)
    .interrupt('legend-scope')
    .transition(inheritT)
    .style(SvgAttributes.Opacity, function () {
      const series = this.getAttribute(DataAttributes.Series) ?? ''
      if (!activeSeries.has(series)) return 0
      // Circle row keeps its 0.85 base opacity; text gets full opacity.
      return this.tagName === 'circle' ? 0.85 : OPACITIES.FULL
    })

  // Circles transition cy; texts transition y. Two separate selections so
  // the d3 typing on attr() stays narrow.
  legend
    .selectAll<SVGCircleElement, unknown>(`circle[${DataAttributes.Series}]`)
    .transition(inheritT)
    .attr(SvgAttributes.CY, function () {
      const series = this.getAttribute(DataAttributes.Series) ?? ''
      const newY = seriesToNewY.get(series)
      return newY != null ? newY : Number(this.getAttribute(SvgAttributes.CY) ?? 0)
    })

  legend
    .selectAll<SVGTextElement, unknown>(`text[${DataAttributes.Series}]`)
    .transition(inheritT)
    .attr(SvgAttributes.Y, function () {
      const series = this.getAttribute(DataAttributes.Series) ?? ''
      const newY = seriesToNewY.get(series)
      return newY != null ? newY : Number(this.getAttribute(SvgAttributes.Y) ?? 0)
    })

  try {
    await parent.end()
  } catch {
    /* interrupted */
  }
}

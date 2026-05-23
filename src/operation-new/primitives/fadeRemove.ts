import type * as d3 from 'd3'
import { SvgAttributes } from '../../rendering/interfaces'
import { DURATIONS, EASINGS } from '../../rendering/common/d3Helpers'

const DEFAULT_FADE_OUT_MS = 150

/**
 * Smooth removal for an applier's previously-drawn annotation set.
 *
 * Replaces the bare `selectAll(cssClass).interrupt().remove()` pattern. The
 * old elements fade their opacity to 0 over `duration` ms before being
 * removed, so re-running the same op against new params produces a cross-fade
 * rather than a pop. Fire-and-forget — the caller can immediately append the
 * new annotation alongside the fading-out old one; both occupy the DOM
 * briefly while the old finishes its exit.
 *
 * Idempotent: callable even when no matching elements exist (selectAll
 * returns an empty selection).
 */
export function fadeRemoveAnnotations(
  scope: d3.Selection<d3.BaseType, unknown, d3.BaseType, unknown>,
  cssClass: string,
  duration: number = DEFAULT_FADE_OUT_MS,
): void {
  const sel = scope.selectAll<SVGElement, unknown>(`.${cssClass}`)
  if (sel.empty()) return
  sel
    .interrupt()
    .transition()
    .duration(duration)
    .ease(EASINGS.SMOOTH ?? ((t: number) => t))
    .style(SvgAttributes.Opacity, 0)
    .remove()
}

export const ANNOTATION_FADE_OUT_MS = DEFAULT_FADE_OUT_MS
export { DURATIONS }

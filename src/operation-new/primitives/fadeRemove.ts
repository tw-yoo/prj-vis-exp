import type * as d3 from 'd3'
import { SvgAttributes } from '../../rendering/interfaces'
import { DURATIONS, EASINGS } from '../../rendering/common/d3Helpers'
import type { ParentTransition } from './sharedTransition'

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
 *
 * @param parent  When supplied, the fade-out joins the caller's parent
 *                transition (validation-page idiom: every sub-op in a phase
 *                ticks on the same scheduler frame). When omitted, the
 *                primitive creates its own root transition with `duration`.
 */
export function fadeRemoveAnnotations(
  scope: d3.Selection<any, any, any, any>,
  cssClass: string,
  duration: number = DEFAULT_FADE_OUT_MS,
  parent?: ParentTransition,
): void {
  const sel = scope.selectAll<SVGElement, unknown>(`.${cssClass}`)
  if (sel.empty()) return
  if (parent) {
    sel
      .interrupt()
      .transition(parent as never)
      .style(SvgAttributes.Opacity, 0)
      .remove()
    return
  }
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

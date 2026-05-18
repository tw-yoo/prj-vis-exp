import * as d3 from 'd3'
import { DURATIONS, EASINGS, OPACITIES } from '../../rendering/common/d3Helpers'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MarkSalienceOptions {
  /**
   * Pre-built D3 selection of mark elements to apply salience to.
   *
   * Callers are responsible for building the chart-type-specific selection
   * (e.g. `svg.selectAll('rect.MainBar')` for bars, `svg.selectAll('circle[data-target]')`
   * for line/scatter points). This keeps the salience primitive chart-agnostic.
   */
  marks: d3.Selection<SVGElement, unknown, d3.BaseType, unknown>

  /**
   * Per-element predicate: return `true` if this mark is within the active
   * scope (full opacity), `false` if it should be dimmed.
   *
   * The node passed in is the raw SVG element, so callers can read attributes
   * such as `data-target` or `data-series` to decide.
   */
  isInScope: (node: SVGElement) => boolean

  /**
   * Opacity applied to marks that are in scope.
   * Defaults to OPACITIES.FULL (1).
   */
  inOpacity?: number

  /**
   * Opacity applied to marks that are out of scope.
   * Defaults to OPACITIES.DIM (0.2).
   */
  outOpacity?: number

  /**
   * Transition duration in milliseconds.
   * Defaults to DURATIONS.DIM (400 ms).
   */
  duration?: number
}

// ---------------------------------------------------------------------------
// applyMarkSalience
// ---------------------------------------------------------------------------

/**
 * Applies an opacity-based salience transition to a selection of chart marks.
 *
 * In-scope marks are brought to full opacity; out-of-scope marks are dimmed.
 * Any in-progress transition on the selection is interrupted first to avoid
 * queuing artifacts when operations run in rapid succession.
 *
 * Returns a Promise that resolves when all mark transitions have settled.
 * Callers should `await` this before drawing annotations so that reference
 * line placement reads stable DOM geometry (marks at their final opacity/
 * position rather than mid-transition values).
 *
 * Interrupted transitions resolve silently — this is expected behaviour when
 * the user triggers a new operation before the previous one finishes.
 *
 * @example
 * // simpleBar filter
 * const bars = svg.selectAll<SVGElement, unknown>(`rect.${SvgClassNames.MainBar}`)
 * await applyMarkSalience({
 *   marks: bars,
 *   isInScope: (node) => remainingTargets.has(node.getAttribute('data-target') ?? ''),
 * })
 * // Now safe to draw the reference line at stable bar positions.
 */
export async function applyMarkSalience(opts: MarkSalienceOptions): Promise<void> {
  const {
    marks,
    isInScope,
    inOpacity  = OPACITIES.FULL,
    outOpacity = OPACITIES.DIM,
    duration   = DURATIONS.DIM,
  } = opts

  if (marks.empty()) return

  try {
    await marks
      .interrupt()
      .transition()
      .duration(duration)
      .ease(EASINGS.SMOOTH)
      .style('opacity', function () {
        return isInScope(this as SVGElement) ? inOpacity : outOpacity
      })
      .end()
  } catch {
    // An interrupted transition means the user triggered another operation
    // before this one finished. The marks will be in a partially transitioned
    // state, but the next operation will interrupt again and take over cleanly.
  }
}

// ---------------------------------------------------------------------------
// restoreMarkSalience
// ---------------------------------------------------------------------------

/**
 * Restores all marks in the selection to full opacity.
 *
 * Used when scope is cleared (e.g. between operation groups, or when a
 * `sort` operation runs after a `filter` and the filter context should be
 * discarded).
 */
export async function restoreMarkSalience(
  marks: d3.Selection<SVGElement, unknown, d3.BaseType, unknown>,
  duration = DURATIONS.FADE,
): Promise<void> {
  if (marks.empty()) return

  try {
    await marks
      .interrupt()
      .transition()
      .duration(duration)
      .ease(EASINGS.SMOOTH)
      .style('opacity', OPACITIES.FULL)
      .end()
  } catch { /* interrupted */ }
}

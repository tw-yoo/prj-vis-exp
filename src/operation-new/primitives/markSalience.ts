import type * as d3 from 'd3'
import { DURATIONS, EASINGS, OPACITIES } from '../../rendering/common/d3Helpers'

export interface MarkSalienceOptions {
  marks: d3.Selection<SVGElement, unknown, any, any>
  isInScope: (node: SVGElement) => boolean
  inOpacity?: number
  outOpacity?: number
  duration?: number
}

/**
 * Smoothly transitions a mark selection to in-scope / out-of-scope opacity.
 * Resolves when the transition settles (or is interrupted).
 */
export async function applyMarkSalience(opts: MarkSalienceOptions): Promise<void> {
  const {
    marks,
    isInScope,
    inOpacity = OPACITIES.FULL,
    outOpacity = OPACITIES.DIM,
    duration = DURATIONS.DIM,
  } = opts
  if (marks.empty()) return
  // Use a named transition ('salience') so other concurrent transitions on
  // the same selection (e.g. ChartInstance.transitionChartScale's cx/cy
  // attrTween) can coexist without their `interrupt()` cancelling this
  // opacity fade.
  try {
    await marks
      .interrupt('salience')
      .transition('salience')
      .duration(duration)
      .ease(EASINGS.SMOOTH)
      .style('opacity', function () {
        return isInScope(this as SVGElement) ? inOpacity : outOpacity
      })
      .end()
  } catch {
    /* interrupted */
  }
}

export async function restoreMarkSalience(
  marks: d3.Selection<SVGElement, unknown, any, any>,
  duration = DURATIONS.FADE,
): Promise<void> {
  if (marks.empty()) return
  try {
    await marks.interrupt().transition().duration(duration).ease(EASINGS.SMOOTH).style('opacity', OPACITIES.FULL).end()
  } catch {
    /* interrupted */
  }
}

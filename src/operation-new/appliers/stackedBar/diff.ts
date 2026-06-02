import { makeBarGroupDiffApplier } from '../barGroup/diff'
import type { StackedBarChartInstance } from '../../../rendering-new/instances/stackedBarInstance'

export { DIFF_ANNOTATION_CLASS } from '../barGroup/diff'

/**
 * stacked-bar diff applier — native (shared logic in `barGroup/diff.ts`).
 *
 * A root merge diff on a split layout resolves its endpoints from the two
 * surfaces' stamped average lines and draws the cross-surface Δ arrow; the
 * non-split / intra-panel branch delegates to the legacy bar-to-bar diff.
 */
export const diffApplier = makeBarGroupDiffApplier<StackedBarChartInstance>()

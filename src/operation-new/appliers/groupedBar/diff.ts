import { makeBarGroupDiffApplier } from '../barGroup/diff'
import type { GroupedBarChartInstance } from '../../../rendering-new/instances/groupedBarInstance'

export { DIFF_ANNOTATION_CLASS } from '../barGroup/diff'

/**
 * grouped-bar diff applier — native (shared logic in `barGroup/diff.ts`).
 *
 * A root merge diff on a split layout resolves its endpoints from the two
 * surfaces' stamped average lines and draws the cross-surface Δ arrow; the
 * non-split / intra-panel branch delegates to the legacy bar-to-bar diff.
 */
export const diffApplier = makeBarGroupDiffApplier<GroupedBarChartInstance>()

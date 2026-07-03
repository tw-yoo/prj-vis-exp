import { makeBarGroupDiffApplier } from '../barGroup/diff'
import { pairDiffApplier } from './pairDiff'
import type { OperationApplier, ApplierArgs, ApplierResult } from '../../applier'
import type { StackedBarChartInstance } from '../../../rendering-new/instances/stackedBarInstance'

export { DIFF_ANNOTATION_CLASS } from '../barGroup/diff'

/**
 * stacked-bar diff applier — native (shared logic in `barGroup/diff.ts`).
 *
 * A root merge diff on a split layout resolves its endpoints from the two
 * surfaces' stamped average lines and draws the cross-surface Δ arrow; the
 * non-split / intra-panel branch delegates to the legacy bar-to-bar diff.
 *
 * op-consolidation Tier 1: a folded op="diff" with series operands (groupA+groupB per `by`,
 * formerly pairDiff) is drawn by the pairDiff applier (per-key stacked-segment Δ).
 */
const baseDiffApplier = makeBarGroupDiffApplier<StackedBarChartInstance>()

export const diffApplier: OperationApplier<StackedBarChartInstance> = {
  op: baseDiffApplier.op,
  async apply(args: ApplierArgs<StackedBarChartInstance>): Promise<ApplierResult> {
    const op = args.operation
    if (op.groupA && op.groupB && (op.by || op.keyField)) {
      return pairDiffApplier.apply(args)
    }
    return baseDiffApplier.apply(args)
  },
}

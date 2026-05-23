import { OperationOp } from '../../../domain/operation/types'
import type { OperationApplier, ApplierArgs, ApplierResult } from '../../applier'
import type { GroupedBarChartInstance } from '../../../rendering-new/instances/groupedBarInstance'
import { runGroupedBarDiffOperation } from '../../../operation-next/runners/barGroupShared'

/**
 * grouped-bar diff applier.
 *
 * Delegates to the legacy `runGroupedBarDiffOperation`. The visual logic
 * (vertical arrow + ref lines + value labels, with optional cross-surface
 * routing when split layouts are active) is preserved in legacy.
 *
 * Known pre-existing issue (273wm22z47ptlhzz): when both endpoints are
 * derived refs (e.g. average over a group), `diffData`'s slice resolution
 * sometimes can't materialize from the runtime store, causing the diff to
 * fail silently with no annotation. Out of scope for this port.
 */
export const diffApplier: OperationApplier<GroupedBarChartInstance> = {
  op: OperationOp.Diff,

  async apply({
    operation,
    state,
    instance,
    options,
  }: ApplierArgs<GroupedBarChartInstance>): Promise<ApplierResult> {
    console.info('[operation-new] grouped-bar applier:diff (delegating to legacy)', {
      nodeId: operation.meta?.nodeId,
      targetA: operation.targetA,
      targetB: operation.targetB,
      workingLen: state.workingData.length,
    })

    return runGroupedBarDiffOperation(
      instance.host,
      operation,
      state,
      options?.surfaceManager,
    )
  },
}

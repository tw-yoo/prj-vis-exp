import { OperationOp } from '../../../domain/operation/types'
import type { OperationApplier, ApplierArgs, ApplierResult } from '../../applier'
import type { StackedBarChartInstance } from '../../../rendering-new/instances/stackedBarInstance'
import { runGroupedBarDiffOperation } from '../../../operation-next/runners/barGroupShared'

/**
 * stacked-bar diff applier — shares the legacy `runGroupedBarDiffOperation`
 * with grouped-bar. Stacked-context diff goes through the same vertical
 * arrow + ref line annotation path internally.
 */
export const diffApplier: OperationApplier<StackedBarChartInstance> = {
  op: OperationOp.Diff,

  async apply({
    operation,
    state,
    instance,
    options,
  }: ApplierArgs<StackedBarChartInstance>): Promise<ApplierResult> {
    console.info('[operation-new] stacked-bar applier:diff (delegating to legacy)', {
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

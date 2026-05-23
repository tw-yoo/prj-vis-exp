import { OperationOp } from '../../../domain/operation/types'
import type { OperationApplier, ApplierArgs, ApplierResult } from '../../applier'
import type { StackedBarChartInstance } from '../../../rendering-new/instances/stackedBarInstance'
import { runGroupedBarAverageOperation } from '../../../operation-next/runners/barGroupShared'

/**
 * stacked-bar average applier — shares the legacy
 * `runGroupedBarAverageOperation` with grouped-bar. The function dispatches
 * internally based on `getRuntimeChartState(container)` and handles the
 * stacked → simple-bar conversion path for group-scoped averages.
 */
export const averageApplier: OperationApplier<StackedBarChartInstance> = {
  op: OperationOp.Average,

  async apply({
    operation,
    state,
    instance,
    options,
  }: ApplierArgs<StackedBarChartInstance>): Promise<ApplierResult> {
    console.info('[operation-new] stacked-bar applier:average (delegating to legacy)', {
      nodeId: operation.meta?.nodeId,
      group: operation.group,
      workingLen: state.workingData.length,
    })
    return runGroupedBarAverageOperation(
      instance.host,
      operation,
      state,
      options?.referencedResultIds,
    )
  },
}

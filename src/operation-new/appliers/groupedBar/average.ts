import { OperationOp } from '../../../domain/operation/types'
import type { OperationApplier, ApplierArgs, ApplierResult } from '../../applier'
import type { GroupedBarChartInstance } from '../../../rendering-new/instances/groupedBarInstance'
import { runGroupedBarAverageOperation } from '../../../operation-next/runners/barGroupShared'

/**
 * grouped-bar average applier.
 *
 * Delegates to the legacy `runGroupedBarAverageOperation`. Average for
 * grouped/stacked bar is structurally complex — when a `group` is
 * specified, the chart is CONVERTED to a simple-bar showing only that
 * group's bars, then the average ref line is drawn on the simple-bar.
 * This chart-conversion logic is well-tested in legacy and re-implementing
 * it would be substantial. The wrapper preserves the visual behavior and
 * threads ChainState through our applier interface.
 */
export const averageApplier: OperationApplier<GroupedBarChartInstance> = {
  op: OperationOp.Average,

  async apply({
    operation,
    state,
    instance,
    options,
  }: ApplierArgs<GroupedBarChartInstance>): Promise<ApplierResult> {
    console.info('[operation-new] grouped-bar applier:average (delegating to legacy)', {
      nodeId: operation.meta?.nodeId,
      group: operation.group,
      workingLen: state.workingData.length,
    })

    const outcome = await runGroupedBarAverageOperation(
      instance.host,
      operation,
      state,
      options?.referencedResultIds,
    )
    return outcome
  },
}

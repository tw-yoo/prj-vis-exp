import { OperationOp } from '../../../domain/operation/types'
import type { OperationApplier, ApplierArgs, ApplierResult } from '../../applier'
import { runPairDiffOperation } from '../../../operation-next/runners/multipleLine'
import type { MultipleLineChartInstance } from '../../../rendering-new/instances/multipleLineInstance'
import type { ParsedOperationRun } from '../../../operation-next/types'

/**
 * multiple-line pairDiff applier.
 *
 * pairDiff is the most structurally complex op in this chart type — it
 * applies a "focus" transform that hides unrelated series, rescales the
 * y-axis to the differential range, and draws vertical arrows between
 * paired endpoints. The transform interacts deeply with the renderer's
 * DOM layout (group structure, point positions, axis ticks).
 *
 * Rather than reimplementing the focus transform, this applier delegates
 * to the well-tested legacy `runPairDiffOperation` and wraps the result
 * in our applier interface. State (derivedData, scaleState) flows through
 * normally so downstream appliers (filter, average, findExtremum) see the
 * post-pairDiff context as expected.
 */
export const pairDiffApplier: OperationApplier<MultipleLineChartInstance> = {
  op: OperationOp.PairDiff,

  async apply({
    operation,
    operationIndex,
    state,
    options,
    runtimeSpec,
    chartType,
    instance,
  }: ApplierArgs<MultipleLineChartInstance>): Promise<ApplierResult> {
    console.info('[operation-new] multi-line applier:pairDiff (delegating to legacy)', {
      nodeId: operation.meta?.nodeId,
      workingLen: state.workingData.length,
    })

    // Build a minimal ParsedOperationRun that the legacy function expects.
    // groups is unused inside runPairDiffOperation — it only reads container,
    // runtimeSpec/originalSpec are also unused — but we provide them for
    // shape correctness.
    const legacyRun: ParsedOperationRun = {
      container: instance.host,
      originalSpec: runtimeSpec ?? ({} as ParsedOperationRun['originalSpec']),
      runtimeSpec: runtimeSpec ?? ({} as ParsedOperationRun['runtimeSpec']),
      chartType: chartType ?? ('multi-line' as ParsedOperationRun['chartType']),
      opsSpec: { ops: [operation] },
      groups: [{ name: 'ops', ops: [operation] }],
      options,
    }

    return runPairDiffOperation(legacyRun, operation, operationIndex, state)
  },
}

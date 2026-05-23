import { OperationOp, type DatumValue } from '../../../domain/operation/types'
import type { OperationApplier, ApplierArgs, ApplierResult } from '../../applier'
import type { GroupedBarChartInstance } from '../../../rendering-new/instances/groupedBarInstance'
import type { StackedBarChartInstance } from '../../../rendering-new/instances/stackedBarInstance'
import {
  createBarChartState,
  isBarTransformDrawOperation,
  runBarTransformOperation,
} from '../../../operation-next/runners/barGroupShared'
import { ChartType } from '../../../domain/chart'
import type { DrawOp } from '../../../rendering/draw/types'

/**
 * Draw transform applier for grouped + stacked bars.
 *
 * Wraps legacy `runBarTransformOperation` which performs in-place chart-type
 * conversions:
 *   - stacked → grouped (split the stacks into side-by-side bars)
 *   - grouped → stacked (combine columns into stacks)
 *   - stacked → simple-bar (collapse to a single measure)
 *   - grouped → simple-bar (collapse to a single measure)
 *
 * The legacy function:
 *   1. Animates the conversion (well-tested motion logic)
 *   2. Re-stores runtime chart state so subsequent ops dispatch to the new
 *      chart type (e.g. ops after StackedToSimple go through simple-bar
 *      runners)
 *
 * Our wrapper returns the post-conversion ChainState. The chart instance
 * passed in (grouped or stacked) may no longer match the new chart type
 * after conversion, but that's resolved on the NEXT runChartOps call which
 * goes through the dispatcher and picks the right instance/runner.
 */
function buildApplier<TInstance extends GroupedBarChartInstance | StackedBarChartInstance>(
  startChartType: ChartType.GROUPED_BAR | ChartType.STACKED_BAR,
): OperationApplier<TInstance> {
  return {
    op: OperationOp.Draw,

    async apply({
      operation,
      state,
      instance,
      runtimeSpec,
    }: ApplierArgs<TInstance>): Promise<ApplierResult> {
      // Guard: only act on bar-transform Draw ops. Other Draw ops (e.g. text
      // annotations) are skipped — the legacy runner would also skip them.
      if (!isBarTransformDrawOperation(operation)) {
        return { result: state.lastResult ?? [], nextState: state }
      }

      const drawOp = operation as DrawOp
      console.info('[operation-new] bar-group applier:draw (delegating to legacy)', {
        action: drawOp.action,
        startChartType,
      })

      const active = createBarChartState(instance.host, startChartType, runtimeSpec ?? instance.host)
      const transformed = await runBarTransformOperation(instance.host, { ...active, chainState: state }, drawOp)

      // The transformation returns the new ActiveBarChartState; thread its
      // ChainState forward. Subsequent ops in the same group land on the
      // (possibly new) chart type via the dispatcher's NEXT runChartOps call.
      const nextResult: DatumValue[] = transformed.chainState.lastResult ?? state.lastResult ?? []
      return {
        result: nextResult,
        nextState: transformed.chainState,
      }
    },
  }
}

export const drawTransformApplierGrouped = buildApplier<GroupedBarChartInstance>(ChartType.GROUPED_BAR)
export const drawTransformApplierStacked = buildApplier<StackedBarChartInstance>(ChartType.STACKED_BAR)

import { OperationOp, type DatumValue } from '../../../domain/operation/types'
import type { OperationApplier, ApplierArgs, ApplierResult } from '../../applier'
import type { GroupedBarChartInstance } from '../../../rendering-new/instances/groupedBarInstance'
import type { StackedBarChartInstance } from '../../../rendering-new/instances/stackedBarInstance'
import { ChartType, type ChartTypeValue, type ChartSpec } from '../../../domain/chart'
import { DrawAction, type DrawOp } from '../../../rendering/draw/types'
import type { StackedSpec } from '../../../rendering/bar/stackedBarRenderer'
import type { GroupedSpec } from '../../../rendering/bar/groupedBarRenderer'
import {
  createBarChartState,
  getBarDatumValues,
  isBarTransformDrawOperation,
  runBarTransformOperation,
} from '../../../operation-next/runners/barGroupShared'
import { createChainState, type ChainState } from '../../../operation-next/chainState'

/**
 * Draw transform applier for grouped + stacked bars.
 *
 * Routes each chart-type-conversion DrawAction to the matching instance
 * method (`transitionToGrouped` / `transitionToStacked` / `transitionToSimple`
 * / `transitionToDiverging`) instead of delegating wholesale to the legacy
 * `runBarTransformOperation`. The instance method:
 *   1. Animates the conversion in-place via the existing legacy converter
 *      (well-tested motion logic — same visual as before).
 *   2. Detaches itself from the host when the chart type shifts so the
 *      dispatcher attaches the matching instance type on the next op.
 *
 * Falls back to the legacy single-entry-point runner for any DrawAction that
 * isn't one of the five typed chart-type transitions — keeps less common
 * conversions working without forcing a complete reimplementation here.
 *
 * After conversion, this applier produces a ChainState consistent with the
 * NEW chart type: workingData re-derived from the now-rendered SVG via
 * `getBarDatumValues`, fresh salience / annotation records. Subsequent ops
 * in the same group land on the dispatcher's NEXT runChartOps call which
 * picks the appropriate runner (simple-bar / grouped-bar) for the new type.
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
      if (!isBarTransformDrawOperation(operation)) {
        return { result: state.lastResult ?? [], nextState: state }
      }

      const drawOp = operation as DrawOp
      console.info('[operation-new] bar-group applier:draw (instance-routed)', {
        action: drawOp.action,
        startChartType,
      })

      const resolvedSpec = (runtimeSpec ?? null) as ChartSpec | null

      // Dispatch to the matching instance method. Each returns a tuple of
      // (next chart type, next spec, ranOnInstance flag); on `null` we fall
      // through to the legacy runner so unmapped or guarded cases still work.
      const transition = await dispatchInstanceTransition(instance, startChartType, drawOp, resolvedSpec)

      if (transition === 'legacy-fallback') {
        // Same code path as before for the small subset of cases the typed
        // instance API doesn't cover yet (currently: action type mismatch
        // against the instance's current chart type).
        const active = createBarChartState(instance.host, startChartType, runtimeSpec ?? instance.host)
        const transformed = await runBarTransformOperation(instance.host, { ...active, chainState: state }, drawOp)
        const nextResult: DatumValue[] = transformed.chainState.lastResult ?? state.lastResult ?? []
        return { result: nextResult, nextState: transformed.chainState }
      }

      // Successful instance-routed conversion. Build the next ChainState from
      // the new chart's rendered data so subsequent ops see consistent state.
      const nextChain = buildChainStateForType(instance.host, transition.chartType, transition.spec, state)
      const nextResult: DatumValue[] = nextChain.lastResult ?? state.lastResult ?? []
      return { result: nextResult, nextState: nextChain }
    },
  }
}

/**
 * Routes the draw action to the corresponding `transitionToXxx` method on
 * the chart instance. Returns:
 *   - `{ chartType, spec }` on success — caller threads the chain state.
 *   - `'legacy-fallback'` when the action doesn't match the instance's
 *      current chart type (e.g. StackedToGrouped on a grouped instance).
 *      Caller defers to the legacy runner for these edge cases.
 */
async function dispatchInstanceTransition(
  instance: GroupedBarChartInstance | StackedBarChartInstance,
  startChartType: ChartType.GROUPED_BAR | ChartType.STACKED_BAR,
  drawOp: DrawOp,
  spec: ChartSpec | null,
): Promise<{ chartType: ChartTypeValue; spec: ChartSpec } | 'legacy-fallback'> {
  // Stacked-source transitions
  if (startChartType === ChartType.STACKED_BAR) {
    const stackedInstance = instance as StackedBarChartInstance
    const stackedSpec = spec as StackedSpec | null

    if (drawOp.action === DrawAction.StackedToGrouped && stackedSpec) {
      const result = await stackedInstance.transitionToGrouped({
        currentSpec: stackedSpec,
        stackGroup: drawOp.stackGroup,
      })
      return result ? { chartType: result.chartType, spec: result.spec as ChartSpec } : 'legacy-fallback'
    }

    if (drawOp.action === DrawAction.StackedToDiverging && stackedSpec) {
      await stackedInstance.transitionToDiverging({ currentSpec: stackedSpec })
      // Chart type unchanged — return current spec/type.
      return { chartType: ChartType.STACKED_BAR, spec: stackedSpec as ChartSpec }
    }

    if (drawOp.action === DrawAction.StackedToSimple && stackedSpec && drawOp.toSimple) {
      const simpleSpec = await stackedInstance.transitionToSimple({
        currentSpec: stackedSpec,
        toSimple: drawOp.toSimple,
      })
      return simpleSpec ? { chartType: ChartType.SIMPLE_BAR, spec: simpleSpec as ChartSpec } : 'legacy-fallback'
    }
  }

  // Grouped-source transitions
  if (startChartType === ChartType.GROUPED_BAR) {
    const groupedInstance = instance as GroupedBarChartInstance
    const groupedSpec = spec as GroupedSpec | null

    if (drawOp.action === DrawAction.GroupedToStacked && groupedSpec) {
      const result = await groupedInstance.transitionToStacked({
        currentSpec: groupedSpec,
        stackGroup: drawOp.stackGroup,
      })
      return result ? { chartType: result.chartType, spec: result.spec as ChartSpec } : 'legacy-fallback'
    }

    if (drawOp.action === DrawAction.GroupedToSimple && groupedSpec && drawOp.toSimple) {
      const simpleSpec = await groupedInstance.transitionToSimple({
        currentSpec: groupedSpec,
        toSimple: drawOp.toSimple,
      })
      return simpleSpec ? { chartType: ChartType.SIMPLE_BAR, spec: simpleSpec as ChartSpec } : 'legacy-fallback'
    }
  }

  return 'legacy-fallback'
}

/**
 * Build a ChainState consistent with the post-conversion chart. The new chart
 * has fresh data (per `getBarDatumValues` for that chart type), so we reset
 * derivedData / salienceMap / annotationRecords but preserve `originalData`
 * and `lastResult` from the upstream state.
 *
 * This mirrors what legacy `runBarTransformOperation` does internally via
 * `createBarChartState(...).chainState` — kept here as an explicit helper
 * so the chain-state derivation is co-located with the applier.
 */
function buildChainStateForType(
  host: HTMLElement,
  chartType: ChartTypeValue,
  spec: ChartSpec,
  prevState: ChainState,
): ChainState {
  const workingData = getBarDatumValues(host, chartType, spec)
  const fresh = createChainState(workingData)
  return {
    ...fresh,
    originalData: prevState.originalData,
    lastResult: prevState.lastResult ?? workingData,
  }
}

export const drawTransformApplierGrouped = buildApplier<GroupedBarChartInstance>(ChartType.GROUPED_BAR)
export const drawTransformApplierStacked = buildApplier<StackedBarChartInstance>(ChartType.STACKED_BAR)

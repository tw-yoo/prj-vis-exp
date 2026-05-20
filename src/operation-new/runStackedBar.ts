import type { StackedSpec } from '../rendering/bar/stackedBarRenderer'
import { ensureStackedBarChartInstance } from '../rendering-new/instances/stackedBarInstance'
import { runStackedBarOperations } from '../operation-next/runners/stackedBar'
import type { ParsedOperationRun } from '../operation-next/types'

/**
 * STACKED_BAR op runner — wraps the existing `runStackedBarOperations` so
 * the new dispatcher path stays consistent across chart types.
 *
 * Phase 3b scope: ensure a `StackedBarChartInstance` is attached to the host
 * (so future substeps can hit the idempotent-render fast path), then delegate
 * to the existing runner which already produces correct annotations and
 * transitions for filter / diff / average / Draw ops.
 *
 * Future work: split into a registry of `OperationApplier<StackedBarChartInstance>`
 * objects with a new instance-driven `transitionChartScale` for stack
 * recalculation + color-legend transitions, matching the simple-line +
 * simple-bar pattern.
 */
export async function runStackedBarOperationsNew(run: ParsedOperationRun) {
  console.info('[operation-new] runStackedBarOperationsNew: entry', {
    groupCount: run.groups.length,
    opsTotal: run.groups.reduce((sum, g) => sum + g.ops.length, 0),
  })
  const instance = ensureStackedBarChartInstance(run.container, run.runtimeSpec as StackedSpec)
  await instance.waitForBuild()
  // Delegate to the existing well-tested runner. The instance attached above
  // ensures subsequent substep renderChart calls hit the no-op path.
  return runStackedBarOperations(run)
}

import type { GroupedSpec } from '../rendering/bar/groupedBarRenderer'
import { ensureGroupedBarChartInstance } from '../rendering-new/instances/groupedBarInstance'
import { runGroupedBarOperations } from '../operation-next/runners/groupedBar'
import type { ParsedOperationRun } from '../operation-next/types'

/**
 * GROUPED_BAR op runner — wraps the existing `runGroupedBarOperations`.
 * Attaches the instance for idempotent ensureRendered, then delegates to the
 * existing runner which handles facet-aware filter / diff / average / Draw
 * transforms.
 */
export async function runGroupedBarOperationsNew(run: ParsedOperationRun) {
  console.info('[operation-new] runGroupedBarOperationsNew: entry', {
    groupCount: run.groups.length,
    opsTotal: run.groups.reduce((sum, g) => sum + g.ops.length, 0),
  })
  const instance = ensureGroupedBarChartInstance(run.container, run.runtimeSpec as GroupedSpec)
  await instance.waitForBuild()
  return runGroupedBarOperations(run)
}

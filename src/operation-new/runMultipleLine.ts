import type { MultiLineSpec } from '../rendering/line/multipleLineRenderer'
import { ensureMultipleLineChartInstance } from '../rendering-new/instances/multipleLineInstance'
import { runMultipleLineOperations } from '../operation-next/runners/multipleLine'
import type { ParsedOperationRun } from '../operation-next/types'

/**
 * MULTI_LINE op runner — wraps the existing `runMultipleLineOperations`.
 * Attaches the instance for idempotent ensureRendered, then delegates to the
 * existing runner which handles per-series filter / diff / average /
 * findExtremum / lagDiff / pairDiff annotations.
 */
export async function runMultipleLineOperationsNew(run: ParsedOperationRun) {
  console.info('[operation-new] runMultipleLineOperationsNew: entry', {
    groupCount: run.groups.length,
    opsTotal: run.groups.reduce((sum, g) => sum + g.ops.length, 0),
  })
  const instance = ensureMultipleLineChartInstance(run.container, run.runtimeSpec as MultiLineSpec)
  await instance.waitForBuild()
  return runMultipleLineOperations(run)
}

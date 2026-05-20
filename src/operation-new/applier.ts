import type { ChartSpec, ChartTypeValue } from '../domain/chart'
import type { DatumValue, OperationSpec } from '../domain/operation/types'
import { OperationOp } from '../domain/operation/types'
import type { ChainState } from '../operation-next/chainState'
import type { RunChartOpsOptions } from '../operation-next/types'
import type { ChartInstance } from '../rendering-new/chartInstance'
import type { SimpleLineChartInstance } from '../rendering-new/instances/simpleLineInstance'

/**
 * Args passed to each applier. Generic over the chart-instance type so each
 * chart-type's appliers (simple-line, simple-bar, etc.) can type-narrow
 * `instance` to their specific class without losing per-chart fields. Default
 * is `ChartInstance` (the common interface) for legacy / non-typed call sites.
 */
export interface ApplierArgs<TInstance extends ChartInstance = SimpleLineChartInstance> {
  operation: OperationSpec
  operationIndex: number
  state: ChainState
  instance: TInstance
  options?: RunChartOpsOptions
  /**
   * Operations in the same group as `operation`. Used by filter appliers to
   * peek at the next op for filterSaliencePolicy decisions (e.g. filter→sort
   * triggers `remove` mode). Optional; appliers that don't need group context
   * ignore this.
   */
  groupOps?: OperationSpec[]
  groupOperationIndex?: number
  /** Original chart spec, in case the applier needs to consult encoding. */
  runtimeSpec?: ChartSpec
  /** Chart type from the dispatcher (e.g. ChartType.SIMPLE_BAR). */
  chartType?: ChartTypeValue
}

export interface ApplierResult {
  result: DatumValue[]
  nextState: ChainState
}

export interface OperationApplier<TInstance extends ChartInstance = SimpleLineChartInstance> {
  /** The operation type this applier handles (e.g. OperationOp.Filter). */
  readonly op: string
  apply(args: ApplierArgs<TInstance>): Promise<ApplierResult>
}

/**
 * Registry for appliers of one chart-type. The runner iterates ops and
 * dispatches each one to the applier whose `op` matches. Unknown ops are
 * skipped — same behaviour as the existing runners.
 *
 * Keying by `op` (the OperationOp string) means dispatch is op-agnostic in
 * the sense the runner doesn't have to know which ops chain together — each
 * applier reads ChainState and decides for itself.
 */
export function createApplierRegistry<TInstance extends ChartInstance>(
  appliers: OperationApplier<TInstance>[],
): Map<string, OperationApplier<TInstance>> {
  const map = new Map<string, OperationApplier<TInstance>>()
  for (const applier of appliers) {
    map.set(applier.op, applier)
  }
  return map
}

export { OperationOp }

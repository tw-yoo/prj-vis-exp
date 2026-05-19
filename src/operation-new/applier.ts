import type { DatumValue, OperationSpec } from '../domain/operation/types'
import { OperationOp } from '../domain/operation/types'
import type { ChainState } from '../operation-next/chainState'
import type { RunChartOpsOptions } from '../operation-next/types'
import type { SimpleLineChartInstance } from '../rendering-new/instances/simpleLineInstance'

export interface ApplierArgs {
  operation: OperationSpec
  operationIndex: number
  state: ChainState
  instance: SimpleLineChartInstance
  options?: RunChartOpsOptions
}

export interface ApplierResult {
  result: DatumValue[]
  nextState: ChainState
}

export interface OperationApplier {
  /** The operation type this applier handles (e.g. OperationOp.Filter). */
  readonly op: string
  apply(args: ApplierArgs): Promise<ApplierResult>
}

/**
 * Registry for simple-line appliers. The runner iterates ops and dispatches
 * each one to the applier whose `op` matches. Unknown ops are skipped — same
 * behaviour as the existing simple-line runner.
 *
 * Keying by `op` (the OperationOp string) means dispatch is op-agnostic in the
 * sense the runner doesn't have to know which ops chain together — each
 * applier reads ChainState and decides for itself.
 */
export function createApplierRegistry(appliers: OperationApplier[]): Map<string, OperationApplier> {
  const map = new Map<string, OperationApplier>()
  for (const applier of appliers) {
    map.set(applier.op, applier)
  }
  return map
}

export { OperationOp }

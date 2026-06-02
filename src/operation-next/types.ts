import type { OperationCompletedEvent, OperationReadyEvent } from '../application/usecases/runChartOperationsUseCase'
import type { ChartSpec, ChartTypeValue } from '../domain/chart'
import type { NormalizedOpsGroup, OpsSpecInput } from '../domain/operation/opsSpec'
import type { OperationSpec } from '../domain/operation/types'
import type { SurfaceManager } from '../runtime/surfaceManager'
import type { OperationRuntimeSnapshot, SerializableChainState } from './executionState'
import type { TensionPolicy } from './tensionPolicy'

export type RunChartOpsOptions = {
  onOperationReady?: (event: OperationReadyEvent) => Promise<void> | void
  onOperationCompleted?: (event: OperationCompletedEvent) => Promise<void> | void
  onGroupCompleted?: (event: {
    groupName: string
    groupIndex: number
    svgString: string
  }) => Promise<void> | void
  showSnapshotStrip?: boolean
  snapshotScale?: number
  runtimeScope?: string
  resetRuntime?: boolean
  runtimeSnapshot?: OperationRuntimeSnapshot
  initialChainState?: SerializableChainState | null
  referencedResultIds?: string[]
  /**
   * Result ids consumed by ops in groups that run AFTER this call (strictly
   * future groups). Lets the simple-bar / simple-line runners build a per-op
   * "still-live" keep set (`computeLiveReferencedIds(callOps, i) ∪ this`) so a
   * consumed annotation is removed once no current-or-later op needs it —
   * rather than the static all-groups `referencedResultIds`, which kept every
   * referenced annotation dimmed forever (case 1hlsoeyqlr1r1n41). Other chart
   * types ignore this field and keep the legacy `referencedResultIds` behavior.
   */
  futureReferencedResultIds?: string[]
  initialRenderMode?: 'always' | 'reuse-existing'
  surfaceManager?: SurfaceManager
  operationIndexStart?: number
  tensionPolicy?: TensionPolicy
  /**
   * Logical successor of the last op in this run, when known by the caller.
   * Used by the filter applier to detect a downstream subset-internal op even
   * when the run only contains the filter itself (substep / sentence splits
   * hide the real "next op" from runner-internal lookahead). Resolved by the
   * visual-execution-player from `logicalArtifacts.nodeOps`.
   */
  nextRunHeadOp?: OperationSpec
}

export type ParsedOperationRun = {
  container: HTMLElement
  originalSpec: ChartSpec
  runtimeSpec: ChartSpec
  chartType: ChartTypeValue
  opsSpec: OpsSpecInput
  groups: NormalizedOpsGroup[]
  options?: RunChartOpsOptions
}

export type OperationNextRunResult = {
  chartType: ChartTypeValue
  spec: ChartSpec
  groups: Array<{
    name: string
    operationCount: number
    operations: string[]
  }>
  operationCount: number
}

export type ChartOperationRunner = (run: ParsedOperationRun) => Promise<unknown>

export type SupportedOperationSummary = {
  dataOperations: string[]
  drawActions: string[]
}

export type OperationSpecLike = OperationSpec

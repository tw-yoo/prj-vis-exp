import type { OperationCompletedEvent, OperationReadyEvent } from '../application/usecases/runChartOperationsUseCase'
import type { ChartSpec, ChartTypeValue } from '../domain/chart'
import type { NormalizedOpsGroup, OpsSpecInput } from '../domain/operation/opsSpec'
import type { OperationSpec } from '../domain/operation/types'
import type { SurfaceManager } from '../runtime/surfaceManager'
import type { OperationRuntimeSnapshot, SerializableChainState } from './executionState'
import type { OperationNode } from './operationTree'
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
  initialRenderMode?: 'always' | 'reuse-existing'
  surfaceManager?: SurfaceManager
  operationIndexStart?: number
  tensionPolicy?: TensionPolicy
}

export type ParsedOperationRun = {
  container: HTMLElement
  originalSpec: ChartSpec
  runtimeSpec: ChartSpec
  chartType: ChartTypeValue
  opsSpec: OpsSpecInput
  groups: NormalizedOpsGroup[]
  operationTrees?: OperationNode[][]
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

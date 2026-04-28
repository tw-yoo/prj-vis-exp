import { makeRuntimeKey, resetRuntimeResults, restoreRuntimeResults, snapshotRuntimeResults, storeRuntimeResult, getRuntimeResultsById } from '../domain/operation/dataOps'
import type { DatumValue, OperationSpec } from '../domain/operation/types'
import { createChainState, type AnnotationRecord, type ChainState, type ScaleRecord } from './chainState'
import type { RunChartOpsOptions } from './types'
import { createFrameAfterOperation, createVisualizationFrame } from './visualizationFrame'

export type OperationRuntimeSnapshot = Record<string, DatumValue[]>

export type SerializableChainState = {
  originalData: DatumValue[]
  workingData: DatumValue[]
  derivedData: DatumValue[] | null
  lastResult: DatumValue[] | null
  salienceEntries: Array<[string, number]>
  annotationRecords: AnnotationRecord[]
  scaleState: ScaleRecord | null
}

export type OperationNextRunOutcome = {
  result: DatumValue[] | null
  continuation: SerializableChainState | null
  runtimeSnapshot: OperationRuntimeSnapshot
}

function cloneDatumValue(datum: DatumValue): DatumValue {
  return {
    category: datum.category,
    measure: datum.measure,
    semanticMeasure: datum.semanticMeasure ?? null,
    target: datum.target,
    displayTarget: datum.displayTarget ?? null,
    group: datum.group ?? null,
    panel: datum.panel ?? null,
    panelField: datum.panelField ?? null,
    value: datum.value,
    id: datum.id ?? null,
    lookupId: datum.lookupId ?? datum.id ?? null,
    name: datum.name ?? null,
    prevTarget: datum.prevTarget,
    series: datum.series ?? null,
  }
}

function cloneDatumValues(rows: DatumValue[] | null | undefined): DatumValue[] {
  if (!rows?.length) return []
  return rows.map(cloneDatumValue).filter((datum) => Number.isFinite(datum.value))
}

function operationKey(operation: OperationSpec) {
  const raw = operation as OperationSpec & { id?: string | number; key?: string | number }
  return raw.key ?? raw.id ?? operation.op ?? 'step'
}

export function initializeOperationRuntime(options?: RunChartOpsOptions) {
  if (options?.runtimeSnapshot) {
    restoreOperationRuntimeSnapshot(options.runtimeSnapshot)
    return
  }
  if (options?.resetRuntime !== false) {
    resetRuntimeResults()
  }
}

export function captureOperationRuntimeSnapshot(): OperationRuntimeSnapshot {
  const snapshot = snapshotRuntimeResults()
  const serialized: OperationRuntimeSnapshot = {}
  snapshot.forEach((rows, key) => {
    serialized[key] = cloneDatumValues(rows)
  })
  return serialized
}

export function restoreOperationRuntimeSnapshot(snapshot: OperationRuntimeSnapshot | null | undefined) {
  const restored = new Map<string, DatumValue[]>()
  if (snapshot) {
    Object.entries(snapshot).forEach(([key, rows]) => {
      restored.set(key, cloneDatumValues(rows))
    })
  }
  restoreRuntimeResults(restored)
}

export function serializeChainState(state: ChainState | null | undefined): SerializableChainState | null {
  if (!state) return null
  return {
    originalData: cloneDatumValues(state.originalData),
    workingData: cloneDatumValues(state.workingData),
    derivedData: state.derivedData ? cloneDatumValues(state.derivedData) : null,
    lastResult: state.lastResult ? cloneDatumValues(state.lastResult) : null,
    salienceEntries: Array.from(state.salienceMap.entries()),
    annotationRecords: state.annotationRecords.map((record) => ({ ...record })),
    scaleState: state.scaleState ? { ...state.scaleState } : null,
  }
}

export function restoreChainState(baseData: DatumValue[], serialized: SerializableChainState | null | undefined): ChainState {
  if (!serialized) return createChainState(baseData)
  return {
    originalData: cloneDatumValues(serialized.originalData.length > 0 ? serialized.originalData : baseData),
    workingData: cloneDatumValues(serialized.workingData.length > 0 ? serialized.workingData : baseData),
    derivedData: serialized.derivedData ? cloneDatumValues(serialized.derivedData) : null,
    lastResult: serialized.lastResult ? cloneDatumValues(serialized.lastResult) : null,
    salienceMap: new Map(serialized.salienceEntries),
    annotationRecords: serialized.annotationRecords.map((record) => ({ ...record })),
    scaleState: serialized.scaleState ? { ...serialized.scaleState } : null,
    currentFrame: createVisualizationFrame({ id: 'frame_restored' }),
    prevFrame: null,
  }
}

export function storeOperationRuntimeResult(
  operation: OperationSpec,
  operationIndex: number,
  result: DatumValue[] | null | undefined,
  runtimeScope = 'ops',
) {
  if (!result?.length) return
  const keys = new Set<string>()
  const raw = operation as OperationSpec & { id?: string | number; key?: string | number }
  if (raw.id != null) keys.add(String(raw.id))
  if (raw.key != null) keys.add(String(raw.key))
  const nodeId = operation.meta?.nodeId
  if (typeof nodeId === 'string' || typeof nodeId === 'number') keys.add(String(nodeId))
  keys.add(makeRuntimeKey(operationKey(operation), operationIndex))
  keys.add(`${runtimeScope}_${operationIndex}`)
  keys.forEach((key) => storeRuntimeResult(key, result))
}

function selectorContainsRef(value: unknown): boolean {
  if (value == null) return false
  if (Array.isArray(value)) return value.some(selectorContainsRef)
  if (typeof value === 'string') return value.startsWith('ref:')
  if (typeof value === 'object') {
    const id = (value as { id?: unknown }).id
    return typeof id === 'string' && id.startsWith('ref:')
  }
  return false
}

export function stateWithOperationDependencies(operation: OperationSpec, state: ChainState): ChainState {
  const inputs = Array.isArray(operation.meta?.inputs)
    ? operation.meta.inputs.filter((input): input is string | number => typeof input === 'string' || typeof input === 'number')
    : []
  const hasExplicitDiffTargets = operation.op === 'diff' && (operation.targetA != null || operation.targetB != null)
  const hasRefDiffTarget = selectorContainsRef(operation.targetA) || selectorContainsRef(operation.targetB)
  if (hasExplicitDiffTargets && hasRefDiffTarget) {
    return {
      ...state,
      workingData: cloneDatumValues(state.originalData),
      derivedData: null,
      lastResult: null,
      currentFrame: createVisualizationFrame({ id: 'frame_dependency_reset' }),
      prevFrame: null,
    }
  }
  if (inputs.length === 0) {
    return {
      ...state,
      workingData: cloneDatumValues(state.originalData),
      derivedData: null,
      lastResult: null,
      currentFrame: createVisualizationFrame({ id: 'frame_dependency_reset' }),
      prevFrame: null,
    }
  }
  const rows = inputs.flatMap((input) => getRuntimeResultsById(input))
  if (rows.length === 0) return state
  return {
    ...state,
    workingData: rows,
    derivedData: null,
    lastResult: rows,
    currentFrame: createVisualizationFrame({ id: 'frame_dependency_rows' }),
    prevFrame: null,
  }
}

export function stateWithFrameForOperation(operation: OperationSpec, operationIndex: number, state: ChainState): ChainState {
  return {
    ...state,
    prevFrame: state.currentFrame,
    currentFrame: createFrameAfterOperation(operation, operationIndex),
  }
}

export function stateWithCompletedFrame(state: ChainState): ChainState {
  return {
    ...state,
    prevFrame: state.currentFrame,
  }
}

export function buildOperationNextRunOutcome(result: DatumValue[] | null, state: ChainState | null): OperationNextRunOutcome {
  return {
    result,
    continuation: serializeChainState(state),
    runtimeSnapshot: captureOperationRuntimeSnapshot(),
  }
}

export function isOperationNextRunOutcome(value: unknown): value is OperationNextRunOutcome {
  return !!value && typeof value === 'object' && 'runtimeSnapshot' in value && 'continuation' in value && 'result' in value
}

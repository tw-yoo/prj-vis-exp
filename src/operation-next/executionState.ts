import { makeRuntimeKey, resetRuntimeResults, restoreRuntimeResults, snapshotRuntimeResults, storeRuntimeResult, getRuntimeResultsById } from '../domain/operation/dataOps'
import type { DatumValue, OperationSpec } from '../domain/operation/types'
import { createChainState, type AnnotationRecord, type ChainState, type ScaleRecord } from './chainState'
import type { RunChartOpsOptions } from './types'

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

function extractRefNodeId(v: unknown, out: Set<string>): void {
  if (typeof v === 'string' && v.startsWith('ref:')) {
    const id = v.slice('ref:'.length).trim()
    if (id) out.add(id)
  } else if (typeof v === 'object' && v != null && !Array.isArray(v)) {
    const objId = (v as { id?: unknown }).id
    if (typeof objId === 'string' && objId.startsWith('ref:')) {
      const id = objId.slice('ref:'.length).trim()
      if (id) out.add(id)
    }
  }
}

/**
 * Collect node IDs that this operation uses purely as scalar threshold/reference values
 * (not as data row sources). These inputs must NOT replace workingData.
 *
 * Rule: an input is a scalar ref iff its node ID appears as "ref:nX" in any
 * scalar-value field of the operation. No inputs[0] fallback convention.
 *
 * Covered patterns:
 *   filter     — value: "ref:n1"  or  value: ["ref:n1","ref:n2"]  (between)
 *   diff       — targetA/B: "ref:n1" or { id: "ref:n1" }
 *   diffByValue — targetValue: "ref:n1"  (must be explicit; no inputs[0] fallback)
 */
function collectScalarRefNodeIds(operation: OperationSpec): Set<string> {
  const ids = new Set<string>()
  const op = operation as Record<string, unknown>

  // filter: value is "ref:n1" (string) or ["ref:n1","ref:n2"] (between bounds)
  const rawValue = op.value
  if (Array.isArray(rawValue)) {
    rawValue.forEach((v) => extractRefNodeId(v, ids))
  } else {
    extractRefNodeId(rawValue, ids)
  }

  // diff / compareBool: targetA / targetB
  extractRefNodeId(op.targetA, ids)
  extractRefNodeId(op.targetB, ids)

  // diffByValue: targetValue must be "ref:nX" — no inputs[0] fallback
  extractRefNodeId(op.targetValue, ids)

  return ids
}

export function stateWithOperationDependencies(operation: OperationSpec, state: ChainState): ChainState {
  const inputs = Array.isArray(operation.meta?.inputs)
    ? operation.meta.inputs.filter((input): input is string | number => typeof input === 'string' || typeof input === 'number')
    : []

  if (inputs.length === 0) {
    return {
      ...state,
      workingData: cloneDatumValues(state.originalData),
      derivedData: null,
      lastResult: null,
    }
  }

  // Identify inputs that serve only as scalar threshold/reference values.
  // They resolve their data via getRuntimeResultsById at call time (e.g. resolveFilterRefThreshold)
  // and must NOT replace the operation's working dataset.
  const scalarRefIds = collectScalarRefNodeIds(operation)
  const dataInputs = inputs.filter((id) => !scalarRefIds.has(String(id)))

  if (dataInputs.length === 0) {
    // All inputs are scalar refs → operate on the full original dataset
    return {
      ...state,
      workingData: cloneDatumValues(state.originalData),
      derivedData: null,
      lastResult: null,
    }
  }

  const rows = dataInputs.flatMap((input) => getRuntimeResultsById(input))
  if (rows.length === 0) return state
  return {
    ...state,
    workingData: rows,
    derivedData: null,
    lastResult: rows,
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

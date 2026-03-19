import { ChartType, getChartType, type VegaLiteSpec } from '../domain/chart'
import { normalizeOpsGroups, type OpsSpecGroupMap } from '../domain/operation/opsSpec'
import type { DatumValue, OperationSpec, TargetSelector } from '../domain/operation/types'
import { OperationOp } from '../domain/operation/types'
import { toDatumValuesFromRaw } from '../domain/data/datum'
import { executeDataOperation } from '../application/services/executeDataOperation'
import { restoreRuntimeResults, resetRuntimeResults, snapshotRuntimeResults, storeRuntimeResult } from '../domain/operation/dataOps'
import { STANDARD_DATA_OP_HANDLERS } from '../rendering/ops/common/dataHandlers'
import { resolveEncodingFields } from '../rendering/ops/common/resolveEncodingFields'

type DataRow = Record<string, unknown>

type SurfaceTemplate =
  | 'two-value-chart'
  | 'mixed-operands-chart'
  | 'operand-only-chart'
  | 'filtered-operands-chart'
  | 'scalar-reference-chart'

export type ChartFamily = 'bar' | 'line'
export type NodeResultKind = 'source-backed' | 'source-aggregate' | 'synthetic-result'

export type NodeProvenance = {
  resultKind: NodeResultKind
  sourceSelectors: TargetSelector | TargetSelector[] | null
  displaySurfaceHint: 'source-chart' | 'derived-chart'
}

export type LogicalExecutionArtifacts = {
  chartFamily: ChartFamily | null
  baseWorking: DatumValue[]
  nodeOps: Map<string, OperationSpec>
  nodeInputs: Map<string, DatumValue[]>
  nodeResults: Map<string, DatumValue[]>
  resultStore: Map<string, DatumValue[]>
  nodeKinds: Map<string, NodeResultKind>
  nodeSourceSelectors: Map<string, TargetSelector | TargetSelector[] | null>
  nodeProvenance: Map<string, NodeProvenance>
}

export type PreparedSurface = {
  nodeId: string
  family: ChartFamily
  surfaceType: 'derived-chart'
  playbackSpec: VegaLiteSpec
  surfaceRows: DatumValue[]
  surfaceSchema: SurfaceSchema
  materializeOps: OperationSpec[]
  runOps: OperationSpec[]
  selectors: PreparedSurfaceSelectors
}

export type SurfaceSchema = {
  family: ChartFamily
  sourceCategoryField: string | null
  sourceMeasureField: string | null
  sourceGroupField: string | null
  categoryField: 'target'
  measureField: 'value'
  groupField: 'group' | 'series' | null
}

export type BuildSurfaceFailureReason =
  | 'unsupported-template'
  | 'missing-node'
  | 'missing-logical-artifacts'
  | 'requires-grouped-spec'
  | 'empty-derived-rows'
  | 'invalid-surface-selectors'

export type BuildSurfaceResult =
  | {
      ok: true
      surface: PreparedSurface
    }
  | {
      ok: false
      reason: BuildSurfaceFailureReason
      detail?: string
    }

export type DerivedSurfaceSelection = {
  templateType: SurfaceTemplate
  sourceNodeIds: string[]
}

export type PreparedSurfaceSelectors = {
  nodeSelectorMap: Map<string, TargetSelector | TargetSelector[]>
  selectorAliases: Map<string, TargetSelector | TargetSelector[]>
}

type SurfaceRowsResult =
  | {
      ok: true
      rows: DatumValue[]
      family: ChartFamily
    }
  | {
      ok: false
      reason: BuildSurfaceFailureReason
      detail?: string
    }

function getNodeId(op: OperationSpec): string | null {
  const metaNodeId = typeof op.meta?.nodeId === 'string' ? op.meta.nodeId.trim() : ''
  if (metaNodeId) return metaNodeId
  const opId = typeof (op as { id?: unknown }).id === 'string' ? (op as { id?: string }).id?.trim() ?? '' : ''
  return opId || null
}

function nodeSortKey(value: string | null, fallbackIndex: number) {
  if (value && /^n\d+$/i.test(value)) {
    return Number(value.slice(1))
  }
  return 1_000_000 + fallbackIndex
}

function cloneDatum(row: DatumValue): DatumValue {
  return {
    category: row.category ?? null,
    measure: row.measure ?? null,
    target: String(row.target),
    group: row.group ?? null,
    value: Number(row.value),
    id: row.id ?? null,
    lookupId: row.lookupId ?? row.id ?? null,
    name: row.name ?? null,
    prevTarget: row.prevTarget,
    series: row.series ?? null,
  }
}

function inputNodeIds(op: OperationSpec) {
  return (Array.isArray(op.meta?.inputs) ? op.meta.inputs : [])
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => value.trim())
}

function uniqueRows(rows: DatumValue[]) {
  const seen = new Set<string>()
  const out: DatumValue[] = []
  rows.forEach((row, index) => {
    const key = `${row.id ?? ''}::${row.lookupId ?? ''}::${row.group ?? row.series ?? ''}::${row.target}::${row.value}::${index}`
    if (seen.has(key)) return
    seen.add(key)
    out.push(cloneDatum(row))
  })
  return out
}

function toBaseWorkingData(spec: VegaLiteSpec, dataRows: DataRow[]): DatumValue[] {
  const resolved = resolveEncodingFields(spec)
  if (!resolved || !dataRows.length) return []
  return toDatumValuesFromRaw(
    dataRows as Array<Record<string, string | number | boolean | null>>,
    {
      xField: resolved.xField,
      yField: resolved.yField,
      groupField: resolved.groupField,
    },
    {
      groupFallback: (row) => {
        const group = (row as Record<string, unknown>).group ?? (row as Record<string, unknown>).series ?? null
        return group == null ? null : String(group)
      },
    },
  ).filter((row) => Number.isFinite(row.value))
}

function resolveChartFamily(spec: VegaLiteSpec): ChartFamily | null {
  const chartType = getChartType(spec)
  if (
    chartType === ChartType.SIMPLE_BAR ||
    chartType === ChartType.GROUPED_BAR ||
    chartType === ChartType.STACKED_BAR
  ) {
    return 'bar'
  }
  if (chartType === ChartType.SIMPLE_LINE || chartType === ChartType.MULTI_LINE) {
    return 'line'
  }
  return null
}

function opStoreIds(op: OperationSpec, nodeId: string | null) {
  const ids = new Set<string>()
  if (nodeId) ids.add(nodeId)
  const opId =
    typeof (op as { id?: unknown }).id === 'string' ? ((op as { id?: string }).id ?? '').trim() : ''
  if (opId) ids.add(opId)
  return ids
}

function resolveLogicalInputSeed(
  operation: OperationSpec,
  baseWorking: DatumValue[],
  resultStore: Map<string, DatumValue[]>,
) {
  if (operation.op === OperationOp.Filter) return baseWorking
  const inputs = (Array.isArray(operation.meta?.inputs) ? operation.meta.inputs : []).filter(
    (value): value is string | number => typeof value === 'string' || typeof value === 'number',
  )
  if (!inputs.length) return baseWorking
  const merged = inputs.flatMap((depId) => resultStore.get(String(depId)) ?? [])
  return merged.length ? merged : baseWorking
}

function selectorsFromResultRows(rows: DatumValue[]): TargetSelector | TargetSelector[] | null {
  if (!rows.length || !rows.every((row) => !isSyntheticTarget(String(row.target)))) return null
  const selectors = uniqueRows(rows).map((row) => rowToSelector(row))
  if (!selectors.length) return null
  return selectors.length === 1 ? selectors[0] : selectors
}

function selectorKindsFromNodeIds(nodeIds: string[], nodeKinds: Map<string, NodeResultKind>): NodeResultKind[] {
  return nodeIds
    .map((nodeId) => nodeKinds.get(nodeId))
    .filter((kind): kind is NodeResultKind => kind != null)
}

function classifyNodeResult(args: {
  op: OperationSpec
  result: DatumValue[]
  nodeKinds: Map<string, NodeResultKind>
}): NodeProvenance {
  const { op, result, nodeKinds } = args
  const sourceSelectors = selectorsFromResultRows(result)
  const opInputs = inputNodeIds(op)
  const inputKinds = selectorKindsFromNodeIds(opInputs, nodeKinds)

  const aggregateWithoutInputs =
    (op.op === OperationOp.Average ||
      op.op === OperationOp.Sum ||
      op.op === OperationOp.Count ||
      op.op === OperationOp.DetermineRange) &&
    opInputs.length === 0

  if (aggregateWithoutInputs) {
    return {
      resultKind: 'source-aggregate',
      sourceSelectors: null,
      displaySurfaceHint: 'source-chart',
    }
  }

  const alwaysSynthetic =
    op.op === OperationOp.Diff ||
    op.op === OperationOp.Add ||
    op.op === OperationOp.Scale ||
    op.op === OperationOp.CompareBool ||
    op.op === OperationOp.PairDiff ||
    op.op === OperationOp.LagDiff ||
    ((op.op === OperationOp.Average ||
      op.op === OperationOp.Sum ||
      op.op === OperationOp.Count ||
      op.op === OperationOp.DetermineRange) &&
      opInputs.length > 0)

  if (alwaysSynthetic) {
    return {
      resultKind: 'synthetic-result',
      sourceSelectors: null,
      displaySurfaceHint: 'derived-chart',
    }
  }

  const compareWithNonMarkOperand =
    op.op === OperationOp.Compare &&
    inputKinds.length > 0 &&
    inputKinds.some((kind) => kind !== 'source-backed')

  if (compareWithNonMarkOperand) {
    return {
      resultKind: 'synthetic-result',
      sourceSelectors: null,
      displaySurfaceHint: 'derived-chart',
    }
  }

  if (sourceSelectors) {
    return {
      resultKind: 'source-backed',
      sourceSelectors,
      displaySurfaceHint: 'source-chart',
    }
  }

  return {
    resultKind: 'synthetic-result',
    sourceSelectors: null,
    displaySurfaceHint: 'derived-chart',
  }
}

export function buildLogicalExecutionArtifacts(args: {
  spec: VegaLiteSpec
  dataRows: DataRow[]
  logicalOpsSpec?: OpsSpecGroupMap
}): LogicalExecutionArtifacts | null {
  const { spec, dataRows, logicalOpsSpec } = args
  if (!logicalOpsSpec) return null

  const baseWorking = toBaseWorkingData(spec, dataRows)
  const nodeOps = new Map<string, OperationSpec>()
  const nodeInputs = new Map<string, DatumValue[]>()
  const nodeResults = new Map<string, DatumValue[]>()
  const resultStore = new Map<string, DatumValue[]>()
  const nodeKinds = new Map<string, NodeResultKind>()
  const nodeSourceSelectors = new Map<string, TargetSelector | TargetSelector[] | null>()
  const nodeProvenance = new Map<string, NodeProvenance>()
  const flattened = normalizeOpsGroups(logicalOpsSpec)
    .flatMap((group, groupIndex) =>
      group.ops.map((op, opIndex) => ({
        op,
        order: groupIndex * 10_000 + opIndex,
        nodeId: getNodeId(op),
      })),
    )
    .filter((entry) => entry.op.op && entry.op.op !== OperationOp.Draw && entry.op.op !== OperationOp.Sleep)
    .sort((a, b) => {
      const delta = nodeSortKey(a.nodeId, a.order) - nodeSortKey(b.nodeId, b.order)
      if (delta !== 0) return delta
      return a.order - b.order
    })

  const runtimeSnapshot = snapshotRuntimeResults()
  try {
    resetRuntimeResults()
    for (const entry of flattened) {
      resetRuntimeResults()
      resultStore.forEach((rows, id) => {
        storeRuntimeResult(id, rows)
      })

      const input = resolveLogicalInputSeed(entry.op, baseWorking, resultStore).map(cloneDatum)
      const executed = executeDataOperation(input, entry.op, STANDARD_DATA_OP_HANDLERS)
      if (!executed) continue

      const result = executed.result.map(cloneDatum)
      if (entry.nodeId) {
        nodeOps.set(entry.nodeId, entry.op)
        nodeInputs.set(entry.nodeId, input)
        nodeResults.set(entry.nodeId, result)
        const provenance = classifyNodeResult({
          op: entry.op,
          result,
          nodeKinds,
        })
        nodeKinds.set(entry.nodeId, provenance.resultKind)
        nodeSourceSelectors.set(entry.nodeId, provenance.sourceSelectors)
        nodeProvenance.set(entry.nodeId, provenance)
      }
      opStoreIds(entry.op, entry.nodeId).forEach((id) => {
        resultStore.set(id, result)
        if (entry.nodeId) {
          const provenance = nodeProvenance.get(entry.nodeId)
          if (provenance) {
            nodeKinds.set(id, provenance.resultKind)
            nodeSourceSelectors.set(id, provenance.sourceSelectors)
            nodeProvenance.set(id, provenance)
          }
        }
      })
    }
  } finally {
    restoreRuntimeResults(runtimeSnapshot)
  }

  return {
    chartFamily: resolveChartFamily(spec),
    baseWorking,
    nodeOps,
    nodeInputs,
    nodeResults,
    resultStore,
    nodeKinds,
    nodeSourceSelectors,
    nodeProvenance,
  }
}

function isSyntheticTarget(target: string) {
  return target.startsWith('__')
}

function operandLabel(nodeId: string, rows: DatumValue[]) {
  const first = rows[0]
  if (typeof first?.name === 'string' && first.name.trim().length > 0) return first.name.trim()
  if (rows.length === 1 && !isSyntheticTarget(String(first?.target ?? ''))) return String(first?.target ?? nodeId)
  return nodeId
}

function normalizeOperandRows(nodeId: string, rows: DatumValue[]) {
  const label = operandLabel(nodeId, rows)
  return rows
    .map((row) => {
      const cloned = cloneDatum(row)
      cloned.id = nodeId
      cloned.lookupId = nodeId
      cloned.series = cloned.series ?? cloned.group ?? null
      if (isSyntheticTarget(cloned.target)) {
        // Keep a stable internal playback key so synthetic operands with the
        // same human-readable label do not collapse onto a single x-domain slot.
        cloned.target = nodeId
      }
      if (!cloned.name || !String(cloned.name).trim()) {
        cloned.name = label
      }
      return cloned
    })
    .filter((row) => Number.isFinite(row.value))
}

function rowToSelector(row: DatumValue): TargetSelector {
  const id =
    typeof row.id === 'string' && row.id.trim().length > 0
      ? row.id.trim()
      : typeof row.lookupId === 'string' && row.lookupId.trim().length > 0
        ? row.lookupId.trim()
        : undefined
  const group = row.group ?? row.series ?? null
  if (group != null && String(group).trim().length > 0) {
    return {
      ...(id ? { id } : {}),
      category: String(row.target),
      series: String(group),
    }
  }
  return {
    ...(id ? { id } : {}),
    target: String(row.target),
  }
}

type SurfaceSelector = {
  target?: string
  id?: string
  group?: string | null
}

function selectorEntries(
  selector: TargetSelector | TargetSelector[] | undefined,
  fallbackGroup: string | null | undefined,
): SurfaceSelector[] {
  if (selector == null) return []
  if (Array.isArray(selector)) {
    return selector.flatMap((entry) => selectorEntries(entry, fallbackGroup))
  }
  if (typeof selector === 'number') {
    return [{ target: String(selector), group: fallbackGroup ?? null }]
  }
  if (typeof selector === 'string') {
    if (selector.startsWith('ref:')) {
      return [{ id: selector.slice('ref:'.length), group: fallbackGroup ?? null }]
    }
    return [{ target: selector, group: fallbackGroup ?? null }]
  }
  if (typeof selector === 'object') {
    const group = typeof selector.series === 'string' ? selector.series : fallbackGroup ?? null
    const category = selector.category ?? selector.target
    const id = typeof selector.id === 'string' && selector.id.trim().length > 0 ? selector.id.trim() : undefined
    const text = category == null ? undefined : String(category)
    if (id) {
      return [{ id, ...(text ? { target: text } : {}), group }]
    }
    if (category == null) return []
    const categoryText = String(category)
    if (categoryText.startsWith('ref:')) {
      return [{ id: categoryText.slice('ref:'.length), group }]
    }
    return [{ target: categoryText, group }]
  }
  return []
}

function selectorRefIds(selector: TargetSelector | TargetSelector[] | undefined): string[] {
  if (selector == null) return []
  if (Array.isArray(selector)) return selector.flatMap((entry) => selectorRefIds(entry))
  if (typeof selector === 'string') {
    return selector.startsWith('ref:') ? [selector.slice('ref:'.length)] : []
  }
  if (typeof selector === 'object') {
    if (typeof selector.id === 'string' && selector.id.trim().length > 0) {
      return [selector.id.trim()]
    }
    const category = selector.category ?? selector.target
    if (typeof category === 'string' && category.startsWith('ref:')) {
      return [category.slice('ref:'.length)]
    }
  }
  return []
}

function isNodeRefText(value: string) {
  return /^n\d+$/i.test(value.trim())
}

function isSourceBackedRows(rows: DatumValue[]) {
  return rows.length > 0 && rows.every((row) => !isSyntheticTarget(String(row.target)))
}

export function resolveRefOperandKind(
  refNodeId: string,
  artifacts: LogicalExecutionArtifacts | null,
): NodeResultKind {
  if (!artifacts) return 'synthetic-result'
  return artifacts.nodeKinds.get(refNodeId) ?? 'synthetic-result'
}

function canonicalizeSelectorToSource(
  selector: TargetSelector | TargetSelector[] | undefined,
  artifacts: LogicalExecutionArtifacts,
): TargetSelector | TargetSelector[] | undefined {
  if (selector == null) return selector
  if (Array.isArray(selector)) {
    const resolved = selector.map((entry) => canonicalizeSelectorToSource(entry, artifacts)).filter((entry) => entry != null)
    return resolved.length > 0 ? (resolved as TargetSelector[]) : selector
  }
  if (typeof selector === 'string') {
    if (!selector.startsWith('ref:')) return selector
    const nodeId = selector.slice('ref:'.length)
    if (resolveRefOperandKind(nodeId, artifacts) !== 'source-backed') return selector
    return artifacts.nodeSourceSelectors.get(nodeId) ?? selector
  }
  if (typeof selector === 'object') {
    if (typeof selector.id === 'string' && selector.id.trim().length > 0) {
      const nodeId = selector.id.trim()
      if (!isNodeRefText(nodeId)) return selector
      if (resolveRefOperandKind(nodeId, artifacts) !== 'source-backed') return selector
      return artifacts.nodeSourceSelectors.get(nodeId) ?? selector
    }
    const category = selector.category ?? selector.target
    if (typeof category === 'string' && category.startsWith('ref:')) {
      const nodeId = category.slice('ref:'.length)
      if (resolveRefOperandKind(nodeId, artifacts) !== 'source-backed') return selector
      return artifacts.nodeSourceSelectors.get(nodeId) ?? selector
    }
  }
  return selector
}

export function resolveSourceBackedSelectors(
  op: OperationSpec,
  artifacts: LogicalExecutionArtifacts | null,
): OperationSpec {
  if (!artifacts) return op
  return {
    ...op,
    target: canonicalizeSelectorToSource(op.target, artifacts),
    targetA: canonicalizeSelectorToSource(op.targetA, artifacts),
    targetB: canonicalizeSelectorToSource(op.targetB, artifacts),
  }
}

function collectSourceNodeIds(op: OperationSpec): string[] {
  const out = new Set<string>()
  selectorRefIds(op.target).forEach((id) => out.add(id))
  selectorRefIds(op.targetA).forEach((id) => out.add(id))
  selectorRefIds(op.targetB).forEach((id) => out.add(id))
  ;(Array.isArray(op.meta?.inputs) ? op.meta.inputs : []).forEach((value) => {
    if (typeof value === 'string' && value.trim().length > 0) out.add(value.trim())
  })
  return [...out]
}

function selectorHasRef(selector: TargetSelector | TargetSelector[] | undefined) {
  return selectorRefIds(selector).length > 0
}

function isCanonicalSourceSelector(selector: TargetSelector | TargetSelector[] | undefined) {
  if (selector == null) return false
  return !selectorHasRef(selector)
}

function mergeNodeKinds(kinds: NodeResultKind[]): NodeResultKind | null {
  if (!kinds.length) return null
  if (kinds.includes('synthetic-result')) return 'synthetic-result'
  if (kinds.includes('source-aggregate')) return 'source-aggregate'
  return 'source-backed'
}

function resolveSelectorKind(
  selector: TargetSelector | TargetSelector[] | undefined,
  artifacts: LogicalExecutionArtifacts | null,
): NodeResultKind | null {
  if (selector == null) return null
  if (Array.isArray(selector)) {
    return mergeNodeKinds(
      selector
        .map((entry) => resolveSelectorKind(entry, artifacts))
        .filter((kind): kind is NodeResultKind => kind != null),
    )
  }
  if (typeof selector === 'string') {
    if (selector.startsWith('ref:')) {
      return resolveRefOperandKind(selector.slice('ref:'.length), artifacts)
    }
    return 'source-backed'
  }
  if (typeof selector === 'number') return 'source-backed'
  if (typeof selector === 'object') {
    if (typeof selector.id === 'string' && selector.id.trim().length > 0) {
      const id = selector.id.trim()
      if (id.startsWith('ref:') && isNodeRefText(id.slice('ref:'.length))) {
        return resolveRefOperandKind(id.slice('ref:'.length), artifacts)
      }
      if (isNodeRefText(id)) {
        return resolveRefOperandKind(id, artifacts)
      }
      return 'source-backed'
    }
    const category = selector.category ?? selector.target
    if (typeof category === 'string' && category.startsWith('ref:')) {
      return resolveRefOperandKind(category.slice('ref:'.length), artifacts)
    }
    return 'source-backed'
  }
  return null
}

export function shouldMaterializeDerivedSurface(args: {
  op: OperationSpec
  artifacts: LogicalExecutionArtifacts | null
  templateType?: string
  sourceNodeIds?: string[]
}): DerivedSurfaceSelection | null {
  const { op, artifacts, templateType } = args
  if (!artifacts) return null

  const requestedNodeIds = (args.sourceNodeIds ?? []).filter(
    (value): value is string => typeof value === 'string' && value.trim().length > 0,
  )
  const inferredNodeIds = collectSourceNodeIds(op)
  const sourceNodeIds = Array.from(new Set([...requestedNodeIds, ...inferredNodeIds]))

  const withTemplate = (fallback: SurfaceTemplate) => ({
    templateType:
      templateType === 'two-value-chart' ||
      templateType === 'mixed-operands-chart' ||
      templateType === 'operand-only-chart' ||
      templateType === 'filtered-operands-chart' ||
      templateType === 'scalar-reference-chart'
        ? templateType
        : fallback,
    sourceNodeIds,
  })

  switch (op.op) {
    case OperationOp.Average:
    case OperationOp.Sum:
    case OperationOp.Count: {
      if ((Array.isArray(op.meta?.inputs) ? op.meta.inputs.length : 0) > 0) {
        return withTemplate(op.group || op.groupA || op.groupB ? 'filtered-operands-chart' : 'operand-only-chart')
      }
      return null
    }
    case OperationOp.Diff:
    case OperationOp.Compare:
    case OperationOp.CompareBool:
    case OperationOp.Add: {
      const leftKind = resolveSelectorKind(op.targetA, artifacts)
      const rightKind = resolveSelectorKind(op.targetB, artifacts)
      const kinds = [leftKind, rightKind].filter((kind): kind is NodeResultKind => kind != null)
      if (!kinds.length || kinds.every((kind) => kind !== 'synthetic-result')) return null
      const syntheticCount = kinds.filter((kind) => kind === 'synthetic-result').length
      return withTemplate(syntheticCount >= 2 ? 'two-value-chart' : 'mixed-operands-chart')
    }
    case OperationOp.Scale: {
      const targetKind = resolveSelectorKind(op.target, artifacts)
      if (targetKind === 'synthetic-result') {
        return withTemplate('scalar-reference-chart')
      }
      return null
    }
    default:
      return null
  }
}

export function selectDerivedSurfaceForOperation(args: {
  op: OperationSpec
  artifacts: LogicalExecutionArtifacts | null
  templateType?: string
  sourceNodeIds?: string[]
}): DerivedSurfaceSelection | null {
  return shouldMaterializeDerivedSurface(args)
}

function matchesSelector(row: DatumValue, selector: SurfaceSelector) {
  if (selector.group != null && String(row.group ?? row.series ?? '') !== String(selector.group)) {
    return false
  }
  if (selector.id) {
    const rowIds = [row.id, row.lookupId].filter((value): value is string => typeof value === 'string' && value.length > 0)
    return rowIds.includes(selector.id)
  }
  if (selector.target) {
    return String(row.target) === selector.target
  }
  return false
}

function sliceBySelector(
  rows: DatumValue[],
  selector: TargetSelector | TargetSelector[] | undefined,
  fallbackGroup: string | null | undefined,
) {
  const entries = selectorEntries(selector, fallbackGroup)
  if (!entries.length) return []
  return rows.filter((row) => entries.some((entry) => matchesSelector(row, entry)))
}

function applyDeclaredGroupScope(rows: DatumValue[], op: OperationSpec) {
  const groups = new Set(
    [op.group, op.groupA, op.groupB]
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim())
      .filter((value) => value.length > 0),
  )
  if (!groups.size) return rows
  return rows.filter((row) => groups.has(String(row.group ?? row.series ?? '')))
}

function selectRowsForOperation(op: OperationSpec, inputRows: DatumValue[]) {
  const scoped = applyDeclaredGroupScope(inputRows, op)

  switch (op.op) {
    case OperationOp.RetrieveValue:
    case OperationOp.Scale: {
      const selected = sliceBySelector(scoped, op.target, op.group ?? null)
      return selected.length ? selected : scoped
    }
    case OperationOp.Compare:
    case OperationOp.CompareBool:
    case OperationOp.Diff:
    case OperationOp.Add: {
      const left = sliceBySelector(scoped, op.targetA, op.groupA ?? op.group ?? null)
      const right = sliceBySelector(scoped, op.targetB, op.groupB ?? op.group ?? null)
      const combined = uniqueRows([...left, ...right])
      return combined.length ? combined : scoped
    }
    default:
      return scoped.length ? scoped : inputRows
  }
}

function buildSurfaceRows(args: {
  spec: VegaLiteSpec
  artifacts: LogicalExecutionArtifacts
  op: OperationSpec
  nodeId: string
  templateType?: string
  sourceNodeIds: string[]
}): SurfaceRowsResult {
  const { spec, artifacts, op, nodeId, templateType, sourceNodeIds } = args
  const family = artifacts.chartFamily
  if (!family) {
    return { ok: false, reason: 'unsupported-template', detail: 'unknown chart family' }
  }

  if (templateType === 'filtered-operands-chart') {
    const resolved = resolveEncodingFields(spec)
    if (!resolved?.groupField) {
      return { ok: false, reason: 'requires-grouped-spec' }
    }
  }

  if (templateType) {
    const supportedTemplates = new Set<string>([
      'two-value-chart',
      'mixed-operands-chart',
      'operand-only-chart',
      'filtered-operands-chart',
      'scalar-reference-chart',
    ])
    if (!supportedTemplates.has(templateType)) {
      return { ok: false, reason: 'unsupported-template', detail: templateType }
    }
  }

  const rowsFromSources = uniqueRows(
    sourceNodeIds.flatMap((sourceNodeId) => normalizeOperandRows(sourceNodeId, artifacts.nodeResults.get(sourceNodeId) ?? [])),
  )
  if (rowsFromSources.length) {
    return { ok: true, rows: rowsFromSources, family }
  }

  const inputRows = artifacts.nodeInputs.get(nodeId) ?? artifacts.baseWorking
  const selected = uniqueRows(selectRowsForOperation(op, inputRows))
  if (!selected.length) {
    return { ok: false, reason: 'empty-derived-rows' }
  }
  return { ok: true, rows: selected, family }
}

function buildAxisLabelExpr(values: Array<{ target: string; label: string }>) {
  const labelMap = Object.fromEntries(
    values.map((value) => [value.target, value.label]),
  )
  return `(${JSON.stringify(labelMap)})[datum.value] || datum.label || datum.value`
}

function buildBarSurfaceSpec(rows: DatumValue[]): VegaLiteSpec {
  const values = rows.map((row, index) => ({
    id: row.id ?? row.lookupId ?? `bar_${index}`,
    target: String(row.target),
    value: Number(row.value),
    group: row.group ?? row.series ?? null,
    label: typeof row.name === 'string' && row.name.trim().length > 0 ? row.name.trim() : String(row.target),
  }))
  const axisLabelExpr = buildAxisLabelExpr(values)
  const hasGroups = values.some((row) => row.group != null && String(row.group).trim().length > 0)
  return {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    width: 'container' as unknown as number,
    height: 360,
    data: { values },
    mark: { type: 'bar', cornerRadiusTopLeft: 6, cornerRadiusTopRight: 6 } as unknown as VegaLiteSpec['mark'],
    encoding: hasGroups
      ? ({
          x: { field: 'target', type: 'nominal', axis: { title: null, labelAngle: 0, labelExpr: axisLabelExpr } },
          y: { field: 'value', type: 'quantitative', axis: { title: null } },
          xOffset: { field: 'group', type: 'nominal' },
          color: { field: 'group', type: 'nominal', legend: { title: null } },
          tooltip: [
            { field: 'label', type: 'nominal', title: 'Label' },
            { field: 'group', type: 'nominal', title: 'Group' },
            { field: 'value', type: 'quantitative', title: 'Value' },
          ],
        } as unknown as VegaLiteSpec['encoding'])
      : ({
          x: { field: 'target', type: 'nominal', axis: { title: null, labelAngle: 0, labelExpr: axisLabelExpr } },
          y: { field: 'value', type: 'quantitative', axis: { title: null } },
          tooltip: [
            { field: 'label', type: 'nominal', title: 'Label' },
            { field: 'value', type: 'quantitative', title: 'Value' },
          ],
        } as unknown as VegaLiteSpec['encoding']),
    config: {
      view: { stroke: '#e5e7eb' },
      axis: { labelFontSize: 12, titleFontSize: 12 },
      bar: { size: hasGroups ? 24 : 42 },
    } as VegaLiteSpec['config'],
  }
}

function buildLineSurfaceSpec(rows: DatumValue[]): VegaLiteSpec {
  const values = rows.map((row, index) => ({
    id: row.id ?? row.lookupId ?? `line_${index}`,
    target: String(row.target),
    value: Number(row.value),
    series: row.group ?? row.series ?? null,
    label: typeof row.name === 'string' && row.name.trim().length > 0 ? row.name.trim() : String(row.target),
  }))
  const axisLabelExpr = buildAxisLabelExpr(values)
  const hasSeries = values.some((row) => row.series != null && String(row.series).trim().length > 0)
  return {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    width: 'container' as unknown as number,
    height: 360,
    data: { values },
    mark: { type: 'line', point: true, strokeWidth: 3 } as unknown as VegaLiteSpec['mark'],
    encoding: hasSeries
      ? ({
          x: { field: 'target', type: 'ordinal', axis: { title: null, labelAngle: 0, labelExpr: axisLabelExpr } },
          y: { field: 'value', type: 'quantitative', axis: { title: null } },
          color: { field: 'series', type: 'nominal', legend: { title: null } },
          tooltip: [
            { field: 'label', type: 'nominal', title: 'Label' },
            { field: 'series', type: 'nominal', title: 'Series' },
            { field: 'value', type: 'quantitative', title: 'Value' },
          ],
        } as unknown as VegaLiteSpec['encoding'])
      : ({
          x: { field: 'target', type: 'ordinal', axis: { title: null, labelAngle: 0, labelExpr: axisLabelExpr } },
          y: { field: 'value', type: 'quantitative', axis: { title: null } },
          tooltip: [
            { field: 'label', type: 'nominal', title: 'Label' },
            { field: 'value', type: 'quantitative', title: 'Value' },
          ],
        } as unknown as VegaLiteSpec['encoding']),
    config: {
      view: { stroke: '#e5e7eb' },
      axis: { labelFontSize: 12, titleFontSize: 12 },
      line: { point: { filled: true, size: 64 } },
    } as VegaLiteSpec['config'],
  }
}

function buildPlaybackSpec(family: ChartFamily, rows: DatumValue[]) {
  return family === 'bar' ? buildBarSurfaceSpec(rows) : buildLineSurfaceSpec(rows)
}

function buildSurfaceSchema(args: {
  spec: VegaLiteSpec
  family: ChartFamily
}): SurfaceSchema {
  const resolved = resolveEncodingFields(args.spec)
  return {
    family: args.family,
    sourceCategoryField: resolved?.xField ?? null,
    sourceMeasureField: resolved?.yField ?? null,
    sourceGroupField: resolved?.groupField ?? null,
    categoryField: 'target',
    measureField: 'value',
    groupField: args.family === 'line' ? 'series' : 'group',
  }
}

function nodeSurfaceSelectors(rows: DatumValue[]) {
  const grouped = new Map<string, TargetSelector[]>()
  rows.forEach((row) => {
    const nodeId =
      typeof row.id === 'string' && row.id.trim().length > 0
        ? row.id.trim()
        : typeof row.lookupId === 'string' && row.lookupId.trim().length > 0
          ? row.lookupId.trim()
          : ''
    if (!nodeId) return
    const existing = grouped.get(nodeId) ?? []
    existing.push(rowToSelector(row))
    grouped.set(nodeId, existing)
  })
  const out = new Map<string, TargetSelector | TargetSelector[]>()
  grouped.forEach((selectors, nodeId) => {
    const unique = selectors.filter((selector, index) => {
      const key = JSON.stringify(selector)
      return selectors.findIndex((entry) => JSON.stringify(entry) == key) === index
    })
    out.set(nodeId, unique.length === 1 ? unique[0] : unique)
  })
  return out
}

function selectorAliasKeys(
  selector: TargetSelector | TargetSelector[] | undefined,
): string[] {
  if (selector == null) return []
  if (Array.isArray(selector)) {
    return selector.flatMap((entry) => selectorAliasKeys(entry))
  }
  if (typeof selector === 'string') {
    const trimmed = selector.trim()
    if (!trimmed) return []
    if (trimmed.startsWith('ref:')) {
      return [`ref:${trimmed.slice('ref:'.length).trim()}`]
    }
    return [`target:${trimmed}`]
  }
  if (typeof selector === 'number') {
    return [`target:${String(selector)}`]
  }
  const keys: string[] = []
  if (typeof selector.id === 'string' && selector.id.trim().length > 0) {
    const id = selector.id.trim()
    if (isNodeRefText(id)) {
      keys.push(`ref:${id}`)
    } else {
      keys.push(`id:${id}`)
    }
  }
  const category = selector.category ?? selector.target
  if (category != null) {
    const text = String(category).trim()
    if (text) {
      if (text.startsWith('ref:')) {
        keys.push(`ref:${text.slice('ref:'.length).trim()}`)
      } else {
        const group = typeof selector.series === 'string' ? selector.series.trim() : ''
        if (group) {
          keys.push(`target:${text}|group:${group}`)
        }
        keys.push(`target:${text}`)
      }
    }
  }
  return Array.from(new Set(keys))
}

function buildPreparedSurfaceSelectors(args: {
  rows: DatumValue[]
  artifacts: LogicalExecutionArtifacts
}): PreparedSurfaceSelectors {
  const nodeSelectorMap = nodeSurfaceSelectors(args.rows)
  const selectorAliases = new Map<string, TargetSelector | TargetSelector[]>()

  nodeSelectorMap.forEach((selector, nodeId) => {
    selectorAliases.set(`ref:${nodeId}`, selector)
    selectorAliasKeys(args.artifacts.nodeSourceSelectors.get(nodeId) ?? undefined).forEach((key) => {
      selectorAliases.set(key, selector)
    })
    selectorAliasKeys(selector).forEach((key) => {
      selectorAliases.set(key, selector)
    })
  })

  return {
    nodeSelectorMap,
    selectorAliases,
  }
}

function rewriteSelectorForSurface(
  selector: TargetSelector | TargetSelector[] | undefined,
  surfaceSelectors: PreparedSurfaceSelectors,
): TargetSelector | TargetSelector[] | undefined {
  if (selector == null) return selector
  if (Array.isArray(selector)) {
    const rewritten = selector
      .map((entry) => rewriteSelectorForSurface(entry, surfaceSelectors))
      .filter((entry) => entry != null)
    return rewritten.length > 0 ? (rewritten as TargetSelector[]) : selector
  }
  if (typeof selector === 'string') {
    if (selector.startsWith('ref:')) {
      return surfaceSelectors.nodeSelectorMap.get(selector.slice('ref:'.length)) ?? selector
    }
    return surfaceSelectors.selectorAliases.get(`target:${selector}`) ?? selector
  }
  if (typeof selector === 'object') {
    if (typeof selector.id === 'string' && isNodeRefText(selector.id.trim())) {
      return surfaceSelectors.nodeSelectorMap.get(selector.id.trim()) ?? selector
    }
    const category = selector.category ?? selector.target
    if (typeof category === 'string' && category.startsWith('ref:')) {
      return surfaceSelectors.nodeSelectorMap.get(category.slice('ref:'.length)) ?? selector
    }
    for (const key of selectorAliasKeys(selector)) {
      const mapped = surfaceSelectors.selectorAliases.get(key)
      if (mapped) return mapped
    }
  }
  return selector
}

function sanitizeOperationForSurface(
  op: OperationSpec,
  args: {
    rows: DatumValue[]
    artifacts: LogicalExecutionArtifacts
    selectors: PreparedSurfaceSelectors
    surfaceSchema: SurfaceSchema
  },
): OperationSpec {
  const rewriteField = (field: string | undefined) => {
    if (!field) return field
    if (field === args.surfaceSchema.measureField) return field
    if (field === args.surfaceSchema.categoryField) return field
    if (args.surfaceSchema.groupField && field === args.surfaceSchema.groupField) return field
    if (field === args.surfaceSchema.sourceMeasureField) return args.surfaceSchema.measureField
    if (field === args.surfaceSchema.sourceCategoryField) return args.surfaceSchema.categoryField
    if (args.surfaceSchema.sourceGroupField && field === args.surfaceSchema.sourceGroupField) {
      return args.surfaceSchema.groupField ?? field
    }

    if (
      op.op === OperationOp.Average ||
      op.op === OperationOp.Sum ||
      op.op === OperationOp.Count ||
      op.op === OperationOp.DetermineRange ||
      op.op === OperationOp.FindExtremum ||
      op.op === OperationOp.RetrieveValue ||
      op.op === OperationOp.Diff ||
      op.op === OperationOp.Compare ||
      op.op === OperationOp.CompareBool ||
      op.op === OperationOp.Add ||
      op.op === OperationOp.Scale
    ) {
      return args.surfaceSchema.measureField
    }

    if (op.op === OperationOp.Filter) {
      const hasMembership = Array.isArray(op.include) || Array.isArray(op.exclude)
      return hasMembership ? args.surfaceSchema.categoryField : args.surfaceSchema.measureField
    }

    return field
  }

  const rewriteGroup = (group: string | null | undefined) => {
    if (!group) return group
    if (args.surfaceSchema.groupField && group === args.surfaceSchema.sourceGroupField) {
      return args.surfaceSchema.groupField
    }
    return group
  }

  const target = rewriteSelectorForSurface(op.target, args.selectors)
  const targetA = rewriteSelectorForSurface(op.targetA, args.selectors)
  const targetB = rewriteSelectorForSurface(op.targetB, args.selectors)
  const originalInputs = Array.isArray(op.meta?.inputs) ? [...op.meta.inputs] : []

  return {
    ...op,
    chartId: undefined,
    field: rewriteField(op.field),
    group: rewriteGroup(op.group),
    groupA: rewriteGroup(op.groupA),
    groupB: rewriteGroup(op.groupB),
    target,
    targetA,
    targetB,
    meta: {
      ...(op.meta ? { ...op.meta } : {}),
      inputs: [],
      visualSurface: {
        surfaceLocal: true,
        originalInputs,
      },
    },
  }
}

function selectorMatchesSurfaceRows(
  rows: DatumValue[],
  selector: TargetSelector | TargetSelector[] | undefined,
  fallbackGroup: string | null | undefined,
) {
  return sliceBySelector(rows, selector, fallbackGroup).length > 0
}

function validatePreparedRunOps(args: {
  rows: DatumValue[]
  runOps: OperationSpec[]
}): boolean {
  return args.runOps.every((op) => {
    switch (op.op) {
      case OperationOp.Diff:
      case OperationOp.Compare:
      case OperationOp.CompareBool:
      case OperationOp.Add:
        return (
          selectorMatchesSurfaceRows(args.rows, op.targetA, op.groupA ?? op.group ?? null) &&
          selectorMatchesSurfaceRows(args.rows, op.targetB, op.groupB ?? op.group ?? null)
        )
      case OperationOp.Scale:
      case OperationOp.RetrieveValue:
        return selectorMatchesSurfaceRows(args.rows, op.target, op.group ?? null)
      default:
        return true
    }
  })
}

export function buildPreparedSurface(args: {
  spec: VegaLiteSpec
  artifacts?: LogicalExecutionArtifacts | null
  surfaceType?: 'derived-chart' | 'scalar-panel' | 'source-chart' | 'text-only'
  nodeId?: string
  templateType?: string
  sourceNodeIds?: string[]
}): BuildSurfaceResult {
  const { spec, artifacts, nodeId, sourceNodeIds = [] } = args
  if (!artifacts) return { ok: false, reason: 'missing-logical-artifacts' }
  if (!nodeId) return { ok: false, reason: 'missing-node' }
  if (args.surfaceType === 'text-only') {
    return { ok: false, reason: 'unsupported-template', detail: 'text-only' }
  }

  const op = artifacts.nodeOps.get(nodeId)
  if (!op) return { ok: false, reason: 'missing-node' }
  const selected = selectDerivedSurfaceForOperation({
    op,
    artifacts,
    templateType: args.templateType,
    sourceNodeIds,
  })
  if (!selected) {
    return { ok: false, reason: 'unsupported-template', detail: String(args.templateType ?? args.surfaceType ?? '') }
  }

  const rowsResult = buildSurfaceRows({
    spec,
    artifacts,
    op,
    nodeId,
    templateType: selected.templateType,
    sourceNodeIds: selected.sourceNodeIds,
  })
  if (!rowsResult.ok) {
    return rowsResult
  }

  if (!rowsResult.rows.length) {
    return { ok: false, reason: 'empty-derived-rows' }
  }
  const surfaceSchema = buildSurfaceSchema({
    spec,
    family: rowsResult.family,
  })
  const selectors = buildPreparedSurfaceSelectors({
    rows: rowsResult.rows,
    artifacts,
  })
  const runOps = [
    sanitizeOperationForSurface(op, {
      rows: rowsResult.rows,
      artifacts,
      selectors,
      surfaceSchema,
    }),
  ]
  if (!validatePreparedRunOps({ rows: rowsResult.rows, runOps })) {
    return { ok: false, reason: 'invalid-surface-selectors' }
  }

  return {
    ok: true,
    surface: {
      nodeId,
      family: rowsResult.family,
      surfaceType: 'derived-chart',
      playbackSpec: buildPlaybackSpec(rowsResult.family, rowsResult.rows),
      surfaceRows: rowsResult.rows,
      surfaceSchema,
      materializeOps: [],
      runOps,
      selectors,
    },
  }
}

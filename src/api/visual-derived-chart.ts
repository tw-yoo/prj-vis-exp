import { ChartType, getChartType, type VegaLiteSpec } from '../domain/chart'
import { normalizeOpsGroups, type OpsSpecGroupMap } from '../domain/operation/opsSpec'
import type { DatumValue, OperationSpec, TargetSelector } from '../domain/operation/types'
import { OperationOp } from '../domain/operation/types'
import { toDatumValuesFromRaw } from '../domain/data/datum'
import { executeDataOperation } from '../application/services/executeDataOperation'
import { STANDARD_DATA_OP_HANDLERS } from '../rendering/ops/common/dataHandlers'
import { resolveMultiLineEncoding } from '../rendering/line/multipleLineRenderer'
import { resolveSimpleLineEncoding } from '../rendering/line/simpleLineRenderer'
import { resetRuntimeResults, storeRuntimeResult, getRuntimeResultsById } from '../operation/run/dataOps'

type DataRow = Record<string, unknown>

type DerivedTemplate =
  | 'two-value-chart'
  | 'mixed-operands-chart'
  | 'operand-only-chart'
  | 'filtered-operands-chart'
  | 'scalar-reference-chart'

type DerivedChartRow = {
  target: string
  value: number
  group: string | null
  label: string
  sourceNodeId?: string
}

type DerivedChartSurface = {
  spec: VegaLiteSpec
  runOps: OperationSpec[]
}

type LogicalExecutionArtifacts = {
  baseWorking: DatumValue[]
  nodeOps: Map<string, OperationSpec>
  nodeResults: Map<string, DatumValue[]>
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
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

function resolveSpecFields(spec: VegaLiteSpec) {
  const chartType = getChartType(spec)
  const topEncoding = asRecord(spec.encoding)
  const topX = typeof asRecord(topEncoding?.x)?.field === 'string' ? String(asRecord(topEncoding?.x)?.field) : null
  const topY = typeof asRecord(topEncoding?.y)?.field === 'string' ? String(asRecord(topEncoding?.y)?.field) : null
  const topColor =
    typeof asRecord(topEncoding?.color)?.field === 'string' ? String(asRecord(topEncoding?.color)?.field) : undefined

  if (
    chartType === ChartType.SIMPLE_BAR ||
    chartType === ChartType.GROUPED_BAR ||
    chartType === ChartType.STACKED_BAR
  ) {
    if (!topX || !topY) return null
    return { xField: topX, yField: topY, groupField: topColor }
  }

  if (chartType === ChartType.SIMPLE_LINE) {
    const resolved = resolveSimpleLineEncoding(spec)
    if (!resolved) return null
    return { xField: resolved.xField, yField: resolved.yField, groupField: resolved.colorField }
  }

  if (chartType === ChartType.MULTI_LINE) {
    const resolved = resolveMultiLineEncoding(spec)
    if (!resolved) return null
    return { xField: resolved.xField, yField: resolved.yField, groupField: resolved.colorField ?? undefined }
  }

  if (!topX || !topY) return null
  return { xField: topX, yField: topY, groupField: topColor }
}

function toBaseWorkingData(spec: VegaLiteSpec, dataRows: DataRow[]): DatumValue[] {
  const resolved = resolveSpecFields(spec)
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

function resolveLogicalInputSeed(operation: OperationSpec, currentWorking: DatumValue[]) {
  if (operation.op === OperationOp.Filter) return currentWorking
  const inputs = (Array.isArray(operation.meta?.inputs) ? operation.meta.inputs : []).filter(
    (value): value is string | number => typeof value === 'string' || typeof value === 'number',
  )
  if (!inputs.length) return currentWorking
  const merged = inputs.flatMap((depId) => getRuntimeResultsById(depId))
  return merged.length ? merged : currentWorking
}

function executeLogicalOps(spec: VegaLiteSpec, dataRows: DataRow[], logicalOpsSpec?: OpsSpecGroupMap): LogicalExecutionArtifacts | null {
  if (!logicalOpsSpec) return null
  const baseWorking = toBaseWorkingData(spec, dataRows)
  const nodeOps = new Map<string, OperationSpec>()
  const nodeResults = new Map<string, DatumValue[]>()
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

  resetRuntimeResults()
  let working = baseWorking.map(cloneDatum)
  for (const entry of flattened) {
    const op = entry.op
    const nodeId = entry.nodeId
    const input = resolveLogicalInputSeed(op, working)
    const executed = executeDataOperation(input, op, STANDARD_DATA_OP_HANDLERS)
    if (!executed) continue
    const result = executed.result.map(cloneDatum)
    working = result
    if (nodeId) {
      nodeOps.set(nodeId, op)
      nodeResults.set(nodeId, result)
      storeRuntimeResult(nodeId, result)
    }
    const opId =
      typeof (op as { id?: unknown }).id === 'string' ? ((op as { id?: string }).id ?? '').trim() : ''
    if (opId) {
      storeRuntimeResult(opId, result)
    }
  }

  return { baseWorking, nodeOps, nodeResults }
}

function sourceTargetDomain(baseWorking: DatumValue[]) {
  return new Set(baseWorking.map((row) => String(row.target)))
}

function isSyntheticTarget(target: string) {
  return target.startsWith('__')
}

function isChartBackedRows(rows: DatumValue[], sourceTargets: Set<string>) {
  if (!rows.length) return false
  return rows.some((row) => !isSyntheticTarget(String(row.target)) && sourceTargets.has(String(row.target)))
}

function operandLabel(nodeId: string, rows: DatumValue[]) {
  const first = rows[0]
  if (typeof first?.name === 'string' && first.name.trim().length > 0) return first.name.trim()
  if (rows.length === 1 && !isSyntheticTarget(String(first?.target ?? ''))) return String(first?.target ?? nodeId)
  return nodeId
}

function aggregateRowsForOperand(nodeId: string, rows: DatumValue[]): DerivedChartRow | null {
  const values = rows.map((row) => Number(row.value)).filter((value) => Number.isFinite(value))
  if (!values.length) return null
  return {
    target: operandLabel(nodeId, rows),
    value: values.reduce((sum, value) => sum + value, 0),
    group: null,
    label: operandLabel(nodeId, rows),
    sourceNodeId: nodeId,
  }
}

function toDerivedRowsFromDatum(nodeId: string, rows: DatumValue[]): DerivedChartRow[] {
  const out: DerivedChartRow[] = []
  rows.forEach((row) => {
    const numeric = Number(row.value)
    if (!Number.isFinite(numeric)) return
    out.push({
      target: String(row.target),
      value: numeric,
      group: row.group ?? null,
      label: typeof row.name === 'string' && row.name.trim().length > 0 ? row.name.trim() : String(row.target),
      sourceNodeId: nodeId,
    })
  })
  return out
}

function extractLiteralTargets(selector: TargetSelector | TargetSelector[] | undefined): string[] {
  if (selector == null) return []
  if (Array.isArray(selector)) {
    return selector.flatMap((entry) => extractLiteralTargets(entry))
  }
  if (typeof selector === 'string') {
    if (selector.startsWith('ref:')) return []
    return [selector]
  }
  if (typeof selector === 'number') {
    return [String(selector)]
  }
  if (typeof selector === 'object') {
    const target = selector.target ?? selector.category ?? selector.id
    if (typeof target === 'string' && target.startsWith('ref:')) return []
    if (target == null) return []
    return [String(target)]
  }
  return []
}

function buildFilteredRows(op: OperationSpec, baseWorking: DatumValue[]): DerivedChartRow[] {
  const requestedGroups = new Set(
    [op.group, op.groupA, op.groupB]
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim())
      .filter((value) => value.length > 0),
  )
  const requestedTargets = new Set([
    ...extractLiteralTargets(op.target),
    ...extractLiteralTargets(op.targetA),
    ...extractLiteralTargets(op.targetB),
  ])

  return baseWorking
    .filter((row) => {
      const groupPass = requestedGroups.size === 0 || requestedGroups.has(String(row.group ?? ''))
      const targetPass = requestedTargets.size === 0 || requestedTargets.has(String(row.target))
      return groupPass && targetPass
    })
    .map((row) => ({
      target: String(row.target),
      value: Number(row.value),
      group: row.group ?? null,
      label: typeof row.name === 'string' && row.name.trim().length > 0 ? row.name.trim() : String(row.target),
      sourceNodeId: undefined,
    }))
    .filter((row) => Number.isFinite(row.value))
}

function uniqueRows(rows: DerivedChartRow[]) {
  const seen = new Set<string>()
  const out: DerivedChartRow[] = []
  rows.forEach((row) => {
    const key = `${row.sourceNodeId ?? ''}::${row.group ?? ''}::${row.target}::${row.value}`
    if (seen.has(key)) return
    seen.add(key)
    out.push(row)
  })
  return out
}

function buildDerivedRows(args: {
  templateType: DerivedTemplate
  op: OperationSpec
  sourceNodeIds: string[]
  baseWorking: DatumValue[]
  nodeResults: Map<string, DatumValue[]>
}): DerivedChartRow[] {
  const { templateType, op, sourceNodeIds, baseWorking, nodeResults } = args
  const sourceTargets = sourceTargetDomain(baseWorking)

  if (templateType === 'filtered-operands-chart') {
    return uniqueRows(buildFilteredRows(op, baseWorking))
  }

  if (templateType === 'two-value-chart' || templateType === 'scalar-reference-chart') {
    return uniqueRows(
      sourceNodeIds
        .map((nodeId) => aggregateRowsForOperand(nodeId, nodeResults.get(nodeId) ?? []))
        .filter((row): row is DerivedChartRow => row !== null),
    )
  }

  const rows = sourceNodeIds.flatMap((nodeId) => {
    const resultRows = nodeResults.get(nodeId) ?? []
    if (!resultRows.length) return []
    if (isChartBackedRows(resultRows, sourceTargets)) {
      return toDerivedRowsFromDatum(nodeId, resultRows)
    }
    const aggregateRow = aggregateRowsForOperand(nodeId, resultRows)
    return aggregateRow ? [aggregateRow] : []
  })

  if (templateType === 'mixed-operands-chart' || templateType === 'operand-only-chart') {
    return uniqueRows(rows)
  }

  return uniqueRows(rows)
}

function buildDerivedChartSpec(rows: DerivedChartRow[], templateType: DerivedTemplate): VegaLiteSpec {
  const values = rows.map((row, index) => ({
    id: `${row.sourceNodeId ?? 'derived'}_${index}`,
    target: row.target,
    value: row.value,
    group: row.group ?? null,
    label: row.label ?? row.target,
  }))
  const hasGroups = rows.some((row) => row.group != null && String(row.group).trim().length > 0)
  const base: VegaLiteSpec = {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    width: 'container' as unknown as number,
    height: 360,
    data: { values },
    mark: { type: 'bar', cornerRadiusTopLeft: 6, cornerRadiusTopRight: 6 } as unknown as VegaLiteSpec['mark'],
    encoding: hasGroups
      ? ({
          x: { field: 'target', type: 'nominal', axis: { title: null, labelAngle: 0 } },
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
          x: { field: 'target', type: 'nominal', axis: { title: null, labelAngle: 0 } },
          y: { field: 'value', type: 'quantitative', axis: { title: null } },
          tooltip: [
            { field: 'label', type: 'nominal', title: 'Label' },
            { field: 'value', type: 'quantitative', title: 'Value' },
          ],
        } as unknown as VegaLiteSpec['encoding']),
    config: {
      view: { stroke: '#e5e7eb' },
      axis: { labelFontSize: 12, titleFontSize: 12 },
      bar: { size: templateType === 'two-value-chart' ? 56 : 28 },
    } as VegaLiteSpec['config'],
  }
  return base
}

function rowSelector(row: DerivedChartRow): TargetSelector {
  if (row.group != null && String(row.group).trim().length > 0) {
    return { category: row.target, series: row.group }
  }
  return row.target
}

function rewriteOperationForDerivedChart(op: OperationSpec, rows: DerivedChartRow[]): OperationSpec | null {
  const meta = { ...(op.meta ?? {}), inputs: [] }
  const base: OperationSpec = {
    ...op,
    chartId: undefined,
    meta,
  }

  if (
    (op.op === OperationOp.Diff ||
      op.op === OperationOp.Compare ||
      op.op === OperationOp.CompareBool ||
      op.op === OperationOp.Add) &&
    rows.length >= 2
  ) {
    return {
      ...base,
      targetA: rowSelector(rows[0]),
      targetB: rowSelector(rows[1]),
      group: undefined,
      groupA: undefined,
      groupB: undefined,
    }
  }

  if ((op.op === OperationOp.Scale || op.op === OperationOp.RetrieveValue) && rows.length >= 1) {
    return {
      ...base,
      target: rowSelector(rows[0]),
      group: undefined,
    }
  }

  if (op.op === OperationOp.SetOp || op.op === OperationOp.PairDiff || op.op === OperationOp.LagDiff) {
    return null
  }

  return {
    ...base,
    groupA: undefined,
    groupB: undefined,
  }
}

export function buildDerivedChartSurface(args: {
  spec: VegaLiteSpec
  dataRows: DataRow[]
  logicalOpsSpec?: OpsSpecGroupMap
  nodeId?: string
  templateType?: string
  sourceNodeIds?: string[]
}): DerivedChartSurface | null {
  const { spec, dataRows, logicalOpsSpec, nodeId, templateType, sourceNodeIds = [] } = args
  if (!nodeId) return null
  if (!templateType) return null
  if (
    templateType !== 'two-value-chart' &&
    templateType !== 'mixed-operands-chart' &&
    templateType !== 'operand-only-chart' &&
    templateType !== 'filtered-operands-chart' &&
    templateType !== 'scalar-reference-chart'
  ) {
    return null
  }

  if (templateType === 'filtered-operands-chart' && !resolveSpecFields(spec)?.groupField) {
    return null
  }

  const artifacts = executeLogicalOps(spec, dataRows, logicalOpsSpec)
  if (!artifacts) return null
  const op = artifacts.nodeOps.get(nodeId)
  if (!op) return null

  const rows = buildDerivedRows({
    templateType,
    op,
    sourceNodeIds,
    baseWorking: artifacts.baseWorking,
    nodeResults: artifacts.nodeResults,
  })
  if (!rows.length) return null

  const rewritten = rewriteOperationForDerivedChart(op, rows)
  if (!rewritten) return null

  return {
    spec: buildDerivedChartSpec(rows, templateType),
    runOps: [rewritten],
  }
}

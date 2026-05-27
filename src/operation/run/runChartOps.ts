import { ChartType, getChartType, prepareChartRuntimeSpec, type ChartSpec, type ChartTypeValue } from '../../domain/chart'
import { assertDrawCapabilities } from '../../rendering/draw/capabilityGuard.ts'
import { normalizeOpsGroups, type OpsSpecInput } from '../../domain/operation/opsSpec'
import { runSimpleBarOps } from './simpleBarOps.ts'
import { runStackedBarOps } from './stackedBarOps.ts'
import { runGroupedBarOps } from './groupedBarOps.ts'
import { runSimpleLineOps } from './simpleLineOps.ts'
import { runMultipleLineOps } from './multipleLineOps.ts'
import { getSimpleBarStoredData, type SimpleBarSpec } from '../../rendering/bar/simpleBarRenderer.ts'
import type { StackedSpec } from '../../rendering/bar/stackedBarRenderer.ts'
import type { GroupedSpec } from '../../rendering/bar/groupedBarRenderer.ts'
import { getSimpleLineStoredData, resolveSimpleLineEncoding, type LineSpec } from '../../rendering/line/simpleLineRenderer.ts'
import { getMultipleLineStoredData, resolveMultiLineEncoding, type MultiLineSpec } from '../../rendering/line/multipleLineRenderer.ts'
import type { OperationCompletedEvent, OperationReadyEvent } from '../../application/usecases/runChartOperationsUseCase'
import { captureSvgSnapshot } from '../../rendering/utils/svgSnapshot.ts'
import { SnapshotStrip } from '../../rendering/snapshotStrip.ts'
import { consumeDerivedChartState } from '../../rendering/utils/derivedChartState.ts'
import { getRuntimeChartState } from '../../rendering/utils/runtimeChartState.ts'
import { DrawAction } from '../../rendering/draw/types.ts'
import type { DrawOp, DrawSplitSpec } from '../../rendering/draw/types.ts'
import { OperationOp, type DatumValue, type OperationSpec, type TargetSelector } from '../../domain/operation/types/index.ts'
import type { SurfaceManager } from '../../runtime/surfaceManager.ts'
import { STRUCTURAL_DRAW_ACTIONS } from './drawActionPolicy.ts'
import { toDatumValuesFromRaw, type RawRow } from '../../rendering/ops/common/datum.ts'
import type { ChartSurfaceInstance } from '../../domain/surface/chartSurfaceInstance.ts'
import { normalizeGroupSelection, normalizeOpForSingleGroupDelegation } from '../../domain/operation/groupSelection.ts'
import { convertMultiLineToSimpleLine } from '../../rendering/line/multiLineToSimpleLineTransform.ts'
import { SINGLE_GROUP_DELEGATION_ANIMATION } from '../../rendering/draw/animationPolicy.ts'
import { ops } from '../build/authoring/index.ts'
import { draw } from '../build/authoring/draw.ts'
import { buildExplanationTextForOperations } from '../../api/operation-summary-text.ts'
import { clearChartExplanation, renderChartExplanation } from '../../rendering/explanation/chartExplanation.ts'
import { resolveBinaryInputsFromMeta, getRuntimeResultsById, snapshotRuntimeResults } from '../../domain/operation/dataOps.ts'
import { getGroupedBarStoredData } from '../../rendering/bar/groupedBarRenderer.ts'
import { getStackedBarStoredData } from '../../rendering/bar/stackedBarRenderer.ts'
import { renderBarSelectionAsSimpleSurface } from '../../rendering/bar/toSimpleTransforms.ts'
import { getPlotContext } from '../../rendering/ops/common/chartContext.ts'
import { toWorkingDatumValuesFromStore } from '../../domain/data/workingData.ts'
import { resolveEncodingFields } from '../../rendering/ops/common/resolveEncodingFields.ts'

export type GroupCompletedEvent = {
  groupName: string
  groupIndex: number
  svgString: string
}

export type RunChartOpsOptions = {
  onOperationReady?: (event: OperationReadyEvent) => Promise<void> | void
  onOperationCompleted?: (event: OperationCompletedEvent) => Promise<void> | void
  onGroupCompleted?: (event: GroupCompletedEvent) => Promise<void> | void
  showSnapshotStrip?: boolean
  snapshotScale?: number
  runtimeScope?: string
  resetRuntime?: boolean
  initialRenderMode?: 'always' | 'reuse-existing'
  surfaceManager?: SurfaceManager
  operationIndexStart?: number
}

type ChartExecutionState = {
  chartType: ChartTypeValue | null
  spec: ChartSpec
}

type BarComparePoint = {
  target: string
  series?: string | null
}

type BarCompareOperand = BarComparePoint & {
  series: string | null
  value: number
  surfaceTarget: string
  displayTarget: string
}

function isExplainableOperation(op: OperationSpec) {
  return Boolean(op.op && op.op !== DrawAction.Sleep && op.op !== 'draw' && op.op !== 'text')
}

function stableExplanationNodeId(op: OperationSpec) {
  const metaNodeId = typeof op.meta?.nodeId === 'string' ? op.meta.nodeId.trim() : ''
  if (metaNodeId) return metaNodeId
  const opId = typeof (op as { id?: unknown }).id === 'string' ? String((op as { id?: string }).id ?? '').trim() : ''
  return opId || null
}

function createGroupExplanationController(container: HTMLElement, ops: OperationSpec[]) {
  const explainableOps = ops.filter((op) => isExplainableOperation(op))
  const resultByNodeId = snapshotRuntimeResults()
  const nodeIdByOperation = new Map<OperationSpec, string>()
  const nodeIdByOperationIndex = new Map<number, string>()

  explainableOps.forEach((op, index) => {
    const nodeId = stableExplanationNodeId(op) ?? `__summary_${index}`
    nodeIdByOperation.set(op, nodeId)
    nodeIdByOperationIndex.set(index, nodeId)
  })

  let lastSignature = ''
  const hasVisibleExplanation = () =>
    container.querySelector('.chart-explanation-layer .chart-explanation-text') != null
  const renderSummary = () => {
    if (!explainableOps.length) {
      clearChartExplanation(container)
      lastSignature = ''
      return
    }
    const summary = buildExplanationTextForOperations({
      operations: explainableOps,
      resultsByNodeId: resultByNodeId,
    })
    if (!summary) {
      clearChartExplanation(container)
      lastSignature = ''
      return
    }

    const canRenderFinal =
      Boolean(summary.finalText) &&
      (!summary.refineOnNodeIds?.length || summary.refineOnNodeIds.every((nodeId) => resultByNodeId.has(nodeId)))

    const text = canRenderFinal && summary.finalText ? summary.finalText : ''
    const signature = text
    if (signature === lastSignature && hasVisibleExplanation()) return
    if (!text) {
      clearChartExplanation(container)
      lastSignature = ''
      return
    }
    renderChartExplanation(container, { text })
    lastSignature = signature
  }

  return {
    start() {
      clearChartExplanation(container)
      lastSignature = ''
    },
    ready(event: OperationReadyEvent) {
      if (!isExplainableOperation(event.operation)) return
      const nodeId =
        nodeIdByOperation.get(event.operation) ??
        nodeIdByOperationIndex.get(event.operationIndex) ??
        stableExplanationNodeId(event.operation)
      if (nodeId && Array.isArray(event.result)) {
        resultByNodeId.set(nodeId, event.result)
      }
      renderSummary()
    },
    complete(_event: OperationCompletedEvent) {
      if (!hasVisibleExplanation()) {
        lastSignature = ''
      }
      renderSummary()
    },
  }
}

// ─── split helpers ────────────────────────────────────────────────────────────

function findSplitOpIndex(ops: OperationSpec[]): number {
  return ops.findIndex(
    (op) => op.op === 'draw' && (op as { action?: string }).action === DrawAction.Split,
  )
}

function findDrawActionIndex(ops: OperationSpec[], action: DrawAction): number {
  return ops.findIndex(
    (op) => op.op === 'draw' && (op as { action?: string }).action === action,
  )
}

function isStructuralBarrierOperation(op: OperationSpec): boolean {
  if (op.op !== 'draw') return false
  const action = (op as { action?: string }).action
  return typeof action === 'string' && STRUCTURAL_DRAW_ACTIONS.has(action as DrawAction)
}

function splitOpsAtStructuralBoundaries(ops: OperationSpec[]): OperationSpec[][] {
  if (!ops.length) return []
  const segments: OperationSpec[][] = []
  let current: OperationSpec[] = []
  ops.forEach((op) => {
    current.push(op)
    if (isStructuralBarrierOperation(op)) {
      segments.push(current)
      current = []
    }
  })
  if (current.length > 0) {
    segments.push(current)
  }
  return segments
}

type SplitSurfaceSetup = {
  idA: string
  idB: string
  dataA: DatumValue[]
  dataB: DatumValue[]
  mergedData: DatumValue[]
  specA?: ChartSpec
  specB?: ChartSpec
}

function getSplitSurfaceData(
  split: DrawSplitSpec,
  workingData: DatumValue[],
): SplitSurfaceSetup {
  const groupEntries = Object.entries(split.groups ?? {})
  const idA = groupEntries[0]?.[0] ?? 'A'
  const idB = groupEntries[1]?.[0] ?? 'B'
  const domainA = new Set((groupEntries[0]?.[1] ?? []).map(String))
  const domainB = new Set((groupEntries[1]?.[1] ?? []).map(String))
  const dataA = domainA.size > 0 ? workingData.filter((d) => domainA.has(String(d.target))) : workingData
  const dataB = domainB.size > 0 ? workingData.filter((d) => domainB.has(String(d.target))) : workingData
  return { idA, idB, dataA, dataB, mergedData: workingData }
}

function resolveOperationSurfaceId(op: OperationSpec): string | undefined {
  const surfaceId = typeof op.surfaceId === 'string' && op.surfaceId.trim().length > 0 ? op.surfaceId.trim() : undefined
  if (surfaceId) return surfaceId
  const chartId = typeof op.chartId === 'string' && op.chartId.trim().length > 0 ? op.chartId.trim() : undefined
  return chartId
}

function filterOpsBySurfaceId(ops: OperationSpec[], surfaceId: string): OperationSpec[] {
  return ops.filter((op) => {
    const scopedId = resolveOperationSurfaceId(op)
    return scopedId === undefined || scopedId === null || scopedId === surfaceId
  })
}

function stripSurfaceScope(ops: OperationSpec[]): OperationSpec[] {
  return ops.map((op) => {
    const { chartId: _cid, surfaceId: _sid, ...rest } = op as OperationSpec & { chartId?: string; surfaceId?: string }
    return rest as OperationSpec
  })
}

function resolveSplitDomains(
  split: DrawSplitSpec,
  domainLabels: string[],
): { idA: string; idB: string; domainA: string[]; domainB: string[] } {
  const selectorEntries = Object.entries(split.selectors ?? {})
  if ((split.mode === 'selector' || selectorEntries.length > 0) && selectorEntries.length > 0) {
    const [idA, selectorA] = selectorEntries[0]
    const [idB, selectorB] = selectorEntries[1] ?? [split.restTo ?? 'B', { all: true }]
    const buildDomain = (selector: { include?: Array<string | number>; exclude?: Array<string | number>; all?: boolean }) => {
      const includeSet = new Set((selector.include ?? []).map(String))
      const excludeSet = new Set((selector.exclude ?? []).map(String))
      const includeMode = includeSet.size > 0
      const allMode = selector.all === true || (!includeMode && excludeSet.size === 0)
      return domainLabels.filter((label) => {
        if (excludeSet.has(label)) return false
        if (includeMode) return includeSet.has(label)
        return allMode
      })
    }
    return {
      idA,
      idB,
      domainA: buildDomain(selectorA),
      domainB: buildDomain(selectorB),
    }
  }

  const entries = Object.entries(split.groups ?? {})
  const [firstId, firstGroup] = entries[0] ?? ['A', domainLabels]
  const hasExplicitSecondGroup = entries.length >= 2
  const secondId = entries[1]?.[0] ?? split.restTo ?? 'B'
  const secondGroup = entries[1]?.[1] ?? []
  const firstSet = new Set((firstGroup ?? []).map(String))
  const secondSet = new Set((secondGroup ?? []).map(String))
  const domainA: string[] = []
  const domainB: string[] = []
  domainLabels.forEach((label) => {
    if (firstSet.has(label)) domainA.push(label)
    else if (secondSet.has(label)) domainB.push(label)
    else if (!hasExplicitSecondGroup) domainB.push(label)
  })
  return { idA: firstId, idB: secondId, domainA, domainB }
}

function buildSimpleLineSplitSurfaceSetup(
  host: HTMLElement,
  spec: LineSpec,
  split: DrawSplitSpec,
): SplitSurfaceSetup | null {
  const stored = (getSimpleLineStoredData(host) || []) as RawRow[]
  const resolved = resolveSimpleLineEncoding(spec)
  if (!resolved || stored.length === 0) return null

  const { xField, yField } = resolved
  const domainLabels = Array.from(
    new Set(
      stored
        .map((row) => row?.[xField])
        .filter((value): value is RawRow[string] => value !== undefined && value !== null)
        .map((value) => String(value)),
    ),
  )
  const { idA, idB, domainA, domainB } = resolveSplitDomains(split, domainLabels)
  const domainSetA = new Set(domainA)
  const domainSetB = new Set(domainB)
  const rowsA = stored.filter((row) => domainSetA.has(String(row?.[xField] ?? '')))
  const rowsB = stored.filter((row) => domainSetB.has(String(row?.[xField] ?? '')))
  const cloneRows = (rows: RawRow[]) => rows.map((row) => ({ ...row }))
  return {
    idA,
    idB,
    specA: { ...spec, data: { values: cloneRows(rowsA) } },
    specB: { ...spec, data: { values: cloneRows(rowsB) } },
    dataA: toDatumValuesFromRaw(rowsA, { xField, yField }),
    dataB: toDatumValuesFromRaw(rowsB, { xField, yField }),
    mergedData: toDatumValuesFromRaw(stored, { xField, yField }),
  }
}

function buildSplitSurfaceSetup(
  host: HTMLElement,
  chartType: ChartTypeValue | null,
  normalized: ChartSpec,
  split: DrawSplitSpec,
  workingData: DatumValue[],
): SplitSurfaceSetup {
  const fallbackWorkingData = resolveSplitBootstrapWorkingData(host, chartType, normalized, workingData)
  if (chartType === ChartType.SIMPLE_LINE) {
    const lineSetup = buildSimpleLineSplitSurfaceSetup(host, normalized as LineSpec, split)
    if (lineSetup) return lineSetup
  }
  return getSplitSurfaceData(split, fallbackWorkingData)
}

function syncSingleSurfaceState(
  surfaceManager: SurfaceManager | undefined,
  chartType: ChartTypeValue | null,
  normalized: ChartSpec,
  data?: DatumValue[],
) {
  if (!surfaceManager || !chartType) return
  const layout = surfaceManager.getLayout()
  if (!layout || layout.type !== 'single') return
  surfaceManager.updateSurface('root', {
    spec: normalized,
    chartType,
    ...(data !== undefined ? { data } : {}),
  })
}

function syncChartExecutionState(
  container: HTMLElement,
  currentChartType: ChartTypeValue | null,
  currentSpec: ChartSpec,
): ChartExecutionState {
  const derived = consumeDerivedChartState(container)
  if (derived) {
    return {
      chartType: derived.chartType,
      spec: derived.spec,
    }
  }

  const runtime = getRuntimeChartState(container)
  if (runtime) {
    return {
      chartType: runtime.chartType,
      spec: runtime.spec,
    }
  }

  return {
    chartType: currentChartType,
    spec: currentSpec,
  }
}

// ─────────────────────────────────────────────────────────────────────────────

async function runChartOpsForSingleGroup(
  container: HTMLElement,
  chartType: ChartTypeValue | null,
  normalized: ChartSpec,
  opsSpec: OpsSpecInput,
  options?: RunChartOpsOptions,
) {
  switch (chartType) {
    case ChartType.SIMPLE_BAR:
      return runSimpleBarOps(container, normalized as SimpleBarSpec, opsSpec, options)
    case ChartType.STACKED_BAR:
      return runStackedBarOps(container, normalized as StackedSpec, opsSpec, options)
    case ChartType.GROUPED_BAR:
      return runGroupedBarOps(container, normalized as GroupedSpec, opsSpec, options)
    case ChartType.SIMPLE_LINE:
      return runSimpleLineOps(container, normalized as LineSpec, opsSpec, options)
    case ChartType.MULTI_LINE:
      return runMultipleLineOps(container, normalized as MultiLineSpec, opsSpec, options)
    default:
      throw new Error(`Unsupported chart type: ${String(chartType)}`)
  }
}

function isDataOperation(operation: OperationSpec) {
  if (operation.op === 'draw') return false
  if (operation.op === 'sleep') return false
  return true
}

function isBarCompareSurfaceChartType(chartType: ChartTypeValue | null) {
  return chartType === ChartType.STACKED_BAR || chartType === ChartType.GROUPED_BAR
}

function isBarCompareSurfaceOp(op: OperationSpec) {
  return op.op === OperationOp.CompareBool || op.op === OperationOp.Diff
}

function firstTargetSelector(selector: TargetSelector | TargetSelector[] | undefined): TargetSelector | undefined {
  if (Array.isArray(selector)) return selector[0]
  return selector
}

function resolveRefComparePoint(refKey: string, fallbackSeries?: string | null): BarComparePoint | null {
  const runtimeRows = getRuntimeResultsById(refKey)
  if (!runtimeRows.length) return null
  const first = runtimeRows[0]
  return {
    target: String(first.target),
    series: first.group != null ? String(first.group) : fallbackSeries ?? undefined,
  }
}

function selectorComparePoint(
  selector: TargetSelector | TargetSelector[] | undefined,
  fallbackSeries?: string | null,
): BarComparePoint | null {
  const item = firstTargetSelector(selector)
  if (item == null) return null
  if (typeof item === 'string') {
    if (item.startsWith('ref:')) return resolveRefComparePoint(item.slice('ref:'.length).trim(), fallbackSeries)
    return { target: item, series: fallbackSeries ?? undefined }
  }
  if (typeof item === 'number') {
    return { target: String(item), series: fallbackSeries ?? undefined }
  }
  const explicitTarget =
    item.target != null
      ? String(item.target)
      : item.category != null
        ? String(item.category)
        : typeof item.id === 'string' && /^n\d+$/i.test(item.id)
          ? null
          : item.id != null
            ? String(item.id)
            : null
  if (!explicitTarget) {
    if (typeof item.id === 'string' && /^n\d+$/i.test(item.id)) {
      return resolveRefComparePoint(item.id, fallbackSeries)
    }
    return null
  }
  return {
    target: explicitTarget,
    series: item.series != null ? String(item.series) : fallbackSeries ?? undefined,
  }
}

function toGroupedLikeDatumValues(container: HTMLElement, spec: GroupedSpec) {
  const raw = (getGroupedBarStoredData(container) || []) as RawRow[]
  const resolved = resolveEncodingFields(spec)
  if (!resolved) return []
  return toDatumValuesFromRaw(raw, {
    xField: resolved.xField,
    yField: resolved.yField,
    groupField: resolved.groupField,
  }, {
    panelField: resolved.panelField,
  })
}

function toStackedLikeDatumValues(container: HTMLElement, spec: StackedSpec) {
  const raw = (getStackedBarStoredData(container) || []) as RawRow[]
  return toDatumValuesFromRaw(
    raw,
    {
      xField: spec.encoding.x.field,
      yField: spec.encoding.y.field,
      groupField: spec.encoding.color?.field,
    },
    {
      groupFallback: (row: RawRow) => {
        const candidate = row?.group ?? row?.color ?? row?.series ?? null
        if (candidate == null) return null
        return String(candidate)
      },
    },
  )
}

const groupFallback = (row: RawRow) => {
  const candidate = row?.group ?? row?.color ?? row?.series ?? null
  if (candidate == null) return null
  return String(candidate)
}

function currentSimpleBarDatumValues(container: HTMLElement, spec: SimpleBarSpec) {
  const raw = (getSimpleBarStoredData(container) || []) as RawRow[]
  const ctx = getPlotContext(container)
  return toWorkingDatumValuesFromStore({
    raw,
    specXField: spec.encoding.x.field,
    specYField: spec.encoding.y.field,
    ctxXField: ctx.xField,
    ctxYField: ctx.yField,
  })
}

function currentBarDatumValues(container: HTMLElement, chartType: ChartTypeValue | null, spec: ChartSpec) {
  if (chartType === ChartType.SIMPLE_BAR) return currentSimpleBarDatumValues(container, spec as SimpleBarSpec)
  if (chartType === ChartType.GROUPED_BAR) return toGroupedLikeDatumValues(container, spec as GroupedSpec)
  if (chartType === ChartType.STACKED_BAR) return toStackedLikeDatumValues(container, spec as StackedSpec)
  return [] as DatumValue[]
}

function currentMultipleLineDatumValues(container: HTMLElement, spec: MultiLineSpec) {
  const raw = (getMultipleLineStoredData(container) || []) as RawRow[]
  const encoding = resolveMultiLineEncoding(spec)
  if (!encoding) return []
  return toDatumValuesFromRaw(
    raw,
    {
      xField: encoding.xField,
      yField: encoding.yField,
      groupField: encoding.colorField ?? undefined,
    },
    { groupFallback },
  )
}

function resolveSplitBootstrapWorkingData(
  container: HTMLElement,
  chartType: ChartTypeValue | null,
  spec: ChartSpec,
  workingData: DatumValue[],
) {
  if (workingData.length > 0) return workingData
  if (chartType === ChartType.MULTI_LINE) {
    return currentMultipleLineDatumValues(container, spec as MultiLineSpec)
  }
  return currentBarDatumValues(container, chartType, spec)
}

function resolveCompareOperandsFromOp(
  data: DatumValue[],
  op: OperationSpec,
): { left: BarComparePoint; right: BarComparePoint } | null {
  const fallbackTargets = resolveBinaryInputsFromMeta(op.meta?.inputs)
  const left = selectorComparePoint(op.targetA ?? fallbackTargets.targetA, op.groupA ?? op.group)
  const right = selectorComparePoint(op.targetB ?? fallbackTargets.targetB, op.groupB ?? op.group)
  if (!left || !right) return null
  const resolvePoint = (point: BarComparePoint) => {
    const exact = data.find((row) => String(row.target) === point.target && (point.series == null || String(row.group ?? '') === String(point.series)))
    if (exact) return { target: String(exact.target), series: exact.group != null ? String(exact.group) : point.series ?? undefined }
    const fallback = data.find((row) => String(row.target) === point.target)
    if (!fallback) return null
    return { target: String(fallback.target), series: fallback.group != null ? String(fallback.group) : point.series ?? undefined }
  }
  const resolvedLeft = resolvePoint(left)
  const resolvedRight = resolvePoint(right)
  if (!resolvedLeft || !resolvedRight) return null
  return { left: resolvedLeft, right: resolvedRight }
}

function findDatumForPoint(data: DatumValue[], point: BarComparePoint) {
  const exact = data.find((row) => String(row.target) === point.target && (point.series == null || String(row.group ?? '') === String(point.series)))
  if (exact) return exact
  if (point.series != null) return null
  return data.find((row) => String(row.target) === point.target) ?? null
}

function comparisonSurfaceDisplayTarget(point: BarComparePoint, useSeriesDisambiguation: boolean, index: number) {
  const target = String(point.target)
  const series = point.series != null ? String(point.series) : ''
  if (useSeriesDisambiguation && series) return `${target} (${series})`
  return target || `value ${index + 1}`
}

function comparisonSurfaceTarget(point: BarComparePoint, displayTarget: string, index: number, hasCollision: boolean) {
  if (!hasCollision && point.target.trim().length > 0) return point.target.trim()
  return displayTarget.trim().length > 0 ? displayTarget.trim() : `operand_${index + 1}`
}

function buildCompareSurfaceOperands(
  data: DatumValue[],
  pair: { left: BarComparePoint; right: BarComparePoint },
): { operands: BarCompareOperand[]; remap: Map<string, string> } | null {
  const leftDatum = findDatumForPoint(data, pair.left)
  const rightDatum = findDatumForPoint(data, pair.right)
  if (!leftDatum || !rightDatum) return null
  const basePoints = [
    { point: pair.left, datum: leftDatum },
    { point: pair.right, datum: rightDatum },
  ]
  const targetCounts = new Map<string, number>()
  basePoints.forEach(({ point }) => {
    targetCounts.set(point.target, (targetCounts.get(point.target) ?? 0) + 1)
  })

  const operands: BarCompareOperand[] = []
  basePoints.forEach(({ point, datum }, index) => {
    const value = Number(datum.value)
    if (!Number.isFinite(value)) return
    const duplicateTarget = (targetCounts.get(point.target) ?? 0) > 1
    const displayTarget = comparisonSurfaceDisplayTarget(point, duplicateTarget || Boolean(point.series), index)
    const surfaceTarget = comparisonSurfaceTarget(point, displayTarget, index, duplicateTarget)
    operands.push({
      target: point.target,
      series: point.series ?? null,
      value,
      surfaceTarget,
      displayTarget,
    })
  })

  if (operands.length !== 2) return null

  const remap = new Map<string, string>()
  operands.forEach((operand) => {
    remap.set(`${operand.target}::${operand.series ?? ''}`, operand.surfaceTarget)
    if (!operands.some((candidate) => candidate !== operand && candidate.target === operand.target)) {
      remap.set(`${operand.target}::`, operand.surfaceTarget)
    }
  })
  return { operands, remap }
}

function remapSelectorForSimpleSurface(
  selector: TargetSelector | TargetSelector[] | undefined,
  remap: Map<string, string>,
): TargetSelector | TargetSelector[] | undefined {
  if (Array.isArray(selector)) {
    return selector.map((entry) => remapSelectorForSimpleSurface(entry, remap) as TargetSelector)
  }
  if (selector == null) return selector
  if (typeof selector === 'string' || typeof selector === 'number') {
    if (typeof selector === 'string' && selector.startsWith('ref:')) return selector
    const mapped = remap.get(`${String(selector)}::`) ?? remap.get(`${String(selector)}::`)
    return mapped ?? selector
  }
  if (typeof selector === 'object') {
    if (typeof selector.id === 'string' && /^n\d+$/i.test(selector.id)) return selector
    const rawTarget =
      selector.target != null
        ? String(selector.target)
        : selector.category != null
          ? String(selector.category)
          : selector.id != null
            ? String(selector.id)
            : null
    if (!rawTarget) return selector
    const key = `${rawTarget}::${selector.series != null ? String(selector.series) : ''}`
    const mapped = remap.get(key) ?? remap.get(`${rawTarget}::`)
    if (!mapped) return selector
    return { target: mapped }
  }
  return selector
}

function normalizeOpsForBarComparisonSurface(ops: OperationSpec[], remap: Map<string, string>) {
  return ops.map((op) => ({
    ...op,
    group: undefined,
    groupA: undefined,
    groupB: undefined,
    target: remapSelectorForSimpleSurface(op.target, remap),
    targetA: remapSelectorForSimpleSurface(op.targetA, remap),
    targetB: remapSelectorForSimpleSurface(op.targetB, remap),
  }))
}

function findBarCompareDelegationCandidate(
  chartType: ChartTypeValue | null,
  ops: OperationSpec[],
): { index: number } | null {
  if (!isBarCompareSurfaceChartType(chartType)) return null
  for (let index = 0; index < ops.length; index += 1) {
    const op = ops[index]
    if (!isDataOperation(op)) continue
    if (!isBarCompareSurfaceOp(op)) continue
    return { index }
  }
  return null
}

function findStackedPairDiffTransitionCandidate(
  chartType: ChartTypeValue | null,
  ops: OperationSpec[],
): { index: number; groupA: string; groupB: string } | null {
  if (chartType !== ChartType.STACKED_BAR) return null
  for (let index = 0; index < ops.length; index += 1) {
    const op = ops[index]
    if (!isDataOperation(op) || op.op !== OperationOp.PairDiff) continue
    if (!op.groupA || !op.groupB) continue
    return { index, groupA: String(op.groupA), groupB: String(op.groupB) }
  }
  return null
}

function isSingleGroupDelegationChartType(chartType: ChartTypeValue | null) {
  return chartType === ChartType.STACKED_BAR || chartType === ChartType.GROUPED_BAR || chartType === ChartType.MULTI_LINE
}

function findSingleGroupDelegationCandidate(
  chartType: ChartTypeValue | null,
  ops: OperationSpec[],
): { index: number; series: string } | null {
  if (!isSingleGroupDelegationChartType(chartType)) return null
  for (let index = 0; index < ops.length; index += 1) {
    const op = ops[index]
    if (!isDataOperation(op)) continue
    const groupSelection = normalizeGroupSelection((op as OperationSpec & { group?: unknown }).group)
    if (groupSelection.kind !== 'single') continue
    return { index, series: groupSelection.values[0] }
  }
  return null
}

function normalizeOpsForSingleGroupDelegation(ops: OperationSpec[]): OperationSpec[] {
  return ops.map((op) => {
    if (!isDataOperation(op)) return op
    const groupSelection = normalizeGroupSelection((op as OperationSpec & { group?: unknown }).group)
    if (groupSelection.kind !== 'single') return op
    return normalizeOpForSingleGroupDelegation(op, groupSelection.values[0])
  })
}

const INTERNAL_DELEGATION_RUNTIME_SCOPE = '__single_group_delegation_transition__'

function delayMs(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return Promise.resolve()
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

function buildSingleGroupFocusDrawOp(chartType: ChartTypeValue | null, series: string): DrawOp | null {
  if (chartType === ChartType.STACKED_BAR) {
    return ops.draw.stackedFilterGroups(undefined, [series], 'include')
  }
  if (chartType === ChartType.GROUPED_BAR) {
    return ops.draw.groupedFilterGroups(undefined, [series], 'include')
  }
  return null
}

function buildSingleGroupToSimpleDrawOp(chartType: ChartTypeValue | null, series: string): DrawOp | null {
  if (chartType === ChartType.STACKED_BAR) {
    return ops.draw.stackedToSimple(undefined, series)
  }
  if (chartType === ChartType.GROUPED_BAR) {
    return ops.draw.groupedToSimple(undefined, series)
  }
  return null
}

function internalDelegationRunOptions(options?: RunChartOpsOptions): RunChartOpsOptions {
  return {
    ...options,
    onOperationReady: undefined,
    onOperationCompleted: undefined,
    runtimeScope: INTERNAL_DELEGATION_RUNTIME_SCOPE,
    operationIndexStart: 0,
    initialRenderMode: 'reuse-existing',
    resetRuntime: false,
  }
}

async function runSingleGroupTransitionDrawOp(
  container: HTMLElement,
  state: ChartExecutionState,
  drawOp: DrawOp,
  options?: RunChartOpsOptions,
): Promise<ChartExecutionState> {
  await runChartOpsForSingleGroup(
    container,
    state.chartType,
    state.spec,
    { ops: [drawOp] },
    internalDelegationRunOptions(options),
  )
  return syncChartExecutionState(container, state.chartType, state.spec)
}

async function runSingleGroupDelegationTransition(
  container: HTMLElement,
  chartType: ChartTypeValue | null,
  spec: ChartSpec,
  series: string,
  options?: RunChartOpsOptions,
): Promise<ChartExecutionState | null> {
  if (chartType === ChartType.STACKED_BAR || chartType === ChartType.GROUPED_BAR) {
    const focusDrawOp = buildSingleGroupFocusDrawOp(chartType, series)
    const toSimpleDrawOp = buildSingleGroupToSimpleDrawOp(chartType, series)
    if (!focusDrawOp || !toSimpleDrawOp) return null

    let state: ChartExecutionState = { chartType, spec }
    state = await runSingleGroupTransitionDrawOp(container, state, focusDrawOp, options)
    await delayMs(SINGLE_GROUP_DELEGATION_ANIMATION.focusSettleMs)
    state = await runSingleGroupTransitionDrawOp(container, state, toSimpleDrawOp, options)
    if (state.chartType !== ChartType.SIMPLE_BAR) return null
    await delayMs(SINGLE_GROUP_DELEGATION_ANIMATION.minHoldAfterConvertMs)
    return state
  }

  if (chartType === ChartType.MULTI_LINE) {
    const simple = await convertMultiLineToSimpleLine(container, spec as MultiLineSpec, series)
    await delayMs(SINGLE_GROUP_DELEGATION_ANIMATION.minHoldAfterConvertMs)
    return { chartType: ChartType.SIMPLE_LINE, spec: simple }
  }
  return null
}

async function runBarCompareDelegationTransition(
  container: HTMLElement,
  chartType: ChartTypeValue | null,
  spec: ChartSpec,
  op: OperationSpec,
  options?: RunChartOpsOptions,
): Promise<{ state: ChartExecutionState; remap: Map<string, string> } | null> {
  if (!isBarCompareSurfaceChartType(chartType)) return null
  const data = currentBarDatumValues(container, chartType, spec)
  const pair = resolveCompareOperandsFromOp(data, op)
  if (!pair) return null
  const surface = buildCompareSurfaceOperands(data, pair)
  if (!surface) return null

  const selectedTargets = surface.operands.map((operand) => operand.target)
  const selectedIds = data
    .filter((row) =>
      surface.operands.some(
        (operand) =>
          String(row.target) === operand.target &&
          String(row.group ?? '') === String(operand.series ?? ''),
      ),
    )
    .map((row) => String(row.id ?? row.lookupId ?? row.target))
    .filter((value, index, list) => value.length > 0 && list.indexOf(value) === index)

  if (selectedIds.length > 0) {
    await runSingleGroupTransitionDrawOp(
      container,
      { chartType, spec },
      ops.draw.dim(
        undefined,
        draw.select.markFieldKeys('rect', 'id', ...selectedIds),
        undefined,
        0.18,
      ),
      options,
    )
  } else if (selectedTargets.length > 0) {
    await runSingleGroupTransitionDrawOp(
      container,
      { chartType, spec },
      ops.draw.dim(
        undefined,
        draw.select.markFieldKeys('rect', 'target', ...selectedTargets),
        undefined,
        0.18,
      ),
      options,
    )
  }
  await delayMs(SINGLE_GROUP_DELEGATION_ANIMATION.focusSettleMs)

  const simple = await renderBarSelectionAsSimpleSurface(
    container,
    spec as GroupedSpec | StackedSpec,
    surface.operands.map((operand) => ({
      target: operand.surfaceTarget,
      displayTarget: operand.displayTarget,
      value: operand.value,
      group: operand.series ?? null,
    })),
  )
  if (!simple) return null
  await delayMs(SINGLE_GROUP_DELEGATION_ANIMATION.minHoldAfterConvertMs)
  return {
    state: { chartType: ChartType.SIMPLE_BAR, spec: simple },
    remap: surface.remap,
  }
}

async function runStackedPairDiffDelegationTransition(
  container: HTMLElement,
  spec: StackedSpec,
  groupA: string,
  groupB: string,
  options?: RunChartOpsOptions,
): Promise<ChartExecutionState | null> {
  let state: ChartExecutionState = { chartType: ChartType.STACKED_BAR, spec }
  state = await runSingleGroupTransitionDrawOp(
    container,
    state,
    ops.draw.stackedFilterGroups(undefined, [groupA, groupB], 'include'),
    options,
  )
  await delayMs(SINGLE_GROUP_DELEGATION_ANIMATION.focusSettleMs)
  state = await runSingleGroupTransitionDrawOp(
    container,
    state,
    ops.draw.stackedToGrouped(undefined),
    options,
  )
  if (state.chartType !== ChartType.GROUPED_BAR) return null
  await delayMs(SINGLE_GROUP_DELEGATION_ANIMATION.minHoldAfterConvertMs)
  return state
}

async function runChartOpsForSegmentedGroupBase(
  container: HTMLElement,
  initialChartType: ChartTypeValue | null,
  initialSpec: ChartSpec,
  ops: OperationSpec[],
  options?: RunChartOpsOptions,
): Promise<{ result: unknown; chartType: ChartTypeValue | null; spec: ChartSpec }> {
  const shouldHydrateEmptyOps =
    ops.length === 0 &&
    initialChartType != null &&
    ((options?.initialRenderMode ?? 'always') === 'always' || container.querySelector('svg') == null)
  if (shouldHydrateEmptyOps) {
    const result = await runChartOpsForSingleGroup(container, initialChartType, initialSpec, { ops: [] }, {
      ...options,
      resetRuntime: false,
    })
    const synced = syncChartExecutionState(container, initialChartType, initialSpec)
    return {
      result,
      chartType: synced.chartType,
      spec: synced.spec,
    }
  }

  const segments = splitOpsAtStructuralBoundaries(ops)
  let chartType = initialChartType
  let spec = initialSpec
  let result: unknown = initialSpec
  let nextOperationIndex = options?.operationIndexStart ?? 0

  for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex += 1) {
    const segmentOps = segments[segmentIndex] ?? []
    if (!segmentOps.length) continue
    assertDrawCapabilities(chartType, { ops: segmentOps })
    result = await runChartOpsForSingleGroup(container, chartType, spec, { ops: segmentOps }, {
      ...options,
      initialRenderMode:
        segmentIndex === 0 ? options?.initialRenderMode ?? 'always' : 'reuse-existing',
      resetRuntime:
        segmentIndex === 0 ? options?.resetRuntime ?? true : false,
      operationIndexStart: nextOperationIndex,
    })
    nextOperationIndex += segmentOps.length
    const synced = syncChartExecutionState(container, chartType, spec)
    chartType = synced.chartType
    spec = synced.spec
  }

  const lastOp = ops.length ? ops[ops.length - 1] : null
  if (lastOp && isStructuralBarrierOperation(lastOp)) {
    result = await runChartOpsForSingleGroup(container, chartType, spec, { ops: [] }, {
      ...options,
      initialRenderMode: 'reuse-existing',
      resetRuntime: false,
      operationIndexStart: nextOperationIndex,
    })
    const synced = syncChartExecutionState(container, chartType, spec)
    chartType = synced.chartType
    spec = synced.spec
  }

  return { result, chartType, spec }
}

async function runChartOpsForSegmentedGroup(
  container: HTMLElement,
  initialChartType: ChartTypeValue | null,
  initialSpec: ChartSpec,
  ops: OperationSpec[],
  options?: RunChartOpsOptions,
): Promise<{ result: unknown; chartType: ChartTypeValue | null; spec: ChartSpec }> {
  const pairDiffTransition = findStackedPairDiffTransitionCandidate(initialChartType, ops)
  if (pairDiffTransition) {
    let chartType = initialChartType
    let spec = initialSpec
    let operationIndexStart = options?.operationIndexStart ?? 0

    if (pairDiffTransition.index > 0) {
      const prefixOps = ops.slice(0, pairDiffTransition.index)
      const prefixResult = await runChartOpsForSegmentedGroupBase(container, chartType, spec, prefixOps, {
        ...options,
        operationIndexStart,
      })
      chartType = prefixResult.chartType
      spec = prefixResult.spec
      operationIndexStart += prefixOps.length
    }

    const transitioned = await runStackedPairDiffDelegationTransition(
      container,
      spec as StackedSpec,
      pairDiffTransition.groupA,
      pairDiffTransition.groupB,
      options,
    )
    if (!transitioned) {
      return runChartOpsForSegmentedGroupBase(container, chartType, spec, ops.slice(pairDiffTransition.index), {
        ...options,
        operationIndexStart,
        initialRenderMode: 'reuse-existing',
        resetRuntime: pairDiffTransition.index > 0 ? false : options?.resetRuntime ?? true,
      })
    }

    const delegatedResult = await runChartOpsForSegmentedGroupBase(
      container,
      transitioned.chartType,
      transitioned.spec,
      ops.slice(pairDiffTransition.index),
      {
        ...options,
        operationIndexStart,
        initialRenderMode: 'reuse-existing',
        resetRuntime: pairDiffTransition.index > 0 ? false : options?.resetRuntime ?? true,
      },
    )
    return delegatedResult
  }

  const compareDelegation = findBarCompareDelegationCandidate(initialChartType, ops)
  if (compareDelegation) {
    let chartType = initialChartType
    let spec = initialSpec
    let operationIndexStart = options?.operationIndexStart ?? 0

    if (compareDelegation.index > 0) {
      const prefixOps = ops.slice(0, compareDelegation.index)
      const prefixResult = await runChartOpsForSegmentedGroupBase(container, chartType, spec, prefixOps, {
        ...options,
        operationIndexStart,
      })
      chartType = prefixResult.chartType
      spec = prefixResult.spec
      operationIndexStart += prefixOps.length
    }

    const remainingOps = ops.slice(compareDelegation.index)
    const transitioned = await runBarCompareDelegationTransition(container, chartType, spec, remainingOps[0], options)
    if (transitioned) {
      return runChartOpsForSegmentedGroupBase(
        container,
        transitioned.state.chartType,
        transitioned.state.spec,
        normalizeOpsForBarComparisonSurface(remainingOps, transitioned.remap),
        {
          ...options,
          operationIndexStart,
          initialRenderMode: 'reuse-existing',
          resetRuntime: compareDelegation.index > 0 ? false : options?.resetRuntime ?? true,
        },
      )
    }
  }

  const delegation = findSingleGroupDelegationCandidate(initialChartType, ops)
  if (!delegation) {
    return runChartOpsForSegmentedGroupBase(container, initialChartType, initialSpec, ops, options)
  }

  let chartType = initialChartType
  let spec = initialSpec
  let result: unknown = initialSpec
  let operationIndexStart = options?.operationIndexStart ?? 0

  if (delegation.index > 0) {
    const prefixOps = ops.slice(0, delegation.index)
    const prefixResult = await runChartOpsForSegmentedGroupBase(container, chartType, spec, prefixOps, {
      ...options,
      operationIndexStart,
    })
    result = prefixResult.result
    chartType = prefixResult.chartType
    spec = prefixResult.spec
    operationIndexStart += prefixOps.length
  }

  const remainingOps = ops.slice(delegation.index)
  const tailResetRuntime = delegation.index > 0 ? false : options?.resetRuntime ?? true
  const transitioned = await runSingleGroupDelegationTransition(container, chartType, spec, delegation.series, options)
  if (!transitioned) {
    console.warn('single-group delegation: failed to convert to simple chart, falling back to original runner', {
      chartType,
      series: delegation.series,
    })
    const fallback = await runChartOpsForSegmentedGroupBase(container, chartType, spec, remainingOps, {
      ...options,
      operationIndexStart,
      initialRenderMode: 'reuse-existing',
      resetRuntime: tailResetRuntime,
    })
    return fallback
  }

  const delegatedOps = normalizeOpsForSingleGroupDelegation(remainingOps)
  const delegatedResult = await runChartOpsForSegmentedGroupBase(
    container,
    transitioned.chartType,
    transitioned.spec,
    delegatedOps,
    {
      ...options,
      operationIndexStart,
      initialRenderMode: 'reuse-existing',
      resetRuntime: tailResetRuntime,
    },
  )
  result = delegatedResult.result
  chartType = delegatedResult.chartType
  spec = delegatedResult.spec
  return { result, chartType, spec }
}

async function runSegmentedGroupWithExplanation(
  container: HTMLElement,
  initialChartType: ChartTypeValue | null,
  initialSpec: ChartSpec,
  ops: OperationSpec[],
  options?: RunChartOpsOptions,
) {
  const explanationController = createGroupExplanationController(container, ops)
  explanationController.start()
  const userOnOperationReady = options?.onOperationReady
  const userOnOperationCompleted = options?.onOperationCompleted
  return runChartOpsForSegmentedGroup(container, initialChartType, initialSpec, ops, {
    ...options,
    onOperationReady: async (event) => {
      explanationController.ready(event)
      await userOnOperationReady?.(event)
    },
    onOperationCompleted: async (event) => {
      explanationController.complete(event)
      await userOnOperationCompleted?.(event)
    },
  })
}

export async function runChartOps(
  container: HTMLElement,
  spec: ChartSpec,
  opsSpec: OpsSpecInput,
  options?: RunChartOpsOptions,
) {
  const prepared = await prepareChartRuntimeSpec(spec)
  let chartType = prepared.chartType
  let normalized = prepared.spec
  const groups = normalizeOpsGroups(opsSpec)

  if (groups.length <= 1) {
    // single-group에서도 split op이 있으면 SurfaceManager로 처리
    const singleGroup = groups[0]
    const existingLayout = options?.surfaceManager?.getLayout()
    const alreadySplit = Boolean(existingLayout && existingLayout.type !== 'single')
    const hasSplitInSingle = Boolean(options?.surfaceManager && singleGroup && findSplitOpIndex(singleGroup.ops) !== -1)
    if (!hasSplitInSingle && !alreadySplit) {
      const executed = await runSegmentedGroupWithExplanation(
        container,
        chartType,
        normalized,
        singleGroup?.ops ?? [],
        {
          ...options,
          operationIndexStart: options?.operationIndexStart ?? 0,
        },
      )
      const result = executed.result
      chartType = executed.chartType ?? chartType
      normalized = executed.spec
      syncSingleSurfaceState(
        options?.surfaceManager,
        chartType,
        normalized,
        Array.isArray(result) ? result : undefined,
      )
      return result
    }
  }

  const scale = options?.snapshotScale ?? 0.2
  let snapshotStrip: SnapshotStrip | undefined
  if (options?.showSnapshotStrip) {
    // 재실행 시 기존 strip 제거 후 새로 생성
    container.querySelector('.snapshot-strip')?.remove()
    snapshotStrip = new SnapshotStrip(container)
  }

  const captureAndNotify = async (groupName: string, groupIndex: number) => {
    const svg = container.querySelector('svg')
    if (!svg) return
    const svgString = captureSvgSnapshot(svg as SVGSVGElement)
    snapshotStrip?.addSnapshot(svgString, scale, groupName)
    if (options?.onGroupCompleted) {
      await options.onGroupCompleted({ groupName, groupIndex, svgString })
    }
  }

  let lastResult: unknown = normalized
  let operationOffset = 0
  const surfaceManager = options?.surfaceManager
  const initialLayout = surfaceManager?.getLayout()
  let isSplit = Boolean(initialLayout && initialLayout.type !== 'single')
  let splitIdA =
    initialLayout && initialLayout.type !== 'single' ? initialLayout.surfaces[0]?.id ?? 'A' : 'A'
  let splitIdB =
    initialLayout && initialLayout.type !== 'single' ? initialLayout.surfaces[1]?.id ?? 'B' : 'B'

  for (let index = 0; index < groups.length; index += 1) {
    const group = groups[index]
    const groupName = group.name || `ops${index + 1}`
    const groupOpts = {
      ...options,
      runtimeScope: groupName,
      resetRuntime: index === 0 ? options?.resetRuntime ?? true : false,
      operationIndexStart: operationOffset,
      onOperationReady: options?.onOperationReady,
      onOperationCompleted: options?.onOperationCompleted,
    }

    const applyRootDerivedState = (data?: DatumValue[]) => {
      const synced = syncChartExecutionState(container, chartType, normalized)
      chartType = synced.chartType ?? chartType
      normalized = synced.spec
      syncSingleSurfaceState(surfaceManager, chartType, normalized, data)
    }

    // ── SurfaceManager split handling ────────────────────────────────────────
    if (surfaceManager) {
      const currentLayout = surfaceManager.getLayout()
      const runOpsOnSurface = async (
        surface: ChartSurfaceInstance,
        ops: OperationSpec[],
        initialRenderMode: 'always' | 'reuse-existing',
      ) => {
        const host = surface.hostElement as HTMLElement
        const executed = await runSegmentedGroupWithExplanation(host, surface.chartType, surface.spec, ops, {
          ...groupOpts,
          initialRenderMode,
        })
        const result = executed.result
        surfaceManager.updateSurface(surface.id, {
          spec: executed.spec,
          chartType: executed.chartType ?? surface.chartType,
        })
        if (Array.isArray(result)) {
          surfaceManager.updateSurface(surface.id, { data: result })
        }
        return surfaceManager.getSurface(surface.id) ?? surface
      }

      const rerenderMergedRoot = async (tailOps: OperationSpec[]) => {
        const firstNonEmptyData = (...candidates: Array<DatumValue[] | undefined>) =>
          candidates.find((candidate) => Array.isArray(candidate) && candidate.length > 0) ?? []
        const mergedData =
          firstNonEmptyData(
            surfaceManager.getSurface(splitIdA)?.data,
            surfaceManager.getSurface(splitIdB)?.data,
            surfaceManager.getSurface('root')?.data,
          )
        surfaceManager.mergeSurfaces(splitIdA, splitIdB, normalized, chartType ?? ChartType.SIMPLE_BAR, mergedData)
        isSplit = false
        const executed = await runSegmentedGroupWithExplanation(container, chartType, normalized, tailOps, {
          ...groupOpts,
          initialRenderMode: 'always',
        })
        lastResult = executed.result
        chartType = executed.chartType ?? chartType
        normalized = executed.spec
        applyRootDerivedState(Array.isArray(lastResult) ? lastResult : undefined)
      }

      // Split op 감지
      const splitIdx = findSplitOpIndex(group.ops)
      if (splitIdx !== -1 && (!isSplit || (currentLayout && currentLayout.type === 'single'))) {
        const splitOp = group.ops[splitIdx] as DrawOp
        const splitSpec = splitOp.split as DrawSplitSpec | undefined
        const orientation = splitSpec?.orientation === 'vertical' ? 'vertical' : 'horizontal'

        // split 이전 ops 실행
        if (splitIdx > 0) {
          const preOps = group.ops.slice(0, splitIdx)
          const executed = await runSegmentedGroupWithExplanation(container, chartType, normalized, preOps, groupOpts)
          lastResult = executed.result
          chartType = executed.chartType ?? chartType
          normalized = executed.spec
          applyRootDerivedState(Array.isArray(lastResult) ? lastResult : undefined)
        }

        // surfaceManager.splitSurface 호출
        const workingData = Array.isArray(lastResult) ? lastResult : []
        const splitSetup = splitSpec
          ? buildSplitSurfaceSetup(container, chartType, normalized, splitSpec, workingData)
          : getSplitSurfaceData({ groups: { A: [], B: [] } } as DrawSplitSpec, workingData)
        const { idA, idB } = splitSetup
        splitIdA = idA
        splitIdB = idB

        const { surfaceA, surfaceB } = surfaceManager.splitSurface(orientation, splitSetup)
        isSplit = true

        // split 이후 ops를 각 surface에서 실행하고, same-group unsplit은 root re-render barrier로 처리한다.
        const postOps = group.ops.slice(splitIdx + 1)
        const unsplitIdx = findDrawActionIndex(postOps, DrawAction.Unsplit)
        const branchOps = unsplitIdx === -1 ? postOps : postOps.slice(0, unsplitIdx)
        const tailOps = unsplitIdx === -1 ? [] : postOps.slice(unsplitIdx + 1)
        await runOpsOnSurface(surfaceA, stripSurfaceScope(filterOpsBySurfaceId(branchOps, idA)), 'always')
        await runOpsOnSurface(surfaceB, stripSurfaceScope(filterOpsBySurfaceId(branchOps, idB)), 'always')

        if (unsplitIdx !== -1) {
          await rerenderMergedRoot(tailOps)
        }

        operationOffset += group.ops.length
        if (index < groups.length - 1) {
          await captureAndNotify(groupName, index)
        }
        continue
      }

      // 이미 split 상태인 경우: chartId별로 각 surface에서 실행
      if (isSplit) {
        const layout = surfaceManager.getLayout()
        if (layout && layout.type !== 'single') {
          splitIdA = layout.surfaces[0]?.id ?? splitIdA
          splitIdB = layout.surfaces[1]?.id ?? splitIdB
          const surfaceA = surfaceManager.getSurface(splitIdA)
          const surfaceB = surfaceManager.getSurface(splitIdB)
          const unsplitIdx = findDrawActionIndex(group.ops, DrawAction.Unsplit)
          const branchOps = unsplitIdx === -1 ? group.ops : group.ops.slice(0, unsplitIdx)

          if (surfaceA) {
            const opsA = stripSurfaceScope(filterOpsBySurfaceId(branchOps, splitIdA))
            if (opsA.length > 0 || unsplitIdx === -1) {
              await runOpsOnSurface(surfaceA, opsA, 'reuse-existing')
            }
          }
          if (surfaceB) {
            const opsB = stripSurfaceScope(filterOpsBySurfaceId(branchOps, splitIdB))
            if (opsB.length > 0 || unsplitIdx === -1) {
              await runOpsOnSurface(surfaceB, opsB, 'reuse-existing')
            }
          }

          if (unsplitIdx !== -1) {
            await rerenderMergedRoot(group.ops.slice(unsplitIdx + 1))
          }

          operationOffset += group.ops.length
          if (index < groups.length - 1) {
            await captureAndNotify(groupName, index)
          }
          continue
        }
      }
    }
    // ── end SurfaceManager split handling ─────────────────────────────────────

    const executed = await runSegmentedGroupWithExplanation(container, chartType, normalized, group.ops, groupOpts)
    lastResult = executed.result
    chartType = executed.chartType ?? chartType
    normalized = executed.spec
    applyRootDerivedState(Array.isArray(lastResult) ? lastResult : undefined)
    // 마지막 그룹 이후에는 스냅샷 불필요 (다음 그룹이 없으므로)
    if (index < groups.length - 1) {
      await captureAndNotify(groupName, index)
    }
    operationOffset += group.ops.length
  }
  return lastResult
}

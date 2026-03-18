import { ChartType, getChartType, type VegaLiteSpec, type ChartTypeValue } from '../../domain/chart'
import { renderVegaLiteChart } from '../../rendering/chartRenderer.ts'
import { assertDrawCapabilities } from '../../rendering/draw/capabilityGuard.ts'
import { normalizeSpec } from '../../domain/chart/normalizeSpec'
import { normalizeOpsGroups, type OpsSpecInput } from '../../domain/operation/opsSpec'
import { runSimpleBarOps } from './simpleBarOps.ts'
import { runStackedBarOps } from './stackedBarOps.ts'
import { runGroupedBarOps } from './groupedBarOps.ts'
import { runSimpleLineOps } from './simpleLineOps.ts'
import { runMultipleLineOps } from './multipleLineOps.ts'
import type { SimpleBarSpec } from '../../rendering/bar/simpleBarRenderer.ts'
import type { StackedSpec } from '../../rendering/bar/stackedBarRenderer.ts'
import type { GroupedSpec } from '../../rendering/bar/groupedBarRenderer.ts'
import { getSimpleLineStoredData, resolveSimpleLineEncoding, type LineSpec } from '../../rendering/line/simpleLineRenderer.ts'
import type { MultiLineSpec } from '../../rendering/line/multipleLineRenderer.ts'
import type { OperationCompletedEvent } from '../../application/usecases/runChartOperationsUseCase'
import { captureSvgSnapshot } from '../../rendering/utils/svgSnapshot.ts'
import { SnapshotStrip } from '../../rendering/snapshotStrip.ts'
import { consumeDerivedChartState } from '../../rendering/utils/derivedChartState.ts'
import { DrawAction } from '../../rendering/draw/types.ts'
import type { DrawOp, DrawSplitSpec } from '../../rendering/draw/types.ts'
import type { DatumValue, OperationSpec } from '../../domain/operation/types/index.ts'
import type { SurfaceManager } from '../../runtime/surfaceManager.ts'
import { SURFACE_SPLIT_ENABLED } from './drawActionPolicy.ts'
import { toDatumValuesFromRaw, type RawRow } from '../../rendering/ops/common/datum.ts'
import type { ChartSurfaceInstance } from '../../domain/surface/chartSurfaceInstance.ts'

export type GroupCompletedEvent = {
  groupName: string
  groupIndex: number
  svgString: string
}

export type RunChartOpsOptions = {
  onOperationCompleted?: (event: OperationCompletedEvent) => Promise<void> | void
  onGroupCompleted?: (event: GroupCompletedEvent) => Promise<void> | void
  showSnapshotStrip?: boolean
  snapshotScale?: number
  runtimeScope?: string
  resetRuntime?: boolean
  initialRenderMode?: 'always' | 'reuse-existing'
  surfaceManager?: SurfaceManager
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

type SplitSurfaceSetup = {
  idA: string
  idB: string
  dataA: DatumValue[]
  dataB: DatumValue[]
  mergedData: DatumValue[]
  specA?: VegaLiteSpec
  specB?: VegaLiteSpec
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

function filterOpsByChartId(ops: OperationSpec[], chartId: string): OperationSpec[] {
  return ops.filter((op) => {
    const cid = (op as { chartId?: string }).chartId
    return cid === undefined || cid === null || cid === chartId
  })
}

function stripChartId(ops: OperationSpec[]): OperationSpec[] {
  return ops.map((op) => {
    const { chartId: _cid, ...rest } = op as OperationSpec & { chartId?: string }
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
  normalized: VegaLiteSpec,
  split: DrawSplitSpec,
  workingData: DatumValue[],
): SplitSurfaceSetup {
  if (chartType === ChartType.SIMPLE_LINE) {
    const lineSetup = buildSimpleLineSplitSurfaceSetup(host, normalized as LineSpec, split)
    if (lineSetup) return lineSetup
  }
  return getSplitSurfaceData(split, workingData)
}

function syncSingleSurfaceState(
  surfaceManager: SurfaceManager | undefined,
  chartType: ChartTypeValue | null,
  normalized: VegaLiteSpec,
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

// ─────────────────────────────────────────────────────────────────────────────

async function runChartOpsForSingleGroup(
  container: HTMLElement,
  chartType: ChartTypeValue | null,
  normalized: VegaLiteSpec,
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
      console.warn('runChartOps: unknown chart type, running plain render then no-op ops')
      await renderVegaLiteChart(container, normalized)
      return normalized
  }
}

export async function runChartOps(
  container: HTMLElement,
  spec: VegaLiteSpec,
  opsSpec: OpsSpecInput,
  options?: RunChartOpsOptions,
) {
  let chartType = getChartType(spec)
  let normalized = normalizeSpec(spec)
  assertDrawCapabilities(chartType, opsSpec)
  const groups = normalizeOpsGroups(opsSpec)

  if (groups.length <= 1) {
    // single-group에서도 split op이 있으면 SurfaceManager로 처리
    const singleGroup = groups[0]
    const hasSplitInSingle =
      SURFACE_SPLIT_ENABLED &&
      options?.surfaceManager &&
      singleGroup &&
      findSplitOpIndex(singleGroup.ops) !== -1
    if (!hasSplitInSingle) {
      const result = await runChartOpsForSingleGroup(container, chartType, normalized, opsSpec, options)
      const derived = consumeDerivedChartState(container)
      if (derived) {
        chartType = derived.chartType
        normalized = derived.spec
      }
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
  let isSplit = false
  let splitIdA = 'A'
  let splitIdB = 'B'

  for (let index = 0; index < groups.length; index += 1) {
    const group = groups[index]
    const groupName = group.name || `ops${index + 1}`
    const groupOpts = {
      ...options,
      runtimeScope: groupName,
      resetRuntime: index === 0 ? options?.resetRuntime ?? true : false,
      onOperationCompleted: options?.onOperationCompleted
        ? async (event: OperationCompletedEvent) => {
            await options.onOperationCompleted?.({
              ...event,
              operationIndex: operationOffset + event.operationIndex,
            })
          }
        : undefined,
    }

    const applyRootDerivedState = (data?: DatumValue[]) => {
      const derived = consumeDerivedChartState(container)
      if (derived) {
        chartType = derived.chartType
        normalized = derived.spec
      }
      syncSingleSurfaceState(surfaceManager, chartType, normalized, data)
    }

    // ── SurfaceManager split handling ────────────────────────────────────────
    if (SURFACE_SPLIT_ENABLED && surfaceManager) {
      const currentLayout = surfaceManager.getLayout()
      const runOpsOnSurface = async (
        surface: ChartSurfaceInstance,
        ops: OperationSpec[],
        initialRenderMode: 'always' | 'reuse-existing',
      ) => {
        const result = await runChartOpsForSingleGroup(
          surface.hostElement,
          surface.chartType,
          surface.spec,
          { ops },
          { ...groupOpts, initialRenderMode },
        )
        const derived = consumeDerivedChartState(surface.hostElement)
        if (derived) {
          surfaceManager.updateSurface(surface.id, {
            spec: derived.spec,
            chartType: derived.chartType,
          })
        }
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
        lastResult = await runChartOpsForSingleGroup(container, chartType, normalized, { ops: tailOps }, {
          ...groupOpts,
          initialRenderMode: 'always',
        })
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
          lastResult = await runChartOpsForSingleGroup(container, chartType, normalized, { ops: preOps }, groupOpts)
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
        await runOpsOnSurface(surfaceA, stripChartId(filterOpsByChartId(branchOps, idA)), 'always')
        await runOpsOnSurface(surfaceB, stripChartId(filterOpsByChartId(branchOps, idB)), 'always')

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
          const surfaceA = surfaceManager.getSurface(splitIdA)
          const surfaceB = surfaceManager.getSurface(splitIdB)
          const unsplitIdx = findDrawActionIndex(group.ops, DrawAction.Unsplit)
          const branchOps = unsplitIdx === -1 ? group.ops : group.ops.slice(0, unsplitIdx)

          if (surfaceA) {
            const opsA = stripChartId(filterOpsByChartId(branchOps, splitIdA))
            if (opsA.length > 0 || unsplitIdx === -1) {
              await runOpsOnSurface(surfaceA, opsA, 'reuse-existing')
            }
          }
          if (surfaceB) {
            const opsB = stripChartId(filterOpsByChartId(branchOps, splitIdB))
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

    lastResult = await runChartOpsForSingleGroup(container, chartType, normalized, group.ops, groupOpts)
    // After each group, consume any derived chart state (e.g. from stacked/grouped/multi-line → simple conversions)
    applyRootDerivedState(Array.isArray(lastResult) ? lastResult : undefined)
    // 마지막 그룹 이후에는 스냅샷 불필요 (다음 그룹이 없으므로)
    if (index < groups.length - 1) {
      await captureAndNotify(groupName, index)
    }
    operationOffset += group.ops.length
  }
  return lastResult
}

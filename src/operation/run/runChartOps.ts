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
import type { LineSpec } from '../../rendering/line/simpleLineRenderer.ts'
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

function getSplitSurfaceData(
  split: DrawSplitSpec,
  workingData: DatumValue[],
): { idA: string; idB: string; dataA: DatumValue[]; dataB: DatumValue[] } {
  const groupEntries = Object.entries(split.groups ?? {})
  const idA = groupEntries[0]?.[0] ?? 'A'
  const idB = groupEntries[1]?.[0] ?? 'B'
  const domainA = new Set((groupEntries[0]?.[1] ?? []).map(String))
  const domainB = new Set((groupEntries[1]?.[1] ?? []).map(String))
  const dataA = domainA.size > 0 ? workingData.filter((d) => domainA.has(String(d.target))) : workingData
  const dataB = domainB.size > 0 ? workingData.filter((d) => domainB.has(String(d.target))) : workingData
  return { idA, idB, dataA, dataB }
}

function filterOpsByChartId(ops: OperationSpec[], chartId: string): OperationSpec[] {
  return ops.filter((op) => {
    const cid = (op as { chartId?: string }).chartId
    return cid === undefined || cid === null || cid === chartId
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
    return runChartOpsForSingleGroup(container, chartType, normalized, opsSpec, options)
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

    // ── SurfaceManager split handling ────────────────────────────────────────
    if (SURFACE_SPLIT_ENABLED && surfaceManager) {
      const currentLayout = surfaceManager.getLayout()

      // Check if this group has an Unsplit op
      const hasUnsplit = group.ops.some(
        (op) => op.op === 'draw' && (op as { action?: string }).action === DrawAction.Unsplit,
      )
      if (hasUnsplit && isSplit) {
        const layout = surfaceManager.getLayout()
        if (layout && layout.type !== 'single') {
          surfaceManager.mergeSurfaces(splitIdA, splitIdB, normalized, chartType ?? ChartType.SIMPLE_BAR, [])
          isSplit = false
        }
        lastResult = normalized
        operationOffset += group.ops.length
        if (index < groups.length - 1) {
          await captureAndNotify(groupName, index)
        }
        continue
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
          const derived = consumeDerivedChartState(container)
          if (derived) {
            chartType = derived.chartType
            normalized = derived.spec
          }
        }

        // surfaceManager.splitSurface 호출
        const workingData: DatumValue[] = []
        const { idA, idB } = splitSpec ? getSplitSurfaceData(splitSpec, workingData) : { idA: 'A', idB: 'B' }
        splitIdA = idA
        splitIdB = idB

        const { surfaceA, surfaceB } = surfaceManager.splitSurface(orientation, { idA, idB })
        isSplit = true

        // split 이후 ops를 각 surface에서 실행
        const postOps = group.ops.slice(splitIdx + 1)
        if (postOps.length > 0) {
          const opsA = filterOpsByChartId(postOps, idA)
          const opsB = filterOpsByChartId(postOps, idB)

          if (opsA.length > 0) {
            await runChartOpsForSingleGroup(surfaceA.hostElement, chartType, normalized, { ops: opsA }, {
              ...groupOpts,
              initialRenderMode: 'always',
            })
          }
          if (opsB.length > 0) {
            await runChartOpsForSingleGroup(surfaceB.hostElement, chartType, normalized, { ops: opsB }, {
              ...groupOpts,
              initialRenderMode: 'always',
            })
          }
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

          if (surfaceA) {
            const opsA = filterOpsByChartId(group.ops, splitIdA)
            if (opsA.length > 0) {
              await runChartOpsForSingleGroup(surfaceA.hostElement, chartType, normalized, { ops: opsA }, {
                ...groupOpts,
                initialRenderMode: 'reuse-existing',
              })
            }
          }
          if (surfaceB) {
            const opsB = filterOpsByChartId(group.ops, splitIdB)
            if (opsB.length > 0) {
              await runChartOpsForSingleGroup(surfaceB.hostElement, chartType, normalized, { ops: opsB }, {
                ...groupOpts,
                initialRenderMode: 'reuse-existing',
              })
            }
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
    const derived = consumeDerivedChartState(container)
    if (derived) {
      chartType = derived.chartType
      normalized = derived.spec
    }
    // 마지막 그룹 이후에는 스냅샷 불필요 (다음 그룹이 없으므로)
    if (index < groups.length - 1) {
      await captureAndNotify(groupName, index)
    }
    operationOffset += group.ops.length
  }
  return lastResult
}

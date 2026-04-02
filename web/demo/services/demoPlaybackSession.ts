import { getChartType, renderChart, type ChartSpec, type ChartTypeValue } from '../../../src/api/rendering'
import { runChartOps, type RunChartOpsOptions } from '../../../src/api/operation-run'
import type { DatumValue, OperationSpec } from '../../../src/api/types'
import { SurfaceManager } from '../../../src/runtime/surfaceManager'

type DemoSurfaceSnapshot = {
  id: string
  spec: ChartSpec
  chartType: ChartTypeValue
  data: DatumValue[]
}

export type DemoPlaybackSnapshot = {
  layoutType: 'single' | 'split-horizontal' | 'split-vertical'
  rootSurface: DemoSurfaceSnapshot
  activeSurfaces: DemoSurfaceSnapshot[]
}

export type DemoPlaybackStepResult = {
  kind: 'executed' | 'restored'
  stepIndex: number
}

function cloneSpecValue(spec: ChartSpec): ChartSpec {
  try {
    return structuredClone(spec)
  } catch {
    return JSON.parse(JSON.stringify(spec)) as ChartSpec
  }
}

function cloneDatumValues(rows: DatumValue[]): DatumValue[] {
  return rows.map((row) => ({ ...row }))
}

function cloneSurfaceSnapshot(surface: DemoSurfaceSnapshot): DemoSurfaceSnapshot {
  return {
    id: surface.id,
    spec: cloneSpecValue(surface.spec),
    chartType: surface.chartType,
    data: cloneDatumValues(surface.data),
  }
}

function isSplitLayout(layoutType: DemoPlaybackSnapshot['layoutType']) {
  return layoutType !== 'single'
}

export function createDemoPlaybackSession() {
  let container: HTMLElement | null = null
  let surfaceManager: SurfaceManager | null = null
  let lastExecutedStep = -1
  const snapshotsByStep = new Map<number, DemoPlaybackSnapshot>()

  const getExecutionSpec = () => surfaceManager?.getSurface('root')?.spec ?? null

  const createRootSurfaceManager = async (host: HTMLElement, spec: ChartSpec, data: DatumValue[] = []) => {
    const chartType = getChartType(spec)
    if (!chartType) {
      throw new Error('Failed to infer the chart type for demo playback.')
    }
    surfaceManager?.cleanupAll()
    surfaceManager = new SurfaceManager(host)
    surfaceManager.createRootSurface(cloneSpecValue(spec), chartType, cloneDatumValues(data))
  }

  const captureSnapshot = (): DemoPlaybackSnapshot => {
    if (!surfaceManager) {
      throw new Error('Demo playback session is not initialized.')
    }
    const rootSurface = surfaceManager.getSurface('root')
    if (!rootSurface) {
      throw new Error('Root surface is unavailable.')
    }
    const layoutType = surfaceManager.getLayout()?.type ?? 'single'
    const activeSurfaces =
      layoutType === 'single'
        ? [rootSurface]
        : surfaceManager.getActiveSurfaces().filter((surface) => surface.id !== 'root')

    return {
      layoutType,
      rootSurface: cloneSurfaceSnapshot({
        id: rootSurface.id,
        spec: rootSurface.spec,
        chartType: rootSurface.chartType,
        data: rootSurface.data,
      }),
      activeSurfaces: activeSurfaces.map((surface) =>
        cloneSurfaceSnapshot({
          id: surface.id,
          spec: surface.spec,
          chartType: surface.chartType,
          data: surface.data,
        }),
      ),
    }
  }

  const restoreSnapshot = async (snapshot: DemoPlaybackSnapshot) => {
    if (!container) {
      throw new Error('Demo playback container is unavailable.')
    }

    surfaceManager?.cleanupAll()
    await renderChart(container, snapshot.rootSurface.spec)
    await createRootSurfaceManager(container, snapshot.rootSurface.spec, snapshot.rootSurface.data)

    if (isSplitLayout(snapshot.layoutType) && snapshot.activeSurfaces.length >= 2 && surfaceManager) {
      const [surfaceA, surfaceB] = snapshot.activeSurfaces
      surfaceManager.splitSurface(snapshot.layoutType === 'split-vertical' ? 'vertical' : 'horizontal', {
        idA: surfaceA.id,
        idB: surfaceB.id,
        specA: cloneSpecValue(surfaceA.spec),
        specB: cloneSpecValue(surfaceB.spec),
        dataA: cloneDatumValues(surfaceA.data),
        dataB: cloneDatumValues(surfaceB.data),
      })

      const hostA = surfaceManager.getSurface(surfaceA.id)?.hostElement as HTMLElement | null
      const hostB = surfaceManager.getSurface(surfaceB.id)?.hostElement as HTMLElement | null
      if (hostA) {
        await renderChart(hostA, surfaceA.spec)
        surfaceManager.updateSurface(surfaceA.id, {
          spec: cloneSpecValue(surfaceA.spec),
          chartType: surfaceA.chartType,
          data: cloneDatumValues(surfaceA.data),
        })
      }
      if (hostB) {
        await renderChart(hostB, surfaceB.spec)
        surfaceManager.updateSurface(surfaceB.id, {
          spec: cloneSpecValue(surfaceB.spec),
          chartType: surfaceB.chartType,
          data: cloneDatumValues(surfaceB.data),
        })
      }
    }
  }

  const truncateSnapshotsAfter = (stepIndex: number) => {
    Array.from(snapshotsByStep.keys()).forEach((key) => {
      if (key > stepIndex) snapshotsByStep.delete(key)
    })
  }

  return {
    async initialize(host: HTMLElement, spec: ChartSpec) {
      container = host
      snapshotsByStep.clear()
      lastExecutedStep = -1
      surfaceManager?.cleanupAll()
      await renderChart(host, spec)
      await createRootSurfaceManager(host, spec)
    },

    reset() {
      surfaceManager?.cleanupAll()
      surfaceManager = null
      container = null
      snapshotsByStep.clear()
      lastExecutedStep = -1
    },

    getLastExecutedStep() {
      return lastExecutedStep
    },

    isStepLocked(stepIndex: number) {
      return stepIndex > lastExecutedStep + 1
    },

    async activateStep(stepIndex: number, ops: OperationSpec[]): Promise<DemoPlaybackStepResult> {
      if (!container) {
        throw new Error('Demo playback session is not initialized.')
      }
      if (this.isStepLocked(stepIndex)) {
        throw new Error(`Step ${stepIndex + 1} is locked until step ${stepIndex} is complete.`)
      }

      if (stepIndex <= lastExecutedStep) {
        const snapshot = snapshotsByStep.get(stepIndex)
        if (!snapshot) {
          throw new Error(`Missing snapshot for step ${stepIndex + 1}.`)
        }
        await restoreSnapshot(snapshot)
        truncateSnapshotsAfter(stepIndex)
        lastExecutedStep = stepIndex
        return { kind: 'restored', stepIndex }
      }

      const executionSpec = getExecutionSpec()
      if (!executionSpec) {
        throw new Error('Execution spec is unavailable.')
      }

      const options: RunChartOpsOptions = {
        initialRenderMode: 'reuse-existing',
        resetRuntime: stepIndex === 0,
        surfaceManager: surfaceManager ?? undefined,
      }
      await runChartOps(container, executionSpec, { ops }, options)
      const snapshot = captureSnapshot()
      snapshotsByStep.set(stepIndex, snapshot)
      lastExecutedStep = stepIndex
      return { kind: 'executed', stepIndex }
    },
  }
}

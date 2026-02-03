import type { DatumValue, OperationSpec, JsonValue } from '../types'
import { clearAnnotations } from '../renderer/common/d3Helpers.ts'
import { runChartOperationsCommon } from './runChartOperationsCommon.ts'
import { StackedBarDrawHandler } from '../renderer/draw/bar/StackedBarDrawHandler.ts'
import { runGenericDraw } from '../renderer/draw/genericDraw.ts'
import { DrawAction } from '../renderer/draw/types.ts'
import type { DrawOp } from '../renderer/draw/types.ts'
import {
  renderStackedBarChart,
  type StackedSpec,
  getStackedBarStoredData,
  getStackedBarOriginalData,
} from '../renderer/bar/stackedBarRenderer.ts'
import { toDatumValuesFromRaw, type RawRow } from '../renderer/ops/common/datum.ts'
import { runStackedBarDrawPlan } from '../renderer/ops/executor/runStackedBarDrawPlan.ts'
import { convertStackedToGrouped } from '../renderer/bar/stackGroupTransforms.ts'

const cloneDataset = (rows: any[]) => rows.map((row) => ({ ...row }))

function toStackedDatumValues(raw: JsonValue[], spec: StackedSpec): DatumValue[] {
  const normalized = raw.filter((item): item is RawRow => typeof item === 'object' && item !== null)
  return toDatumValuesFromRaw(
    normalized,
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

async function handleStackedGroupFilter(
  container: HTMLElement,
  spec: StackedSpec,
  drawOp: DrawOp,
) {
  if (drawOp.action !== DrawAction.StackedFilterGroups) return false
  const filterSpec = drawOp.groupFilter
  if (!filterSpec) {
    console.warn('draw:stacked-filter-groups requires groupFilter spec')
    return true
  }
  const colorField = spec.encoding.color?.field
  if (!colorField) {
    console.warn('draw:stacked-filter-groups requires a color encoding field')
    return true
  }
  const originalData = getStackedBarOriginalData(container)
  if (!originalData.length) return true
  let filtered = originalData
  if (filterSpec.reset) {
    filtered = originalData
  } else {
    const includeCandidates =
      filterSpec.groups?.length
        ? filterSpec.groups
        : filterSpec.include?.length
        ? filterSpec.include
        : filterSpec.keep
    if (includeCandidates && includeCandidates.length) {
      const includeSet = new Set(includeCandidates.map(String))
      filtered = originalData.filter((row) => includeSet.has(String(row[colorField])))
    } else if (filterSpec.exclude && filterSpec.exclude.length) {
      const excludeSet = new Set(filterSpec.exclude.map(String))
      filtered = originalData.filter((row) => !excludeSet.has(String(row[colorField])))
    } else {
      console.warn('draw:stacked-filter-groups needs groups/include/keep/exclude or reset flag')
      return true
    }
  }
  await renderStackedBarChart(container, { ...spec, data: { values: cloneDataset(filtered) } })
  return true
}

async function handleStackedBarDraw(
  container: HTMLElement,
  handler: StackedBarDrawHandler,
  drawOp: DrawOp,
  spec: StackedSpec,
) {
  if (drawOp.action === DrawAction.StackedToGrouped) {
    await convertStackedToGrouped(container, spec, drawOp.stackGroup)
    return
  }
  handler.run(drawOp)
  runGenericDraw(container, drawOp)
}

export async function runStackedBarOps(
  container: HTMLElement,
  vlSpec: StackedSpec,
  opsSpec: OperationSpec | OperationSpec[],
) {
  return runChartOperationsCommon<StackedSpec>({
    container,
    spec: vlSpec,
    opsSpec,
    render: renderStackedBarChart,
    postRender: async () => {},
    getWorkingData: () => {
      const raw = (getStackedBarStoredData(container) || []) as JsonValue[]
      return toStackedDatumValues(raw, vlSpec)
    },
    createHandler: () => new StackedBarDrawHandler(container),
    splitHandler: async (host, spec, handler, drawOp) =>
      handleStackedGroupFilter(host, spec, drawOp),
    handleDrawOp: async (host, handler, drawOp) =>
      handleStackedBarDraw(host, handler as StackedBarDrawHandler, drawOp, vlSpec),
    clearAnnotations: ({ svg }) => clearAnnotations(svg),
    runDrawPlan: async (drawPlan, handler) => {
      await runStackedBarDrawPlan(container, drawPlan, { handler: handler as StackedBarDrawHandler })
    },
  })
}

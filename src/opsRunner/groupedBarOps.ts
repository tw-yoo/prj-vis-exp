import type { DatumValue, OperationSpec, JsonValue } from '../types'
import { clearAnnotations } from '../renderer/common/d3Helpers.ts'
import { runChartOperationsCommon } from './runChartOperationsCommon.ts'
import { runGenericDraw } from '../renderer/draw/genericDraw.ts'
import { DrawAction } from '../renderer/draw/types.ts'
import { GroupedBarDrawHandler } from '../renderer/draw/bar/GroupedBarDrawHandler.ts'
import type { DrawOp } from '../renderer/draw/types.ts'
import { renderGroupedBarChart, type GroupedSpec, getGroupedBarStoredData, getGroupedBarOriginalData } from '../renderer/bar/groupedBarRenderer.ts'
import { toDatumValuesFromRaw, type RawRow } from '../renderer/ops/common/datum.ts'
import { runGroupedBarDrawPlan } from '../renderer/ops/executor/runGroupedBarDrawPlan.ts'
import { convertGroupedToStacked } from '../renderer/bar/stackGroupTransforms.ts'

const cloneDataset = (rows: any[]) => rows.map((row) => ({ ...row }))

async function handleGroupedGroupFilter(
  container: HTMLElement,
  spec: GroupedSpec,
  drawOp: DrawOp,
) {
  if (drawOp.action !== DrawAction.GroupedFilterGroups) return false
  const filterSpec = drawOp.groupFilter
  if (!filterSpec) {
    console.warn('draw:grouped-filter-groups requires groupFilter spec')
    return true
  }
  const colorField = spec.encoding.color?.field
  if (!colorField) {
    console.warn('draw:grouped-filter-groups requires a color encoding field')
    return true
  }
  const originalData = getGroupedBarOriginalData(container)
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
      console.warn('draw:grouped-filter-groups needs groups/include/keep/exclude or reset flag')
      return true
    }
  }
  await renderGroupedBarChart(container, { ...spec, data: { values: cloneDataset(filtered) } })
  return true
}

function toGroupedDatumValues(raw: JsonValue[], spec: GroupedSpec): DatumValue[] {
  const normalized = raw.filter((item): item is RawRow => typeof item === 'object' && item !== null)
  return toDatumValuesFromRaw(normalized, {
    xField: spec.encoding.x.field,
    yField: spec.encoding.y.field,
    groupField: spec.encoding.color?.field,
  })
}

async function handleGroupedBarDraw(
  container: HTMLElement,
  handler: GroupedBarDrawHandler,
  drawOp: DrawOp,
  spec: GroupedSpec,
) {
  if (drawOp.action === DrawAction.GroupedToStacked) {
    await convertGroupedToStacked(container, spec, drawOp.stackGroup)
    return
  }
  handler.run(drawOp)
  runGenericDraw(container, drawOp)
}

export async function runGroupedBarOps(
  container: HTMLElement,
  vlSpec: GroupedSpec,
  opsSpec: OperationSpec | OperationSpec[],
) {
  return runChartOperationsCommon<GroupedSpec>({
    container,
    spec: vlSpec,
    opsSpec,
    render: renderGroupedBarChart,
    postRender: async () => {},
    getWorkingData: () => {
      const raw = (getGroupedBarStoredData(container) || []) as JsonValue[]
      return toGroupedDatumValues(raw, vlSpec)
    },
    createHandler: () => new GroupedBarDrawHandler(container),
    splitHandler: async (host, spec, handler, drawOp) =>
      handleGroupedGroupFilter(host, spec, drawOp),
    handleDrawOp: async (host, handler, drawOp) =>
      handleGroupedBarDraw(host, handler as GroupedBarDrawHandler, drawOp, vlSpec),
    clearAnnotations: ({ svg }) => clearAnnotations(svg),
    runDrawPlan: async (drawPlan, handler) => {
      await runGroupedBarDrawPlan(container, drawPlan, { handler: handler as GroupedBarDrawHandler })
    },
  })
}

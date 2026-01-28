import type { DatumValue, OperationSpec } from '../types'
import { clearAnnotations } from '../renderer/common/d3Helpers.ts'
import { runChartOperationsCommon } from './runChartOperationsCommon.ts'
import { runGenericDraw } from '../renderer/draw/genericDraw.ts'
import { GroupedBarDrawHandler } from '../renderer/draw/bar/GroupedBarDrawHandler.ts'
import type { DrawOp } from '../renderer/draw/types.ts'
import { renderGroupedBarChart, type GroupedSpec, getGroupedBarStoredData } from '../renderer/bar/groupedBarRenderer.ts'
import { toDatumValuesFromRaw } from '../renderer/ops/common/datum.ts'
import { runGroupedBarDrawPlan } from '../renderer/ops/executor/runGroupedBarDrawPlan.ts'

function toGroupedDatumValues(raw: any[], spec: GroupedSpec): DatumValue[] {
  return toDatumValuesFromRaw(raw as any, {
    xField: spec.encoding.x.field,
    yField: spec.encoding.y.field,
    groupField: spec.encoding.color?.field,
  })
}

function handleGroupedBarDraw(container: HTMLElement, handler: GroupedBarDrawHandler, drawOp: DrawOp) {
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
      const raw = getGroupedBarStoredData(container) || []
      return toGroupedDatumValues(raw, vlSpec)
    },
    createHandler: () => new GroupedBarDrawHandler(container),
    handleDrawOp: (host, handler, drawOp) => handleGroupedBarDraw(host, handler as GroupedBarDrawHandler, drawOp),
    clearAnnotations: ({ svg }) => clearAnnotations(svg),
    runDrawPlan: async (drawPlan, handler) => {
      await runGroupedBarDrawPlan(container, drawPlan, { handler: handler as GroupedBarDrawHandler })
    },
  })
}

import type { DatumValue, OperationSpec } from '../types'
import { clearAnnotations } from '../renderer/common/d3Helpers.ts'
import { runChartOperationsCommon } from './runChartOperationsCommon.ts'
import { StackedBarDrawHandler } from '../renderer/draw/bar/StackedBarDrawHandler.ts'
import { runGenericDraw } from '../renderer/draw/genericDraw.ts'
import type { DrawOp } from '../renderer/draw/types.ts'
import { renderStackedBarChart, type StackedSpec, getStackedBarStoredData } from '../renderer/bar/stackedBarRenderer.ts'
import { toDatumValuesFromRaw } from '../renderer/ops/common/datum.ts'
import { runStackedBarDrawPlan } from '../renderer/ops/executor/runStackedBarDrawPlan.ts'

function toStackedDatumValues(raw: any[], spec: StackedSpec): DatumValue[] {
  return toDatumValuesFromRaw(
    raw as any,
    { xField: spec.encoding.x.field, yField: spec.encoding.y.field, groupField: spec.encoding.color?.field },
    {
      groupFallback: (row: any) => (row?.group ?? row?.color ?? null),
    },
  )
}

function handleStackedBarDraw(container: HTMLElement, handler: StackedBarDrawHandler, drawOp: DrawOp) {
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
      const raw = getStackedBarStoredData(container) || []
      return toStackedDatumValues(raw, vlSpec)
    },
    createHandler: () => new StackedBarDrawHandler(container),
    handleDrawOp: (host, handler, drawOp) => handleStackedBarDraw(host, handler as StackedBarDrawHandler, drawOp),
    clearAnnotations: ({ svg }) => clearAnnotations(svg),
    runDrawPlan: async (drawPlan, handler) => {
      await runStackedBarDrawPlan(container, drawPlan, { handler: handler as StackedBarDrawHandler })
    },
  })
}

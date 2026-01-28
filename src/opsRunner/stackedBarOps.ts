import type { DatumValue, OperationSpec, JsonValue } from '../types'
import { clearAnnotations } from '../renderer/common/d3Helpers.ts'
import { runChartOperationsCommon } from './runChartOperationsCommon.ts'
import { StackedBarDrawHandler } from '../renderer/draw/bar/StackedBarDrawHandler.ts'
import { runGenericDraw } from '../renderer/draw/genericDraw.ts'
import { DrawAction } from '../renderer/draw/types.ts'
import type { DrawOp } from '../renderer/draw/types.ts'
import { renderStackedBarChart, type StackedSpec, getStackedBarStoredData } from '../renderer/bar/stackedBarRenderer.ts'
import { toDatumValuesFromRaw, type RawRow } from '../renderer/ops/common/datum.ts'
import { runStackedBarDrawPlan } from '../renderer/ops/executor/runStackedBarDrawPlan.ts'
import { convertStackedToGrouped } from '../renderer/bar/stackGroupTransforms.ts'

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
    handleDrawOp: async (host, handler, drawOp) =>
      handleStackedBarDraw(host, handler as StackedBarDrawHandler, drawOp, vlSpec),
    clearAnnotations: ({ svg }) => clearAnnotations(svg),
    runDrawPlan: async (drawPlan, handler) => {
      await runStackedBarDrawPlan(container, drawPlan, { handler: handler as StackedBarDrawHandler })
    },
  })
}

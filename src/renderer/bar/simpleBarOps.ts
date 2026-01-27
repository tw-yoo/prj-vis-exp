// @ts-nocheck
import type { DataOpResult, DatumValue, JsonValue, OperationSpec } from '../../types'
import { OperationOp } from '../../types'
import { clearAnnotations, getChartContext, type ChartContext } from '../common/d3Helpers'
import { BarDrawHandler } from '../draw/BarDrawHandler'
import { DrawAction, type DrawSplitSpec } from '../draw/types'
import { runGenericDraw } from '../draw/genericDraw'
import { isDrawOp } from '../ops/operationPipeline'
import { runSimpleBarDrawPlan } from '../ops/executor/runSimpleBarDrawPlan'
import { buildSimpleBarRetrieveValueDrawPlan } from '../ops/visual/bar/simple/retrieveValue.visual'
import {
  retrieveValue,
  filterData,
  findExtremum,
  sortData,
  sumData,
  averageData,
  diffData,
  lagDiffData,
  nthData,
  compareOp,
  compareBoolOp,
  countData,
  determineRange,
  makeRuntimeKey,
  resetRuntimeResults,
  storeRuntimeResult,
} from '../../logic/dataOps'
import {
  renderSimpleBarChart,
  renderSplitSimpleBarChart,
  type SimpleBarSpec,
  getSimpleBarStoredData,
} from './simpleBarRenderer'

function getContext(container: HTMLElement): ChartContext {
  return getChartContext(container, { preferPlotArea: true })
}

type OpsSpecInput = { ops?: OperationSpec[] } | OperationSpec[] | null | undefined

function normalizeOpsList(opsSpec: OpsSpecInput): OperationSpec[] {
  if (!opsSpec) return []
  if (Array.isArray(opsSpec)) return opsSpec
  if (typeof opsSpec === 'object' && Array.isArray((opsSpec as { ops?: JsonValue }).ops)) {
    return (opsSpec as { ops: OperationSpec[] }).ops
  }
  if (typeof opsSpec === 'object') return [opsSpec as OperationSpec]
  return []
}

function toDatumValues(rawData: Record<string, JsonValue>[], xField: string, yField: string): DatumValue[] {
  const categoryField = xField
  const measureField = yField
  return rawData.map((row, idx) => {
    const targetRaw = row[categoryField] ?? `item_${idx}`
    const valueRaw = row[measureField]
    return {
      category: categoryField,
      measure: measureField,
      target: String(targetRaw),
      group: null,
      value: Number(valueRaw),
      id: row.id != null ? String(row.id) : String(idx),
    }
  })
}

function toWorkingDatumValues(container: HTMLElement, vlSpec: SimpleBarSpec) {
  const raw = (getSimpleBarStoredData(container) || []) as Record<string, JsonValue>[]
  const { xField, yField } = getContext(container)
  return toDatumValues(raw, xField || vlSpec.encoding.x.field, yField || vlSpec.encoding.y.field)
}

const DATA_OP_HANDLERS: Record<string, (data: DatumValue[], op: OperationSpec) => DataOpResult> = {
  [OperationOp.RetrieveValue]: retrieveValue,
  [OperationOp.Filter]: filterData,
  [OperationOp.FindExtremum]: findExtremum,
  [OperationOp.DetermineRange]: determineRange,
  [OperationOp.Compare]: compareOp,
  [OperationOp.CompareBool]: compareBoolOp,
  [OperationOp.Sort]: sortData,
  [OperationOp.Sum]: sumData,
  [OperationOp.Average]: averageData,
  [OperationOp.Diff]: diffData,
  [OperationOp.LagDiff]: lagDiffData,
  [OperationOp.Nth]: nthData,
  [OperationOp.Count]: countData,
}

function looksLikeDatumArray(result: DataOpResult): result is DatumValue[] {
  if (!Array.isArray(result) || result.length === 0) return false
  const first = result[0] as DatumValue
  return typeof first === 'object' && first !== null && 'value' in first
}

function runtimeKeyFor(op: OperationSpec, index: number) {
  const opKey = (op as any)?.key ?? (op as any)?.id ?? op.op ?? 'step'
  return makeRuntimeKey(opKey, index)
}

/**
 * Run a list of operations against a rendered simple bar chart in the given container.
 * Rendering is invoked first to ensure the chart and data store are prepared.
 */
export async function runSimpleBarOps(
  container: HTMLElement,
  vlSpec: SimpleBarSpec,
  opsSpec: OpsSpecInput,
): Promise<DataOpResult> {
  await renderSimpleBarChart(container, vlSpec)

  const baseData = toWorkingDatumValues(container, vlSpec)
  const opsList = normalizeOpsList(opsSpec)

  resetRuntimeResults()
  clearAnnotations(getContext(container).svg)

  let working: DataOpResult = baseData
  let handler = new BarDrawHandler(container)

  for (let index = 0; index < opsList.length; index += 1) {
    const op = opsList[index]

    if (isDrawOp(op)) {
      const drawOp = op as any
      if (drawOp.action === DrawAction.Split) {
        if (!drawOp.split) {
          console.warn('draw:split requires split spec', drawOp)
          continue
        }
        await renderSplitSimpleBarChart(container, vlSpec, drawOp.split as DrawSplitSpec)
        handler = new BarDrawHandler(container)
        continue
      }
      if (drawOp.action === DrawAction.Unsplit) {
        await renderSimpleBarChart(container, vlSpec)
        handler = new BarDrawHandler(container)
        continue
      }
      handler.run(drawOp)
      runGenericDraw(container, drawOp)
      continue
    }

    const input = Array.isArray(working) ? (working as DatumValue[]) : baseData

    if (op.op === OperationOp.RetrieveValue) {
      const result = retrieveValue(input, op)
      if (looksLikeDatumArray(result)) {
        storeRuntimeResult(runtimeKeyFor(op, index), result)
      }
      working = result
      const drawPlan = buildSimpleBarRetrieveValueDrawPlan(result, op as any)
      await runSimpleBarDrawPlan(container, drawPlan, { handler })
      continue
    }

    const dataHandler = DATA_OP_HANDLERS[op.op ?? '']
    if (!dataHandler) {
      console.warn(`Unsupported operation: ${op.op}`)
      continue
    }

    const result = dataHandler(input, op)
    if (looksLikeDatumArray(result)) {
      storeRuntimeResult(runtimeKeyFor(op, index), result)
    }
    working = result
  }

  return working
}


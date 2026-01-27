import type { DatumValue, OperationSpec } from '../../types'
import { OperationOp } from '../../types'
import { renderSimpleLineChart, type LineSpec, getSimpleLineStoredData, tagSimpleLineMarks } from './simpleLineRenderer'
import {
  retrieveValue,
  filterData,
  findExtremum,
  determineRange,
  compareOp,
  compareBoolOp,
  sortData,
  sumData,
  averageData,
  diffData,
  lagDiffData,
  nthData,
  countData,
} from '../../logic/dataOps'
import { DrawAction } from '../draw/types'
import { SimpleLineDrawHandler } from '../draw/line/SimpleLineDrawHandler'
import { clearAnnotations } from '../common/d3Helpers'
import { SvgElements } from '../interfaces'
import * as d3 from 'd3'

const OP_HANDLERS: Record<string, (data: DatumValue[], op: OperationSpec, container?: HTMLElement) => DatumValue[] | any> = {
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
  [OperationOp.Draw]: (data, op, container) => handleDraw(container, data, op as DrawOp),
}

type DrawSelect = { by?: 'key' | 'mark'; keys?: string[]; mark?: string }
type DrawOp = OperationSpec & {
  action?: DrawAction
  select?: DrawSelect
  style?: { color?: string; opacity?: number }
  chartId?: string
}

function toDatumValues(rawData: any[], xField: string, yField: string): DatumValue[] {
  return rawData.map((row, idx) => ({
    category: xField,
    measure: yField,
    target: String(row[xField] ?? `item_${idx}`),
    group: null,
    value: Number(row[yField]),
    id: row.id != null ? String(row.id) : String(idx),
  }))
}

function handleDraw(container: HTMLElement | undefined, data: DatumValue[], op: DrawOp) {
  if (!container) return data
  const handler = new SimpleLineDrawHandler(container)
  if (!op.action) return data
  switch (op.action) {
    case DrawAction.Clear: {
      clearAnnotations(d3.select(container).select(SvgElements.Svg))
      handler.run(op as any)
      return data
    }
    case DrawAction.Highlight:
    case DrawAction.Dim:
    case DrawAction.LineTrace:
    case DrawAction.Text:
    case DrawAction.Rect:
    case DrawAction.Line: {
      handler.run(op as any)
      return data
    }
    default: {
      console.warn('draw: unsupported action for simple line', op.action)
    }
  }
  return data
}

export async function runSimpleLineOps(container: HTMLElement, vlSpec: LineSpec, opsSpec: any) {
  const hasSvg = !!container.querySelector('svg')
  if (!hasSvg) {
    await renderSimpleLineChart(container, vlSpec)
  } else {
    await tagSimpleLineMarks(container, vlSpec)
  }
  const raw = getSimpleLineStoredData(container) || []
  const xField = vlSpec.encoding.x.field
  const yField = vlSpec.encoding.y.field
  const base = toDatumValues(raw, xField, yField)
  const opsArray = Array.isArray(opsSpec) ? opsSpec : Array.isArray(opsSpec?.ops) ? opsSpec.ops : []
  let working: any = base
  for (const op of opsArray) {
    const handler = OP_HANDLERS[op.op ?? '']
    if (!handler) continue
    working = handler(Array.isArray(working) ? working : base, { ...op, container }, container)
  }
  return working
}


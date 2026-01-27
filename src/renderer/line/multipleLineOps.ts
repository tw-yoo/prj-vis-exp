import type { DatumValue, OperationSpec } from '../../types'
import { OperationOp } from '../../types'
import * as d3 from 'd3'
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
import { clearAnnotations } from '../common/d3Helpers'
import { DataAttributes, SvgAttributes, SvgElements } from '../interfaces'
import { DrawAction } from '../draw/types'
import { runGenericDraw } from '../draw/genericDraw'
import {
  renderMultipleLineChart,
  type MultiLineSpec,
  getMultipleLineStoredData,
  tagMultipleLineMarks,
} from './multipleLineRenderer'

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
}

function toDatumValues(rawData: any[], xField: string, yField: string, colorField?: string): DatumValue[] {
  return rawData.map((row, idx) => ({
    category: xField,
    measure: yField,
    target: String(row[xField] ?? `item_${idx}`),
    group: colorField ? row[colorField] ?? null : null,
    value: Number(row[yField]),
    id: row.id != null ? String(row.id) : String(idx),
  }))
}

function selectElements(container: HTMLElement, select: DrawSelect | undefined) {
  const svg = d3.select(container).select(SvgElements.Svg)
  const mark = select?.mark || SvgElements.Circle
  if (!select?.keys || !select.keys.length) return svg.selectAll<SVGElement, unknown>(mark)
  const keySet = new Set(select.keys.map(String))
  return svg
    .selectAll<SVGElement, unknown>(mark)
    .filter(function () {
      const targetAttr =
        (this as Element).getAttribute(DataAttributes.Target) || (this as Element).getAttribute(DataAttributes.Id)
      const datum: any = (this as any).__data__
      const datumKey = datum?.target ?? datum?.x ?? null
      const target = targetAttr ?? (datumKey != null ? String(datumKey) : null)
      return target != null && keySet.has(String(target))
    })
}

function handleDraw(container: HTMLElement | undefined, data: DatumValue[], op: DrawOp) {
  if (!container) return data
  const selection = selectElements(container, op.select)
  const allPoints = d3.select(container).select(SvgElements.Svg).selectAll<SVGCircleElement, unknown>(SvgElements.Circle)

  switch (op.action) {
    case DrawAction.Clear:
      allPoints.attr(SvgAttributes.Fill, null).attr(SvgAttributes.Opacity, 1)
      clearAnnotations(d3.select(container).select(SvgElements.Svg))
      return data
    case DrawAction.Highlight: {
      const color = op.style?.color || '#ef4444'
      selection.attr(SvgAttributes.Fill, color).attr(SvgAttributes.Opacity, 1).attr(SvgAttributes.Stroke, color)
      return data
    }
    case DrawAction.Dim: {
      const opacity = op.style?.opacity ?? 0.25
      const selectedNodes = new Set(selection.nodes())
      allPoints.attr(SvgAttributes.Opacity, function () {
        return selectedNodes.has(this as any) ? 1 : opacity
      })
      return data
    }
    case DrawAction.Text: {
      runGenericDraw(container, op as any)
      return data
    }
    default:
      runGenericDraw(container, op as any)
  }
  return data
}

export async function runMultipleLineOps(container: HTMLElement, vlSpec: MultiLineSpec, opsSpec: any) {
  const hasSvg = !!container.querySelector('svg')
  if (!hasSvg) {
    await renderMultipleLineChart(container, vlSpec)
  } else {
    await tagMultipleLineMarks(container, vlSpec)
  }
  const raw = getMultipleLineStoredData(container) || []
  const xField = vlSpec.encoding.x.field
  const yField = vlSpec.encoding.y.field
  const colorField = vlSpec.encoding.color?.field
  const base = toDatumValues(raw, xField, yField, colorField)
  const opsArray = Array.isArray(opsSpec) ? opsSpec : Array.isArray(opsSpec?.ops) ? opsSpec.ops : []
  let working: any = base
  for (const op of opsArray) {
    const handler = OP_HANDLERS[op.op ?? '']
    if (!handler) continue
    working = handler(Array.isArray(working) ? working : base, { ...op, container }, container)
  }
  return working
}

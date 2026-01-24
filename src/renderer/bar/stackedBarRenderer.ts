import * as d3 from 'd3'
import { renderVegaLiteChart, type VegaLiteSpec } from '../../utils/chartRenderer'
import type { DatumValue, OperationSpec } from '../../types'
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

const localDataStore: WeakMap<HTMLElement, any[]> = new WeakMap()

type StackedSpec = VegaLiteSpec & {
  encoding: {
    x: { field: string; type: string; stack?: string | null }
    y: { field: string; type: string; stack?: string | null }
    color?: { field?: string }
  }
}

const OP_HANDLERS: Record<string, (data: DatumValue[], op: OperationSpec, container?: HTMLElement) => DatumValue[] | any> = {
  retrieveValue,
  filter: filterData,
  findExtremum,
  determineRange,
  compare: compareOp,
  compareBool: compareBoolOp,
  sort: sortData,
  sum: sumData,
  average: averageData,
  diff: diffData,
  lagDiff: lagDiffData,
  nth: nthData,
  count: countData,
  draw: (data, op, container) => handleDraw(container, data, op as DrawOp),
}

type DrawSelect = {
  by?: 'key' | 'mark'
  keys?: string[]
  mark?: string
}
type DrawOp = OperationSpec & {
  action?: 'clear' | 'highlight' | 'dim'
  select?: DrawSelect
  style?: { color?: string; opacity?: number }
}

function toDatumValues(rawData: any[], xField: string, yField: string): DatumValue[] {
  return rawData.map((row, idx) => {
    const target = row[xField] ?? `item_${idx}`
    const value = Number(row[yField])
    return {
      category: xField,
      measure: yField,
      target: String(target),
      group: row.group ?? row.color ?? null,
      value,
      id: row.id != null ? String(row.id) : String(idx),
    }
  })
}

function selectElements(container: HTMLElement, select: DrawSelect | undefined) {
  const svg = d3.select(container).select('svg')
  const mark = select?.mark || 'rect'
  if (!select?.keys || !select.keys.length) {
    return svg.selectAll<SVGElement, unknown>(mark)
  }
  const keySet = new Set(select.keys.map(String))
  return svg
    .selectAll<SVGElement, unknown>(mark)
    .filter(function filterByKey() {
      const target = (this as Element).getAttribute('data-target') || (this as Element).getAttribute('data-id')
      return target != null && keySet.has(String(target))
    })
}

function handleDraw(container: HTMLElement | undefined, data: DatumValue[], op: DrawOp) {
  if (!container) return data
  const action = (op.action || '').toLowerCase()
  const selection = selectElements(container, op.select)
  const allRects = d3.select(container).select('svg').selectAll<SVGRectElement, unknown>('rect')

  if (action === 'clear') {
    allRects.attr('fill', null).attr('opacity', 1)
    clearAnnotations(d3.select(container).select('svg'))
    return data
  }
  if (action === 'highlight') {
    const color = op.style?.color || '#ef4444'
    selection.attr('fill', color).attr('opacity', 1)
    return data
  }
  if (action === 'dim') {
    const opacity = op.style?.opacity ?? 0.25
    const selectedNodes = new Set(selection.nodes())
    allRects.attr('opacity', function () {
      return selectedNodes.has(this as any) ? 1 : opacity
    })
    return data
  }
  console.warn('draw: unsupported action', action, op)
  return data
}

export async function renderStackedBarChart(container: HTMLElement, spec: StackedSpec) {
  localDataStore.set(container, (spec.data as any)?.values || [])
  return renderVegaLiteChart(container, spec)
}

export async function runStackedBarOps(container: HTMLElement, vlSpec: StackedSpec, opsSpec: any) {
  await renderStackedBarChart(container, vlSpec)
  const raw = localDataStore.get(container) || []
  const xField = vlSpec.encoding.x.field
  const yField = vlSpec.encoding.y.field
  const base = toDatumValues(raw, xField, yField)
  const opsArray = Array.isArray(opsSpec) ? opsSpec : Array.isArray(opsSpec?.ops) ? opsSpec.ops : []
  let working: any = base
  for (const op of opsArray) {
    const handler = OP_HANDLERS[op.op ?? '']
    if (!handler) continue
    working = handler(Array.isArray(working) ? working : base, { ...op, container })
  }
  clearAnnotations(d3.select(container).select('svg'))
  return working
}

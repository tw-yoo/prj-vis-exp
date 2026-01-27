import * as d3 from 'd3'
import { renderVegaLiteChart, type VegaLiteSpec } from '../../utils/chartRenderer'
import type { DatumValue, OperationSpec } from '../../types'
import { SimpleLineDrawHandler } from '../draw/line/SimpleLineDrawHandler'
import { DrawAction } from '../draw/types'
import { DataAttributes, SvgAttributes, SvgElements } from '../interfaces'
import { clearAnnotations, ensureXAxisLabelClearance } from '../common/d3Helpers'
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

const localDataStore: WeakMap<HTMLElement, any[]> = new WeakMap()

type LineSpec = VegaLiteSpec & {
  encoding: {
    x: { field: string; type: string }
    y: { field: string; type: string }
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
    case DrawAction.Text: {
      handler.run(op as any)
      return data
    }
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

export async function renderSimpleLineChart(container: HTMLElement, spec: LineSpec) {
  const values = (spec.data as any)?.values || []
  localDataStore.set(container, values)
  const mark =
    typeof spec.mark === 'string'
      ? { type: spec.mark, point: true }
      : { ...(spec.mark || {}), type: (spec.mark as any)?.type || 'line', point: (spec.mark as any)?.point ?? true }
  const withPoints = { ...spec, mark }
  const result = await renderVegaLiteChart(container, withPoints)
  await tagLineMarks(container, spec.encoding.x.field, spec.encoding.y.field, spec.encoding.x.type)
  ensureXAxisLabelClearance(container.id || 'chart', { attempts: 5, minGap: 14, maxShift: 120 })
  return result
}

export async function runSimpleLineOps(container: HTMLElement, vlSpec: LineSpec, opsSpec: any) {
  // Re-render only if SVG is missing; otherwise reuse to avoid flicker.
  const hasSvg = !!container.querySelector('svg')
  if (!hasSvg) {
    await renderSimpleLineChart(container, vlSpec)
  } else {
    await tagLineMarks(container, vlSpec.encoding.x.field, vlSpec.encoding.y.field, vlSpec.encoding.x.type)
  }
  const raw = localDataStore.get(container) || []
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

async function tagLineMarks(container: HTMLElement, xField: string, yField: string, xType?: string) {
  // wait up to 5 animation frames for marks to be rendered
  for (let i = 0; i < 5; i += 1) {
    const svgCheck = d3.select(container).select(SvgElements.Svg)
    const markCount = svgCheck.selectAll<SVGGraphicsElement, any>('path, circle, rect').size()
    if (markCount > 0) break
    await new Promise((resolve) => requestAnimationFrame(resolve))
  }
  const svg = d3.select(container).select(SvgElements.Svg)
  // Tag all shapes that actually carry datum with x/y.
  let count = 0
  svg.selectAll<SVGGraphicsElement, any>('path, circle, rect').each(function (_d: any) {
    const datum = (_d as any)?.datum ?? _d ?? (this as any).__data__ ?? {}
    const hasX = datum?.[xField] !== undefined && datum?.[xField] !== null
    const hasY = datum?.[yField] !== undefined && datum?.[yField] !== null
    if (!hasX || !hasY) return
    const rawTarget = datum?.[xField]
    const rawValue = datum?.[yField]
    if (rawTarget != null && rawValue != null) {
      let isoFull = String(rawTarget)
      let isoDate = String(rawTarget)
      if (xType === 'temporal') {
        let dt: Date
        if (rawTarget instanceof Date) {
          dt = rawTarget
        } else if (typeof rawTarget === 'number') {
          if (rawTarget > 1e10) dt = new Date(rawTarget)
          else if (rawTarget > 3e3) dt = new Date(rawTarget * 1000)
          else dt = new Date(Date.UTC(rawTarget, 0, 1))
        } else {
          dt = new Date(rawTarget as any)
        }
        isoFull = dt.toISOString()
        isoDate = isoFull.slice(0, 10)
      }
      const valueVal = rawValue
      d3.select(this as Element)
        .attr(DataAttributes.Target, isoDate)
        .attr(DataAttributes.Id, isoFull)
        .attr(DataAttributes.Value, valueVal != null ? String(valueVal) : null)
      count += 1
    }
  })
  // eslint-disable-next-line no-console
  return count
}

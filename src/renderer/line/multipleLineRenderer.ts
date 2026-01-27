import * as d3 from 'd3'
import { renderVegaLiteChart, type VegaLiteSpec } from '../../utils/chartRenderer'
import type { DatumValue, OperationSpec } from '../../types'
import { DataAttributes, SvgAttributes, SvgClassNames, SvgElements } from '../interfaces'
import { DrawAction } from '../draw/types'
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
import { clearAnnotations, ensureXAxisLabelClearance } from '../common/d3Helpers'
import { runGenericDraw } from '../draw/genericDraw'

const localDataStore: WeakMap<HTMLElement, any[]> = new WeakMap()

type MultiLineSpec = VegaLiteSpec & {
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

export async function renderMultipleLineChart(container: HTMLElement, spec: MultiLineSpec) {
  const values = (spec.data as any)?.values || []
  localDataStore.set(container, values)

  // Default mark: line with point symbols
  const mark =
    typeof spec.mark === 'string'
      ? { type: spec.mark, point: true }
      : { ...(spec.mark || {}), type: (spec.mark as any)?.type || 'line', point: (spec.mark as any)?.point ?? true }

  const withPoints = { ...spec, mark }
  const result = await renderVegaLiteChart(container, withPoints)
  tagLineMarks(container, spec.encoding.x.field, spec.encoding.y.field, spec.encoding.x.type)
  ensureXAxisLabelClearance(container.id || 'chart', { attempts: 5, minGap: 14, maxShift: 120 })
  return result
}

export async function runMultipleLineOps(container: HTMLElement, vlSpec: MultiLineSpec, opsSpec: any) {
  await renderMultipleLineChart(container, vlSpec)
  const raw = localDataStore.get(container) || []
  const xField = vlSpec.encoding.x.field
  const yField = vlSpec.encoding.y.field
  const colorField = vlSpec.encoding.color?.field
  const base = toDatumValues(raw, xField, yField, colorField)
  const opsArray = Array.isArray(opsSpec) ? opsSpec : Array.isArray(opsSpec?.ops) ? opsSpec.ops : []
  let working: any = base
  for (const op of opsArray) {
    const handler = OP_HANDLERS[op.op ?? '']
    if (!handler) continue
    working = handler(Array.isArray(working) ? working : base, { ...op, container })
  }
  clearAnnotations(d3.select(container).select(SvgElements.Svg))
  return working
}

async function tagLineMarks(container: HTMLElement, xField: string, yField: string, xType?: string) {
  // wait up to 5 frames for marks to exist
  for (let i = 0; i < 5; i += 1) {
    const svgCheck = d3.select(container).select(SvgElements.Svg)
    const markCount = svgCheck.selectAll<SVGGraphicsElement, any>('path, circle, rect').size()
    if (markCount > 0) break
    await new Promise((resolve) => requestAnimationFrame(resolve))
  }
  const svg = d3.select(container).select(SvgElements.Svg)
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
    }
  })
}

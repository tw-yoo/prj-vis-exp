// @ts-nocheck
import * as d3 from 'd3'
import { renderVegaLiteChart, type VegaLiteSpec } from '../../utils/chartRenderer'
import type { DatumValue, OperationSpec } from '../../types'
import { DataAttributes, SvgAttributes, SvgElements } from '../interfaces'
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
  draw: (data, op, container) => {
    const result = handleDraw(container, data, op as DrawOp)
    runGenericDraw(container!, op as any)
    return result
  },
}

type DrawSelect = {
  by?: 'key' | 'mark'
  keys?: string[]
  mark?: string
}
type DrawOp = OperationSpec & {
  action?: DrawAction
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
  const svg = d3.select(container).select(SvgElements.Svg) as any
  const mark = select?.mark || SvgElements.Rect
  if (!select?.keys || !select.keys.length) {
    return svg.selectAll<SVGElement, any>(mark) as any
  }
  const keySet = new Set(select.keys.map(String))
  return (svg as any)
    .selectAll<SVGElement, any>(mark)
    .filter(function filterByKey() {
      const target =
        (this as Element).getAttribute(DataAttributes.Target) || (this as Element).getAttribute(DataAttributes.Id)
      return target != null && keySet.has(String(target))
    }) as any
}

function handleDraw(container: HTMLElement | undefined, data: DatumValue[], op: DrawOp) {
  if (!container) return data
  const selection = selectElements(container, op.select)
  const allRects = d3.select(container).select(SvgElements.Svg).selectAll<SVGRectElement, unknown>(SvgElements.Rect)

  switch (op.action) {
    case DrawAction.Clear:
      allRects.attr(SvgAttributes.Fill, null).attr(SvgAttributes.Opacity, 1)
      clearAnnotations(d3.select(container).select(SvgElements.Svg))
      return data
    case DrawAction.Highlight: {
      const color = op.style?.color || '#ef4444'
      selection.attr(SvgAttributes.Fill, color).attr(SvgAttributes.Opacity, 1)
      return data
    }
    case DrawAction.Dim: {
      const opacity = op.style?.opacity ?? 0.25
      const selectedNodes = new Set(selection.nodes())
      allRects.attr(SvgAttributes.Opacity, function () {
        return selectedNodes.has(this as any) ? 1 : opacity
      })
      return data
    }
    default:
      console.warn('draw: unsupported action', op.action, op)
  }
  return data
}

export async function renderStackedBarChart(container: HTMLElement, spec: StackedSpec) {
  localDataStore.set(container, (spec.data as any)?.values || [])
  const result = await renderVegaLiteChart(container, spec)
  await tagBarMarks(container, spec.encoding.x.field, spec.encoding.y.field, spec.encoding.color?.field)
  fitSvgToHost(container)
  ensureXAxisLabelClearance(container.id || 'chart', { attempts: 5, minGap: 14, maxShift: 120 })
  return result
}

async function tagBarMarks(container: HTMLElement, xField: string, yField: string, colorField?: string) {
  for (let i = 0; i < 5; i += 1) {
    const markCount = d3.select(container).select(SvgElements.Svg).selectAll<SVGGraphicsElement, any>('rect,path').size()
    if (markCount > 0) break
    await new Promise((resolve) => requestAnimationFrame(resolve))
  }
  const svg = d3.select(container).select(SvgElements.Svg)
  svg.selectAll<SVGGraphicsElement, any>('rect,path').each(function (_d: any) {
    const datum = (_d as any)?.datum ?? _d ?? (this as any).__data__ ?? {}
    const xVal = datum?.[xField] ?? datum?.[xField?.toLowerCase?.()] ?? datum?.x ?? null
    const yVal = datum?.[yField] ?? datum?.[yField?.toLowerCase?.()] ?? datum?.y ?? null
    const colorVal = colorField ? datum?.[colorField] ?? datum?.[colorField?.toLowerCase?.()] : null
    if (xVal == null || yVal == null) return
    d3.select(this as Element)
      .attr(DataAttributes.Target, String(xVal))
      .attr(DataAttributes.Id, String(xVal))
      .attr(DataAttributes.Value, String(yVal))
      .attr(DataAttributes.Series, colorVal != null ? String(colorVal) : null)
  })
}

function fitSvgToHost(container: HTMLElement) {
  const svgSel = d3.select(container).select(SvgElements.Svg)
  if (svgSel.empty()) return
  const node = svgSel.node() as SVGSVGElement | null
  if (!node || typeof node.getBBox !== 'function') return
  const bbox = node.getBBox()
  if (!bbox || !Number.isFinite(bbox.width) || bbox.width <= 0 || !Number.isFinite(bbox.height)) return
  const hostWidth = Math.max(1, Math.min(container.clientWidth || bbox.width, 880))
  const scale = hostWidth / bbox.width
  const newHeight = Math.max(1, bbox.height * scale)
  node.setAttribute(SvgAttributes.ViewBox, `${bbox.x} ${bbox.y} ${bbox.width} ${bbox.height}`)
  node.setAttribute('width', String(hostWidth))
  node.setAttribute('height', String(newHeight))
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
  clearAnnotations(d3.select(container).select(SvgElements.Svg))
  return working
}
// @ts-nocheck

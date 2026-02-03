// @ts-nocheck
import * as d3 from 'd3'
import { renderVegaLiteChart, type VegaLiteSpec } from '../../utils/chartRenderer'
import { DataAttributes, SvgAttributes, SvgElements } from '../interfaces'
import { ensureXAxisLabelClearance } from '../common/d3Helpers'

const localDataStore: WeakMap<HTMLElement, any[]> = new WeakMap()
const originalDataStore: WeakMap<HTMLElement, any[]> = new WeakMap()
const cloneRows = (rows: any[]) => rows.map((row) => ({ ...row }))

export type GroupedSpec = VegaLiteSpec & {
  encoding: {
    x: { field: string; type: string }
    y: { field: string; type: string }
    color?: { field?: string; type?: string }
  }
}

// Ops runner functions are in `src/renderer/bar/groupedBarOps.ts`.

export async function renderGroupedBarChart(container: HTMLElement, spec: GroupedSpec) {
  const result = await renderVegaLiteChart(container, spec)
  const rows = await tagBarMarks(container, spec.encoding.x.field, spec.encoding.y.field, spec.encoding.color?.field)
  localDataStore.set(container, rows)
  if (!originalDataStore.has(container)) {
    originalDataStore.set(container, cloneRows(rows))
  }
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
  const rows: any[] = []
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
    const numY = Number(yVal)
    if (!Number.isFinite(numY)) return
    const row: Record<string, any> = {
      [xField]: xVal,
      [yField]: numY,
    }
    if (colorField) {
      row[colorField] = colorVal != null ? String(colorVal) : null
    }
    rows.push(row)
  })
  return rows
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

export function getGroupedBarStoredData(container: HTMLElement) {
  return cloneRows(localDataStore.get(container) || [])
}

export function getGroupedBarOriginalData(container: HTMLElement) {
  return cloneRows(originalDataStore.get(container) || [])
}
// @ts-nocheck

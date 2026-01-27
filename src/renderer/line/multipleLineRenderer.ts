import * as d3 from 'd3'
import { renderVegaLiteChart, type VegaLiteSpec } from '../../utils/chartRenderer'
import { DataAttributes, SvgElements } from '../interfaces'
import { ensureXAxisLabelClearance } from '../common/d3Helpers'

const localDataStore: WeakMap<HTMLElement, any[]> = new WeakMap()

export type MultiLineSpec = VegaLiteSpec & {
  encoding: {
    x: { field: string; type: string }
    y: { field: string; type: string }
    color?: { field?: string }
  }
}
// Ops runner functions are in `src/renderer/line/multipleLineOps.ts`.

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
  await tagMultipleLineMarks(container, spec)
  ensureXAxisLabelClearance(container.id || 'chart', { attempts: 5, minGap: 14, maxShift: 120 })
  return result
}

export function getMultipleLineStoredData(container: HTMLElement) {
  return localDataStore.get(container) || []
}

export async function tagMultipleLineMarks(container: HTMLElement, spec: MultiLineSpec) {
  const xField = spec.encoding.x.field
  const yField = spec.encoding.y.field
  const xType = spec.encoding.x.type
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

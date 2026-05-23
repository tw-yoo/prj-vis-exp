import type * as d3 from 'd3'
import type { DatumValue, OperationSpec } from '../../../domain/operation/types'
import { DataAttributes, SvgClassNames } from '../../../rendering/interfaces'

/**
 * Mark identity for grouped + stacked bar charts. Matches the legacy
 * `markKey` in operation-next/runners/barGroupShared.ts so applier-side
 * scope sets line up with what the renderer's rects carry.
 */
export function barMarkKey(panel: string, target: string, group: string): string {
  return `${panel}|${target}|${group}`
}

export function barMarkKeyFromDatum(datum: DatumValue): string {
  const panel = (datum.panel as string | undefined) ?? 'root'
  const target = String(datum.target)
  const group = String(datum.group ?? datum.series ?? '')
  return barMarkKey(panel, target, group)
}

export function barMarkKeyFromNode(node: SVGElement): string {
  const panel = node.getAttribute(DataAttributes.ChartId) ?? 'root'
  const target = node.getAttribute(DataAttributes.Target) ?? ''
  const group =
    node.getAttribute(DataAttributes.Series) ??
    node.getAttribute(DataAttributes.GroupValue) ??
    ''
  return barMarkKey(panel, target, group)
}

/** All main data `<rect>` bars across panels for a grouped / stacked chart. */
export function selectAllMainBars(
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
): d3.Selection<SVGRectElement, unknown, d3.BaseType, unknown> {
  return svg.selectAll<SVGRectElement, unknown>(`rect.${SvgClassNames.MainBar}`)
}

/**
 * Resolve a numeric threshold for measure-threshold filters (>, >=, <, <=,
 * between, etc.). Returns null for membership filters (include / exclude).
 * Matches the legacy `resolveNumericThreshold` in the shared bar-group runner.
 */
export function resolveBarThreshold(operation: OperationSpec, workingData: DatumValue[]): number | null {
  const rawValue = operation.value
  const numeric = Number(rawValue)
  if (Number.isFinite(numeric)) return numeric
  if (typeof rawValue === 'string' || typeof rawValue === 'number') {
    const match = workingData.find(
      (d) => String(d.target) === String(rawValue) || String(d.id) === String(rawValue),
    )
    if (match && Number.isFinite(Number(match.value))) return Number(match.value)
  }
  return null
}

/**
 * Compute a y-pixel position for a numeric value by reading the chart's
 * y-axis tick text + transform. Avoids a coupling to the renderer's scale
 * objects (which aren't exposed by the legacy bar renderer).
 */
export function inferBarYFromAxis(
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
  value: number,
): number | null {
  const ticks = svg.select<SVGGElement>(`.${SvgClassNames.YAxis}`).selectAll<SVGGElement, unknown>('.tick').nodes()
  const samples: Array<{ value: number; y: number }> = []
  ticks.forEach((tick) => {
    const text = tick.querySelector('text')?.textContent
    const numericValue = Number(text?.replace(/[, ]/g, ''))
    if (!Number.isFinite(numericValue)) return
    const transform = tick.getAttribute('transform') ?? ''
    const match = transform.match(/translate\(\s*[^,]*,\s*([^)]+)\)/)
    const y = match ? Number(match[1]) : NaN
    if (!Number.isFinite(y)) return
    samples.push({ value: numericValue, y })
  })
  if (samples.length < 2) return null
  const a = samples[0]
  const b = samples.find((s) => s.value !== a.value)
  if (!b) return null
  const pixelsPerValue = (b.y - a.y) / (b.value - a.value)
  if (!Number.isFinite(pixelsPerValue)) return null
  return a.y + (value - a.value) * pixelsPerValue
}

// @ts-nocheck
import * as d3 from 'd3'
import { SvgAttributes, SvgClassNames, SvgElements } from '../interfaces'
import type { DrawLineSpec, DrawRectSpec } from './types'
import type { OperationSpec } from '../../types'

type DrawAction = 'highlight' | 'dim' | 'clear' | 'text' | 'rect' | 'line'

type DrawSelect = {
  keys?: Array<string | number>
  mark?: string
}

type DrawTextSpec = {
  value: string
  mode?: 'normalized'
  position?: { x: number; y: number }
  style?: { color?: string; fontSize?: number; fontWeight?: string | number; opacity?: number }
}

type DrawOp = OperationSpec & {
  action?: DrawAction
  select?: DrawSelect
  style?: { color?: string; opacity?: number }
  text?: DrawTextSpec
  rect?: DrawRectSpec
  line?: DrawLineSpec
  chartId?: string
}

const DEFAULT_FILL = '#69b3a2'

function selectByKeys(container: HTMLElement, select: DrawSelect | undefined) {
  const svg = d3.select(container).select(SvgElements.Svg)
  const mark = select?.mark || `${SvgElements.Rect},${SvgElements.Circle},${SvgElements.Path}`
  const selection = svg.selectAll<SVGElement, unknown>(mark)
  const keys = select?.keys
  if (!keys || keys.length === 0) return selection
  const keySet = new Set(keys.map(String))
  return selection.filter(function () {
    const el = this as Element
    const attrs = [
      el.getAttribute('data-target'),
      el.getAttribute('data-id'),
      el.getAttribute('data-value'),
      el.getAttribute('data-series'),
      el.id,
    ].filter(Boolean)
    for (const a of attrs) {
      if (a && keySet.has(String(a))) return true
    }
    // fall back to bound datum
    const datum: any = (this as any).__data__
    const datumKey = datum?.target ?? datum?.x ?? datum?.id ?? null
    return datumKey != null && keySet.has(String(datumKey))
  })
}

/** select.keys에 맞춰 SVG 요소를 찾아 반환합니다 (data-target/id/value 포함). */

function selectAllMarks(container: HTMLElement) {
  return d3
    .select(container)
    .select(SvgElements.Svg)
    .selectAll<SVGElement, unknown>(`${SvgElements.Rect},${SvgElements.Circle},${SvgElements.Path}`)
}

/** SVG viewBox를 기준으로 정규화된 텍스트/rect/line을 annotation 레이어에 추가합니다. */

function addNormalizedText(container: HTMLElement, textSpec: DrawTextSpec) {
  const svgSel = d3.select(container).select(SvgElements.Svg)
  const svg = svgSel.node() as SVGSVGElement | null
  if (!svg || textSpec.mode !== 'normalized' || !textSpec.position) return
  const vb = svg.viewBox?.baseVal
  const width = vb ? vb.width : svg.getBoundingClientRect().width
  const height = vb ? vb.height : svg.getBoundingClientRect().height
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return
  const clamp = (n: number) => Math.max(0, Math.min(1, n))
  const x = clamp(textSpec.position.x) * width
  const y = (1 - clamp(textSpec.position.y)) * height
  svgSel
    .append(SvgElements.Text)
    .attr(SvgAttributes.Class, SvgClassNames.Annotation)
    .attr(SvgAttributes.X, x)
    .attr(SvgAttributes.Y, y)
    .attr(SvgAttributes.TextAnchor, 'middle')
    .attr(SvgAttributes.Fill, textSpec.style?.color ?? '#111827')
    .attr(SvgAttributes.FontSize, textSpec.style?.fontSize ?? 12)
    .attr(SvgAttributes.FontWeight, textSpec.style?.fontWeight ?? 'bold')
    .attr(SvgAttributes.Opacity, textSpec.style?.opacity ?? 1)
    .text(textSpec.value)
}

function addNormalizedRect(container: HTMLElement, rectSpec: DrawRectSpec) {
  const svgSel = d3.select(container).select(SvgElements.Svg)
  const svg = svgSel.node() as SVGSVGElement | null
  if (!svg || !rectSpec.position || !rectSpec.size) return
  const vb = svg.viewBox?.baseVal
  const width = vb ? vb.width : svg.getBoundingClientRect().width
  const height = vb ? vb.height : svg.getBoundingClientRect().height
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return
  const clamp = (n: number) => Math.max(0, Math.min(1, n))
  const x = clamp(rectSpec.position.x) * width
  const y = (1 - clamp(rectSpec.position.y)) * height
  const w = clamp(rectSpec.size.width) * width
  const h = clamp(rectSpec.size.height) * height
  svgSel
    .append(SvgElements.Rect)
    .attr(SvgAttributes.Class, SvgClassNames.Annotation)
    .attr(SvgAttributes.X, x - w / 2)
    .attr(SvgAttributes.Y, y - h / 2)
    .attr(SvgAttributes.Width, w)
    .attr(SvgAttributes.Height, h)
    .attr(SvgAttributes.Fill, rectSpec.style?.fill ?? 'rgba(239,68,68,0.08)')
    .attr(SvgAttributes.Stroke, rectSpec.style?.stroke ?? rectSpec.style?.fill ?? '#ef4444')
    .attr(SvgAttributes.StrokeWidth, rectSpec.style?.strokeWidth ?? 1)
    .attr(SvgAttributes.Opacity, rectSpec.style?.opacity ?? 1)
}

function addNormalizedLine(container: HTMLElement, lineSpec: DrawLineSpec) {
  const svgSel = d3.select(container).select(SvgElements.Svg)
  const svg = svgSel.node() as SVGSVGElement | null
  if (!svg || !lineSpec.position || !lineSpec.position.end || !lineSpec.position.start) return
  const vb = svg.viewBox?.baseVal
  const width = vb ? vb.width : svg.getBoundingClientRect().width
  const height = vb ? vb.height : svg.getBoundingClientRect().height
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return
  const clamp = (n: number) => Math.max(0, Math.min(1, n))
  const { start, end } = lineSpec.position
  const x1 = clamp(start.x) * width
  const y1 = (1 - clamp(start.y)) * height
  const x2 = clamp(end.x) * width
  const y2 = (1 - clamp(end.y)) * height
  svgSel
    .append(SvgElements.Line)
    .attr(SvgAttributes.Class, SvgClassNames.Annotation)
    .attr(SvgAttributes.X1, x1)
    .attr(SvgAttributes.Y1, y1)
    .attr(SvgAttributes.X2, x2)
    .attr(SvgAttributes.Y2, y2)
    .attr(SvgAttributes.Stroke, lineSpec.style?.stroke ?? '#ef4444')
    .attr(SvgAttributes.StrokeWidth, lineSpec.style?.strokeWidth ?? 2)
    .attr(SvgAttributes.Opacity, lineSpec.style?.opacity ?? 1)
}

export function runGenericDraw(container: HTMLElement, op: DrawOp) {
  const action = (op.action || '').toLowerCase() as DrawAction
  const selection = selectByKeys(container, op.select)
  const allMarks = selectAllMarks(container)

  // DrawAction별 처리 흐름
  switch (action) {
    case 'clear':
      allMarks.attr(SvgAttributes.Fill, DEFAULT_FILL).attr(SvgAttributes.Opacity, 1)
      d3.select(container).select(SvgElements.Svg).selectAll(`.${SvgClassNames.Annotation}`).remove()
      return
    case 'highlight': {
      const color = op.style?.color || '#ef4444'
      selection.attr(SvgAttributes.Fill, color).attr(SvgAttributes.Stroke, color).attr(SvgAttributes.Opacity, 1)
      return
    }
    case 'dim': {
      const opacity = op.style?.opacity ?? 0.25
      const selectedNodes = new Set(selection.nodes())
      allMarks.attr(SvgAttributes.Opacity, function () {
        return selectedNodes.size === 0 ? opacity : selectedNodes.has(this as any) ? 1 : opacity
      })
      return
    }
    case 'text': {
      if (op.text?.value) {
        addNormalizedText(container, op.text)
      }
      return
    }
    case 'rect': {
      if (op.rect?.position && op.rect?.size) {
        addNormalizedRect(container, op.rect)
      }
      return
    }
    case 'line': {
      if ((op.line as any)?.position?.start && (op.line as any)?.position?.end) {
        addNormalizedLine(container, op.line as any)
      }
      return
    }
    default:
      console.warn('draw: unsupported action', action, op)
  }
}
// @ts-nocheck

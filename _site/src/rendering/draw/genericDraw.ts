import * as d3 from 'd3'
import { DataAttributes, SvgAttributes, SvgClassNames, SvgElements } from '../interfaces'
import { DrawAction, type DrawArrowSpec, type DrawLineSpec, type DrawRectSpec, type DrawTextSpec, type DrawOp } from './types'

type DrawSelect = DrawOp['select']

function resolveSelectFieldAttr(container: HTMLElement, field?: string) {
  if (typeof field !== 'string') return null
  const normalized = field.trim().toLowerCase()
  if (!normalized) return null
  const alias = new Map<string, string>([
    ['id', 'id'],
    [DataAttributes.Id, DataAttributes.Id],
    ['target', DataAttributes.Target],
    ['x', DataAttributes.Target],
    [DataAttributes.Target, DataAttributes.Target],
    ['value', DataAttributes.Value],
    ['y', DataAttributes.Value],
    [DataAttributes.Value, DataAttributes.Value],
    ['series', DataAttributes.Series],
    ['group', DataAttributes.Series],
    ['color', DataAttributes.Series],
    [DataAttributes.Series, DataAttributes.Series],
  ])
  const aliased = alias.get(normalized)
  if (aliased) return aliased

  const svgNode = d3.select(container).select(SvgElements.Svg).node() as SVGSVGElement | null
  if (!svgNode) return null
  const xField = (svgNode.getAttribute(DataAttributes.XField) ?? '').trim().toLowerCase()
  const yField = (svgNode.getAttribute(DataAttributes.YField) ?? '').trim().toLowerCase()
  const colorField = (svgNode.getAttribute(DataAttributes.ColorField) ?? '').trim().toLowerCase()
  if (xField && normalized === xField) return DataAttributes.Target
  if (yField && normalized === yField) return DataAttributes.Value
  if (colorField && normalized === colorField) return DataAttributes.Series
  return null
}

function selectByKeys(container: HTMLElement, select: DrawSelect | undefined) {
  const svg = d3.select(container).select(SvgElements.Svg)
  const mark = select?.mark || `${SvgElements.Rect},${SvgElements.Circle},${SvgElements.Path}`
  const selection = svg.selectAll<SVGElement, unknown>(mark)
  const keys = select?.keys
  if (!keys || keys.length === 0) return selection
  const fieldAttr = resolveSelectFieldAttr(container, select?.field)
  const keySet = new Set(keys.map(String))
  const numberKeys = new Set(keys.map((k) => Number(k)).filter(Number.isFinite))
  const inferredFieldAttr = !fieldAttr && select?.field ? inferFieldAttr(selection, keySet, numberKeys) : null
  const effectiveFieldAttr = fieldAttr ?? inferredFieldAttr
  return selection.filter(function (this: SVGElement) {
    const el = this as Element
    const attrs = effectiveFieldAttr
      ? effectiveFieldAttr === 'id'
        ? [el.id]
        : [el.getAttribute(effectiveFieldAttr)]
      : [
          el.getAttribute('data-target'),
          el.getAttribute('data-id'),
          el.getAttribute('data-value'),
          el.getAttribute('data-series'),
          el.id,
        ]
    for (const a of attrs) {
      if (!a) continue
      if (keySet.has(String(a))) return true
      const numeric = Number(a)
      if (Number.isFinite(numeric) && numberKeys.has(numeric)) return true
    }
    // fall back to bound datum
    const datum = (this as SVGElement & { __data__?: unknown }).__data__ as
      | { target?: unknown; x?: unknown; id?: unknown }
      | undefined
    const datumKey = datum?.target ?? datum?.x ?? datum?.id ?? null
    return datumKey != null && keySet.has(String(datumKey))
  })
}

function inferFieldAttr(
  selection: d3.Selection<SVGElement, unknown, any, any>,
  keySet: Set<string>,
  numberKeys: Set<number>,
) {
  const candidates = [DataAttributes.Target, DataAttributes.Series, DataAttributes.Value, DataAttributes.Id, 'id'] as const
  let best: (typeof candidates)[number] | null = null
  let bestScore = 0
  const matches = (raw: string | null | undefined) => {
    if (!raw) return false
    if (keySet.has(raw)) return true
    const numeric = Number(raw)
    return Number.isFinite(numeric) && numberKeys.has(numeric)
  }
  candidates.forEach((candidate) => {
    let score = 0
    selection.each(function () {
      const el = this as Element
      const raw = candidate === 'id' ? el.id : el.getAttribute(candidate)
      if (matches(raw)) score += 1
    })
    if (score > bestScore) {
      bestScore = score
      best = candidate
    }
  })
  return bestScore > 0 ? best : null
}

/** select.keys에 맞춰 SVG 요소를 찾아 반환합니다 (data-target/id/value 포함). */

function selectAllMarks(container: HTMLElement) {
  return d3
    .select(container)
    .select(SvgElements.Svg)
    .selectAll<SVGElement, unknown>(`${SvgElements.Rect},${SvgElements.Circle},${SvgElements.Path}`)
}

/** SVG viewBox를 기준으로 정규화된 텍스트/rect/line을 annotation 레이어에 추가합니다. */

function getMarkKey(el: Element) {
  const attrs = [
    el.getAttribute('data-target'),
    el.getAttribute('data-id'),
    el.getAttribute('data-value'),
    el.getAttribute('data-series'),
    el.id,
  ]
  return attrs.find((attr) => attr != null) ?? null
}

function addNormalizedText(container: HTMLElement, textSpec: DrawTextSpec) {
  const svgSel = d3.select(container).select<SVGSVGElement>(SvgElements.Svg)
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
    .text(typeof textSpec.value === 'string' ? textSpec.value : String(textSpec.value))
}

function addNormalizedRect(container: HTMLElement, rectSpec: DrawRectSpec) {
  const svgSel = d3.select(container).select<SVGSVGElement>(SvgElements.Svg)
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

function addArrowHead(
  svgSel: d3.Selection<SVGSVGElement, unknown, any, any>,
  tipX: number,
  tipY: number,
  direction: { x: number; y: number },
  style: {
    stroke?: string
    strokeWidth?: number
    opacity?: number
  },
  arrowSpec: DrawArrowSpec,
) {
  const length = Math.max(arrowSpec.length ?? 12, 1)
  const width =
    Math.max(arrowSpec.width ?? Math.max(Math.round(length * 0.6), 1), 1)
  const fill = arrowSpec.style?.fill ?? style.stroke ?? '#ef4444'
  const stroke = arrowSpec.style?.stroke ?? style.stroke ?? fill
  const strokeWidth = arrowSpec.style?.strokeWidth ?? style.strokeWidth ?? 0
  const opacity = arrowSpec.style?.opacity ?? style.opacity ?? 1
  const baseX = tipX - direction.x * length
  const baseY = tipY - direction.y * length
  const perpX = -direction.y
  const perpY = direction.x
  const p1x = baseX + perpX * (width / 2)
  const p1y = baseY + perpY * (width / 2)
  const p2x = baseX - perpX * (width / 2)
  const p2y = baseY - perpY * (width / 2)
  const path = `M${tipX},${tipY} L${p1x},${p1y} L${p2x},${p2y} Z`
  svgSel
    .append(SvgElements.Path)
    .attr(
      SvgAttributes.Class,
      `${SvgClassNames.Annotation} ${SvgClassNames.LineAnnotation} arrowhead`,
    )
    .attr(SvgAttributes.D, path)
    .attr(SvgAttributes.Fill, fill)
    .attr(SvgAttributes.Stroke, stroke)
    .attr(SvgAttributes.StrokeWidth, strokeWidth)
    .attr(SvgAttributes.Opacity, opacity)
}

function addNormalizedLine(container: HTMLElement, lineSpec: DrawLineSpec) {
  const svgSel = d3.select(container).select<SVGSVGElement>(SvgElements.Svg)
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
  const stroke = lineSpec.style?.stroke ?? '#ef4444'
  const strokeWidth = lineSpec.style?.strokeWidth ?? 2
  const opacity = lineSpec.style?.opacity ?? 1
  svgSel
    .append(SvgElements.Line)
    .attr(SvgAttributes.Class, SvgClassNames.Annotation)
    .attr(SvgAttributes.X1, x1)
    .attr(SvgAttributes.Y1, y1)
    .attr(SvgAttributes.X2, x2)
    .attr(SvgAttributes.Y2, y2)
    .attr(SvgAttributes.Stroke, stroke)
    .attr(SvgAttributes.StrokeWidth, strokeWidth)
    .attr(SvgAttributes.Opacity, opacity)

  const arrowSpec = lineSpec.arrow
  if (arrowSpec && (arrowSpec.start || arrowSpec.end)) {
    const dx = x2 - x1
    const dy = y2 - y1
    const dist = Math.hypot(dx, dy)
    if (dist > 0) {
      const direction = { x: dx / dist, y: dy / dist }
      if (arrowSpec.start) {
        addArrowHead(svgSel, x1, y1, { x: -direction.x, y: -direction.y }, { stroke, strokeWidth, opacity }, arrowSpec)
      }
      if (arrowSpec.end) {
        addArrowHead(svgSel, x2, y2, direction, { stroke, strokeWidth, opacity }, arrowSpec)
      }
    }
  }
}

function addFilterHighlight(container: HTMLElement, include?: Array<string | number>, exclude?: Array<string | number>, options?: { opacity?: number }) {
  if ((!include || include.length === 0) && (!exclude || exclude.length === 0)) return
  const includeSet = new Set<string>((include || []).map(String))
  const excludeSet = new Set<string>((exclude || []).map(String))
  const svgDelta = selectAllMarks(container)
  svgDelta.attr(SvgAttributes.Opacity, function (this: SVGElement) {
    const key = getMarkKey(this as Element)
    if (!key) return options?.opacity ?? 0.25
    if (excludeSet.has(key)) return options?.opacity ?? 0.25
    if (includeSet.size > 0) {
      return includeSet.has(key) ? 1 : options?.opacity ?? 0.25
    }
    return 1
  })
}

export function runGenericDraw(container: HTMLElement, op: DrawOp) {
  const action = op.action
  const selection = selectByKeys(container, op.select)
  const allMarks = selectAllMarks(container)

    // DrawAction별 처리 흐름
  switch (action) {
    case DrawAction.Clear:
      allMarks.interrupt().attr(SvgAttributes.Opacity, 1)
      d3.select(container).select(SvgElements.Svg).selectAll(`.${SvgClassNames.Annotation}`).remove()
      return
    case DrawAction.Highlight: {
      const color = op.style?.color || '#ef4444'
      selection.interrupt().each(function (this: SVGElement) {
        const el = d3.select(this as Element)
        const fill = (el.attr(SvgAttributes.Fill) ?? '').trim().toLowerCase()
        const stroke = (el.attr(SvgAttributes.Stroke) ?? '').trim().toLowerCase()
        const hasFill = fill.length > 0 && fill !== 'none' && fill !== 'transparent'
        const hasStroke = stroke.length > 0 && stroke !== 'none' && stroke !== 'transparent'
        if (hasFill || !hasStroke) {
          el.attr(SvgAttributes.Fill, color)
          return
        }
        el.attr(SvgAttributes.Stroke, color)
      })
      if (op.style?.opacity != null) {
        selection.attr(SvgAttributes.Opacity, op.style.opacity)
      }
      return
    }
    case DrawAction.Dim: {
      const opacity = op.style?.opacity ?? 0.25
      if ((op.select?.keys?.length ?? 0) > 0 && selection.empty()) {
        return
      }
      const selectedNodes = new Set<SVGElement>(selection.nodes())
      allMarks.interrupt().attr(SvgAttributes.Opacity, function (this: SVGElement) {
        return selectedNodes.size === 0 ? opacity : selectedNodes.has(this) ? 1 : opacity
      })
      return
    }
    case DrawAction.Text: {
      if (op.text?.value) {
        addNormalizedText(container, op.text)
      }
      return
    }
    case DrawAction.Rect: {
      if (op.rect?.position && op.rect?.size) {
        addNormalizedRect(container, op.rect)
      }
      return
    }
    case DrawAction.Line: {
      const lineSpec = op.line
      if (lineSpec?.position?.start && lineSpec.position?.end) {
        addNormalizedLine(container, lineSpec)
      }
      return
    }
    case DrawAction.Filter: {
      addFilterHighlight(container, op.filter?.x?.include, op.filter?.x?.exclude, {
        opacity: op.style?.opacity ?? 0.25,
      })
      return
    }
    case DrawAction.BarSegment:
    case DrawAction.Sort:
      return
    default:
      console.warn('draw: unsupported action', action, op)
  }
}

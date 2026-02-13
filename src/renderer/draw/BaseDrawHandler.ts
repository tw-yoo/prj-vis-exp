import * as d3 from 'd3'
import type { JsonValue } from '../../types'
import { DataAttributes, SvgAttributes, SvgClassNames, SvgElements, SvgSelectors } from '../interfaces'
import {
  DrawAction,
  DrawLineModes,
  DrawRectModes,
  DrawTextModes,
  type DrawArrowSpec,
  type DrawLineSpec,
  type DrawOp,
  type DrawRectMode,
  type DrawRectSpec,
  type DrawSelect,
  type DrawTextMode,
} from './types'
import { toSvgCenter as toSvgCenterUtil } from './utils/coords'
import { ensureAnnotationLayer } from './utils/annotationLayer'

type AnySelection = d3.Selection<any, unknown, any, any>

const addArrowHead = (
  layer: AnySelection,
  tipX: number,
  tipY: number,
  direction: { x: number; y: number },
  style: { stroke?: string; strokeWidth?: number; opacity?: number },
  arrowSpec: DrawArrowSpec,
) => {
  const length = Math.max(arrowSpec.length ?? 12, 1)
  const width = Math.max(arrowSpec.width ?? length * 0.6, 1)
  const baseX = tipX - direction.x * length
  const baseY = tipY - direction.y * length
  const perpX = -direction.y
  const perpY = direction.x
  const leftX = baseX + perpX * width * 0.5
  const leftY = baseY + perpY * width * 0.5
  const rightX = baseX - perpX * width * 0.5
  const rightY = baseY - perpY * width * 0.5
  const path = `M ${tipX} ${tipY} L ${leftX} ${leftY} L ${rightX} ${rightY} Z`
  const stroke = arrowSpec.style?.stroke ?? style.stroke ?? '#111827'
  const strokeWidth = arrowSpec.style?.strokeWidth ?? style.strokeWidth ?? 2
  const opacity = arrowSpec.style?.opacity ?? style.opacity ?? 1
  const fill = arrowSpec.style?.fill ?? stroke

  layer
    .append(SvgElements.Path)
    .attr(SvgAttributes.Class, `${SvgClassNames.Annotation} ${SvgClassNames.LineAnnotation} arrowhead`)
    .attr(SvgAttributes.D, path)
    .attr(SvgAttributes.Fill, fill)
    .attr(SvgAttributes.Stroke, stroke)
    .attr(SvgAttributes.StrokeWidth, strokeWidth)
    .attr(SvgAttributes.Opacity, opacity)
}

const drawLineWithArrow = (
  layer: AnySelection,
  chartId: string | undefined,
  lineSpec: DrawLineSpec,
  coords: { x1: number; y1: number; x2: number; y2: number },
) => {
  const stroke = lineSpec.style?.stroke ?? '#111827'
  const strokeWidth = lineSpec.style?.strokeWidth ?? 2
  const opacity = lineSpec.style?.opacity ?? 1

  layer
    .append(SvgElements.Line)
    .attr(SvgAttributes.Class, `${SvgClassNames.Annotation} ${SvgClassNames.LineAnnotation}`)
    .attr(DataAttributes.ChartId, chartId ?? null)
    .attr(SvgAttributes.X1, coords.x1)
    .attr(SvgAttributes.Y1, coords.y1)
    .attr(SvgAttributes.X2, coords.x2)
    .attr(SvgAttributes.Y2, coords.y2)
    .attr(SvgAttributes.Stroke, stroke)
    .attr(SvgAttributes.StrokeWidth, strokeWidth)
    .attr(SvgAttributes.Opacity, opacity)

  const arrowSpec = lineSpec.arrow
  if (!arrowSpec || (!arrowSpec.start && !arrowSpec.end)) return
  const dx = coords.x2 - coords.x1
  const dy = coords.y2 - coords.y1
  const dist = Math.hypot(dx, dy)
  if (dist <= 0) return
  const direction = { x: dx / dist, y: dy / dist }

  if (arrowSpec.start) {
    addArrowHead(layer, coords.x1, coords.y1, { x: -direction.x, y: -direction.y }, { stroke, strokeWidth, opacity }, arrowSpec)
  }
  if (arrowSpec.end) {
    addArrowHead(layer, coords.x2, coords.y2, direction, { stroke, strokeWidth, opacity }, arrowSpec)
  }
}

export abstract class BaseDrawHandler {
  protected container: HTMLElement

  constructor(container: HTMLElement) {
    this.container = container
  }

  /** Center of an element in SVG coordinates. Falls back to boundingClientRect if CTM is unavailable. */
  protected toSvgCenter(el: Element, svgNode: SVGSVGElement) {
    return toSvgCenterUtil(el, svgNode)
  }

  protected abstract selectElements(
    select?: DrawSelect,
    chartId?: string,
  ): d3.Selection<SVGElement, JsonValue, d3.BaseType, JsonValue>
  protected abstract allMarks(chartId?: string): d3.Selection<SVGElement, JsonValue, d3.BaseType, JsonValue>
  protected defaultColor(): string {
    return '#69b3a2'
  }

  protected selectScope(chartId?: string) {
    const svg = d3.select(this.container).select(SvgElements.Svg)
    if (!chartId) return svg as unknown as d3.Selection<d3.BaseType, JsonValue, d3.BaseType, JsonValue>
    const groups = svg.selectAll<SVGGElement, JsonValue>(
      `${SvgSelectors.ChartGroup}[${DataAttributes.ChartId}="${String(chartId)}"]`,
    )
    return groups.empty()
      ? (d3.select(null) as unknown as d3.Selection<d3.BaseType, JsonValue, d3.BaseType, JsonValue>)
      : (groups as unknown as d3.Selection<d3.BaseType, JsonValue, d3.BaseType, JsonValue>)
  }

  protected selectBarMarks(
    scope: d3.Selection<d3.BaseType, JsonValue, d3.BaseType, JsonValue>,
  ): d3.Selection<SVGRectElement, JsonValue, d3.BaseType, JsonValue> {
    const mainBars = scope.selectAll<SVGRectElement, JsonValue>(SvgSelectors.MainBars)
    if (!mainBars.empty()) return mainBars
    const fallback = scope
      .selectAll<SVGElement, JsonValue>(SvgSelectors.DataTargets)
      .filter(function () {
        return (this as Element).tagName.toLowerCase() === SvgElements.Rect
      })
    return fallback as unknown as d3.Selection<SVGRectElement, JsonValue, d3.BaseType, JsonValue>
  }

  protected filterByKeys(
    selection: d3.Selection<SVGElement, JsonValue, d3.BaseType, JsonValue>,
    keys?: Array<string | number>,
  ) {
    if (!keys || keys.length === 0) return selection
    const stringKeys = new Set(keys.map(String))
    const numericKeys = new Set(keys.map((k) => Number(k)).filter(Number.isFinite))
    return selection.filter(function () {
      const el = this as Element
      const candidates = [
        el.getAttribute(DataAttributes.Id),
        el.getAttribute(DataAttributes.Target),
        el.getAttribute(DataAttributes.Value),
        el.getAttribute(DataAttributes.Series),
        el.id,
      ]
      for (const candidate of candidates) {
        if (!candidate) continue
        if (stringKeys.has(candidate)) return true
        const num = Number(candidate)
        if (Number.isFinite(num) && numericKeys.has(num)) return true
      }
      return false
    })
  }

  protected yValueToSvgY(
    scope: d3.Selection<d3.BaseType, JsonValue, d3.BaseType, JsonValue>,
    svgNode: SVGSVGElement,
  ) {
    const tickCenters: Array<{ value: number; y: number }> = []
    const svgRect = svgNode.getBoundingClientRect()
    const viewBox = svgNode.viewBox?.baseVal
    const scaleY = viewBox && svgRect.height > 0 ? viewBox.height / svgRect.height : 1

    scope.selectAll<SVGTextElement, JsonValue>(SvgSelectors.YAxisText).each(function () {
      const text = (this as SVGTextElement).textContent?.trim() ?? ''
      const value = Number(text)
      if (!Number.isFinite(value)) return
      const elRect = (this as Element).getBoundingClientRect()
      const y = (viewBox?.y ?? 0) + (elRect.top - svgRect.top + elRect.height / 2) * scaleY
      tickCenters.push({ value, y })
    })
    const markCenters: Array<{ value: number; y: number }> = []
    scope.selectAll<SVGElement, JsonValue>(SvgSelectors.DataTargets).each((_, i, nodes) => {
      const el = nodes[i] as Element
      const vAttr = el.getAttribute(DataAttributes.Value)
      const v = vAttr != null ? Number(vAttr) : NaN
      if (!Number.isFinite(v)) return
      const { y } = this.toSvgCenter(el, svgNode)
      markCenters.push({ value: v, y })
    })

    const centers = tickCenters.length >= 2 ? tickCenters : markCenters
    if (centers.length < 2) return (_value: number) => null
    centers.sort((a, b) => a.value - b.value)

    return (value: number) => {
      if (!Number.isFinite(value)) return null
      const exact = centers.find((t) => t.value === value)
      if (exact) return exact.y

      let lower = centers[0]
      let upper = centers[centers.length - 1]
      for (let i = 0; i < centers.length - 1; i += 1) {
        const a = centers[i]
        const b = centers[i + 1]
        if (value >= a.value && value <= b.value) {
          lower = a
          upper = b
          break
        }
      }
      if (value < centers[0].value) {
        lower = centers[0]
        upper = centers[1]
      } else if (value > centers[centers.length - 1].value) {
        upper = centers[centers.length - 1]
        lower = centers[centers.length - 2]
      }
      if (upper.value === lower.value) return null
      const t = (value - lower.value) / (upper.value - lower.value)
      return lower.y + (upper.y - lower.y) * t
    }
  }

  clear(chartId?: string) {
    this.allMarks(chartId).attr(SvgAttributes.Fill, this.defaultColor()).attr(SvgAttributes.Opacity, 1)
    this.clearAnnotations(chartId)
  }

  highlight(op: DrawOp) {
    const color = op.style?.color || '#ef4444'
    this.selectElements(op.select, op.chartId).attr(SvgAttributes.Fill, color).attr(SvgAttributes.Opacity, 1)
  }

  dim(op: DrawOp) {
    const opacity = op.style?.opacity ?? 0.25
    const selectedNodes = new Set(this.selectElements(op.select, op.chartId).nodes())
    this.allMarks(op.chartId).attr(SvgAttributes.Opacity, function () {
      return selectedNodes.has(this as SVGElement) ? 1 : opacity
    })
  }

  text(op: DrawOp) {
    const textSpec = op.text
    const value = textSpec?.value
    if (!value) return

    const svg = d3.select(this.container).select(SvgElements.Svg)
    if (svg.empty()) return
    const svgNode = svg.node() as SVGSVGElement | null
    if (!svgNode) return

    const mode: DrawTextMode =
      textSpec?.mode ?? (op.select?.keys?.length ? DrawTextModes.Anchor : DrawTextModes.Normalized)
    const offsetX = textSpec?.offset?.x ?? 0
    const offsetY = textSpec?.offset?.y ?? (mode === DrawTextModes.Anchor ? -6 : 0)

    const style = textSpec?.style

    const resolveTextValue = (el?: Element) => {
      if (typeof value === 'string') return value
      if (!el) return null
      const candidates = [
        el.getAttribute(DataAttributes.Id),
        el.getAttribute(DataAttributes.Target),
        el.getAttribute(DataAttributes.Value),
        el.getAttribute(DataAttributes.Series),
        el.id,
      ].filter(Boolean) as string[]
      if (value && typeof value === 'object') {
        const byAttrName = [
          DataAttributes.Id,
          DataAttributes.Target,
          DataAttributes.Value,
          DataAttributes.Series,
          'id',
        ]
        for (const key of byAttrName) {
          if ((value as Record<string, unknown>)[key] != null) {
            const mapped = (value as Record<string, unknown>)[key]
            return typeof mapped === 'string' ? mapped : String(mapped)
          }
        }
      }
      for (const key of candidates) {
        if (value[key] != null) return value[key]
      }
      return null
    }

    if (mode === DrawTextModes.Anchor) {
      const selection = this.selectElements(op.select, op.chartId)
      if (selection.empty()) return
      selection.each(function () {
        const el = this as SVGGraphicsElement
        if (!el || typeof el.getBBox !== 'function') return
        const bbox = el.getBBox()
        const x = bbox.x + bbox.width / 2 + offsetX
        const y = bbox.y + offsetY
        const textValue = resolveTextValue(el)
        if (!textValue) return
        const layerParent = el.parentElement ?? svgNode
        const layer = d3.select(ensureAnnotationLayer(layerParent, op.chartId ?? null))
        layer
          .append(SvgElements.Text)
          .attr(SvgAttributes.Class, `${SvgClassNames.Annotation} ${SvgClassNames.TextAnnotation}`)
          .attr(DataAttributes.ChartId, op.chartId ?? null)
          .attr(SvgAttributes.X, x)
          .attr(SvgAttributes.Y, y)
          .attr(SvgAttributes.TextAnchor, 'middle')
          .attr(SvgAttributes.DominantBaseline, 'ideographic')
          .attr(SvgAttributes.Fill, style?.color ?? '#111827')
          .attr(SvgAttributes.FontSize, style?.fontSize ?? 12)
          .attr(SvgAttributes.FontWeight, style?.fontWeight ?? 'bold')
          .attr(SvgAttributes.Opacity, style?.opacity ?? 1)
          .attr(SvgAttributes.FontFamily, style?.fontFamily ?? null)
          .text(textValue)
      })
      return
    }

    if (mode === DrawTextModes.Normalized) {
      const pos = textSpec?.position
      if (!pos) {
        console.warn('draw:text requires text.position when mode=normalized', op)
        return
      }
      const viewBox = svgNode.viewBox?.baseVal
      const width = viewBox && Number.isFinite(viewBox.width) ? viewBox.width : svgNode.getBoundingClientRect().width
      const height = viewBox && Number.isFinite(viewBox.height) ? viewBox.height : svgNode.getBoundingClientRect().height
      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return

      const clamp = (n: number) => Math.max(0, Math.min(1, n))
      const x = clamp(pos.x) * width + offsetX
      const y = (1 - clamp(pos.y)) * height + offsetY

      const textValue = typeof value === 'string' ? value : null
      if (!textValue) return

      const layer = d3.select(ensureAnnotationLayer(svgNode, op.chartId ?? null))
      layer
        .append(SvgElements.Text)
        .attr(SvgAttributes.Class, `${SvgClassNames.Annotation} ${SvgClassNames.TextAnnotation}`)
        .attr(DataAttributes.ChartId, op.chartId ?? null)
        .attr(SvgAttributes.X, x)
        .attr(SvgAttributes.Y, y)
        .attr(SvgAttributes.TextAnchor, 'middle')
        .attr(SvgAttributes.DominantBaseline, 'middle')
        .attr(SvgAttributes.Fill, style?.color ?? '#111827')
        .attr(SvgAttributes.FontSize, style?.fontSize ?? 12)
        .attr(SvgAttributes.FontWeight, style?.fontWeight ?? 'bold')
        .attr(SvgAttributes.Opacity, style?.opacity ?? 1)
        .attr(SvgAttributes.FontFamily, style?.fontFamily ?? null)
        .text(textValue)
      return
    }
  }

  rect(op: DrawOp) {
    const rectSpec: DrawRectSpec | undefined = op.rect
    if (!rectSpec) return
    const svg = d3.select(this.container).select(SvgElements.Svg)
    if (svg.empty()) return

    const svgNode = svg.node() as SVGSVGElement | null
    if (!svgNode) return
    const layer = d3.select(ensureAnnotationLayer(svgNode, op.chartId ?? null))
    const viewBox = svgNode.viewBox?.baseVal
    const width = viewBox && Number.isFinite(viewBox.width) ? viewBox.width : svgNode.getBoundingClientRect().width
    const height = viewBox && Number.isFinite(viewBox.height) ? viewBox.height : svgNode.getBoundingClientRect().height
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return

    const clamp = (n: number) => Math.max(0, Math.min(1, n))
    const mode: DrawRectMode = rectSpec.mode ?? DrawRectModes.Normalized
    let centerX: number | null = null
    let centerY: number | null = null
    if (mode === DrawRectModes.Normalized) {
      const pos = rectSpec.position
      const size = rectSpec.size
      if (!pos || !size) {
        console.warn('draw:rect requires rect.position and rect.size when mode=normalized', op)
        return
      }
      centerX = clamp(pos.x) * width
      centerY = (1 - clamp(pos.y)) * height
    } else if (mode === DrawRectModes.DataPoint) {
      const pointX = rectSpec.point?.x
      const size = rectSpec.size
      if (pointX == null || !size) {
        console.warn('draw:rect requires rect.point.x and rect.size when mode=data-point', op)
        return
      }
      const label = String(pointX)
      const scope = this.selectScope(op.chartId)
      const candidates = scope.selectAll<SVGElement, JsonValue>(SvgSelectors.DataTargets).filter(function () {
        const el = this as Element
        const target = el.getAttribute(DataAttributes.Target) || el.getAttribute(DataAttributes.Id)
        return target != null && String(target) === label
      })
      if (candidates.empty()) return
      const nodes = candidates.nodes() as SVGGraphicsElement[]
      const pick = nodes.reduce<SVGGraphicsElement | null>((best, current) => {
        if (!best) return current
        const bestBBox = typeof best.getBBox === 'function' ? best.getBBox() : null
        const currBBox = typeof current.getBBox === 'function' ? current.getBBox() : null
        const bestArea = bestBBox ? Math.abs(bestBBox.width * bestBBox.height) : Number.POSITIVE_INFINITY
        const currArea = currBBox ? Math.abs(currBBox.width * currBBox.height) : Number.POSITIVE_INFINITY
        return currArea < bestArea ? current : best
      }, null)
      const node = pick as SVGGraphicsElement | null
      if (!node) return

      const svgRect = svgNode.getBoundingClientRect()
      const viewBox = svgNode.viewBox?.baseVal
      const scaleX = viewBox && svgRect.width > 0 ? viewBox.width / svgRect.width : 1
      const scaleY = viewBox && svgRect.height > 0 ? viewBox.height / svgRect.height : 1

      centerX = (viewBox?.x ?? 0) + (node.getBoundingClientRect().left - svgRect.left + node.getBoundingClientRect().width / 2) * scaleX
      const rawValue = node.getAttribute(DataAttributes.Value)
      const value = rawValue != null ? Number(rawValue) : NaN
      if (node.tagName.toLowerCase() === SvgElements.Rect) {
        const elRect = node.getBoundingClientRect()
        const yTop = (viewBox?.y ?? 0) + (elRect.top - svgRect.top) * scaleY
        const yBottom = (viewBox?.y ?? 0) + (elRect.bottom - svgRect.top) * scaleY
        if (Number.isFinite(value)) {
          centerY = value >= 0 ? yTop : yBottom
        } else {
          centerY = (yTop + yBottom) / 2
        }
      } else {
        const center = this.toSvgCenter(node, svgNode)
        centerY = center.y
      }
    } else if (mode === DrawRectModes.Axis) {
      const axis = rectSpec.axis
      if (!axis) {
        console.warn('draw:rect requires rect.axis when mode=axis', op)
        return
      }
      if (axis.x != null && axis.y != null) {
        console.warn('draw:rect axis mode expects only one of axis.x or axis.y', op)
        return
      }
      let axisRect: { x: number; y: number; width: number; height: number } | null = null
      let missingYLabel: boolean | null = null
      let missingLabelText: string | null = null

      if (axis.x != null) {
        const scope = this.selectScope(op.chartId)
        const labels = Array.isArray(axis.x) ? axis.x.map(String) : [String(axis.x)]
        const svgRect = svgNode.getBoundingClientRect()
        const scaleX = viewBox && svgRect.width > 0 ? viewBox.width / svgRect.width : 1
        const scaleY = viewBox && svgRect.height > 0 ? viewBox.height / svgRect.height : 1
        let tickInfos: Array<{ label: string; centerX: number; minX: number; maxX: number; minY: number; height: number }> = []
        scope.selectAll<SVGGElement, JsonValue>(SvgSelectors.XAxisTicks).each(function () {
          const tick = this as SVGGElement
          const text = tick.querySelector('text')
          const label = text?.textContent?.trim()
          if (!label) return
          const bbox = tick.getBoundingClientRect()
          tickInfos.push({
            label,
            centerX: (viewBox?.x ?? 0) + (bbox.left - svgRect.left + bbox.width / 2) * scaleX,
            minX: (viewBox?.x ?? 0) + (bbox.left - svgRect.left) * scaleX,
            maxX: (viewBox?.x ?? 0) + (bbox.right - svgRect.left) * scaleX,
            minY: (viewBox?.y ?? 0) + (bbox.top - svgRect.top) * scaleY,
            height: bbox.height * scaleY,
          })
        })
        // fallback: use mark centers when axis ticks are unavailable
        if (!tickInfos.length) {
          const markInfos: Array<{ label: string; centerX: number }> = []
          scope.selectAll<SVGElement, JsonValue>(SvgSelectors.DataTargets).each((_, i, nodes) => {
            const el = nodes[i] as Element
            const lbl = el.getAttribute(DataAttributes.Target) || el.getAttribute(DataAttributes.Id)
            if (!lbl) return
            const pt = this.toSvgCenter(el, svgNode)
            markInfos.push({ label: String(lbl), centerX: pt.x })
          })
          markInfos.sort((a, b) => a.centerX - b.centerX)
          tickInfos = markInfos.map((m, idx, arr) => {
            const prev = arr[idx - 1]
            const next = arr[idx + 1]
            const spacingPrev = prev ? m.centerX - prev.centerX : next ? next.centerX - m.centerX : 10
            const spacingNext = next ? next.centerX - m.centerX : spacingPrev
            const minX = prev ? (prev.centerX + m.centerX) / 2 : m.centerX - spacingPrev / 2
            const maxX = next ? (m.centerX + next.centerX) / 2 : m.centerX + spacingNext / 2
            return { label: m.label, centerX: m.centerX, minX, maxX, minY: 0, height: 12 }
          })
        }
        if (!tickInfos.length) return
        tickInfos.sort((a, b) => a.centerX - b.centerX)

        const findTick = (lbl: string) => tickInfos.find((t) => t.label === lbl)
        if (labels.length === 1) {
          const target = findTick(labels[0])
          if (!target) return
          const idx = tickInfos.indexOf(target)
          const prev = tickInfos[idx - 1]
          const next = tickInfos[idx + 1]
          const spacingPrev = prev ? target.centerX - prev.centerX : next ? next.centerX - target.centerX : target.height || 1
          const spacingNext = next ? next.centerX - target.centerX : spacingPrev
          const left = prev ? (prev.centerX + target.centerX) / 2 : target.centerX - spacingNext / 2
          const right = next ? (target.centerX + next.centerX) / 2 : target.centerX + spacingPrev / 2
          const paddingY = 2
          const rectHeight = target.height + paddingY * 2
          axisRect = {
            x: left,
            width: right - left,
            y: target.minY - paddingY,
            height: rectHeight,
          }
        } else if (labels.length === 2) {
          const first = findTick(labels[0])
          const second = findTick(labels[1])
          if (!first || !second) return
          const [a, b] = first.centerX <= second.centerX ? [first, second] : [second, first]
          const startIdx = tickInfos.indexOf(a)
          const endIdx = tickInfos.indexOf(b)
          const prev = tickInfos[startIdx - 1]
          const next = tickInfos[endIdx + 1]
          const spacingLeft = prev ? a.centerX - prev.centerX : tickInfos[1] ? tickInfos[1].centerX - a.centerX : a.height || 1
          const spacingRight =
            next && tickInfos[tickInfos.length - 2]
              ? next.centerX - b.centerX
              : tickInfos[tickInfos.length - 1].centerX - tickInfos[tickInfos.length - 2]?.centerX || a.height || 1
          const left = prev ? (prev.centerX + a.centerX) / 2 : a.centerX - spacingLeft / 2
          const right = next ? (b.centerX + next.centerX) / 2 : b.centerX + spacingRight / 2
          const involved = tickInfos.slice(startIdx, endIdx + 1)
          const minY = Math.min(...involved.map((t) => t.minY))
          const maxH = Math.max(...involved.map((t) => t.height))
          const paddingY = 2
          axisRect = {
            x: left,
            width: right - left,
            y: minY - paddingY,
            height: maxH + paddingY * 2,
          }
        } else {
          console.warn('draw:rect axis.x supports 1 or 2 labels', op)
        }
      }
      if (axis.y != null) {
        const scope = this.selectScope(op.chartId)
        const yValues = Array.isArray(axis.y) ? axis.y.map(Number) : [Number(axis.y)]
        if (yValues.some((v) => !Number.isFinite(v))) return

        const svgRect = svgNode.getBoundingClientRect()
        const scaleX = viewBox && svgRect.width > 0 ? viewBox.width / svgRect.width : 1
        const scaleY = viewBox && svgRect.height > 0 ? viewBox.height / svgRect.height : 1

        let tickInfos: Array<{
          value: number
          centerY: number
          minY: number
          maxY: number
          minX: number
          maxX: number
          height: number
        }> = []
        let tickSource: 'y-axis-class' | 'role-axis-label' | 'marks' | 'unknown' = 'unknown'
        // 1) Preferred: explicit y-axis class (bar charts)
        scope.selectAll<SVGGElement, JsonValue>(`.${SvgClassNames.YAxis} .${SvgClassNames.Tick}`).each(function () {
          const tick = this as SVGGElement
          const text = tick.querySelector('text')
          const label = text?.textContent?.trim()
          const num = Number(label?.replace?.(/,/g, '') ?? label)
          if (!Number.isFinite(num)) return
          const bbox = text?.getBoundingClientRect() ?? tick.getBoundingClientRect()
          const minX = (bbox.left - svgRect.left) * scaleX
          const maxX = (bbox.right - svgRect.left) * scaleX
          tickInfos.push({
            value: num,
            centerY: (viewBox?.y ?? 0) + (bbox.top - svgRect.top + bbox.height / 2) * scaleY,
            minY: (viewBox?.y ?? 0) + (bbox.top - svgRect.top) * scaleY,
            maxY: (viewBox?.y ?? 0) + (bbox.bottom - svgRect.top) * scaleY,
            minX: (viewBox?.x ?? 0) + minX,
            maxX: (viewBox?.x ?? 0) + maxX,
            height: bbox.height * scaleY,
          })
          tickSource = 'y-axis-class'
        })
        // 2) Vega-Lite axes often use role/aria-label / role-axis-label classes; capture them (y-axis only)
        if (!tickInfos.length) {
          scope
            .selectAll<SVGTextElement, any>(SvgSelectors.VegaAxisLabelCandidates)
            .filter(function () {
              const el = this as SVGTextElement
              const cls = (el.getAttribute('class') || '').toLowerCase()
              const parent = el.parentElement
              const ariaSelf = el.getAttribute('aria-label')?.toLowerCase() || ''
              const ariaParent = parent?.getAttribute('aria-label')?.toLowerCase() || ''
              const axisAncestor = el.closest('[aria-label*=\"y-axis\"], [aria-label*=\"y axis\"]')
              const isAxisLabel = cls.includes('role-axis-label') || ariaSelf.includes('y-axis') || ariaParent.includes('y-axis') || axisAncestor
              return Boolean(isAxisLabel)
            })
            .each(function () {
              const el = this as SVGTextElement
              const str = String(el.textContent ?? '').trim().replace(/,/g, '')
              const num = Number(str)
              if (!Number.isFinite(num)) return
              const bbox = el.getBoundingClientRect()
              const minX = (bbox.left - svgRect.left) * scaleX
              const maxX = (bbox.right - svgRect.left) * scaleX
              tickInfos.push({
                value: num,
                centerY: (viewBox?.y ?? 0) + (bbox.top - svgRect.top + bbox.height / 2) * scaleY,
                minY: (viewBox?.y ?? 0) + (bbox.top - svgRect.top) * scaleY,
                maxY: (viewBox?.y ?? 0) + (bbox.bottom - svgRect.top) * scaleY,
                minX: (viewBox?.x ?? 0) + minX,
                maxX: (viewBox?.x ?? 0) + maxX,
                height: bbox.height * scaleY,
              })
              tickSource = 'role-axis-label'
            })
        }
        if (!tickInfos.length) {
          const markInfos: Array<{ value: number; centerY: number; minX: number; maxX: number }> = []
          scope.selectAll<SVGElement, JsonValue>(SvgSelectors.DataTargets).each((_, i, nodes) => {
            const el = nodes[i] as Element
            const vAttr = el.getAttribute(DataAttributes.Value)
            const val = vAttr != null ? Number(vAttr) : NaN
            if (!Number.isFinite(val)) return
            const pt = this.toSvgCenter(el, svgNode)
            const bbox = (el as SVGGraphicsElement).getBBox?.()
            const halfW = bbox ? bbox.width / 2 : 4
            markInfos.push({ value: val, centerY: pt.y, minX: pt.x - halfW, maxX: pt.x + halfW })
          })
          // Deduplicate by y-value, keep the point closest to the y-axis (smallest |x|)
          const uniqueMap = new Map<number, { value: number; centerY: number; minX: number; maxX: number }>()
          markInfos.forEach((m) => {
            const prev = uniqueMap.get(m.value)
            const dist = Math.abs(m.minX) + Math.abs(m.maxX)
            const prevDist = prev ? Math.abs(prev.minX) + Math.abs(prev.maxX) : Infinity
            if (!prev || dist < prevDist) uniqueMap.set(m.value, m)
          })
          const deduped = Array.from(uniqueMap.values()).sort((a, b) => a.value - b.value)
          tickInfos = deduped.map((m) => ({
            value: m.value,
            centerY: m.centerY,
            minY: m.centerY,
            maxY: m.centerY,
            minX: m.minX,
            maxX: m.maxX,
            height: 8,
          }))
          tickSource = 'marks'
        }
        if (!tickInfos.length) return
        tickInfos.sort((a, b) => a.value - b.value)
        const paddingX = 4 * scaleX
        const paddingY = 2 * scaleY

        // y축 밴드는 실제 텍스트 폭을 기준으로 x범위를 계산
        const finiteMinXs = tickInfos.map((t) => t.minX).filter((v) => Number.isFinite(v))
        const finiteMaxXs = tickInfos.map((t) => t.maxX).filter((v) => Number.isFinite(v))
        const overallMinX =
          finiteMinXs.length && finiteMaxXs.length
            ? Math.min(...finiteMinXs) - paddingX
            : -paddingX
        const overallMaxX =
          finiteMinXs.length && finiteMaxXs.length
            ? Math.max(...finiteMaxXs) + paddingX
            : paddingX
        const overallCenterX = (overallMinX + overallMaxX) / 2

        const findTickByValue = (v: number) => {
          const EPS = 1e-6
          return tickInfos.find((t) => Math.abs(t.value - v) < EPS)
        }

        const minGap = (() => {
          const diffs: number[] = []
          for (let i = 0; i < tickInfos.length - 1; i += 1) {
            diffs.push(Math.abs(tickInfos[i + 1].centerY - tickInfos[i].centerY))
          }
          return diffs.length ? Math.min(...diffs) : height * 0.05
        })()

        const mapYValue = (v: number) => {
          const exact = findTickByValue(v)
          if (exact) return { y: exact.centerY, height: exact.height }
          let lower = tickInfos[0]
          let upper = tickInfos[tickInfos.length - 1]
          for (let i = 0; i < tickInfos.length - 1; i += 1) {
            const a = tickInfos[i]
            const b = tickInfos[i + 1]
            if (v >= a.value && v <= b.value) {
              lower = a
              upper = b
              break
            }
          }
          if (upper.value === lower.value) return null
          const t = clamp((v - lower.value) / (upper.value - lower.value))
          const y = lower.centerY + (upper.centerY - lower.centerY) * t
          const heightInterp = lower.height + (upper.height - lower.height) * t
          return { y, height: Math.max(heightInterp, 0) }
        }

        if (yValues.length === 1) {
          const pos = mapYValue(yValues[0])
          if (!pos) return
          missingYLabel = !findTickByValue(yValues[0])
          missingLabelText = missingYLabel ? String(yValues[0]) : null
          const rectLeft = overallMinX
          const rectRight = overallMaxX
          const bandHeight = Math.max(pos.height || minGap * 0.6, minGap * 0.4)
          axisRect = {
            x: rectLeft,
            width: rectRight - rectLeft,
            y: pos.y - bandHeight / 2 - paddingY,
            height: bandHeight + paddingY * 2,
          }
        } else if (yValues.length === 2) {
          const posA = mapYValue(yValues[0])
          const posB = mapYValue(yValues[1])
          if (!posA || !posB) return
          missingYLabel = !findTickByValue(yValues[0]) || !findTickByValue(yValues[1])
          missingLabelText = missingYLabel ? `${yValues[0]}–${yValues[1]}` : null
          const yTop = Math.min(posA.y, posB.y)
          const yBottom = Math.max(posA.y, posB.y)
          const rectLeft = overallMinX
          const rectRight = overallMaxX
          axisRect = {
            x: rectLeft,
            width: rectRight - rectLeft,
            y: yTop - paddingY,
            height: yBottom - yTop + paddingY * 2,
          }
        } else {
          console.warn('draw:rect axis.y supports 1 or 2 values', op)
        }
      }
      if (axisRect) {
        centerX = axisRect.x + axisRect.width / 2
        centerY = axisRect.y + axisRect.height / 2
        const rectWidth = axisRect.width
        const rectHeight = axisRect.height
        const x = axisRect.x
        const y = axisRect.y
        layer
          .append(SvgElements.Rect)
          .attr(SvgAttributes.Class, `${SvgClassNames.Annotation} ${SvgClassNames.RectAnnotation}`)
          .attr(DataAttributes.ChartId, op.chartId ?? null)
          .attr(SvgAttributes.X, x)
          .attr(SvgAttributes.Y, y)
          .attr(SvgAttributes.Width, rectWidth)
          .attr(SvgAttributes.Height, rectHeight)
          .attr(SvgAttributes.Fill, rectSpec.style?.fill ?? 'none')
          .attr(SvgAttributes.Opacity, rectSpec.style?.opacity ?? 1)
          .attr(SvgAttributes.Stroke, rectSpec.style?.stroke ?? '#111827')
          .attr(SvgAttributes.StrokeWidth, rectSpec.style?.strokeWidth ?? 1)

        if (axis.y != null && missingYLabel === true && missingLabelText) {
          layer
            .append(SvgElements.Text)
            .attr(SvgAttributes.Class, `${SvgClassNames.Annotation} ${SvgClassNames.TextAnnotation}`)
            .attr(DataAttributes.ChartId, op.chartId ?? null)
            .attr(SvgAttributes.X, centerX)
            .attr(SvgAttributes.Y, centerY)
            .attr(SvgAttributes.TextAnchor, 'middle')
            .attr(SvgAttributes.DominantBaseline, 'middle')
            .attr(SvgAttributes.Fill, rectSpec.style?.stroke ?? '#111827')
            .attr(SvgAttributes.FontSize, 12)
            .attr(SvgAttributes.FontWeight, 'bold')
            .attr(SvgAttributes.Stroke, 'white')
            .attr(SvgAttributes.StrokeWidth, 0.75)
            .attr(SvgAttributes.PaintOrder, 'stroke')
            .text(missingLabelText)
        }
        return
      }
    }

    if (centerX == null || centerY == null) return
    const rectWidth = (rectSpec.size?.width ?? 0) * width
    const rectHeight = (rectSpec.size?.height ?? 0) * height
    if (!rectWidth || !rectHeight) {
      console.warn('draw:rect size is required for normalized mode', op)
      return
    }

    const x = centerX - rectWidth / 2
    const y = centerY - rectHeight / 2

    layer
      .append(SvgElements.Rect)
      .attr(SvgAttributes.Class, `${SvgClassNames.Annotation} ${SvgClassNames.RectAnnotation}`)
      .attr(DataAttributes.ChartId, op.chartId ?? null)
      .attr(SvgAttributes.X, x)
      .attr(SvgAttributes.Y, y)
      .attr(SvgAttributes.Width, rectWidth)
      .attr(SvgAttributes.Height, rectHeight)
      .attr(SvgAttributes.Fill, rectSpec.style?.fill ?? 'none')
      .attr(SvgAttributes.Opacity, rectSpec.style?.opacity ?? 1)
      .attr(SvgAttributes.Stroke, rectSpec.style?.stroke ?? '#111827')
      .attr(SvgAttributes.StrokeWidth, rectSpec.style?.strokeWidth ?? 1)
  }

  line(op: DrawOp) {
    const lineSpec: DrawLineSpec | undefined = op.line
    if (!lineSpec) return
    const svg = d3.select(this.container).select(SvgElements.Svg)
    if (svg.empty()) return

    const svgNode = svg.node() as SVGSVGElement | null
    if (!svgNode) return
    const layer = d3.select(ensureAnnotationLayer(svgNode, op.chartId ?? null))
    const viewBox = svgNode.viewBox?.baseVal
    const width = viewBox && Number.isFinite(viewBox.width) ? viewBox.width : svgNode.getBoundingClientRect().width
    const height = viewBox && Number.isFinite(viewBox.height) ? viewBox.height : svgNode.getBoundingClientRect().height
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return

    const scope = this.selectScope(op.chartId)
    const mapY = this.yValueToSvgY(scope, svgNode)

    const mode = lineSpec.mode ?? DrawLineModes.Angle
    if (mode === DrawLineModes.Angle) {
      if (!lineSpec.axis || lineSpec.angle == null || lineSpec.length == null) return
      const xLabel = String(lineSpec.axis.x)
      const xTick = scope.selectAll<SVGTextElement, JsonValue>(SvgSelectors.XAxisText).filter(function () {
        return (this as SVGTextElement).textContent?.trim() === xLabel
      })
      if (xTick.empty()) return
      const xPt = this.toSvgCenter(xTick.node() as SVGTextElement, svgNode)
      const startY = mapY(lineSpec.axis.y) ?? xPt.y
      const endY = mapY(lineSpec.axis.y + lineSpec.length) ?? startY
      if (startY == null || endY == null) return

      const lengthPx = Math.abs(endY - startY)
      const angle = ((lineSpec.angle % 360) + 360) % 360
      const rad = ((angle - 90) * Math.PI) / 180
      const dx = Math.cos(rad) * lengthPx
      const dy = Math.sin(rad) * lengthPx

      drawLineWithArrow(layer, op.chartId, lineSpec, {
        x1: xPt.x,
        y1: startY,
        x2: xPt.x + dx,
        y2: startY + dy,
      })
      return
    }

    if (mode === DrawLineModes.Connect) {
      if (!lineSpec.pair || lineSpec.pair.x.length !== 2) return
      const [xA, xB] = lineSpec.pair.x
      const pointFor = (label: string) => {
        const mark = scope.selectAll<SVGElement, JsonValue>(SvgSelectors.DataTargets).filter(function () {
          const el = this as Element
          const target = el.getAttribute(DataAttributes.Target) || el.getAttribute(DataAttributes.Id)
          return target != null && String(target) === String(label)
        })
        if (mark.empty()) return null
        const node = mark.node() as Element
        const pt = this.toSvgCenter(node, svgNode)
        const valueAttr = node.getAttribute(DataAttributes.Value)
        const yValue = valueAttr != null ? Number(valueAttr) : NaN
        if (!Number.isFinite(yValue)) return null
        const y = mapY(yValue) ?? pt.y
        if (!Number.isFinite(y)) return null
        return { x: pt.x, y }
      }
      const a = pointFor(xA)
      const b = pointFor(xB)
      if (!a || !b) return
      drawLineWithArrow(layer, op.chartId, lineSpec, { x1: a.x, y1: a.y, x2: b.x, y2: b.y })
      return
    }

    if (mode === DrawLineModes.HorizontalFromX || mode === DrawLineModes.HorizontalFromY) {
      let y: number | null = null
      const nodes = scope.selectAll<SVGElement, JsonValue>(SvgSelectors.DataTargets).nodes()
      if (!nodes.length) return
      const svgRect = svgNode.getBoundingClientRect()
      const viewBox = svgNode.viewBox?.baseVal
      const scaleX = viewBox && svgRect.width > 0 ? viewBox.width / svgRect.width : 1
      const left = Math.min(...nodes.map((n) => (n.getBoundingClientRect().left - svgRect.left) * scaleX))
      const right = Math.max(...nodes.map((n) => (n.getBoundingClientRect().right - svgRect.left) * scaleX))
      let x1 = left
      const x2 = right

      const axisGroup = svgNode.querySelector<SVGGraphicsElement>(SvgSelectors.YAxisGroup)
      if (axisGroup) {
        const axisRect = axisGroup.getBoundingClientRect()
        if (axisRect.width > 0) {
          const axisRight = (viewBox?.x ?? 0) + (axisRect.right - svgRect.left) * scaleX
          if (Number.isFinite(axisRight) && axisRight < x1) {
            x1 = axisRight
          }
        }
      }

      if (mode === DrawLineModes.HorizontalFromX) {
        const label = lineSpec.hline?.x
        if (!label) return
        const mark = scope.selectAll<SVGElement, JsonValue>(SvgSelectors.DataTargets).filter(function () {
          const el = this as Element
          const target = el.getAttribute(DataAttributes.Target) || el.getAttribute(DataAttributes.Id)
          return target != null && String(target) === String(label)
        })
        if (mark.empty()) return
        const node = mark.node() as Element
        const valueAttr = node.getAttribute(DataAttributes.Value)
        const yValue = valueAttr != null ? Number(valueAttr) : NaN
        if (!Number.isFinite(yValue)) return
        y = mapY(yValue) ?? this.toSvgCenter(node, svgNode).y
      } else {
        const yValue = lineSpec.hline?.y
        if (yValue == null) return
        y = mapY(Number(yValue))
      }

      if (y == null) return
      drawLineWithArrow(layer, op.chartId, lineSpec, { x1, y1: y, x2, y2: y })
    }
  }

  run(op: DrawOp) {
    switch (op.action) {
      case DrawAction.Clear:
        this.clear(op.chartId)
        break
      case DrawAction.Highlight:
        this.highlight(op)
        break
      case DrawAction.Dim:
        this.dim(op)
        break
      case DrawAction.Text:
        this.text(op)
        break
      case DrawAction.Rect:
        this.rect(op)
        break
      case DrawAction.Line:
        this.line(op)
        break
      case DrawAction.Filter:
        console.warn('Filter action not implemented for this chart type')
        break
      case DrawAction.Sort:
        // Default no-op; chart-specific handlers may override
        console.warn('Sort action not implemented for this chart type')
        break
      default:
        console.warn('Unsupported draw action', op.action, op)
    }
  }

  protected clearAnnotations(chartId?: string) {
    const svg = d3.select(this.container).select(SvgElements.Svg)
    if (!chartId) {
      svg.selectAll(SvgSelectors.Annotation).remove()
      return
    }
    const scope = this.selectScope(chartId)
    scope.selectAll(SvgSelectors.Annotation).remove()
    svg
      .selectAll<SVGElement, JsonValue>(`${SvgSelectors.Annotation}[${DataAttributes.ChartId}="${String(chartId)}"]`)
      .remove()
  }
}

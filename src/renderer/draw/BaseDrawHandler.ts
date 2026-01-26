import * as d3 from 'd3'
import type { JsonValue } from '../../types'
import { getChartContext } from '../common/d3Helpers'
import {
  DrawAction,
  type DrawLineSpec,
  type DrawOp,
  type DrawRectMode,
  type DrawRectSpec,
  type DrawSelect,
  type DrawTextMode,
} from './types'

export abstract class BaseDrawHandler {
  protected container: HTMLElement

  constructor(container: HTMLElement) {
    this.container = container
  }

  protected abstract selectElements(select?: DrawSelect): d3.Selection<SVGElement, JsonValue, d3.BaseType, JsonValue>
  protected abstract allMarks(): d3.Selection<SVGElement, JsonValue, d3.BaseType, JsonValue>
  protected defaultColor(): string {
    return '#69b3a2'
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
        el.getAttribute('data-id'),
        el.getAttribute('data-target'),
        el.getAttribute('data-value'),
        el.getAttribute('data-series'),
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

  clear() {
    this.allMarks().attr('fill', this.defaultColor()).attr('opacity', 1)
    this.clearAnnotations()
  }

  highlight(op: DrawOp) {
    const color = op.style?.color || '#ef4444'
    this.selectElements(op.select).attr('fill', color).attr('opacity', 1)
  }

  dim(op: DrawOp) {
    const opacity = op.style?.opacity ?? 0.25
    const selectedNodes = new Set(this.selectElements(op.select).nodes())
    this.allMarks().attr('opacity', function () {
      return selectedNodes.has(this as SVGElement) ? 1 : opacity
    })
  }

  text(op: DrawOp) {
    const textSpec = op.text
    const value = textSpec?.value
    if (!value) return

    const svg = d3.select(this.container).select('svg')
    if (svg.empty()) return

    const mode: DrawTextMode = textSpec?.mode ?? (op.select?.keys?.length ? 'anchor' : 'normalized')
    const offsetX = textSpec?.offset?.x ?? 0
    const offsetY = textSpec?.offset?.y ?? (mode === 'anchor' ? -6 : 0)

    const style = textSpec?.style

    const resolveTextValue = (el?: Element) => {
      if (typeof value === 'string') return value
      if (!el) return null
      const candidates = [
        el.getAttribute('data-id'),
        el.getAttribute('data-target'),
        el.getAttribute('data-value'),
        el.getAttribute('data-series'),
        el.id,
      ].filter(Boolean) as string[]
      for (const key of candidates) {
        if (value[key] != null) return value[key]
      }
      return null
    }

    if (mode === 'anchor') {
      const selection = this.selectElements(op.select)
      if (selection.empty()) return
      selection.each(function () {
        const el = this as SVGGraphicsElement
        if (!el || typeof el.getBBox !== 'function') return
        const bbox = el.getBBox()
        const x = bbox.x + bbox.width / 2 + offsetX
        const y = bbox.y + offsetY
        const textValue = resolveTextValue(el)
        if (!textValue) return
        const parent = el.parentElement ? d3.select(el.parentElement) : svg
        parent
          .append('text')
          .attr('class', 'annotation text-annotation')
          .attr('x', x)
          .attr('y', y)
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'ideographic')
          .attr('fill', style?.color ?? '#111827')
          .attr('font-size', style?.fontSize ?? 12)
          .attr('font-weight', style?.fontWeight ?? 'bold')
          .attr('opacity', style?.opacity ?? 1)
          .attr('font-family', style?.fontFamily ?? null)
          .text(textValue)
      })
      return
    }

    if (mode === 'normalized') {
      const pos = textSpec?.position
      if (!pos) {
        console.warn('draw:text requires text.position when mode=normalized', op)
        return
      }
      const svgNode = svg.node() as SVGSVGElement | null
      if (!svgNode) return
      const viewBox = svgNode.viewBox?.baseVal
      const width = viewBox && Number.isFinite(viewBox.width) ? viewBox.width : svgNode.getBoundingClientRect().width
      const height = viewBox && Number.isFinite(viewBox.height) ? viewBox.height : svgNode.getBoundingClientRect().height
      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return

      const clamp = (n: number) => Math.max(0, Math.min(1, n))
      const x = clamp(pos.x) * width + offsetX
      const y = (1 - clamp(pos.y)) * height + offsetY

      const textValue = typeof value === 'string' ? value : null
      if (!textValue) return

      svg
        .append('text')
        .attr('class', 'annotation text-annotation')
        .attr('x', x)
        .attr('y', y)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .attr('fill', style?.color ?? '#111827')
        .attr('font-size', style?.fontSize ?? 12)
        .attr('font-weight', style?.fontWeight ?? 'bold')
        .attr('opacity', style?.opacity ?? 1)
        .attr('font-family', style?.fontFamily ?? null)
        .text(textValue)
      return
    }
  }

  rect(op: DrawOp) {
    const rectSpec: DrawRectSpec | undefined = op.rect
    if (!rectSpec) return
    const svg = d3.select(this.container).select('svg')
    if (svg.empty()) return

    const svgNode = svg.node() as SVGSVGElement | null
    if (!svgNode) return
    const viewBox = svgNode.viewBox?.baseVal
    const width = viewBox && Number.isFinite(viewBox.width) ? viewBox.width : svgNode.getBoundingClientRect().width
    const height = viewBox && Number.isFinite(viewBox.height) ? viewBox.height : svgNode.getBoundingClientRect().height
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return

    const clamp = (n: number) => Math.max(0, Math.min(1, n))
    const mode: DrawRectMode = rectSpec.mode ?? 'normalized'
    let centerX: number | null = null
    let centerY: number | null = null
    const toSvgCenter = (el: Element) => {
      const svgRect = svgNode.getBoundingClientRect()
      const elRect = el.getBoundingClientRect()
      const viewBox = svgNode.viewBox?.baseVal
      const scaleX = viewBox && svgRect.width > 0 ? viewBox.width / svgRect.width : 1
      const scaleY = viewBox && svgRect.height > 0 ? viewBox.height / svgRect.height : 1
      return {
        x: (elRect.left - svgRect.left + elRect.width / 2) * scaleX,
        y: (elRect.top - svgRect.top + elRect.height / 2) * scaleY,
      }
    }

    if (mode === 'normalized') {
      const pos = rectSpec.position
      if (!pos) {
        console.warn('draw:rect requires rect.position when mode=normalized', op)
        return
      }
      centerX = clamp(pos.x) * width
      centerY = (1 - clamp(pos.y)) * height
    } else if (mode === 'axis') {
      const axis = rectSpec.axis
      if (!axis) {
        console.warn('draw:rect requires rect.axis when mode=axis', op)
        return
      }
      if (axis.x != null && axis.y != null) {
        console.warn('draw:rect axis mode expects only one of axis.x or axis.y', op)
        return
      }
      if (axis.x != null) {
        const xLabel = String(axis.x)
        const xTick = svg.selectAll('.x-axis text').filter(function () {
          return (this as SVGTextElement).textContent?.trim() === xLabel
        })
        if (!xTick.empty()) {
          const node = xTick.node() as SVGTextElement
          const pt = toSvgCenter(node)
          centerX = pt.x
          centerY = pt.y
        }
      }
      if (axis.y != null) {
        const yValue = Number(axis.y)
        if (!Number.isFinite(yValue)) return
        const tickCenters: Array<{ value: number; x: number; y: number }> = []
        svg.selectAll('.y-axis text').each(function () {
          const text = (this as SVGTextElement).textContent?.trim() ?? ''
          const value = Number(text)
          if (!Number.isFinite(value)) return
          const pt = toSvgCenter(this as Element)
          tickCenters.push({ value, x: pt.x, y: pt.y })
        })
        if (tickCenters.length === 0) return
        tickCenters.sort((a, b) => a.value - b.value)
        const exact = tickCenters.find((t) => t.value === yValue)
        if (exact) {
          centerX = exact.x
          centerY = exact.y
          return
        }
        let lower = tickCenters[0]
        let upper = tickCenters[tickCenters.length - 1]
        for (let i = 0; i < tickCenters.length - 1; i += 1) {
          const a = tickCenters[i]
          const b = tickCenters[i + 1]
          if (yValue >= a.value && yValue <= b.value) {
            lower = a
            upper = b
            break
          }
        }
        if (upper.value === lower.value) return
        const t = clamp((yValue - lower.value) / (upper.value - lower.value))
        centerY = lower.y + (upper.y - lower.y) * t
        centerX = lower.x
      }
    }

    if (centerX == null || centerY == null) return
    const rectWidth = rectSpec.size.width * width
    const rectHeight = rectSpec.size.height * height

    const x = centerX - rectWidth / 2
    const y = centerY - rectHeight / 2

    svg
      .append('rect')
      .attr('class', 'annotation rect-annotation')
      .attr('x', x)
      .attr('y', y)
      .attr('width', rectWidth)
      .attr('height', rectHeight)
      .attr('fill', rectSpec.style?.fill ?? 'none')
      .attr('opacity', rectSpec.style?.opacity ?? 1)
      .attr('stroke', rectSpec.style?.stroke ?? '#111827')
      .attr('stroke-width', rectSpec.style?.strokeWidth ?? 1)
  }

  line(op: DrawOp) {
    const lineSpec: DrawLineSpec | undefined = op.line
    if (!lineSpec) return
    const svg = d3.select(this.container).select('svg')
    if (svg.empty()) return

    const svgNode = svg.node() as SVGSVGElement | null
    if (!svgNode) return
    const viewBox = svgNode.viewBox?.baseVal
    const width = viewBox && Number.isFinite(viewBox.width) ? viewBox.width : svgNode.getBoundingClientRect().width
    const height = viewBox && Number.isFinite(viewBox.height) ? viewBox.height : svgNode.getBoundingClientRect().height
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return

    const toSvgCenter = (el: Element) => {
      const svgRect = svgNode.getBoundingClientRect()
      const elRect = el.getBoundingClientRect()
      const viewBox = svgNode.viewBox?.baseVal
      const scaleX = viewBox && svgRect.width > 0 ? viewBox.width / svgRect.width : 1
      const scaleY = viewBox && svgRect.height > 0 ? viewBox.height / svgRect.height : 1
      return {
        x: (elRect.left - svgRect.left + elRect.width / 2) * scaleX,
        y: (elRect.top - svgRect.top + elRect.height / 2) * scaleY,
      }
    }

    const tickCenters: Array<{ value: number; x: number; y: number }> = []
    svg.selectAll('.y-axis text').each(function () {
      const text = (this as SVGTextElement).textContent?.trim() ?? ''
      const value = Number(text)
      if (!Number.isFinite(value)) return
      const pt = toSvgCenter(this as Element)
      tickCenters.push({ value, x: pt.x, y: pt.y })
    })
    if (tickCenters.length < 2) return
    tickCenters.sort((a, b) => a.value - b.value)

    const mapY = (value: number) => {
      const exact = tickCenters.find((t) => t.value === value)
      if (exact) return exact.y
      let lower = tickCenters[0]
      let upper = tickCenters[tickCenters.length - 1]
      for (let i = 0; i < tickCenters.length - 1; i += 1) {
        const a = tickCenters[i]
        const b = tickCenters[i + 1]
        if (value >= a.value && value <= b.value) {
          lower = a
          upper = b
          break
        }
      }
      if (value < tickCenters[0].value) {
        lower = tickCenters[0]
        upper = tickCenters[1]
      } else if (value > tickCenters[tickCenters.length - 1].value) {
        upper = tickCenters[tickCenters.length - 1]
        lower = tickCenters[tickCenters.length - 2]
      }
      if (upper.value === lower.value) return null
      const t = (value - lower.value) / (upper.value - lower.value)
      return lower.y + (upper.y - lower.y) * t
    }

    const mode = lineSpec.mode ?? 'angle'
    if (mode === 'angle') {
      if (!lineSpec.axis || lineSpec.angle == null || lineSpec.length == null) return
      const xLabel = String(lineSpec.axis.x)
      const xTick = svg.selectAll('.x-axis text').filter(function () {
        return (this as SVGTextElement).textContent?.trim() === xLabel
      })
      if (xTick.empty()) return
      const xPt = toSvgCenter(xTick.node() as SVGTextElement)
      const startY = mapY(lineSpec.axis.y)
      const endY = mapY(lineSpec.axis.y + lineSpec.length)
      if (startY == null || endY == null) return

      const lengthPx = Math.abs(endY - startY)
      const angle = ((lineSpec.angle % 360) + 360) % 360
      const rad = ((angle - 90) * Math.PI) / 180
      const dx = Math.cos(rad) * lengthPx
      const dy = Math.sin(rad) * lengthPx

      svg
        .append('line')
        .attr('class', 'annotation line-annotation')
        .attr('x1', xPt.x)
        .attr('y1', startY)
        .attr('x2', xPt.x + dx)
        .attr('y2', startY + dy)
        .attr('stroke', lineSpec.style?.stroke ?? '#111827')
        .attr('stroke-width', lineSpec.style?.strokeWidth ?? 2)
        .attr('opacity', lineSpec.style?.opacity ?? 1)
      return
    }

    if (mode === 'connect') {
      if (!lineSpec.pair || lineSpec.pair.x.length !== 2) return
      const [xA, xB] = lineSpec.pair.x
      const pointFor = (label: string) => {
        const mark = svg.selectAll('[data-target], [data-id], [data-value]').filter(function () {
          const el = this as Element
          const target = el.getAttribute('data-target') || el.getAttribute('data-id')
          return target != null && String(target) === String(label)
        })
        if (mark.empty()) return null
        const node = mark.node() as Element
        const x = toSvgCenter(node).x
        const valueAttr = node.getAttribute('data-value')
        const yValue = valueAttr != null ? Number(valueAttr) : NaN
        if (!Number.isFinite(yValue)) return null
        const y = mapY(yValue)
        if (y == null) return null
        return { x, y }
      }
      const a = pointFor(xA)
      const b = pointFor(xB)
      if (!a || !b) return
      svg
        .append('line')
        .attr('class', 'annotation line-annotation')
        .attr('x1', a.x)
        .attr('y1', a.y)
        .attr('x2', b.x)
        .attr('y2', b.y)
        .attr('stroke', lineSpec.style?.stroke ?? '#111827')
        .attr('stroke-width', lineSpec.style?.strokeWidth ?? 2)
        .attr('opacity', lineSpec.style?.opacity ?? 1)
      return
    }

    if (mode === 'hline-x' || mode === 'hline-y') {
      const ctx = getChartContext(this.container)
      const x1 = ctx.margins.left
      const x2 = ctx.margins.left + ctx.plot.w
      let y: number | null = null

      if (mode === 'hline-x') {
        const label = lineSpec.hline?.x
        if (!label) return
        const mark = svg.selectAll('[data-target], [data-id], [data-value]').filter(function () {
          const el = this as Element
          const target = el.getAttribute('data-target') || el.getAttribute('data-id')
          return target != null && String(target) === String(label)
        })
        if (mark.empty()) return
        const node = mark.node() as Element
        const valueAttr = node.getAttribute('data-value')
        const yValue = valueAttr != null ? Number(valueAttr) : NaN
        if (!Number.isFinite(yValue)) return
        y = mapY(yValue)
      } else {
        const yValue = lineSpec.hline?.y
        if (yValue == null) return
        y = mapY(Number(yValue))
      }

      if (y == null) return
      svg
        .append('line')
        .attr('class', 'annotation line-annotation')
        .attr('x1', x1)
        .attr('y1', y)
        .attr('x2', x2)
        .attr('y2', y)
        .attr('stroke', lineSpec.style?.stroke ?? '#111827')
        .attr('stroke-width', lineSpec.style?.strokeWidth ?? 2)
        .attr('opacity', lineSpec.style?.opacity ?? 1)
    }
  }

  run(op: DrawOp) {
    switch (op.action) {
      case DrawAction.Clear:
        this.clear()
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

  protected clearAnnotations() {
    d3.select(this.container).select('svg').selectAll('.annotation').remove()
  }
}

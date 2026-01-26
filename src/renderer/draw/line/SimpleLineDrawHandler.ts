import * as d3 from 'd3'
import type { JsonValue } from '../../../types'
import { DataAttributes, SvgAttributes, SvgClassNames, SvgElements, SvgSelectors } from '../../interfaces'
import { LineDrawHandler } from '../LineDrawHandler'
import { DrawAction, DrawLineModes, type DrawOp } from '../types'

type TraceSpec = {
  pair: { x: [string, string] }
  style?: { stroke?: string; strokeWidth?: number; opacity?: number; fill?: string; radius?: number }
}

/**
 * Simple line-specific handler:
 * - highlight/dim draw small circles on data points (overlay)
 * - added action: line-trace (follow existing line path between two x labels; overlay path & points)
 * - split/sort/filter are intentionally unsupported.
 */
export class SimpleLineDrawHandler extends LineDrawHandler {
  private drawPointCircle(
    svg: d3.Selection<SVGSVGElement, JsonValue, d3.BaseType, JsonValue>,
    x: number,
    y: number,
    style?: { fill?: string; opacity?: number; stroke?: string; strokeWidth?: number; radius?: number },
    chartId?: string,
  ) {
    svg
      .append(SvgElements.Circle)
      .attr(SvgAttributes.Class, `${SvgClassNames.Annotation} point-annotation`)
      .attr(DataAttributes.ChartId, chartId ?? null)
      .attr(SvgAttributes.CX, x)
      .attr(SvgAttributes.CY, y)
      .attr(SvgAttributes.R, style?.radius ?? 4)
      .attr(SvgAttributes.Fill, style?.fill ?? '#ef4444')
      .attr(SvgAttributes.Opacity, style?.opacity ?? 1)
      .attr(SvgAttributes.Stroke, style?.stroke ?? 'white')
      .attr(SvgAttributes.StrokeWidth, style?.strokeWidth ?? 1)
  }

  override highlight(op: DrawOp) {
    const svg = d3.select(this.container).select(SvgElements.Svg)
    if (svg.empty()) return
    const scope = op.chartId ? svg.selectAll(`[${DataAttributes.ChartId}="${String(op.chartId)}"]`) : svg
    const color = op.style?.color || '#ef4444'
    const points = this.selectElements(op.select, op.chartId)
    if (points.empty()) return
    points.each((_, i, nodes) => {
      const el = nodes[i] as Element
      const rect = el.getBoundingClientRect()
      const svgRect = (svg.node() as SVGSVGElement).getBoundingClientRect()
      const viewBox = (svg.node() as SVGSVGElement).viewBox?.baseVal
      const scaleX = viewBox && svgRect.width > 0 ? viewBox.width / svgRect.width : 1
      const scaleY = viewBox && svgRect.height > 0 ? viewBox.height / svgRect.height : 1
      const x = (rect.left - svgRect.left + rect.width / 2) * scaleX
      const y = (rect.top - svgRect.top + rect.height / 2) * scaleY
      this.drawPointCircle(svg as any, x, y, { fill: color }, op.chartId)
    })
  }

  override dim(op: DrawOp) {
    const opacity = op.style?.opacity ?? 0.25
    const selectedNodes = new Set(this.selectElements(op.select, op.chartId).nodes())
    this.allMarks(op.chartId).attr(SvgAttributes.Opacity, function () {
      return selectedNodes.has(this as SVGElement) ? 1 : opacity
    })
  }

  private lineTrace(op: DrawOp) {
    const trace = (op as unknown as { trace?: TraceSpec }).trace
    if (!trace?.pair?.x || trace.pair.x.length !== 2) return
    const svg = d3.select(this.container).select(SvgElements.Svg)
    if (svg.empty()) return
    const scope = op.chartId ? svg.selectAll(`[${DataAttributes.ChartId}="${String(op.chartId)}"]`) : svg
    const mapY = this.yValueToSvgY(scope as any, svg.node() as SVGSVGElement)

    const [xA, xB] = trace.pair.x
    const order = scope.selectAll<SVGElement, JsonValue>(SvgSelectors.DataTargets).nodes()
    const filtered = order
      .map((el) => {
        const label = (el as Element).getAttribute(DataAttributes.Target) || (el as Element).getAttribute(DataAttributes.Id)
        const value = Number((el as Element).getAttribute(DataAttributes.Value))
        return { el, label, value }
      })
      .filter((d) => d.label != null)
      .filter((d) => d.label === String(xA) || d.label === String(xB))
    if (filtered.length < 2) return

    const pointsAll = scope.selectAll<SVGElement, JsonValue>(SvgSelectors.DataTargets).nodes()
    const pointsWithin: Array<{ x: number; y: number }> = []
    const svgRect = (svg.node() as SVGSVGElement).getBoundingClientRect()
    const viewBox = (svg.node() as SVGSVGElement).viewBox?.baseVal
    const scaleX = viewBox && svgRect.width > 0 ? viewBox.width / svgRect.width : 1
    const scaleY = viewBox && svgRect.height > 0 ? viewBox.height / svgRect.height : 1

    const indices = pointsAll.reduce((acc, el, idx) => {
      const label = el.getAttribute(DataAttributes.Target) || el.getAttribute(DataAttributes.Id)
      if (label === String(xA) || label === String(xB)) acc.push(idx)
      return acc
    }, [] as number[])
    if (indices.length < 2) return
    const start = Math.min(...indices)
    const end = Math.max(...indices)
    for (let i = start; i <= end; i += 1) {
      const el = pointsAll[i] as Element
      const rect = el.getBoundingClientRect()
      const x = (rect.left - svgRect.left + rect.width / 2) * scaleX
      const rawValue = el.getAttribute(DataAttributes.Value)
      const yVal = rawValue != null ? Number(rawValue) : NaN
      const y = mapY(yVal)
      if (y == null || !Number.isFinite(x)) continue
      pointsWithin.push({ x, y })
    }
    if (pointsWithin.length < 2) return

    const stroke = trace.style?.stroke ?? '#ef4444'
    const strokeWidth = trace.style?.strokeWidth ?? 2
    const opacity = trace.style?.opacity ?? 1
    const fill = trace.style?.fill ?? stroke
    const radius = trace.style?.radius ?? 3.5

    const lineGen = d3
      .line<{ x: number; y: number }>()
      .x((d) => d.x)
      .y((d) => d.y)

    svg
      .append(SvgElements.Path)
      .attr(SvgAttributes.Class, `${SvgClassNames.Annotation} ${SvgClassNames.LineAnnotation}`)
      .attr(DataAttributes.ChartId, op.chartId ?? null)
      .attr('d', lineGen(pointsWithin) ?? undefined)
      .attr(SvgAttributes.Stroke, stroke)
      .attr(SvgAttributes.StrokeWidth, strokeWidth)
      .attr(SvgAttributes.Fill, 'none')
      .attr(SvgAttributes.Opacity, opacity)

    pointsWithin.forEach((p) => this.drawPointCircle(svg as any, p.x, p.y, { fill, radius, stroke }, op.chartId))
  }

  override run(op: DrawOp) {
    if (op.action === DrawAction.LineTrace || (op as any).trace) {
      this.lineTrace(op)
      return
    }
    // disable unsupported actions for line chart
    if (op.action === DrawAction.Sort || op.action === DrawAction.Filter || op.action === DrawAction.Split || op.action === DrawAction.Unsplit || op.action === DrawAction.BarSegment) {
      console.warn('Unsupported draw action for line chart', op.action)
      return
    }
    super.run(op)
  }
}


import * as d3 from 'd3'
import type { JsonValue } from '../../types'
import { DataAttributes, SvgAttributes, SvgClassNames, SvgElements, SvgSelectors } from '../interfaces'
import { BaseDrawHandler } from './BaseDrawHandler'
import {
  DrawAction,
  DrawComparisonOperators,
  DrawMark,
  type DrawBarSegmentSpec,
  type DrawOp,
  type DrawSelect,
} from './types'
import { normalizeComparisonCondition } from './utils/comparison'

/**
 * Draw handler for bar-like charts.
 * Relies on data-target / data-id attributes set on rect marks.
 */
export class BarDrawHandler extends BaseDrawHandler {
  protected selectElements(select?: DrawSelect, chartId?: string) {
    const scope = this.selectScope(chartId)
    const mark = select?.mark || DrawMark.Rect
    const selection = scope.selectAll<SVGElement, JsonValue>(mark)
    return this.filterByKeys(selection, select?.keys)
  }

  protected allMarks(chartId?: string) {
    const scope = this.selectScope(chartId)
    return scope.selectAll<SVGElement, JsonValue>(SvgElements.Rect)
  }

  protected defaultColor() {
    return '#69b3a2'
  }

  private sort(op: DrawOp) {
    const sortSpec = op.sort
    const by = sortSpec?.by ?? 'y'
    const order = (sortSpec?.order ?? 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc'
    const svg = d3.select(this.container).select(SvgElements.Svg)
    const scope = this.selectScope(op.chartId)
    const bars = this.selectBarMarks(scope)
    if (bars.empty()) return

    const entries = bars.nodes().map((node) => {
      const el = node as SVGRectElement
      return {
        el,
        x: Number(el.getAttribute(SvgAttributes.X)),
        width: Number(el.getAttribute(SvgAttributes.Width)),
        label: el.getAttribute(DataAttributes.Target) || el.getAttribute(DataAttributes.Id) || '',
        value: Number(el.getAttribute(DataAttributes.Value)),
      }
    })

    const xPositions = entries
      .slice()
      .sort((a, b) => a.x - b.x)
      .map((d) => d.x)
    const bandWidth = entries[0]?.width ?? 0

    const comparator =
      by === 'x'
        ? (a: typeof entries[0], b: typeof entries[0]) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0)
        : (a: typeof entries[0], b: typeof entries[0]) => a.value - b.value

    const sorted = entries.slice().sort((a, b) => comparator(a, b))
    if (order === 'desc') sorted.reverse()

    const labelToX = new Map<string, number>()

    sorted.forEach((item, idx) => {
      const targetX = xPositions[idx]
      d3.select(item.el).attr(SvgAttributes.X, targetX)
      labelToX.set(item.label, targetX)
    })

    // Reposition x-axis ticks to match sorted bars
    const ticks = scope.selectAll<SVGGElement, unknown>(SvgSelectors.XAxisTicks)
    ticks.each(function () {
      const tick = d3.select(this)
      const text = tick.select(SvgElements.Text).text().trim()
      const targetX = labelToX.get(text)
      if (targetX == null) return
      tick.attr(SvgAttributes.Transform, `translate(${targetX + bandWidth / 2},0)`)
    })
  }

  private barSegment(op: DrawOp) {
    const segment: DrawBarSegmentSpec | undefined = op.segment
    if (!segment) return

    const svg = d3.select(this.container).select(SvgElements.Svg)
    if (svg.empty()) return
    const svgNode = svg.node() as SVGSVGElement | null
    if (!svgNode) return

    const threshold = Number(segment.threshold)
    if (!Number.isFinite(threshold)) return
    const scope = this.selectScope(op.chartId)
    const mapY = this.yValueToSvgY(scope, svgNode)
    if (mapY(0) == null) return

    const style = segment.style

    const barsAll = this.selectBarMarks(scope)
    const bars =
      (this.filterByKeys(
        barsAll as unknown as d3.Selection<SVGElement, JsonValue, d3.BaseType, JsonValue>,
        op.select?.keys,
      ) as unknown as d3.Selection<SVGRectElement, JsonValue, d3.BaseType, JsonValue>)

    bars.each(function () {
      const el = this as SVGRectElement

      const valueAttr = el.getAttribute(DataAttributes.Value)
      const v = valueAttr != null ? Number(valueAttr) : NaN
      if (!Number.isFinite(v)) return

      const condition = normalizeComparisonCondition(segment.when ?? undefined)

      const svgRect = svgNode.getBoundingClientRect()
      const elRect = el.getBoundingClientRect()
      const viewBox = svgNode.viewBox?.baseVal
      const scaleX = viewBox && svgRect.width > 0 ? viewBox.width / svgRect.width : 1
      const scaleY = viewBox && svgRect.height > 0 ? viewBox.height / svgRect.height : 1

      const x = (elRect.left - svgRect.left) * scaleX
      const width = elRect.width * scaleX
      if (!Number.isFinite(x) || !Number.isFinite(width) || width <= 0) return

      const valueIntervalMin = Math.min(0, v)
      const valueIntervalMax = Math.max(0, v)

      const segmentMin =
        condition === DrawComparisonOperators.GreaterEqual || condition === DrawComparisonOperators.Greater
          ? Math.max(threshold, valueIntervalMin)
          : valueIntervalMin
      const segmentMax =
        condition === DrawComparisonOperators.LessEqual || condition === DrawComparisonOperators.Less
          ? Math.min(threshold, valueIntervalMax)
          : valueIntervalMax
      if (segmentMax <= segmentMin) return

      const yA = mapY(segmentMin)
      const yB = mapY(segmentMax)
      if (yA == null || yB == null) return

      const segY = Math.min(yA, yB)
      const segH = Math.abs(yA - yB)
      if (!Number.isFinite(segY) || !Number.isFinite(segH) || segH <= 0) return

      // Coordinates are computed in the SVG(viewBox) coordinate system, so append to the SVG root.
      svg
        .append(SvgElements.Rect)
        .attr(SvgAttributes.Class, `${SvgClassNames.Annotation} ${SvgClassNames.BarSegmentAnnotation}`)
        .attr(DataAttributes.ChartId, op.chartId ?? null)
        .attr(SvgAttributes.X, x)
        .attr(SvgAttributes.Y, segY)
        .attr(SvgAttributes.Width, width)
        .attr(SvgAttributes.Height, segH)
        .attr(SvgAttributes.Fill, style?.fill ?? '#ef4444')
        .attr(SvgAttributes.Opacity, style?.opacity ?? 1)
        .attr(SvgAttributes.Stroke, style?.stroke ?? null)
        .attr(SvgAttributes.StrokeWidth, style?.strokeWidth ?? null)
    })
  }

  private filter(op: DrawOp) {
    const filterSpec = op.filter
    if (!filterSpec) return
    const svg = d3.select(this.container).select(SvgElements.Svg)
    const scope = this.selectScope(op.chartId)
    const bars = this.selectBarMarks(scope)
    if (bars.empty()) return

    const entries = bars.nodes().map((node) => {
      const el = node as SVGRectElement
      return {
        el,
        x: Number(el.getAttribute(SvgAttributes.X)),
        width: Number(el.getAttribute(SvgAttributes.Width)),
        label: el.getAttribute(DataAttributes.Target) || el.getAttribute(DataAttributes.Id) || '',
        value: Number(el.getAttribute(DataAttributes.Value)),
      }
    })
    const plotW = d3.max(entries.map((e) => e.x + e.width)) ?? 0
    if (!Number.isFinite(plotW) || plotW <= 0) return

    const xRules: Array<{ kind: 'include' | 'exclude'; set: Set<string> }> = []
    if (filterSpec.x) {
      Object.keys(filterSpec.x).forEach((key) => {
        if (key === 'include' && Array.isArray(filterSpec.x?.include)) {
          xRules.push({ kind: 'include', set: new Set(filterSpec.x.include.map(String)) })
        }
        if (key === 'exclude' && Array.isArray(filterSpec.x?.exclude)) {
          xRules.push({ kind: 'exclude', set: new Set(filterSpec.x.exclude.map(String)) })
        }
      })
    }
    const matchY = (value: number) => {
      if (!filterSpec.y) return true
      const target = filterSpec.y.value
      const condition = normalizeComparisonCondition(filterSpec.y.op ?? undefined)
      switch (condition) {
        case DrawComparisonOperators.Greater:
          return value > target
        case DrawComparisonOperators.GreaterEqual:
          return value >= target
        case DrawComparisonOperators.Less:
          return value < target
        case DrawComparisonOperators.LessEqual:
          return value <= target
        default:
          return true
      }
    }

    const kept = entries.filter((e) => {
      let okX = true
      for (const rule of xRules) {
        if (rule.kind === 'include') {
          okX = okX && rule.set.has(e.label)
        } else if (rule.kind === 'exclude') {
          okX = okX && !rule.set.has(e.label)
        }
        if (!okX) break
      }
      const okY = matchY(e.value)
      return okX && okY
    })

    bars.style('display', 'none')

    if (!kept.length) {
      // nothing kept; also hide ticks
      scope.selectAll(SvgSelectors.XAxisTicks).style('display', 'none')
      return
    }

    const scale = d3.scaleBand<string>().domain(kept.map((d) => d.label)).range([0, plotW]).padding(0.2)
    kept.forEach((item) => {
      d3.select(item.el)
        .style('display', null)
        .attr(SvgAttributes.X, scale(item.label)!)
        .attr(SvgAttributes.Width, scale.bandwidth())
    })

    // update x-axis ticks to match filtered domain
    const ticks = scope.selectAll<SVGGElement, unknown>(SvgSelectors.XAxisTicks)
    ticks.style('display', 'none')
    ticks.each(function () {
      const tick = d3.select(this)
      const text = tick.select(SvgElements.Text).text().trim()
      if (!scale.domain().includes(text)) return
      tick
        .style('display', null)
        .attr(SvgAttributes.Transform, `translate(${scale(text)! + scale.bandwidth() / 2},0)`)
      tick.select(SvgElements.Text).attr(SvgAttributes.Transform, 'rotate(-45)').style('text-anchor', 'end')
    })
  }

  run(op: DrawOp) {
    if (op.action === DrawAction.BarSegment) {
      this.barSegment(op)
      return
    }
    if (op.action === DrawAction.Sort) {
      this.sort(op)
      return
    }
    if (op.action === DrawAction.Filter) {
      this.filter(op)
      return
    }
    super.run(op)
  }
}

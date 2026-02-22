import * as d3 from 'd3'
import type { JsonValue } from '../../../types'
import { DataAttributes, SvgAttributes, SvgClassNames, SvgElements, SvgSelectors } from '../../interfaces'
import { BarDrawHandler } from '../BarDrawHandler'
import { DrawAction, DrawComparisonOperators, type DrawBarSegmentSpec, type DrawOp, type DrawSelect } from '../types'
import { ensureAnnotationLayer } from '../utils/annotationLayer'
import { normalizeComparisonCondition } from '../utils/comparison'

export class StackedBarDrawHandler extends BarDrawHandler {
  private collectBarsByTarget(
    scope: d3.Selection<d3.BaseType, JsonValue, d3.BaseType, JsonValue>,
    targetFilter?: Set<string>,
  ) {
    const byTarget = new Map<string, SVGRectElement[]>()
    scope.selectAll<SVGRectElement, JsonValue>(SvgElements.Rect).each(function () {
      const el = this as SVGRectElement
      const target = el.getAttribute(DataAttributes.Target) || el.getAttribute(DataAttributes.Id)
      if (!target) return
      if (targetFilter && !targetFilter.has(String(target))) return
      const list = byTarget.get(String(target)) ?? []
      list.push(el)
      byTarget.set(String(target), list)
    })
    return byTarget
  }

  private sortByAggregate(op: DrawOp) {
    const sortSpec = op.sort
    const by = sortSpec?.by ?? 'y'
    const order = (sortSpec?.order ?? 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc'
    const scope = this.selectScope(op.chartId)

    const byTarget = this.collectBarsByTarget(scope)
    if (byTarget.size === 0) return

    const entries = Array.from(byTarget.entries()).map(([label, rects]) => {
      const first = rects[0]
      return {
        label,
        rects,
        x: Number(first.getAttribute(SvgAttributes.X)),
        width: Number(first.getAttribute(SvgAttributes.Width)),
        value: rects
          .map((rect) => Number(rect.getAttribute(DataAttributes.Value)))
          .filter(Number.isFinite)
          .reduce((acc, v) => acc + v, 0),
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
      item.rects.forEach((rect) => d3.select(rect).attr(SvgAttributes.X, targetX))
      labelToX.set(item.label, targetX)
    })

    const ticks = scope.selectAll<SVGGElement, unknown>(SvgSelectors.XAxisTicks)
    ticks.each(function () {
      const tick = d3.select(this)
      const text = tick.select(SvgElements.Text).text().trim()
      const targetX = labelToX.get(text)
      if (targetX == null) return
      tick.attr(SvgAttributes.Transform, `translate(${targetX + bandWidth / 2},0)`)
    })
  }

  private barSegmentByAggregate(op: DrawOp) {
    const segment: DrawBarSegmentSpec | undefined = op.segment
    if (!segment) return
    const threshold = Number(segment.threshold)
    if (!Number.isFinite(threshold)) return

    const svg = d3.select(this.container).select(SvgElements.Svg)
    if (svg.empty()) return
    const svgNode = svg.node() as SVGSVGElement | null
    if (!svgNode) return

    const scope = this.selectScope(op.chartId)
    const mapY = this.yValueToSvgY(scope, svgNode)
    if (mapY(0) == null) return

    const byTarget = this.collectBarsByTarget(scope)
    if (byTarget.size === 0) return
    let targetFilter: Set<string> | undefined
    if (op.select?.keys && op.select.keys.length) {
      const keys = op.select.keys.map((key) => String(key))
      const availableTargets = new Set(byTarget.keys())
      const matched = keys.filter((key) => availableTargets.has(key))
      if (matched.length) {
        targetFilter = new Set(matched)
      }
    }
    const filteredTargets = targetFilter ? this.collectBarsByTarget(scope, targetFilter) : byTarget
    if (filteredTargets.size === 0) return

    const layer = d3.select(ensureAnnotationLayer(svgNode, op.chartId ?? null))

    const style = segment.style
    const condition = normalizeComparisonCondition(segment.when ?? undefined)

    filteredTargets.forEach((rects, target) => {
      const first = rects[0]
      const x = Number(first.getAttribute(SvgAttributes.X))
      const width = Number(first.getAttribute(SvgAttributes.Width))
      if (!Number.isFinite(x) || !Number.isFinite(width) || width <= 0) return

      const total = rects
        .map((rect) => Number(rect.getAttribute(DataAttributes.Value)))
        .filter(Number.isFinite)
        .reduce((acc, v) => acc + v, 0)
      if (!Number.isFinite(total)) return

      const valueIntervalMin = Math.min(0, total)
      const valueIntervalMax = Math.max(0, total)

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

      layer
        .append(SvgElements.Rect)
        .attr(SvgAttributes.Class, `${SvgClassNames.Annotation} ${SvgClassNames.BarSegmentAnnotation}`)
        .attr(DataAttributes.ChartId, op.chartId ?? null)
        .attr(SvgAttributes.X, x)
        .attr(SvgAttributes.Y, segY)
        .attr(SvgAttributes.Width, width)
        .attr(SvgAttributes.Height, segH)
        .attr(SvgAttributes.Fill, style?.fill ?? 'rgba(239,68,68,0.35)')
        .attr(SvgAttributes.Stroke, style?.stroke ?? style?.fill ?? '#ef4444')
        .attr(SvgAttributes.StrokeWidth, style?.strokeWidth ?? 1)
        .attr(SvgAttributes.Opacity, style?.opacity ?? 1)
    })
  }

  protected override selectElements(select?: DrawSelect, chartId?: string) {
    const scope = this.selectScope(chartId)
    const selection = scope.selectAll<SVGElement, JsonValue>(`${SvgElements.Rect},${SvgElements.Path}`)
    return this.filterByKeys(selection, select?.keys)
  }

  protected override allMarks(chartId?: string) {
    const scope = this.selectScope(chartId)
    return scope.selectAll<SVGElement, JsonValue>(`${SvgElements.Rect},${SvgElements.Path}`)
  }

  override run(op: DrawOp) {
    const hasGroup = op.group != null && String(op.group).trim() !== ''
    if (!hasGroup && op.action === DrawAction.Sort) {
      this.sortByAggregate(op)
      return
    }
    if (!hasGroup && op.action === DrawAction.BarSegment) {
      this.barSegmentByAggregate(op)
      return
    }
    super.run(op)
  }
}

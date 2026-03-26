import * as d3 from 'd3'
import type { JsonValue } from '../../../types'
import { DataAttributes, SvgAttributes, SvgClassNames, SvgElements, SvgSelectors } from '../../interfaces'
import { LineDrawHandler } from '../LineDrawHandler'
import { DrawAction, DrawComparisonOperators, type DrawOp, type DrawSelect } from '../types'
import { NON_SPLIT_ENTER_MS, NON_SPLIT_EXIT_MS, NON_SPLIT_UPDATE_MS } from '../animationPolicy'
import { ensureAnnotationLayer } from '../utils/annotationLayer'

type LinePointEntry = {
  el: SVGElement
  target: string
  value: number
  x: number
}

async function waitTransition(transition: d3.Transition<any, any, any, any>) {
  try {
    await transition.end()
  } catch {
    // interrupted transitions are acceptable in interactive workflows
  }
}

export class MultiLineDrawHandler extends LineDrawHandler {
  protected override selectElements(select?: DrawSelect, chartId?: string) {
    const scope = this.selectScope(chartId)
    const mark = select?.mark ?? `${SvgElements.Path},${SvgElements.Circle},${SvgElements.Rect}`
    const selection = this.filterDataMarks(scope.selectAll<SVGElement, JsonValue>(mark))
    return this.filterBySelect(selection, select)
  }

  protected override allMarks(chartId?: string) {
    const scope = this.selectScope(chartId)
    return this.filterDataMarks(scope.selectAll<SVGElement, JsonValue>(`${SvgElements.Path},${SvgElements.Circle},${SvgElements.Rect}`))
  }

  private collectPointEntries(chartId?: string) {
    const svg = d3.select(this.container).select(SvgElements.Svg)
    if (svg.empty()) return [] as LinePointEntry[]
    const svgNode = svg.node() as SVGSVGElement | null
    if (!svgNode) return [] as LinePointEntry[]
    const points = this.selectElements(undefined, chartId)
    if (points.empty()) return [] as LinePointEntry[]
    return points
      .nodes()
      .map((node) => {
        const el = node as SVGElement
        const target = el.getAttribute(DataAttributes.Target) || el.getAttribute(DataAttributes.Id)
        const value = Number(el.getAttribute(DataAttributes.Value))
        if (!target || !Number.isFinite(value)) return null
        const center = this.toSvgCenter(el, svgNode)
        return { el, target: String(target), value, x: center.x }
      })
      .filter((entry): entry is LinePointEntry => entry !== null)
  }

  private async filter(op: DrawOp) {
    const filterSpec = op.filter
    if (!filterSpec) return
    const entries = this.collectPointEntries(op.chartId)
    if (!entries.length) return

    const include = filterSpec.x?.include?.length ? new Set(filterSpec.x.include.map(String)) : null
    const exclude = filterSpec.x?.exclude?.length ? new Set(filterSpec.x.exclude.map(String)) : null
    const matchY = (value: number) => {
      if (!filterSpec.y) return true
      const threshold = Number(filterSpec.y.value)
      if (!Number.isFinite(threshold)) return false
      switch (filterSpec.y.op) {
        case DrawComparisonOperators.Greater:
          return value > threshold
        case DrawComparisonOperators.GreaterEqual:
          return value >= threshold
        case DrawComparisonOperators.Less:
          return value < threshold
        case DrawComparisonOperators.LessEqual:
          return value <= threshold
        default:
          return true
      }
    }

    const kept = entries.filter((entry) => {
      if (include && !include.has(entry.target)) return false
      if (exclude && exclude.has(entry.target)) return false
      return matchY(entry.value)
    })
    const keptSet = new Set(kept.map((entry) => entry.el))
    const hidden = entries.filter((entry) => !keptSet.has(entry.el))

    const hideTransition = d3
      .selectAll<SVGElement, unknown>(hidden.map((entry) => entry.el) as SVGElement[])
      .style('display', null)
      .transition()
      .duration(NON_SPLIT_EXIT_MS)
      .attr(SvgAttributes.Opacity, 0)
    await waitTransition(hideTransition)
    d3.selectAll<SVGElement, unknown>(hidden.map((entry) => entry.el) as SVGElement[]).style('display', 'none')

    if (kept.length) {
      const left = d3.min(entries.map((entry) => entry.x)) ?? 0
      const right = d3.max(entries.map((entry) => entry.x)) ?? left
      const targetDomain = Array.from(new Set(kept.map((entry) => entry.target)))
      const scale = d3.scalePoint<string>().domain(targetDomain).range([left, right])
      const shownSelection = d3
        .selectAll<SVGElement, unknown>(kept.map((entry) => entry.el) as SVGElement[])
        .style('display', null)
        .attr(SvgAttributes.Opacity, 1)
      const shownTransition = shownSelection.transition().duration(NON_SPLIT_ENTER_MS + NON_SPLIT_UPDATE_MS)
      kept.forEach((entry) => {
        const x = scale(entry.target)
        if (x == null) return
        shownTransition
          .filter(function () {
            return this === entry.el
          })
          .attr(SvgAttributes.CX, x)
      })
      await waitTransition(shownTransition)

      const scope = this.selectScope(op.chartId)
      const ticks = scope.selectAll<SVGGElement, unknown>(SvgSelectors.XAxisTicks)
      const tickTransition = ticks.transition().duration(NON_SPLIT_UPDATE_MS)
      ticks.each(function () {
        const tick = d3.select(this)
        const label = tick.select(SvgElements.Text).text().trim()
        const x = scale(label)
        if (x == null) {
          tickTransition
            .filter(function () {
              return this === tick.node()
            })
            .attr(SvgAttributes.Opacity, 0)
          return
        }
        tickTransition
          .filter(function () {
            return this === tick.node()
          })
          .attr(SvgAttributes.Opacity, 1)
          .attr(SvgAttributes.Transform, `translate(${x},0)`)
      })
      await waitTransition(tickTransition)
    }
  }

  private async lineTrace(op: DrawOp) {
    const svg = d3.select(this.container).select<SVGSVGElement>(SvgElements.Svg)
    if (svg.empty()) return
    const svgNode = svg.node()
    if (!svgNode) return

    // Collect all point marks (circles) grouped by series
    const allCircles = svg.selectAll<SVGCircleElement, unknown>(`${SvgElements.Circle}[${DataAttributes.Target}][${DataAttributes.Series}]`)

    // Get all unique series
    const seriesSet = new Set<string>()
    allCircles.each(function () {
      const s = this.getAttribute(DataAttributes.Series)
      if (s) seriesSet.add(s)
    })

    const pair = op.select?.keys
    const startLabel = pair?.[0] != null ? String(pair[0]) : null
    const endLabel = pair?.[pair.length - 1] != null ? String(pair[pair.length - 1]) : null

    const layer = d3.select(ensureAnnotationLayer(svgNode, op.chartId ?? null))
    const svgBbox = svgNode.getBoundingClientRect()

    for (const series of seriesSet) {
      // Collect points for this series
      const seriesCircles: Array<{ el: SVGCircleElement; target: string; cx: number; cy: number }> = []
      allCircles.each(function () {
        if (this.getAttribute(DataAttributes.Series) !== series) return
        const target = this.getAttribute(DataAttributes.Target) || ''
        const bbox = this.getBoundingClientRect()
        const cx = bbox.left + bbox.width / 2 - svgBbox.left
        const cy = bbox.top + bbox.height / 2 - svgBbox.top
        seriesCircles.push({ el: this, target, cx, cy })
      })

      if (!seriesCircles.length) continue

      // Sort by cx (left to right)
      seriesCircles.sort((a, b) => a.cx - b.cx)

      // Filter to range if pair specified
      let inRange = seriesCircles
      if (startLabel && endLabel) {
        const startIdx = seriesCircles.findIndex((p) => p.target === startLabel)
        const endIdx = seriesCircles.findIndex((p) => p.target === endLabel)
        if (startIdx >= 0 && endIdx >= 0) {
          const lo = Math.min(startIdx, endIdx)
          const hi = Math.max(startIdx, endIdx)
          inRange = seriesCircles.slice(lo, hi + 1)
        }
      }

      if (inRange.length < 2) continue

      const lineGen = d3
        .line<{ cx: number; cy: number }>()
        .x((d) => d.cx)
        .y((d) => d.cy)
        .curve(d3.curveMonotoneX)

      const seriesColor = this.resolveMarkColor(series) ?? '#333'

      const tracePath = layer
        .append(SvgElements.Path)
        .attr(SvgAttributes.Class, `${SvgClassNames.Annotation} ${SvgClassNames.LineAnnotation}`)
        .attr(DataAttributes.ChartId, op.chartId ?? null)
        .attr(SvgAttributes.D, lineGen(inRange) ?? null)
        .attr(SvgAttributes.Fill, 'none')
        .attr(SvgAttributes.Stroke, seriesColor)
        .attr(SvgAttributes.StrokeWidth, 3)
        .attr(SvgAttributes.Opacity, 0)

      try {
        await tracePath.transition().duration(NON_SPLIT_ENTER_MS).attr(SvgAttributes.Opacity, 1).end()
      } catch {
        // interrupted transitions are ok
      }

      // Add endpoint circles
      for (const pt of [inRange[0], inRange[inRange.length - 1]]) {
        layer
          .append(SvgElements.Circle)
          .attr(SvgAttributes.Class, `${SvgClassNames.Annotation}`)
          .attr(DataAttributes.ChartId, op.chartId ?? null)
          .attr(SvgAttributes.CX, pt.cx)
          .attr(SvgAttributes.CY, pt.cy)
          .attr(SvgAttributes.R, 6)
          .attr(SvgAttributes.Fill, seriesColor)
          .attr(SvgAttributes.Opacity, 0.85)
      }
    }
  }

  private resolveMarkColor(series: string): string | null {
    const el = d3.select(this.container).select(`[${DataAttributes.Series}="${series}"]`)
    if (el.empty()) return null
    return (el.attr(SvgAttributes.Stroke) as string | null) || (el.attr(SvgAttributes.Fill) as string | null) || null
  }

  override run(op: DrawOp): void | Promise<void> {
    if (op.action === DrawAction.Filter) {
      return this.filter(op)
    }
    if (op.action === DrawAction.LineTrace) {
      return this.lineTrace(op)
    }
    return super.run(op)
  }
}

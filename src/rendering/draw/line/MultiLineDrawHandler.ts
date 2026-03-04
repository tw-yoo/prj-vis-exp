import * as d3 from 'd3'
import type { JsonValue } from '../../../types'
import { DataAttributes, SvgAttributes, SvgElements, SvgSelectors } from '../../interfaces'
import { LineDrawHandler } from '../LineDrawHandler'
import { DrawAction, DrawComparisonOperators, type DrawOp, type DrawSelect } from '../types'
import { NON_SPLIT_ENTER_MS, NON_SPLIT_EXIT_MS, NON_SPLIT_UPDATE_MS } from '../animationPolicy'

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
    const selection = scope.selectAll<SVGElement, JsonValue>(`${SvgElements.Path},${SvgElements.Circle},${SvgElements.Rect}`)
    return this.filterByKeys(selection, select?.keys)
  }

  protected override allMarks(chartId?: string) {
    const scope = this.selectScope(chartId)
    return scope.selectAll<SVGElement, JsonValue>(`${SvgElements.Path},${SvgElements.Circle},${SvgElements.Rect}`)
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

  override run(op: DrawOp): void | Promise<void> {
    if (op.action === DrawAction.Filter) {
      return this.filter(op)
    }
    return super.run(op)
  }
}

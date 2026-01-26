import * as d3 from 'd3'
import type { JsonValue } from '../../types'
import { getChartContext } from '../common/d3Helpers'
import { BaseDrawHandler } from './BaseDrawHandler'
import { DrawAction, DrawMark, type DrawOp, type DrawSelect } from './types'

/**
 * Draw handler for bar-like charts.
 * Relies on data-target / data-id attributes set on rect marks.
 */
export class BarDrawHandler extends BaseDrawHandler {
  protected selectElements(select?: DrawSelect) {
    const svg = d3.select(this.container).select('svg')
    const mark = select?.mark || DrawMark.Rect
    const selection = svg.selectAll<SVGElement, JsonValue>(mark)
    return this.filterByKeys(selection, select?.keys)
  }

  protected allMarks() {
    return d3.select(this.container).select('svg').selectAll<SVGElement, JsonValue>('rect')
  }

  protected defaultColor() {
    return '#69b3a2'
  }

  private sort(op: DrawOp) {
    const sortSpec = op.sort
    const by = sortSpec?.by ?? 'y'
    const order = (sortSpec?.order ?? 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc'
    const svg = d3.select(this.container).select('svg')
    const bars = svg.selectAll<SVGRectElement, JsonValue>('rect.main-bar')
    if (bars.empty()) return

    const entries = bars.nodes().map((node) => {
      const el = node as SVGRectElement
      return {
        el,
        x: Number(el.getAttribute('x')),
        width: Number(el.getAttribute('width')),
        label: el.getAttribute('data-target') || el.getAttribute('data-id') || '',
        value: Number(el.getAttribute('data-value')),
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
      d3.select(item.el).attr('x', targetX)
      labelToX.set(item.label, targetX)
    })

    // Reposition x-axis ticks to match sorted bars
    const ticks = svg.selectAll<SVGGElement, unknown>('.x-axis .tick')
    ticks.each(function () {
      const tick = d3.select(this)
      const text = tick.select('text').text().trim()
      const targetX = labelToX.get(text)
      if (targetX == null) return
      tick.attr('transform', `translate(${targetX + bandWidth / 2},0)`)
    })
  }

  private filter(op: DrawOp) {
    const filterSpec = op.filter
    if (!filterSpec) return
    const svg = d3.select(this.container).select('svg')
    const bars = svg.selectAll<SVGRectElement, JsonValue>('rect.main-bar')
    if (bars.empty()) return

    const ctx = getChartContext(this.container)
    const plotW = ctx.plot.w

    const entries = bars.nodes().map((node) => {
      const el = node as SVGRectElement
      return {
        el,
        label: el.getAttribute('data-target') || el.getAttribute('data-id') || '',
        value: Number(el.getAttribute('data-value')),
      }
    })

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
      const v = value
      const target = filterSpec.y.value
      switch (filterSpec.y.op) {
        case '>':
        case 'gt':
          return v > target
        case '>=':
        case 'gte':
          return v >= target
        case '<':
        case 'lt':
          return v < target
        case '<=':
        case 'lte':
          return v <= target
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
      svg.selectAll('.x-axis .tick').style('display', 'none')
      return
    }

    const scale = d3.scaleBand<string>().domain(kept.map((d) => d.label)).range([0, plotW]).padding(0.2)
    kept.forEach((item) => {
      d3.select(item.el)
        .style('display', null)
        .attr('x', scale(item.label)!)
        .attr('width', scale.bandwidth())
    })

    // update x-axis ticks to match filtered domain
    const ticks = svg.selectAll<SVGGElement, unknown>('.x-axis .tick')
    ticks.style('display', 'none')
    ticks.each(function () {
      const tick = d3.select(this)
      const text = tick.select('text').text().trim()
      if (!scale.domain().includes(text)) return
      tick
        .style('display', null)
        .attr('transform', `translate(${scale(text)! + scale.bandwidth() / 2},0)`)
      tick.select('text').attr('transform', 'rotate(-45)').style('text-anchor', 'end')
    })
  }

  run(op: DrawOp) {
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

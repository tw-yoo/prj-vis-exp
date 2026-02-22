import * as d3 from 'd3'
import type { JsonValue } from '../../../types'
import { DataAttributes, SvgAttributes, SvgSelectors, SvgElements } from '../../interfaces'
import { BarDrawHandler } from '../BarDrawHandler'
import {
  DrawAction,
  DrawComparisonOperators,
  type DrawOp,
  type DrawSelect,
} from '../types'
import { normalizeComparisonCondition } from '../utils/comparison'

type GroupedBarEntry = {
  el: SVGGraphicsElement
  target: string
  series: string
  value: number
  baseX: number
  width: number
  tagName: string
  baseTransform: string | null
}

export class GroupedBarDrawHandler extends BarDrawHandler {
  protected override selectElements(select?: DrawSelect, chartId?: string) {
    const scope = this.selectScope(chartId)
    const selection = scope.selectAll<SVGElement, JsonValue>(`${SvgElements.Rect},${SvgElements.Path}`)
    return this.filterByKeys(selection, select?.keys)
  }

  protected override allMarks(chartId?: string) {
    const scope = this.selectScope(chartId)
    return scope.selectAll<SVGElement, JsonValue>(`${SvgElements.Rect},${SvgElements.Path}`)
  }

  private collectGroupedBarEntries(scope: d3.Selection<d3.BaseType, JsonValue, d3.BaseType, JsonValue>) {
    const bars = this.selectBarMarks(scope)
    if (bars.empty()) return [] as GroupedBarEntry[]

    const resolveBaseNumeric = (node: SVGGraphicsElement, attrName: string) => {
      const stored = Number(node.getAttribute(`data-layout-${attrName}`))
      if (Number.isFinite(stored)) return stored
      const attr = Number(node.getAttribute(attrName))
      if (Number.isFinite(attr)) {
        node.setAttribute(`data-layout-${attrName}`, String(attr))
        return attr
      }
      const bbox = node.getBBox?.()
      if (!bbox) return NaN
      const fallback = attrName === SvgAttributes.X ? bbox.x : bbox.width
      if (Number.isFinite(fallback)) {
        node.setAttribute(`data-layout-${attrName}`, String(fallback))
      }
      return fallback
    }

    return bars
      .nodes()
      .map((node) => {
        const el = node as unknown as SVGGraphicsElement
        const target = el.getAttribute(DataAttributes.Target) || el.getAttribute(DataAttributes.Id)
        if (!target) return null
        const seriesRaw = el.getAttribute(DataAttributes.Series)
        const series = seriesRaw != null && seriesRaw.trim().length > 0 ? seriesRaw.trim() : '__default__'
        const baseX = resolveBaseNumeric(el, SvgAttributes.X)
        const width = resolveBaseNumeric(el, SvgAttributes.Width)
        const value = Number(el.getAttribute(DataAttributes.Value))
        if (!Number.isFinite(baseX) || !Number.isFinite(width) || width <= 0 || !Number.isFinite(value)) return null
        const baseTransform = el.getAttribute('data-layout-transform') ?? el.getAttribute(SvgAttributes.Transform)
        if (!el.hasAttribute('data-layout-transform') && baseTransform != null) {
          el.setAttribute('data-layout-transform', baseTransform)
        }
        return {
          el,
          target: String(target),
          series,
          value,
          baseX,
          width,
          tagName: el.tagName.toLowerCase(),
          baseTransform,
        } as GroupedBarEntry
      })
      .filter((entry): entry is GroupedBarEntry => entry != null)
  }

  private resolveSeriesDomain(entries: GroupedBarEntry[]) {
    if (!entries.length) return [] as string[]
    const byTarget = d3.group(entries, (entry) => entry.target)
    const firstTarget = Array.from(byTarget.keys())[0]
    const firstEntries = (byTarget.get(firstTarget) || []).slice().sort((a, b) => a.baseX - b.baseX)
    const seen = new Set<string>()
    const ordered: string[] = []

    firstEntries.forEach((entry) => {
      if (seen.has(entry.series)) return
      seen.add(entry.series)
      ordered.push(entry.series)
    })
    entries.forEach((entry) => {
      if (seen.has(entry.series)) return
      seen.add(entry.series)
      ordered.push(entry.series)
    })
    return ordered
  }

  private aggregateByTarget(entries: GroupedBarEntry[]) {
    const map = new Map<string, number>()
    entries.forEach((entry) => {
      map.set(entry.target, (map.get(entry.target) ?? 0) + entry.value)
    })
    return map
  }

  private relayoutGroupedBars(
    scope: d3.Selection<d3.BaseType, JsonValue, d3.BaseType, JsonValue>,
    entries: GroupedBarEntry[],
    visibleTargets: string[],
  ) {
    if (!entries.length) return
    const targetSet = new Set(visibleTargets)
    const seriesDomain = this.resolveSeriesDomain(entries)
    if (!seriesDomain.length || !visibleTargets.length) {
      entries.forEach((entry) => {
        d3.select(entry.el).style('display', 'none')
      })
      scope.selectAll<SVGGElement, unknown>(SvgSelectors.XAxisTicks).style('display', 'none')
      return
    }

    const maxRight = d3.max(entries.map((entry) => entry.baseX + entry.width)) ?? 0
    const minLeft = d3.min(entries.map((entry) => entry.baseX)) ?? 0
    const xScale = d3
      .scaleBand<string>()
      .domain(visibleTargets)
      .range([minLeft, maxRight])
      .paddingInner(0.18)
      .paddingOuter(0.08)
    const groupScale = d3.scaleBand<string>().domain(seriesDomain).range([0, xScale.bandwidth()]).padding(0.08)

    entries.forEach((entry) => {
      const el = d3.select(entry.el)
      if (!targetSet.has(entry.target)) {
        el.style('display', 'none')
        return
      }
      const xLeft = xScale(entry.target)
      const offset = groupScale(entry.series)
      if (xLeft == null || offset == null) {
        el.style('display', 'none')
        return
      }
      const targetX = xLeft + offset
      if (entry.tagName === SvgElements.Rect) {
        el
          .style('display', null)
          .attr(SvgAttributes.Transform, entry.baseTransform ?? null)
          .attr(SvgAttributes.X, targetX)
          .attr(SvgAttributes.Width, groupScale.bandwidth())
        return
      }
      const dx = targetX - entry.baseX
      const transformParts = [entry.baseTransform?.trim(), `translate(${dx},0)`].filter((part) => !!part)
      el.style('display', null).attr(SvgAttributes.Transform, transformParts.join(' '))
    })

    const ticks = scope.selectAll<SVGGElement, unknown>(SvgSelectors.XAxisTicks)
    ticks.style('display', 'none')
    ticks.each(function () {
      const tick = d3.select(this)
      const text = tick.select(SvgElements.Text).text().trim()
      const x = xScale(text)
      if (x == null) return
      tick
        .style('display', null)
        .attr(SvgAttributes.Transform, `translate(${x + xScale.bandwidth() / 2},0)`)
      tick.select(SvgElements.Text).attr(SvgAttributes.Transform, 'rotate(-45)').style('text-anchor', 'end')
    })
  }

  private sortGroupedBars(op: DrawOp) {
    const sortSpec = op.sort
    const by = sortSpec?.by ?? 'y'
    const order = (sortSpec?.order ?? 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc'
    const scope = this.selectScope(op.chartId)
    const entries = this.collectGroupedBarEntries(scope)
    if (!entries.length) return

    const targetDomain = Array.from(new Set(entries.map((entry) => entry.target)))
    const aggregate = this.aggregateByTarget(entries)
    const sortedTargets = targetDomain.slice().sort((a, b) => {
      if (by === 'x') {
        return a < b ? -1 : a > b ? 1 : 0
      }
      return (aggregate.get(a) ?? 0) - (aggregate.get(b) ?? 0)
    })
    if (order === 'desc') sortedTargets.reverse()

    this.relayoutGroupedBars(scope, entries, sortedTargets)
  }

  private filterGroupedBars(op: DrawOp) {
    const filterSpec = op.filter
    if (!filterSpec) return
    const scope = this.selectScope(op.chartId)
    const entries = this.collectGroupedBarEntries(scope)
    if (!entries.length) return

    const includeSet = filterSpec.x?.include?.length ? new Set(filterSpec.x.include.map(String)) : null
    const excludeSet = filterSpec.x?.exclude?.length ? new Set(filterSpec.x.exclude.map(String)) : null
    const aggregate = this.aggregateByTarget(entries)
    const targetDomain = Array.from(new Set(entries.map((entry) => entry.target)))

    const matchY = (target: string) => {
      const yRule = filterSpec.y
      if (!yRule) return true
      const condition = normalizeComparisonCondition(yRule.op ?? undefined)
      const threshold = Number(yRule.value)
      const value = aggregate.get(target) ?? 0
      if (!Number.isFinite(threshold) || !Number.isFinite(value)) return false
      switch (condition) {
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

    const visibleTargets = targetDomain.filter((target) => {
      if (includeSet && !includeSet.has(target)) return false
      if (excludeSet && excludeSet.has(target)) return false
      return matchY(target)
    })

    this.relayoutGroupedBars(scope, entries, visibleTargets)
  }

  override run(op: DrawOp) {
    if (op.action === DrawAction.Sort) {
      this.sortGroupedBars(op)
      return
    }
    if (op.action === DrawAction.Filter) {
      this.filterGroupedBars(op)
      return
    }
    super.run(op)
  }
}

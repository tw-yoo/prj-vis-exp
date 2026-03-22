import * as d3 from 'd3'
import type { JsonValue } from '../../../types'
import { DataAttributes, SvgAttributes, SvgClassNames, SvgSelectors, SvgElements } from '../../interfaces'
import { BarDrawHandler } from '../BarDrawHandler'
import {
  DrawAction,
  DrawComparisonOperators,
  DrawMark,
  DrawTextModes,
  type DrawOp,
  type DrawSelect,
} from '../types'
import { normalizeComparisonCondition } from '../utils/comparison'
import { NON_SPLIT_ENTER_MS, NON_SPLIT_EXIT_MS, NON_SPLIT_UPDATE_MS } from '../animationPolicy'

async function waitTransition(transition: d3.Transition<any, any, any, any>) {
  try {
    await transition.end()
  } catch {
    // interrupted transitions are acceptable in interactive workflows
  }
}

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
    const mark = !select?.mark || select.mark === DrawMark.Rect ? `${SvgElements.Rect},${SvgElements.Path}` : select.mark
    const selection = this.filterDataMarks(scope.selectAll<SVGElement, JsonValue>(mark))
    return this.filterBySelect(selection, select)
  }

  protected override allMarks(chartId?: string) {
    const scope = this.selectScope(chartId)
    return this.filterDataMarks(scope.selectAll<SVGElement, JsonValue>(`${SvgElements.Rect},${SvgElements.Path}`))
  }

  private collectGroupedBarEntries(scope: d3.Selection<d3.BaseType, JsonValue, d3.BaseType, JsonValue>) {
    const bars = this.selectBarMarks(scope)
    if (bars.empty()) return [] as GroupedBarEntry[]

    const resolveBaseNumeric = (node: SVGGraphicsElement, attrName: string) => {
      const stored = Number(node.getAttribute(`data-layout-${attrName}`))
      if (Number.isFinite(stored) && (attrName === SvgAttributes.X || stored > 0)) return stored
      const attr = Number(node.getAttribute(attrName))
      if (Number.isFinite(attr) && (attrName === SvgAttributes.X || attr > 0)) {
        node.setAttribute(`data-layout-${attrName}`, String(attr))
        return attr
      }
      const bbox = node.getBBox?.()
      const localFallback = bbox ? (attrName === SvgAttributes.X ? bbox.x : bbox.width) : NaN
      if (Number.isFinite(localFallback) && (attrName === SvgAttributes.X || localFallback > 0)) {
        node.setAttribute(`data-layout-${attrName}`, String(localFallback))
        return localFallback
      }
      const ownerSvg = node.ownerSVGElement
      const nodeRect = node.getBoundingClientRect?.()
      const svgRect = ownerSvg?.getBoundingClientRect?.()
      const viewBox = ownerSvg?.viewBox?.baseVal
      if (!nodeRect || !svgRect || !viewBox || svgRect.width <= 0 || svgRect.height <= 0) return NaN
      const scaleX = viewBox.width / svgRect.width
      const fallback =
        attrName === SvgAttributes.X
          ? (viewBox.x ?? 0) + (nodeRect.left - svgRect.left) * scaleX
          : nodeRect.width * scaleX
      if (Number.isFinite(fallback) && (attrName === SvgAttributes.X || fallback > 0)) {
        node.setAttribute(`data-layout-${attrName}`, String(fallback))
        return fallback
      }
      return NaN
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
        const rawValue = Number(el.getAttribute(DataAttributes.Value))
        const bbox = el.getBBox?.()
        const value = Number.isFinite(rawValue) ? rawValue : Number(bbox?.height ?? 0)
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
    visibleSeries?: Set<string>,
  ) {
    if (!entries.length) return Promise.resolve()
    const targetSet = new Set(visibleTargets)
    const allSeries = this.resolveSeriesDomain(entries)
    const seriesDomain = visibleSeries ? allSeries.filter((series) => visibleSeries.has(series)) : allSeries
    if (!seriesDomain.length || !visibleTargets.length) {
      const hideTransition = d3
        .selectAll<SVGGraphicsElement, unknown>(entries.map((entry) => entry.el) as SVGGraphicsElement[])
        .style('display', null)
        .transition()
        .duration(NON_SPLIT_EXIT_MS)
        .attr(SvgAttributes.Opacity, 0)
      const tickFade = scope
        .selectAll<SVGGElement, unknown>(SvgSelectors.XAxisTicks)
        .transition()
        .duration(NON_SPLIT_EXIT_MS)
        .attr(SvgAttributes.Opacity, 0)
      return Promise.all([waitTransition(hideTransition), waitTransition(tickFade)]).then(() => {
        d3.selectAll<SVGGraphicsElement, unknown>(entries.map((entry) => entry.el) as SVGGraphicsElement[]).style('display', 'none')
      })
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

    const hiddenEntries = entries.filter(
      (entry) => !targetSet.has(entry.target) || (visibleSeries ? !visibleSeries.has(entry.series) : false),
    )
    const shownEntries = entries.filter(
      (entry) => targetSet.has(entry.target) && (!visibleSeries || visibleSeries.has(entry.series)),
    )

    const hideTransition = d3
      .selectAll<SVGGraphicsElement, unknown>(hiddenEntries.map((entry) => entry.el) as SVGGraphicsElement[])
      .style('display', null)
      .transition()
      .duration(NON_SPLIT_EXIT_MS)
      .attr(SvgAttributes.Opacity, 0)

    const showSelection = d3
      .selectAll<SVGGraphicsElement, unknown>(shownEntries.map((entry) => entry.el) as SVGGraphicsElement[])
      .style('display', null)
      .attr(SvgAttributes.Opacity, 1)
    const showTransition = showSelection.transition().duration(NON_SPLIT_ENTER_MS + NON_SPLIT_UPDATE_MS)
    shownEntries.forEach((entry) => {
      const xLeft = xScale(entry.target)
      const offset = groupScale(entry.series)
      if (xLeft == null || offset == null) return
      const targetX = xLeft + offset
      if (entry.tagName === SvgElements.Rect) {
        showTransition
          .filter(function () {
            return this === entry.el
          })
          .attr(SvgAttributes.Transform, entry.baseTransform ?? null)
          .attr(SvgAttributes.X, targetX)
          .attr(SvgAttributes.Width, groupScale.bandwidth())
          .attr(SvgAttributes.Opacity, 1)
        return
      }
      const dx = targetX - entry.baseX
      const transformParts = [entry.baseTransform?.trim(), `translate(${dx},0)`].filter((part) => !!part)
      showTransition
        .filter(function () {
          return this === entry.el
        })
        .attr(SvgAttributes.Transform, transformParts.join(' '))
        .attr(SvgAttributes.Opacity, 1)
    })

    const ticks = scope.selectAll<SVGGElement, unknown>(SvgSelectors.XAxisTicks)
    const tickTransition = ticks.transition().duration(NON_SPLIT_UPDATE_MS)
    ticks.each(function () {
      const tick = d3.select(this)
      const text = tick.select(SvgElements.Text).text().trim()
      const x = xScale(text)
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
        .attr(SvgAttributes.Transform, `translate(${x + xScale.bandwidth() / 2},0)`)
      tick.select(SvgElements.Text).attr(SvgAttributes.Transform, 'rotate(-45)').style('text-anchor', 'end')
    })

    return Promise.all([
      waitTransition(hideTransition),
      waitTransition(showTransition),
      waitTransition(tickTransition),
    ]).then(() => {
      d3.selectAll<SVGGraphicsElement, unknown>(hiddenEntries.map((entry) => entry.el) as SVGGraphicsElement[]).style(
        'display',
        'none',
      )
    })
  }

  private async sortGroupedBars(op: DrawOp) {
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

    await this.relayoutGroupedBars(scope, entries, sortedTargets)
  }

  private async filterGroupedBars(op: DrawOp) {
    const filterSpec = op.filter
    const scope = this.selectScope(op.chartId)
    const entries = this.collectGroupedBarEntries(scope)
    if (!entries.length) return

    const includeSet = filterSpec?.x?.include?.length ? new Set(filterSpec.x.include.map(String)) : null
    const excludeSet = filterSpec?.x?.exclude?.length ? new Set(filterSpec.x.exclude.map(String)) : null
    const aggregate = this.aggregateByTarget(entries)
    const targetDomain = Array.from(new Set(entries.map((entry) => entry.target)))
    const selectKeys = new Set((op.select?.keys ?? []).map(String))

    const matchY = (target: string) => {
      const yRule = filterSpec?.y
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
    if (visibleTargets.length > 0 || includeSet || excludeSet || filterSpec?.y) {
      await this.relayoutGroupedBars(scope, entries, visibleTargets)
      return
    }

    if (!selectKeys.size) return
    const fallbackTargets = new Set<string>()
    entries.forEach((entry) => {
      if (selectKeys.has(entry.target)) fallbackTargets.add(entry.target)
      if (selectKeys.has(`${entry.target}__${entry.series}`)) fallbackTargets.add(entry.target)
      if (selectKeys.has(entry.series)) fallbackTargets.add(entry.target)
    })
    if (!fallbackTargets.size) return
    await this.relayoutGroupedBars(scope, entries, Array.from(fallbackTargets))
  }

  private async filterGroupedSeries(op: DrawOp) {
    if (op.action !== DrawAction.GroupedFilterGroups) return
    const filterSpec = op.groupFilter
    if (!filterSpec) return
    const scope = this.selectScope(op.chartId)
    const entries = this.collectGroupedBarEntries(scope)
    if (!entries.length) return
    const allTargets = Array.from(new Set(entries.map((entry) => entry.target)))
    const allSeries = this.resolveSeriesDomain(entries)
    let visibleSeries = new Set(allSeries)
    if (!filterSpec.reset) {
      const includeCandidates =
        filterSpec.groups?.length
          ? filterSpec.groups
          : filterSpec.include?.length
            ? filterSpec.include
            : filterSpec.keep
      if (includeCandidates && includeCandidates.length) {
        visibleSeries = new Set(includeCandidates.map(String))
      } else if (filterSpec.exclude?.length) {
        const excluded = new Set(filterSpec.exclude.map(String))
        visibleSeries = new Set(allSeries.filter((series) => !excluded.has(series)))
      } else if (op.select?.keys?.length) {
        const keySet = new Set(op.select.keys.map(String))
        const matched = allSeries.filter((series) => keySet.has(series))
        if (matched.length) {
          visibleSeries = new Set(matched)
        } else {
          entries.forEach((entry) => {
            if (keySet.has(`${entry.target}__${entry.series}`)) visibleSeries.add(entry.series)
          })
        }
      }
    }
    await this.relayoutGroupedBars(scope, entries, allTargets, visibleSeries)
  }

  private async sumGrouped(op: DrawOp) {
    const scope = this.selectScope(op.chartId)
    const entries = this.collectGroupedBarEntries(scope)
    if (!entries.length) return

    const seriesDomain = this.resolveSeriesDomain(entries)
    if (!seriesDomain.length) return
    const bySeries = new Map<string, number>()
    entries.forEach((entry) => {
      bySeries.set(entry.series, (bySeries.get(entry.series) ?? 0) + entry.value)
    })
    const total = Array.from(bySeries.values()).reduce((acc, value) => acc + value, 0)
    if (!Number.isFinite(total)) return

    const scaleFactor = 1
    const sumLabel = String(op.sum?.label ?? 'Sum')
    const minLeft = d3.min(entries.map((entry) => entry.baseX)) ?? 0
    const maxRight = d3.max(entries.map((entry) => entry.baseX + entry.width)) ?? 0
    if (!Number.isFinite(minLeft) || !Number.isFinite(maxRight) || maxRight <= minLeft) return
    const xScale = d3.scaleBand<string>().domain([sumLabel]).range([minLeft, maxRight]).padding(0.25)
    const targetX = xScale(sumLabel) ?? minLeft
    const targetWidth = xScale.bandwidth() || maxRight - minLeft

    const svg = d3.select(this.container).select(SvgElements.Svg)
    const svgNode = svg.node() as SVGSVGElement | null
    if (!svgNode) return
    let positiveTotal = 0
    let negativeTotal = 0
    seriesDomain.forEach((series) => {
      const value = (bySeries.get(series) ?? 0) * scaleFactor
      if (value >= 0) positiveTotal += value
      else negativeTotal += value
    })
    const yScale = this.buildNiceYScale(scope, [negativeTotal, positiveTotal])
    const mapY = this.yValueToSvgY(scope, svgNode)
    const resolveY = (value: number) => (yScale ? yScale(value) : mapY(value))
    const zeroY = resolveY(0) ?? 0

    const anchorBySeries = new Map<string, GroupedBarEntry>()
    entries
      .slice()
      .sort((a, b) => a.baseX - b.baseX)
      .forEach((entry) => {
        if (!anchorBySeries.has(entry.series)) anchorBySeries.set(entry.series, entry)
      })

    const hiddenEntries = entries.filter((entry) => anchorBySeries.get(entry.series)?.el !== entry.el)
    const hiddenSelection = d3.selectAll<SVGGraphicsElement, unknown>(hiddenEntries.map((entry) => entry.el) as SVGGraphicsElement[])
    const hideTransition = hiddenSelection
      .style('display', null)
      .transition()
      .duration(NON_SPLIT_EXIT_MS)
      .attr(SvgAttributes.Opacity, 0)
      .attr(SvgAttributes.Y, zeroY)
      .attr(SvgAttributes.Height, 0)

    let positive = 0
    let negative = 0
    const shownEntries: Array<{ entry: GroupedBarEntry; y: number; height: number; value: number }> = []
    seriesDomain.forEach((series) => {
      const anchor = anchorBySeries.get(series)
      if (!anchor) return
      const rawValue = bySeries.get(series) ?? 0
      const value = rawValue * scaleFactor
      const start = value >= 0 ? positive : negative
      const end = start + value
      if (value >= 0) positive = end
      else negative = end
      const y0 = resolveY(start) ?? zeroY
      const y1 = resolveY(end) ?? zeroY
      shownEntries.push({
        entry: anchor,
        y: Math.min(y0, y1),
        height: Math.abs(y0 - y1),
        value,
      })
    })

    const shownSelection = d3
      .selectAll<SVGGraphicsElement, unknown>(shownEntries.map((item) => item.entry.el) as SVGGraphicsElement[])
      .style('display', null)
      .attr(SvgAttributes.Opacity, 1)
    const shownTransition = shownSelection.transition().duration(NON_SPLIT_ENTER_MS + NON_SPLIT_UPDATE_MS)
    shownEntries.forEach((item) => {
      const node = d3.select(item.entry.el)
      node
        .attr(SvgAttributes.Transform, item.entry.baseTransform ?? null)
        .attr(DataAttributes.Target, sumLabel)
        .attr(DataAttributes.Id, `${sumLabel}__${item.entry.series}`)
        .attr(DataAttributes.Value, String(item.value))
      shownTransition
        .filter(function () {
          return this === item.entry.el
        })
        .attr(SvgAttributes.X, targetX)
        .attr(SvgAttributes.Width, targetWidth)
        .attr(SvgAttributes.Y, item.y)
        .attr(SvgAttributes.Height, item.height)
        .attr(SvgAttributes.Opacity, 1)
    })

    const ticks = scope.selectAll<SVGGElement, unknown>(SvgSelectors.XAxisTicks)
    const tickNodes = ticks.nodes()
    const primaryTick = tickNodes.length ? tickNodes[0] : null
    const tickTransition = ticks.transition().duration(NON_SPLIT_UPDATE_MS)
    const yAxis = scope.select<SVGGElement>(SvgSelectors.YAxisGroup)
    const yAxisTransition =
      yScale && !yAxis.empty()
        ? yAxis.transition().duration(NON_SPLIT_UPDATE_MS).call(d3.axisLeft(yScale).ticks(5) as any)
        : null
    ticks.each(function () {
      const tick = d3.select(this)
      const isPrimary = this === primaryTick
      if (!isPrimary) {
        tickTransition
          .filter(function () {
            return this === tick.node()
          })
          .attr(SvgAttributes.Opacity, 0)
        return
      }
      tick.select(SvgElements.Text).text(sumLabel)
      tickTransition
        .filter(function () {
          return this === tick.node()
        })
        .attr(SvgAttributes.Opacity, 1)
        .attr(SvgAttributes.Transform, `translate(${targetX + targetWidth / 2},0)`)
    })

    await Promise.all([
      waitTransition(hideTransition),
      waitTransition(shownTransition),
      waitTransition(tickTransition),
      yAxisTransition ? waitTransition(yAxisTransition) : Promise.resolve(),
    ])

    const textValue = this.formatNumber(total)
    const stackedTopY = d3.min(shownEntries.map((item) => item.y))
    if (textValue && Number.isFinite(stackedTopY ?? NaN)) {
      const annotationLayer = this.getLocalAnnotationLayer(scope, op.chartId)
      if (!annotationLayer) {
        hiddenSelection.style('display', 'none')
        return
      }
      annotationLayer.selectAll<SVGTextElement, unknown>('text.sum-value-annotation').remove()
      const label = annotationLayer
        .append(SvgElements.Text)
        .attr(SvgAttributes.Class, `${SvgClassNames.Annotation} ${SvgClassNames.TextAnnotation} sum-value-annotation`)
        .attr(DataAttributes.ChartId, op.chartId ?? null)
        .attr(SvgAttributes.X, targetX + targetWidth / 2)
        .attr(SvgAttributes.Y, Number(stackedTopY) - 5)
        .attr(SvgAttributes.TextAnchor, 'middle')
        .attr(SvgAttributes.DominantBaseline, 'ideographic')
        .attr(SvgAttributes.Fill, '#111827')
        .attr(SvgAttributes.FontSize, 12)
        .attr(SvgAttributes.FontWeight, 'bold')
        .attr(SvgAttributes.Opacity, 0)
        .text(textValue)
      this.placeTextWithCollisionPolicy({
        textNode: label as unknown as d3.Selection<SVGTextElement, unknown, SVGElement | null, unknown>,
        svgNode,
        chartId: op.chartId,
        mode: DrawTextModes.Anchor,
        preferred: { x: targetX + targetWidth / 2, y: Number(stackedTopY) - 5 },
        anchorElement: shownEntries[0]?.entry.el ?? null,
        textValue,
        styleColor: '#111827',
        allowBarInsideFallback: true,
      })
      label.transition().duration(NON_SPLIT_UPDATE_MS).attr(SvgAttributes.Opacity, 1)
    }

    hiddenSelection.style('display', 'none')
  }

  override run(op: DrawOp): void | Promise<void> {
    if (op.action === DrawAction.Sort) {
      return this.sortGroupedBars(op)
    }
    if (op.action === DrawAction.Filter) {
      return this.filterGroupedBars(op)
    }
    if (op.action === DrawAction.GroupedFilterGroups) {
      return this.filterGroupedSeries(op)
    }
    if (op.action === DrawAction.Sum) {
      return this.sumGrouped(op)
    }
    return super.run(op)
  }
}

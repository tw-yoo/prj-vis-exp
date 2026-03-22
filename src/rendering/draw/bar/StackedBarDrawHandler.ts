import * as d3 from 'd3'
import type { JsonValue } from '../../../types'
import { DataAttributes, SvgAttributes, SvgClassNames, SvgElements, SvgSelectors } from '../../interfaces'
import { BarDrawHandler } from '../BarDrawHandler'
import { DrawAction, DrawComparisonOperators, DrawMark, DrawTextModes, type DrawBarSegmentSpec, type DrawOp, type DrawSelect } from '../types'
import { resolveAnnotationKeyForDrawOp } from '../annotationKey'
import { ensureAnnotationLayer } from '../utils/annotationLayer'
import { normalizeComparisonCondition } from '../utils/comparison'
import { NON_SPLIT_ENTER_MS, NON_SPLIT_EXIT_MS, NON_SPLIT_UPDATE_MS } from '../animationPolicy'

async function waitTransition(transition: d3.Transition<any, any, any, any>) {
  try {
    await transition.end()
  } catch {
    // interrupted transitions are acceptable in interactive workflows
  }
}

type StackedEntry = {
  el: SVGGraphicsElement
  target: string
  series: string
  value: number
  x: number
  width: number
  y: number
  height: number
}

export class StackedBarDrawHandler extends BarDrawHandler {
  private pathRectD(x: number, y: number, width: number, height: number) {
    const w = Number.isFinite(width) ? width : 0
    const h = Number.isFinite(height) ? height : 0
    return `M${x},${y}h${w}v${h}h${-w}Z`
  }

  private transitionEntryBox(
    transition: d3.Transition<SVGGraphicsElement, unknown, any, any>,
    entry: StackedEntry,
    box: { x: number; y: number; width: number; height: number },
  ) {
    const t = transition.filter(function () {
      return this === entry.el
    })
    t.attr(SvgAttributes.X, box.x)
      .attr(SvgAttributes.Y, box.y)
      .attr(SvgAttributes.Width, box.width)
      .attr(SvgAttributes.Height, box.height)
      .attr('data-layout-x', box.x)
      .attr('data-layout-y', box.y)
      .attr('data-layout-width', box.width)
      .attr('data-layout-height', box.height)
    if (entry.el.tagName.toLowerCase() === SvgElements.Path) {
      t.attr(SvgAttributes.D, this.pathRectD(box.x, box.y, box.width, box.height))
    }
  }

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

  private collectEntries(scope: d3.Selection<d3.BaseType, JsonValue, d3.BaseType, JsonValue>) {
    const entries: StackedEntry[] = []
    scope
      .selectAll<SVGElement, JsonValue>(`${SvgElements.Rect},${SvgElements.Path}`)
      .filter(function () {
        const el = this as SVGElement
        if (el.classList.contains('background') || el.classList.contains(SvgClassNames.Annotation)) return false
        return true
      })
      .each(function () {
      const el = this as SVGGraphicsElement
      const target = el.getAttribute(DataAttributes.Target) || el.getAttribute(DataAttributes.Id)
      if (!target) return
      const seriesRaw = el.getAttribute(DataAttributes.Series)
      const series = seriesRaw != null && seriesRaw.trim().length > 0 ? seriesRaw.trim() : '__default__'
      const bbox = el.getBBox?.()
      const xAttr = Number(el.getAttribute(SvgAttributes.X))
      const widthAttr = Number(el.getAttribute(SvgAttributes.Width))
      const yAttr = Number(el.getAttribute(SvgAttributes.Y))
      const heightAttr = Number(el.getAttribute(SvgAttributes.Height))
      const ownerSvg = el.ownerSVGElement
      const nodeRect = el.getBoundingClientRect?.()
      const svgRect = ownerSvg?.getBoundingClientRect?.()
      const viewBox = ownerSvg?.viewBox?.baseVal
      const scaleX = viewBox && svgRect && svgRect.width > 0 ? viewBox.width / svgRect.width : NaN
      const scaleY = viewBox && svgRect && svgRect.height > 0 ? viewBox.height / svgRect.height : NaN
      const xBBox = Number(bbox?.x ?? NaN)
      const yBBox = Number(bbox?.y ?? NaN)
      const widthBBox = Number(bbox?.width ?? NaN)
      const heightBBox = Number(bbox?.height ?? NaN)
      const xRect =
        Number.isFinite(scaleX) && nodeRect && svgRect && viewBox
          ? (viewBox.x ?? 0) + (nodeRect.left - svgRect.left) * scaleX
          : NaN
      const yRect =
        Number.isFinite(scaleY) && nodeRect && svgRect && viewBox
          ? (viewBox.y ?? 0) + (nodeRect.top - svgRect.top) * scaleY
          : NaN
      const widthRect = Number.isFinite(scaleX) && nodeRect ? nodeRect.width * scaleX : NaN
      const heightRect = Number.isFinite(scaleY) && nodeRect ? nodeRect.height * scaleY : NaN
      const x =
        Number.isFinite(widthAttr) && widthAttr > 0 && Number.isFinite(xAttr)
          ? xAttr
          : Number.isFinite(xBBox)
            ? xBBox
            : xRect
      const width =
        Number.isFinite(widthAttr) && widthAttr > 0
          ? widthAttr
          : Number.isFinite(widthBBox) && widthBBox > 0
            ? widthBBox
            : widthRect
      const y =
        Number.isFinite(heightAttr) && heightAttr > 0 && Number.isFinite(yAttr)
          ? yAttr
          : Number.isFinite(yBBox)
            ? yBBox
            : yRect
      const height =
        Number.isFinite(heightAttr) && heightAttr > 0
          ? heightAttr
          : Number.isFinite(heightBBox) && heightBBox > 0
            ? heightBBox
            : heightRect
      const valueAttr = Number(el.getAttribute(DataAttributes.Value))
      const value = Number.isFinite(valueAttr) ? valueAttr : Number(bbox?.height ?? 0)
      if (!Number.isFinite(x) || !Number.isFinite(width) || width <= 0) return
      if (!Number.isFinite(y) || !Number.isFinite(height) || !Number.isFinite(value)) return
      if (!el.hasAttribute('data-layout-x')) el.setAttribute('data-layout-x', String(x))
      if (!el.hasAttribute('data-layout-width')) el.setAttribute('data-layout-width', String(width))
      if (!el.hasAttribute('data-layout-y')) el.setAttribute('data-layout-y', String(y))
      if (!el.hasAttribute('data-layout-height')) el.setAttribute('data-layout-height', String(height))
      entries.push({
        el,
        target: String(target),
        series,
        value,
        x: Number(el.getAttribute('data-layout-x') ?? x),
        width: Number(el.getAttribute('data-layout-width') ?? width),
        y: Number(el.getAttribute('data-layout-y') ?? y),
        height: Number(el.getAttribute('data-layout-height') ?? height),
      })
    })
    return entries
  }

  private resolveSeriesDomain(entries: StackedEntry[]) {
    const seen = new Set<string>()
    const out: string[] = []
    entries
      .slice()
      .sort((a, b) => {
        if (a.x !== b.x) return a.x - b.x
        if (a.y !== b.y) return b.y - a.y
        return 0
      })
      .forEach((entry) => {
        if (seen.has(entry.series)) return
        seen.add(entry.series)
        out.push(entry.series)
      })
    return out
  }

  private aggregateByTarget(entries: StackedEntry[]) {
    const map = new Map<string, number>()
    entries.forEach((entry) => {
      map.set(entry.target, (map.get(entry.target) ?? 0) + entry.value)
    })
    return map
  }

  private async relayoutTargets(
    scope: d3.Selection<d3.BaseType, JsonValue, d3.BaseType, JsonValue>,
    entries: StackedEntry[],
    visibleTargets: string[],
  ) {
    if (!entries.length) return
    const targetSet = new Set(visibleTargets)
    if (!visibleTargets.length) {
      const hideTransition = d3
        .selectAll<SVGGraphicsElement, unknown>(entries.map((entry) => entry.el) as SVGGraphicsElement[])
        .style('display', null)
        .transition()
        .duration(NON_SPLIT_EXIT_MS)
        .attr(SvgAttributes.Opacity, 0)
        .attr(SvgAttributes.Height, 0)
      const tickFade = scope
        .selectAll<SVGGElement, unknown>(SvgSelectors.XAxisTicks)
        .transition()
        .duration(NON_SPLIT_EXIT_MS)
        .attr(SvgAttributes.Opacity, 0)
      await Promise.all([waitTransition(hideTransition), waitTransition(tickFade)])
      d3.selectAll<SVGGraphicsElement, unknown>(entries.map((entry) => entry.el) as SVGGraphicsElement[]).style(
        'display',
        'none',
      )
      return
    }

    const maxRight = d3.max(entries.map((entry) => entry.x + entry.width)) ?? 0
    const minLeft = d3.min(entries.map((entry) => entry.x)) ?? 0
    const xScale = d3.scaleBand<string>().domain(visibleTargets).range([minLeft, maxRight]).padding(0.2)

    const hiddenEntries = entries.filter((entry) => !targetSet.has(entry.target))
    const shownEntries = entries.filter((entry) => targetSet.has(entry.target))

    const hideTransition = d3
      .selectAll<SVGGraphicsElement, unknown>(hiddenEntries.map((entry) => entry.el) as SVGGraphicsElement[])
      .style('display', null)
      .transition()
      .duration(NON_SPLIT_EXIT_MS)
      .attr(SvgAttributes.Opacity, 0)
    hiddenEntries.forEach((entry) => {
      this.transitionEntryBox(hideTransition, entry, {
        x: entry.x,
        y: entry.y + entry.height,
        width: entry.width,
        height: 0,
      })
    })

    const showSelection = d3
      .selectAll<SVGGraphicsElement, unknown>(shownEntries.map((entry) => entry.el) as SVGGraphicsElement[])
      .style('display', null)
      .attr(SvgAttributes.Opacity, 1)
    const showTransition = showSelection.transition().duration(NON_SPLIT_ENTER_MS + NON_SPLIT_UPDATE_MS)
    shownEntries.forEach((entry) => {
      const x = xScale(entry.target)
      if (x == null) return
      this.transitionEntryBox(showTransition, entry, {
        x,
        y: entry.y,
        width: xScale.bandwidth(),
        height: entry.height,
      })
      showTransition
        .filter(function () {
          return this === entry.el
        })
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

    await Promise.all([
      waitTransition(hideTransition),
      waitTransition(showTransition),
      waitTransition(tickTransition),
    ])
    d3.selectAll<SVGGraphicsElement, unknown>(hiddenEntries.map((entry) => entry.el) as SVGGraphicsElement[]).style(
      'display',
      'none',
    )
  }

  private async sortByAggregate(op: DrawOp) {
    const sortSpec = op.sort
    const by = sortSpec?.by ?? 'y'
    const order = (sortSpec?.order ?? 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc'
    const scope = this.selectScope(op.chartId)
    const entries = this.collectEntries(scope)
    if (!entries.length) return

    const targets = Array.from(new Set(entries.map((entry) => entry.target)))
    const aggregate = this.aggregateByTarget(entries)
    const sortedTargets = targets.slice().sort((a, b) => {
      if (by === 'x') return a < b ? -1 : a > b ? 1 : 0
      return (aggregate.get(a) ?? 0) - (aggregate.get(b) ?? 0)
    })
    if (order === 'desc') sortedTargets.reverse()
    await this.relayoutTargets(scope, entries, sortedTargets)
  }

  private barSegmentByAggregate(op: DrawOp) {
    const segment: DrawBarSegmentSpec | undefined = op.segment
    if (!segment) return
    const annotationKey = resolveAnnotationKeyForDrawOp(op)
    const annotationNodeId =
      (typeof op.meta?.nodeId === 'string' && op.meta.nodeId.trim()) ||
      (typeof (op as { id?: unknown }).id === 'string' ? String((op as { id?: string }).id ?? '').trim() : '') ||
      null
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
        .attr(DataAttributes.AnnotationKey, annotationKey ?? null)
        .attr(DataAttributes.AnnotationNodeId, annotationNodeId)
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

  private async filterByTarget(op: DrawOp) {
    const filterSpec = op.filter
    const scope = this.selectScope(op.chartId)
    const entries = this.collectEntries(scope)
    if (!entries.length) return

    const includeSet = filterSpec?.x?.include?.length ? new Set(filterSpec.x.include.map(String)) : null
    const excludeSet = filterSpec?.x?.exclude?.length ? new Set(filterSpec.x.exclude.map(String)) : null
    const aggregate = this.aggregateByTarget(entries)
    const targets = Array.from(new Set(entries.map((entry) => entry.target)))
    const selectKeys = new Set((op.select?.keys ?? []).map(String))

    const matchY = (target: string) => {
      if (!filterSpec?.y) return true
      const condition = normalizeComparisonCondition(filterSpec.y.op ?? undefined)
      const threshold = Number(filterSpec.y.value)
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

    const visibleTargets = targets.filter((target) => {
      if (includeSet && !includeSet.has(target)) return false
      if (excludeSet && excludeSet.has(target)) return false
      return matchY(target)
    })
    if (visibleTargets.length > 0 || includeSet || excludeSet || filterSpec?.y) {
      await this.relayoutTargets(scope, entries, visibleTargets)
      return
    }
    if (!selectKeys.size) return
    const fallbackTargets = new Set<string>()
    entries.forEach((entry) => {
      if (selectKeys.has(entry.target)) fallbackTargets.add(entry.target)
      if (selectKeys.has(`${entry.target}__${entry.series}`)) fallbackTargets.add(entry.target)
    })
    if (!fallbackTargets.size) return
    await this.relayoutTargets(scope, entries, Array.from(fallbackTargets))
  }

  private async filterBySeries(op: DrawOp) {
    if (op.action !== DrawAction.StackedFilterGroups) return
    const groupFilter = op.groupFilter
    if (!groupFilter) return
    const scope = this.selectScope(op.chartId)
    const entries = this.collectEntries(scope)
    if (!entries.length) return

    const seriesDomain = this.resolveSeriesDomain(entries)
    let visibleSeries = new Set(seriesDomain)
    if (!groupFilter.reset) {
      const includeCandidates =
        groupFilter.groups?.length
          ? groupFilter.groups
          : groupFilter.include?.length
            ? groupFilter.include
            : groupFilter.keep
      if (includeCandidates && includeCandidates.length) {
        visibleSeries = new Set(includeCandidates.map(String))
      } else if (groupFilter.exclude?.length) {
        const excluded = new Set(groupFilter.exclude.map(String))
        visibleSeries = new Set(seriesDomain.filter((series) => !excluded.has(series)))
      } else if (op.select?.keys?.length) {
        const keySet = new Set(op.select.keys.map(String))
        const matched = seriesDomain.filter((series) => keySet.has(series))
        if (matched.length) {
          visibleSeries = new Set(matched)
        } else {
          entries.forEach((entry) => {
            if (keySet.has(`${entry.target}__${entry.series}`)) visibleSeries.add(entry.series)
          })
        }
      }
    }

    const grouped = d3.group(entries, (entry) => entry.target)
    const hiddenEntries: StackedEntry[] = []
    const totalsForScale: number[] = []
    const svg = d3.select(this.container).select(SvgElements.Svg)
    const svgNode = svg.node() as SVGSVGElement | null
    const mapY = svgNode ? this.yValueToSvgY(scope, svgNode) : (_value: number) => null

    grouped.forEach((targetEntries) => {
      let positiveTotal = 0
      let negativeTotal = 0
      targetEntries.forEach((entry) => {
        if (!visibleSeries.has(entry.series)) return
        if (entry.value >= 0) positiveTotal += entry.value
        else negativeTotal += entry.value
      })
      totalsForScale.push(positiveTotal, negativeTotal)
      targetEntries.forEach((entry) => {
        if (!visibleSeries.has(entry.series)) hiddenEntries.push(entry)
      })
    })

    const yScale = this.buildNiceYScale(scope, totalsForScale)
    const resolveY = (value: number) => {
      if (yScale) return yScale(value)
      return mapY(value)
    }
    const fallbackZeroY = d3.max(entries.map((entry) => entry.y + entry.height)) ?? 0
    const zeroY = resolveY(0) ?? fallbackZeroY
    const shownEntries: Array<{ entry: StackedEntry; y: number; height: number }> = []
    grouped.forEach((targetEntries) => {
      const bySeries = new Map<string, StackedEntry>()
      targetEntries.forEach((entry) => bySeries.set(entry.series, entry))
      const positiveVisible = seriesDomain
        .map((series) => bySeries.get(series))
        .filter((entry): entry is StackedEntry => {
          if (!entry) return false
          return visibleSeries.has(entry.series) && entry.value >= 0
        })
        .sort((a, b) => b.y - a.y)
      const negativeVisible = seriesDomain
        .map((series) => bySeries.get(series))
        .filter((entry): entry is StackedEntry => {
          if (!entry) return false
          return visibleSeries.has(entry.series) && entry.value < 0
        })
        .sort((a, b) => a.y - b.y)
      let positive = 0
      let negative = 0
      positiveVisible.forEach((entry) => {
        const start = positive
        const end = start + entry.value
        positive = end
        const y0 = resolveY(start) ?? zeroY
        const y1 = resolveY(end) ?? zeroY
        shownEntries.push({ entry, y: Math.min(y0, y1), height: Math.abs(y0 - y1) })
      })
      negativeVisible.forEach((entry) => {
        const start = negative
        const end = start + entry.value
        negative = end
        const y0 = resolveY(start) ?? zeroY
        const y1 = resolveY(end) ?? zeroY
        shownEntries.push({ entry, y: Math.min(y0, y1), height: Math.abs(y0 - y1) })
      })
    })

    const hideTransition = d3
      .selectAll<SVGGraphicsElement, unknown>(hiddenEntries.map((entry) => entry.el) as SVGGraphicsElement[])
      .style('display', null)
      .transition()
      .duration(NON_SPLIT_EXIT_MS)
      .attr(SvgAttributes.Opacity, 0)
    hiddenEntries.forEach((entry) => {
      this.transitionEntryBox(hideTransition, entry, {
        x: entry.x,
        y: zeroY,
        width: entry.width,
        height: 0,
      })
    })

    const shownSelection = d3
      .selectAll<SVGGraphicsElement, unknown>(shownEntries.map((item) => item.entry.el) as SVGGraphicsElement[])
      .style('display', null)
      .attr(SvgAttributes.Opacity, 1)
    const shownTransition = shownSelection.transition().duration(NON_SPLIT_ENTER_MS + NON_SPLIT_UPDATE_MS)
    shownEntries.forEach((item) => {
      this.transitionEntryBox(shownTransition, item.entry, {
        x: item.entry.x,
        y: item.y,
        width: item.entry.width,
        height: item.height,
      })
      shownTransition
        .filter(function () {
          return this === item.entry.el
        })
        .attr(SvgAttributes.Opacity, 1)
    })

    const yAxis = scope.select<SVGGElement>(SvgSelectors.YAxisGroup)
    const yAxisTransition =
      yScale && !yAxis.empty()
        ? yAxis.transition().duration(NON_SPLIT_ENTER_MS + NON_SPLIT_UPDATE_MS).call(d3.axisLeft(yScale).ticks(5) as any)
        : null

    await Promise.all([
      waitTransition(hideTransition),
      waitTransition(shownTransition),
      yAxisTransition ? waitTransition(yAxisTransition) : Promise.resolve(),
    ])
    d3.selectAll<SVGGraphicsElement, unknown>(hiddenEntries.map((entry) => entry.el) as SVGGraphicsElement[]).style(
      'display',
      'none',
    )
  }

  private async sumStacked(op: DrawOp) {
    const scope = this.selectScope(op.chartId)
    const entries = this.collectEntries(scope)
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
    const minLeft = d3.min(entries.map((entry) => entry.x)) ?? 0
    const maxRight = d3.max(entries.map((entry) => entry.x + entry.width)) ?? 0
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
    const zeroY = resolveY(0) ?? (d3.max(entries.map((entry) => entry.y + entry.height)) ?? 0)

    const anchorBySeries = new Map<string, StackedEntry>()
    entries
      .slice()
      .sort((a, b) => (a.x !== b.x ? a.x - b.x : a.y - b.y))
      .forEach((entry) => {
        if (!anchorBySeries.has(entry.series)) {
          anchorBySeries.set(entry.series, entry)
        }
      })

    const hiddenEntries: StackedEntry[] = []
    entries.forEach((entry) => {
      if (anchorBySeries.get(entry.series)?.el !== entry.el) hiddenEntries.push(entry)
    })
    const hiddenSelection = d3.selectAll<SVGGraphicsElement, unknown>(hiddenEntries.map((entry) => entry.el) as SVGGraphicsElement[])
    const hideTransition = hiddenSelection
      .style('display', null)
      .transition()
      .duration(NON_SPLIT_EXIT_MS)
      .attr(SvgAttributes.Opacity, 0)
    hiddenEntries.forEach((entry) => {
      this.transitionEntryBox(hideTransition, entry, {
        x: entry.x,
        y: zeroY,
        width: entry.width,
        height: 0,
      })
    })

    let positive = 0
    let negative = 0
    const shownEntries: Array<{ entry: StackedEntry; y: number; height: number; value: number }> = []
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
        .attr(DataAttributes.Target, sumLabel)
        .attr(DataAttributes.Id, `${sumLabel}__${item.entry.series}`)
        .attr(DataAttributes.Value, String(item.value))
      shownTransition
        .filter(function () {
          return this === item.entry.el
        })
        .attr(SvgAttributes.Opacity, 1)
      this.transitionEntryBox(shownTransition, item.entry, {
        x: targetX,
        y: item.y,
        width: targetWidth,
        height: item.height,
      })
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

  override run(op: DrawOp): void | Promise<void> {
    const hasGroup = op.group != null && String(op.group).trim() !== ''
    if (!hasGroup && op.action === DrawAction.Sort) {
      return this.sortByAggregate(op)
    }
    if (!hasGroup && op.action === DrawAction.Filter) {
      return this.filterByTarget(op)
    }
    if (op.action === DrawAction.StackedFilterGroups) {
      return this.filterBySeries(op)
    }
    if (op.action === DrawAction.Sum) {
      return this.sumStacked(op)
    }
    if (!hasGroup && op.action === DrawAction.BarSegment) {
      this.barSegmentByAggregate(op)
      return
    }
    return super.run(op)
  }
}

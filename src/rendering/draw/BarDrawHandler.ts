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
import { resolveAnnotationKeyForDrawOp } from './annotationKey'
import { normalizeComparisonCondition } from './utils/comparison'
import { NON_SPLIT_ENTER_MS, NON_SPLIT_EXIT_MS, NON_SPLIT_UPDATE_MS } from './animationPolicy'
import { ensureAnnotationLayer } from './utils/annotationLayer'

async function waitTransition(transition: d3.Transition<any, any, any, any>) {
  try {
    await transition.end()
  } catch {
    // interrupted transitions are acceptable in interactive workflows
  }
}

/**
 * Draw handler for bar-like charts.
 * Relies on data-target / data-id attributes set on rect marks.
 */
export class BarDrawHandler extends BaseDrawHandler {
  protected formatNumber(value: number) {
    if (!Number.isFinite(value)) return ''
    let text = value.toFixed(2)
    text = text.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '')
    return text === '-0' ? '0' : text
  }

  protected selectElements(select?: DrawSelect, chartId?: string) {
    const scope = this.selectScope(chartId)
    const mark = !select?.mark || select.mark === DrawMark.Rect ? `${SvgElements.Rect},${SvgElements.Path}` : select.mark
    const selection = this.filterDataMarks(scope.selectAll<SVGElement, JsonValue>(mark))
    return this.filterBySelect(selection, select)
  }

  protected allMarks(chartId?: string) {
    const scope = this.selectScope(chartId)
    return this.filterDataMarks(scope.selectAll<SVGElement, JsonValue>(`${SvgElements.Rect},${SvgElements.Path}`))
  }

  protected defaultColor() {
    return '#69b3a2'
  }

  protected getLocalAnnotationLayer(
    scope: d3.Selection<d3.BaseType, JsonValue, d3.BaseType, JsonValue>,
    chartId?: string,
  ) {
    const firstBar = this.selectBarMarks(scope).node()
    const parent = (firstBar?.parentElement as Element | null) ?? (scope.node() as Element | null)
    if (!parent) return null
    return d3.select(ensureAnnotationLayer(parent, chartId))
  }

  private async sort(op: DrawOp) {
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

    const barTransition = this.applyTransition(
      d3.selectAll<SVGRectElement, unknown>(sorted.map((item) => item.el) as SVGRectElement[]),
    ).duration(NON_SPLIT_UPDATE_MS)
    sorted.forEach((item, idx) => {
      const targetX = xPositions[idx]
      d3.select(item.el).attr('data-layout-x', String(targetX))
      barTransition.filter(function () {
        return this === item.el
      }).attr(SvgAttributes.X, targetX)
      labelToX.set(item.label, targetX)
    })

    // Reposition x-axis ticks to match sorted bars
    const ticks = scope.selectAll<SVGGElement, unknown>(SvgSelectors.XAxisTicks)
    const tickTransition = this.applyTransition(ticks).duration(NON_SPLIT_UPDATE_MS)
    ticks.each(function () {
      const tick = d3.select(this)
      const text = tick.select(SvgElements.Text).text().trim()
      const targetX = labelToX.get(text)
      if (targetX == null) return
      tickTransition.filter(function () {
        return this === tick.node()
      }).attr(SvgAttributes.Transform, `translate(${targetX + bandWidth / 2},0)`)
    })
    await Promise.all([waitTransition(barTransition), waitTransition(tickTransition)])
  }

  private barSegment(op: DrawOp) {
    const segment: DrawBarSegmentSpec | undefined = op.segment
    if (!segment) return
    const annotationKey = resolveAnnotationKeyForDrawOp(op)
    const annotationNodeId =
      (typeof op.meta?.nodeId === 'string' && op.meta.nodeId.trim()) ||
      (typeof (op as { id?: unknown }).id === 'string' ? String((op as { id?: string }).id ?? '').trim() : '') ||
      null

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
      (this.filterBySelect(
        barsAll as unknown as d3.Selection<SVGElement, JsonValue, d3.BaseType, JsonValue>,
        op.select,
      ) as unknown as d3.Selection<SVGRectElement, JsonValue, d3.BaseType, JsonValue>)

    bars.each((_, index, nodes) => {
      const el = nodes[index] as SVGRectElement

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
      const segmentRect = svg
        .append(SvgElements.Rect)
        .attr(SvgAttributes.Class, `${SvgClassNames.Annotation} ${SvgClassNames.BarSegmentAnnotation}`)
        .attr(DataAttributes.ChartId, op.chartId ?? null)
        .attr(DataAttributes.AnnotationKey, annotationKey ?? null)
        .attr(DataAttributes.AnnotationNodeId, annotationNodeId)
        .attr(SvgAttributes.X, x)
        .attr(SvgAttributes.Y, segY)
        .attr(SvgAttributes.Width, width)
        .attr(SvgAttributes.Height, segH)
        .attr(SvgAttributes.Fill, style?.fill ?? '#ef4444')
        .attr(SvgAttributes.Opacity, 0)
        .attr(SvgAttributes.Stroke, style?.stroke ?? null)
        .attr(SvgAttributes.StrokeWidth, style?.strokeWidth ?? null)
      this.applyTransition(segmentRect).attr(SvgAttributes.Opacity, style?.opacity ?? 1)
    })
  }

  private async filter(op: DrawOp) {
    const filterSpec = op.filter
    const svg = d3.select(this.container).select(SvgElements.Svg)
    const scope = this.selectScope(op.chartId)
    const bars = this.selectBarMarks(scope)
    if (bars.empty()) return

    const entries = bars.nodes().map((node) => {
      const el = node as SVGRectElement
      const x = Number(el.getAttribute(SvgAttributes.X))
      const width = Number(el.getAttribute(SvgAttributes.Width))
      const y = Number(el.getAttribute(SvgAttributes.Y))
      const height = Number(el.getAttribute(SvgAttributes.Height))
      if (Number.isFinite(x) && !el.hasAttribute('data-layout-x')) el.setAttribute('data-layout-x', String(x))
      if (Number.isFinite(width) && !el.hasAttribute('data-layout-width')) el.setAttribute('data-layout-width', String(width))
      if (Number.isFinite(y) && !el.hasAttribute('data-layout-y')) el.setAttribute('data-layout-y', String(y))
      if (Number.isFinite(height) && !el.hasAttribute('data-layout-height')) el.setAttribute('data-layout-height', String(height))
      return {
        el,
        x: Number(el.getAttribute('data-layout-x') ?? x),
        width: Number(el.getAttribute('data-layout-width') ?? width),
        y: Number(el.getAttribute('data-layout-y') ?? y),
        height: Number(el.getAttribute('data-layout-height') ?? height),
        label: el.getAttribute(DataAttributes.Target) || el.getAttribute(DataAttributes.Id) || '',
        value: Number(el.getAttribute(DataAttributes.Value)),
      }
    })
    const plotW = d3.max(entries.map((e) => e.x + e.width)) ?? 0
    if (!Number.isFinite(plotW) || plotW <= 0) return

    const xRules: Array<{ kind: 'include' | 'exclude'; set: Set<string> }> = []
    if (filterSpec?.x) {
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
      if (!filterSpec?.y) return true
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
    if (!kept.length && op.select?.keys?.length) {
      const keySet = new Set(op.select.keys.map(String))
      const fallback = entries.filter((entry) => keySet.has(entry.label))
      if (fallback.length) {
        kept.splice(0, kept.length, ...fallback)
      }
    }

    const svgNode = svg.node() as SVGSVGElement | null
    const zeroY = (() => {
      if (!svgNode) return d3.max(entries.map((entry) => entry.y + entry.height)) ?? 0
      const mapY = this.yValueToSvgY(scope, svgNode)
      return mapY(0) ?? (d3.max(entries.map((entry) => entry.y + entry.height)) ?? 0)
    })()

    const keptSet = new Set(kept.map((item) => item.label))
    const removed = entries.filter((entry) => !keptSet.has(entry.label))
    const removedSelection = d3.selectAll<SVGRectElement, unknown>(removed.map((entry) => entry.el) as SVGRectElement[])
    const exitTransition = removedSelection
      .style('display', null)
      .transition()
      .duration(NON_SPLIT_EXIT_MS)
      .attr(SvgAttributes.Opacity, 0)
      .attr(SvgAttributes.Y, zeroY)
      .attr(SvgAttributes.Height, 0)
    await waitTransition(exitTransition)
    removedSelection.style('display', 'none')

    const ticks = scope.selectAll<SVGGElement, unknown>(SvgSelectors.XAxisTicks)

    if (!kept.length) {
      const tickFade = ticks.transition().duration(NON_SPLIT_EXIT_MS).attr(SvgAttributes.Opacity, 0)
      await waitTransition(tickFade)
      return
    }

    const scale = d3.scaleBand<string>().domain(kept.map((d) => d.label)).range([0, plotW]).padding(0.2)
    const plotHeight =
      Number(svg.attr(DataAttributes.PlotHeight)) || (d3.max(entries.map((entry) => entry.y + entry.height)) ?? 0)
    const keptValues = kept.map((entry) => Number(entry.value)).filter(Number.isFinite)
    const minValue = d3.min(keptValues)
    const maxValue = d3.max(keptValues)
    let domainMin = Math.min(0, Number.isFinite(minValue ?? NaN) ? Number(minValue) : 0)
    let domainMax = Math.max(0, Number.isFinite(maxValue ?? NaN) ? Number(maxValue) : 0)
    if (domainMin === domainMax) domainMax = domainMin + 1
    const yScale = d3.scaleLinear().domain([domainMin, domainMax]).nice().range([plotHeight, 0])
    const nextZeroY = yScale(0)
    const keptSelection = d3.selectAll<SVGRectElement, unknown>(kept.map((item) => item.el) as SVGRectElement[])
    keptSelection.style('display', null).attr(SvgAttributes.Opacity, 1)
    const enterTransition = keptSelection
      .transition()
      .duration(NON_SPLIT_ENTER_MS + NON_SPLIT_UPDATE_MS)
      .attr(SvgAttributes.X, (d, i) => {
        const item = kept[i]
        return scale(item.label) ?? item.x
      })
      .attr(SvgAttributes.Width, scale.bandwidth())
      .attr(SvgAttributes.Y, (d, i) => (kept[i].value >= 0 ? yScale(kept[i].value) : nextZeroY))
      .attr(SvgAttributes.Height, (d, i) => Math.abs(yScale(kept[i].value) - nextZeroY))
      .attr(SvgAttributes.Opacity, 1)

    const tickTransition = ticks.transition().duration(NON_SPLIT_UPDATE_MS)
    const yAxis = scope.select<SVGGElement>(SvgSelectors.YAxisGroup)
    const yAxisTransition =
      !yAxis.empty()
        ? yAxis.transition().duration(NON_SPLIT_UPDATE_MS).call(d3.axisLeft(yScale).ticks(5) as any)
        : null
    ticks.each(function () {
      const tick = d3.select(this)
      const text = tick.select(SvgElements.Text).text().trim()
      const x = scale(text)
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
        .attr(SvgAttributes.Transform, `translate(${x + scale.bandwidth() / 2},0)`)
      tick.select(SvgElements.Text).attr(SvgAttributes.Transform, 'rotate(-45)').style('text-anchor', 'end')
    })
    await Promise.all([
      waitTransition(enterTransition),
      waitTransition(tickTransition),
      yAxisTransition ? waitTransition(yAxisTransition) : Promise.resolve(),
    ])
    kept.forEach((entry) => {
      const x = scale(entry.label) ?? entry.x
      const y = entry.value >= 0 ? yScale(entry.value) : nextZeroY
      const height = Math.abs(yScale(entry.value) - nextZeroY)
      entry.el.setAttribute('data-layout-x', String(x))
      entry.el.setAttribute('data-layout-width', String(scale.bandwidth()))
      entry.el.setAttribute('data-layout-y', String(y))
      entry.el.setAttribute('data-layout-height', String(height))
    })
  }

  private async sum(op: DrawOp) {
    const scope = this.selectScope(op.chartId)
    const bars = this.selectBarMarks(scope)
    if (bars.empty()) return

    const entries = bars
      .nodes()
      .map((node) => {
        const el = node as SVGRectElement
        const x = Number(el.getAttribute(SvgAttributes.X))
        const width = Number(el.getAttribute(SvgAttributes.Width))
        const y = Number(el.getAttribute(SvgAttributes.Y))
        const height = Number(el.getAttribute(SvgAttributes.Height))
        const value = Number(el.getAttribute(DataAttributes.Value))
        const label = el.getAttribute(DataAttributes.Target) || el.getAttribute(DataAttributes.Id) || ''
        if (!Number.isFinite(x) || !Number.isFinite(width) || width <= 0) return null
        if (!Number.isFinite(y) || !Number.isFinite(height)) return null
        if (!Number.isFinite(value)) return null
        return { el, x, width, y, height, value, label }
      })
      .filter((entry): entry is { el: SVGRectElement; x: number; width: number; y: number; height: number; value: number; label: string } => entry != null)
    if (!entries.length) return

    const total = entries.reduce((acc, entry) => acc + entry.value, 0)
    if (!Number.isFinite(total)) return

    const minLeft = d3.min(entries.map((entry) => entry.x)) ?? 0
    const maxRight = d3.max(entries.map((entry) => entry.x + entry.width)) ?? 0
    if (!Number.isFinite(minLeft) || !Number.isFinite(maxRight) || maxRight <= minLeft) return

    const sumLabel = String(op.sum?.label ?? 'Sum')

    const svg = d3.select(this.container).select(SvgElements.Svg)
    const svgNode = svg.node() as SVGSVGElement | null
    if (!svgNode) return
    const yScale = this.buildNiceYScale(scope, [total])
    const mapY = this.yValueToSvgY(scope, svgNode)
    const resolveY = (value: number) => (yScale ? yScale(value) : mapY(value))
    const zeroY = resolveY(0) ?? (d3.max(entries.map((entry) => entry.y + entry.height)) ?? 0)
    const sumY = resolveY(total) ?? zeroY
    const barTop = Math.min(sumY, zeroY)
    const barHeight = Math.abs(sumY - zeroY)

    const targetScale = d3.scaleBand<string>().domain([sumLabel]).range([minLeft, maxRight]).padding(0.25)
    const targetX = targetScale(sumLabel) ?? minLeft
    const targetWidth = targetScale.bandwidth() || maxRight - minLeft

    // Preserve each bar color and animate bars into a stacked single-column composition.
    const ordered = entries.slice().sort((a, b) => a.x - b.x)
    const stackedLayout = new Map<SVGRectElement, { y: number; height: number }>()
    let positiveBase = 0
    let negativeBase = 0
    ordered.forEach((entry) => {
      const value = entry.value
      const start = value >= 0 ? positiveBase : negativeBase
      const end = start + value
      if (value >= 0) positiveBase = end
      else negativeBase = end
      const yStart = resolveY(start)
      const yEnd = resolveY(end)
      if (yStart == null || yEnd == null) return
      const y = Math.min(yStart, yEnd)
      const height = Math.abs(yEnd - yStart)
      stackedLayout.set(entry.el, { y, height })
    })

    const allSelection = d3.selectAll<SVGRectElement, unknown>(ordered.map((entry) => entry.el) as SVGRectElement[])
    allSelection.style('display', null).attr(SvgAttributes.Opacity, 1)
    const morphTransition = allSelection
      .transition()
      .duration(NON_SPLIT_ENTER_MS + NON_SPLIT_UPDATE_MS)
      .attr(SvgAttributes.X, targetX)
      .attr(SvgAttributes.Width, targetWidth)
      .attr(SvgAttributes.Y, function () {
        const layout = stackedLayout.get(this as SVGRectElement)
        return layout ? layout.y : barTop
      })
      .attr(SvgAttributes.Height, function () {
        const layout = stackedLayout.get(this as SVGRectElement)
        return layout ? layout.height : barHeight
      })
      .attr(SvgAttributes.Opacity, 1)

    // Treat the stacked column as a single semantic target/value for later ops.
    allSelection
      .attr(DataAttributes.Target, sumLabel)
      .attr(DataAttributes.Id, sumLabel)
      .attr(DataAttributes.Value, String(total))

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
      waitTransition(morphTransition),
      waitTransition(tickTransition),
      yAxisTransition ? waitTransition(yAxisTransition) : Promise.resolve(),
    ])

    const textValue = this.formatNumber(total)
    if (!textValue) return
    const annotationLayer = this.getLocalAnnotationLayer(scope, op.chartId)
    if (!annotationLayer) return
    annotationLayer.selectAll<SVGTextElement, unknown>('text.sum-value-annotation').remove()
    const label = annotationLayer
      .append(SvgElements.Text)
      .attr(SvgAttributes.Class, `${SvgClassNames.Annotation} ${SvgClassNames.TextAnnotation} sum-value-annotation`)
      .attr(DataAttributes.ChartId, op.chartId ?? null)
      .attr(SvgAttributes.X, targetX + targetWidth / 2)
      .attr(SvgAttributes.Y, barTop - 5)
      .attr(SvgAttributes.TextAnchor, 'middle')
      .attr(SvgAttributes.DominantBaseline, 'ideographic')
      .attr(SvgAttributes.Fill, '#111827')
      .attr(SvgAttributes.FontSize, 12)
      .attr(SvgAttributes.FontWeight, 'bold')
      .attr(SvgAttributes.Opacity, 0)
      .text(textValue)
    this.applyTransition(label).attr(SvgAttributes.Opacity, 1)
  }

  run(op: DrawOp): void | Promise<void> {
    if (op.action === DrawAction.BarSegment) {
      this.barSegment(op)
      return
    }
    if (op.action === DrawAction.Sort) {
      return this.sort(op)
    }
    if (op.action === DrawAction.Filter) {
      return this.filter(op)
    }
    if (op.action === DrawAction.Sum) {
      return this.sum(op)
    }
    return super.run(op)
  }
}

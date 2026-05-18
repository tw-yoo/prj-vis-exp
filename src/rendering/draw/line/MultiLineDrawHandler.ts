import * as d3 from 'd3'
import type { JsonValue } from '../../../types'
import { DataAttributes, SvgAttributes, SvgClassNames, SvgElements, SvgSelectors } from '../../interfaces'
import { LineDrawHandler } from '../LineDrawHandler'
import { DrawAction, DrawComparisonOperators, type DrawOp, type DrawSelect } from '../types'
import { NON_SPLIT_ENTER_MS, NON_SPLIT_EXIT_MS, NON_SPLIT_UPDATE_MS } from '../animationPolicy'
import { ensureAnnotationLayer } from '../utils/annotationLayer'

type LinePointEntry = {
  el: SVGCircleElement
  target: string
  series: string | null
  value: number
  x: number
  y: number
}

type SeriesPathEntry = {
  el: SVGPathElement
  series: string | null
}

type PathTweenPoint = {
  x: number
  y: number
}

type EnteringPathEntry = {
  original: SVGPathElement
  overlay: SVGPathElement
  targetD: string
  finalOpacity: number
  currentPoints: PathTweenPoint[]
  targetPoints: PathTweenPoint[]
}

async function waitTransition(transition: d3.Transition<any, any, any, any>) {
  try {
    await transition.end()
  } catch {
    // interrupted transitions are acceptable in interactive workflows
  }
}

function preserveCurrentOpacity(el: SVGElement, fallback = 1) {
  const rawOpacity = el.getAttribute(SvgAttributes.Opacity)
  const opacity = rawOpacity == null ? Number.NaN : Number(rawOpacity)
  return Number.isFinite(opacity) ? opacity : fallback
}

function buildLinePath(points: PathTweenPoint[]) {
  return (
    d3
      .line<PathTweenPoint>()
      .x((point) => point.x)
      .y((point) => point.y)(points) ?? ''
  )
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

  private collectSeriesPaths(chartId?: string) {
    const scope = this.selectScope(chartId)
    const paths = this.filterDataMarks(
      scope.selectAll<SVGElement, JsonValue>(`${SvgElements.Path}[${DataAttributes.Series}]`),
    )
    if (paths.empty()) return [] as SeriesPathEntry[]
    return paths
      .nodes()
      .map((node) => {
        const el = node as SVGPathElement
        const seriesRaw = el.getAttribute(DataAttributes.Series)
        return {
          el,
          series: typeof seriesRaw === 'string' && seriesRaw.trim().length > 0 ? seriesRaw.trim() : null,
        }
      })
  }

  private collectPointEntries(chartId?: string) {
    const scope = this.selectScope(chartId)
    const points = this.filterDataMarks(
      scope.selectAll<SVGElement, JsonValue>(`${SvgElements.Circle}[${DataAttributes.Target}][${DataAttributes.Value}]`),
    )
    if (points.empty()) return [] as LinePointEntry[]
    return points
      .nodes()
      .map((node) => {
        const el = node as SVGCircleElement
        const target = el.getAttribute(DataAttributes.Target) || el.getAttribute(DataAttributes.Id)
        const value = Number(el.getAttribute(DataAttributes.Value))
        const x = Number(el.getAttribute(SvgAttributes.CX))
        const y = Number(el.getAttribute(SvgAttributes.CY))
        if (!target || !Number.isFinite(value) || !Number.isFinite(x) || !Number.isFinite(y)) return null
        const seriesRaw = el.getAttribute(DataAttributes.Series)
        return {
          el,
          target: String(target),
          series: typeof seriesRaw === 'string' && seriesRaw.trim().length > 0 ? seriesRaw.trim() : null,
          value,
          x,
          y,
        }
      })
      .filter((entry): entry is LinePointEntry => entry !== null)
  }

  private async filter(op: DrawOp) {
    const svg = d3.select(this.container).select<SVGSVGElement>(SvgElements.Svg)
    if (svg.empty()) return
    const filterSpec = op.filter
    if (!filterSpec) return
    const entries = this.collectPointEntries(op.chartId)
    if (!entries.length) return
    const seriesPaths = this.collectSeriesPaths(op.chartId)

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
    const hiddenNodes = hidden.map((entry) => entry.el)
    const keptNodes = kept.map((entry) => entry.el)

    if (!kept.length) {
      const pointTransition = d3
        .selectAll<SVGCircleElement, unknown>(entries.map((entry) => entry.el))
        .style('display', null)
        .transition()
        .duration(NON_SPLIT_EXIT_MS)
        .attr(SvgAttributes.Opacity, 0)
      const pathTransition = d3
        .selectAll<SVGPathElement, unknown>(seriesPaths.map((entry) => entry.el))
        .style('display', null)
        .transition()
        .duration(NON_SPLIT_EXIT_MS)
        .attr(SvgAttributes.Opacity, 0)
      const scope = this.selectScope(op.chartId)
      const ticks = scope.selectAll<SVGGElement, unknown>(SvgSelectors.XAxisTicks)
      const tickTransition = ticks.transition().duration(NON_SPLIT_EXIT_MS).attr(SvgAttributes.Opacity, 0)
      await Promise.all([waitTransition(pointTransition), waitTransition(pathTransition), waitTransition(tickTransition)])
      d3.selectAll<SVGCircleElement, unknown>(entries.map((entry) => entry.el)).style('display', 'none')
      d3.selectAll<SVGPathElement, unknown>(seriesPaths.map((entry) => entry.el)).style('display', 'none')
      return
    }

    const plotW = Number(svg.attr(DataAttributes.PlotWidth))
    if (!Number.isFinite(plotW) || plotW <= 0) return
    const filterDuration = NON_SPLIT_ENTER_MS + NON_SPLIT_UPDATE_MS
    const fastExitDuration = Math.max(1, Math.round(filterDuration / 2))
    const targetOrder = Array.from(new Set(entries.slice().sort((a, b) => a.x - b.x).map((entry) => entry.target)))
    const orderIndex = new Map(targetOrder.map((target, index) => [target, index]))
    const targetDomain = Array.from(new Set(kept.map((entry) => entry.target))).sort(
      (a, b) => (orderIndex.get(a) ?? 0) - (orderIndex.get(b) ?? 0),
    )
    const scale = d3.scalePoint<string>().domain(targetDomain).range([0, plotW]).padding(0.5)

    const hiddenPointTransition = d3
      .selectAll<SVGCircleElement, unknown>(hiddenNodes)
      .style('display', null)
      .transition()
      .duration(fastExitDuration)
      .attr(SvgAttributes.Opacity, 0)

    const keptPointTransition = d3
      .selectAll<SVGCircleElement, unknown>(keptNodes)
      .style('display', null)
      .transition()
      .duration(filterDuration)

    kept.forEach((entry) => {
      const x = scale(entry.target)
      if (x == null) return
      keptPointTransition
        .filter(function () {
          return this === entry.el
        })
        .attr(SvgAttributes.CX, x)
        .attr(SvgAttributes.Opacity, preserveCurrentOpacity(entry.el, 0.85))
    })

    const keptBySeries = d3.group(kept, (entry) => entry.series ?? '')
    const hiddenPaths: SVGPathElement[] = []
    const visiblePaths: SVGPathElement[] = []
    const enteringPaths: EnteringPathEntry[] = []
    const originalPathExitTransition = d3
      .selectAll<SVGPathElement, unknown>(seriesPaths.map((entry) => entry.el))
      .style('display', null)
      .transition()
      .duration(fastExitDuration)

    seriesPaths.forEach((entry) => {
      const seriesKey = entry.series ?? ''
      const seriesPoints = (keptBySeries.get(seriesKey) ?? []).slice().sort(
        (a, b) => (orderIndex.get(a.target) ?? 0) - (orderIndex.get(b.target) ?? 0),
      )
      if (seriesPoints.length < 2) {
        hiddenPaths.push(entry.el)
        originalPathExitTransition
          .filter(function () {
            return this === entry.el
          })
          .attr(SvgAttributes.Opacity, 0)
        return
      }
      visiblePaths.push(entry.el)
      const currentPoints: PathTweenPoint[] = seriesPoints.map((point) => ({ x: point.x, y: point.y }))
      const targetPoints: PathTweenPoint[] = seriesPoints.map((point) => ({
        x: scale(point.target) ?? point.x,
        y: point.y,
      }))
      const currentD = buildLinePath(currentPoints)
      const targetD = buildLinePath(targetPoints)
      const finalOpacity = preserveCurrentOpacity(entry.el)
      const originalPath = d3.select(entry.el)
      originalPath.attr(SvgAttributes.D, currentD).attr(SvgAttributes.Opacity, finalOpacity)
      const overlay = entry.el.cloneNode(false) as SVGPathElement
      overlay.setAttribute(SvgAttributes.D, targetD)
      overlay.setAttribute(SvgAttributes.Opacity, '0')
      overlay.style.display = ''
      entry.el.parentNode?.appendChild(overlay)
      enteringPaths.push({
        original: entry.el,
        overlay,
        targetD,
        finalOpacity,
        currentPoints,
        targetPoints,
      })
      originalPathExitTransition
        .filter(function () {
          return this === entry.el
        })
        .attr(SvgAttributes.Opacity, 0)
    })

    const enteringTransition = d3
      .selectAll<SVGPathElement, unknown>(enteringPaths.map((entry) => entry.overlay))
      .transition()
      .duration(filterDuration)

    enteringPaths.forEach((entry) => {
      enteringTransition
        .filter(function () {
          return this === entry.overlay
        })
        .attrTween(SvgAttributes.D, () => {
          const xInterpolators = entry.currentPoints.map((point, index) =>
            d3.interpolateNumber(point.x, entry.targetPoints[index]?.x ?? point.x),
          )
          return (t) =>
            buildLinePath(
              entry.currentPoints.map((point, index) => ({
                x: xInterpolators[index]?.(t) ?? point.x,
                y: point.y,
              })),
            )
        })
        .attr(SvgAttributes.Opacity, entry.finalOpacity)
    })

    const scope = this.selectScope(op.chartId)
    const ticks = scope.selectAll<SVGGElement, unknown>(SvgSelectors.XAxisTicks)
    const tickTransition = ticks.transition().duration(filterDuration)
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

    await Promise.all([
      waitTransition(hiddenPointTransition),
      waitTransition(keptPointTransition),
      waitTransition(originalPathExitTransition),
      waitTransition(enteringTransition),
      waitTransition(tickTransition),
    ])
    d3.selectAll<SVGCircleElement, unknown>(hiddenNodes).style('display', 'none')
    d3.selectAll<SVGCircleElement, unknown>(keptNodes).style('display', null)
    d3.selectAll<SVGPathElement, unknown>(hiddenPaths).style('display', 'none')
    d3.selectAll<SVGPathElement, unknown>(visiblePaths).style('display', null)
    enteringPaths.forEach((entry) => {
      d3.select(entry.original)
        .attr(SvgAttributes.D, entry.targetD)
        .attr(SvgAttributes.Opacity, entry.finalOpacity)
        .style('display', null)
      entry.overlay.remove()
    })
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

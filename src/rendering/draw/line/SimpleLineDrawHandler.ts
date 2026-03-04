import * as d3 from 'd3'
import type { JsonValue } from '../../../types'
import { DataAttributes, SvgAttributes, SvgClassNames, SvgElements, SvgSelectors } from '../../interfaces'
import { LineDrawHandler } from '../LineDrawHandler'
import { DrawAction, DrawComparisonOperators, DrawRectModes, type DrawOp, type DrawSelect } from '../types'
import { ensureAnnotationLayer } from '../utils/annotationLayer'
import { NON_SPLIT_ENTER_MS, NON_SPLIT_EXIT_MS, NON_SPLIT_UPDATE_MS } from '../animationPolicy'

type TraceSpec = {
  pair: { x: [string, string] }
  style?: { stroke?: string; strokeWidth?: number; opacity?: number; fill?: string; radius?: number }
}

type LinePointEntry = {
  el: SVGElement
  target: string
  value: number
  x: number
  y: number
}

async function waitTransition(transition: d3.Transition<any, any, any, any>) {
  try {
    await transition.end()
  } catch {
    // interrupted transitions are acceptable in interactive workflows
  }
}

/**
 * SimpleLine 전용 handler:
 + highlight/dim 시 데이터 지점 위에 점(circle)만 덧그리는 오버레이 방식입니다.
 + lineTrace 액션은 두 라벨을 따라 선 path와 점을 보여주는 안내선 역할을 합니다.
 + draw action 중 split/sort/filter 등은 지원하지 않고, base handler 흐름을 재사용합니다.
 */
export class SimpleLineDrawHandler extends LineDrawHandler {
  protected override selectElements(_select?: DrawSelect, chartId?: string) {
    const svg = d3.select(this.container).select(SvgElements.Svg)
    const scope = chartId ? svg.selectAll(`[${DataAttributes.ChartId}="${String(chartId)}"]`) : svg
    const selection = scope
      .selectAll<SVGElement, JsonValue>(`${SvgElements.Path}, ${SvgElements.Circle}, ${SvgElements.Rect}`)
      .filter(SvgSelectors.DataTargets)
    return this.filterByKeys(selection, _select?.keys)
  }

  protected override allMarks(chartId?: string) {
    const svg = d3.select(this.container).select(SvgElements.Svg)
    const scope = chartId ? svg.selectAll(`[${DataAttributes.ChartId}="${String(chartId)}"]`) : svg
    return scope
      .selectAll<SVGElement, JsonValue>(`${SvgElements.Path}, ${SvgElements.Circle}, ${SvgElements.Rect}`)
      .filter(SvgSelectors.DataTargets)
  }

  private drawPointCircle(
    svg: d3.Selection<SVGSVGElement, JsonValue, d3.BaseType, JsonValue>,
    x: number,
    y: number,
    style?: { fill?: string; opacity?: number; stroke?: string; strokeWidth?: number; radius?: number },
    chartId?: string,
  ) {
    svg
      .append(SvgElements.Circle)
      .attr(SvgAttributes.Class, `${SvgClassNames.Annotation} point-annotation`)
      .attr(DataAttributes.ChartId, chartId ?? null)
      .attr(SvgAttributes.CX, x)
      .attr(SvgAttributes.CY, y)
      .attr(SvgAttributes.R, style?.radius ?? 4)
      .attr(SvgAttributes.Fill, style?.fill ?? '#ef4444')
      .attr(SvgAttributes.Opacity, style?.opacity ?? 1)
      .attr(SvgAttributes.Stroke, style?.stroke ?? 'white')
      .attr(SvgAttributes.StrokeWidth, style?.strokeWidth ?? 1)
  }

  override highlight(op: DrawOp) {
    const svg = d3.select(this.container).select(SvgElements.Svg)
    if (svg.empty()) return
    const color = op.style?.color || '#ef4444'
    const points = this.selectElements(op.select, op.chartId)
    if (points.empty()) return
    // 그룹별(타겟)로 bbox가 가장 작은 요소를 선택해서 라인 path를 배제
    const grouped: Record<string, Element[]> = {}
    points.each(function () {
      const el = this as Element
      const t = el.getAttribute(DataAttributes.Target) ?? ''
      if (!grouped[t]) grouped[t] = []
      grouped[t].push(el)
    })

    Object.entries(grouped).forEach(([target, nodes]) => {
      const best = nodes.reduce<Element | null>((acc, el) => {
        const bbox = (el as SVGGraphicsElement).getBBox?.()
        const area = bbox ? Math.abs(bbox.width * bbox.height) : Number.POSITIVE_INFINITY
        if (!acc) return el
        const accB = (acc as SVGGraphicsElement).getBBox?.()
        const accArea = accB ? Math.abs(accB.width * accB.height) : Number.POSITIVE_INFINITY
        return area < accArea ? el : acc
      }, null)
      if (!best) return
      // 가장 작은 bbox 중심을 SVG 좌표로 변환하고 annotation circle을 추가
      const { x, y } = this.toSvgCenter(best, svg.node() as SVGSVGElement)
      if (!Number.isFinite(x) || !Number.isFinite(y)) return
      this.drawPointCircle(svg as any, x, y, { fill: color }, op.chartId)
    })
  }

  override dim(op: DrawOp) {
    const opacity = op.style?.opacity ?? 0.25
    const selectedNodes = new Set(this.selectElements(op.select, op.chartId).nodes())
    this.allMarks(op.chartId).attr(SvgAttributes.Opacity, function () {
      // 하이라이트 대상은 불투명하게, 나머지는 투명도 감소
      return selectedNodes.has(this as SVGElement) ? 1 : opacity
    })
  }

  private lineTrace(op: DrawOp) {
    const trace = (op as unknown as { trace?: TraceSpec }).trace
    let pair: [string, string] | null = null
    if (trace?.pair?.x && trace.pair.x.length === 2) {
      pair = trace.pair.x
    } else if (op.select?.keys && op.select.keys.length >= 2) {
      pair = [String(op.select.keys[0]), String(op.select.keys[op.select.keys.length - 1])] as [string, string]
    }
    if (!pair) return
    const svg = d3.select(this.container).select(SvgElements.Svg)
    if (svg.empty()) return
    const svgNode = svg.node() as SVGSVGElement | null
    if (!svgNode) return
    const scope = op.chartId ? svg.selectAll(`[${DataAttributes.ChartId}="${String(op.chartId)}"]`) : svg
    const [xA, xB] = pair
    // 사용 가능한 포인트(심볼)만 이용하고, 라벨별로 가장 작은 bbox(실제 심볼)를 사용
    const marksSel = this.selectElements(undefined, op.chartId)
    const ordered = marksSel.nodes() as Element[]
    const picked: Array<{ label: string; el: Element; idx: number; area: number }> = []
    const byLabel = new Map<string, { el: Element; idx: number; area: number }>()
    ordered.forEach((el, idx) => {
      const label = (el.getAttribute(DataAttributes.Target) || el.getAttribute(DataAttributes.Id) || '') as string
      if (!label) return
      const bbox = (el as SVGGraphicsElement).getBBox?.()
      const area = bbox ? Math.abs(bbox.width * bbox.height) : Number.POSITIVE_INFINITY
      const existing = byLabel.get(label)
      if (!existing || area < existing.area) {
        byLabel.set(label, { el, idx, area })
      }
    })
    byLabel.forEach((v, label) => picked.push({ ...v, label }))
    picked.sort((a, b) => a.idx - b.idx)

    const labels = picked.map((p) => p.label)
    const startIdx = labels.indexOf(String(xA))
    const endIdx = labels.indexOf(String(xB))
    if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) return

    const pointsWithin: Array<{ x: number; y: number }> = []
    for (let i = startIdx; i <= endIdx; i += 1) {
      const el = picked[i].el
      const { x, y } = this.toSvgCenter(el, svgNode)
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue
      pointsWithin.push({ x, y })
    }
    if (pointsWithin.length < 2) return

    const stroke = trace?.style?.stroke ?? '#ef4444'
    const strokeWidth = trace?.style?.strokeWidth ?? 2
    const opacity = trace?.style?.opacity ?? 1
    const fill = trace?.style?.fill ?? stroke
    const radius = trace?.style?.radius ?? 3.5

    const lineGen = d3
      .line<{ x: number; y: number }>()
      .x((d) => d.x)
      .y((d) => d.y)

    const layer = d3.select(ensureAnnotationLayer(svgNode, op.chartId ?? null)) as any
    layer
      .append(SvgElements.Path)
      .attr(SvgAttributes.Class, `${SvgClassNames.Annotation} ${SvgClassNames.LineAnnotation}`)
      .attr(DataAttributes.ChartId, op.chartId ?? null)
      .attr(SvgAttributes.D, lineGen(pointsWithin) ?? null)
      .attr(SvgAttributes.Stroke, stroke)
      .attr(SvgAttributes.StrokeWidth, strokeWidth)
      .attr(SvgAttributes.Fill, 'none')
      .attr(SvgAttributes.Opacity, opacity)

    pointsWithin.forEach((p) => this.drawPointCircle(layer, p.x, p.y, { fill, radius, stroke }, op.chartId))
  }

  private collectPointEntries(chartId?: string) {
    const svg = d3.select(this.container).select(SvgElements.Svg)
    if (svg.empty()) return [] as LinePointEntry[]
    const svgNode = svg.node() as SVGSVGElement | null
    if (!svgNode) return [] as LinePointEntry[]
    const points = this.selectElements(undefined, chartId)
    if (points.empty()) return [] as LinePointEntry[]

    const byTarget = new Map<string, { el: SVGElement; area: number; value: number; x: number; y: number }>()
    points.each((_, index, nodes) => {
      const el = nodes[index] as SVGElement
      const target = el.getAttribute(DataAttributes.Target) || el.getAttribute(DataAttributes.Id)
      const rawValue = Number(el.getAttribute(DataAttributes.Value))
      if (!target || !Number.isFinite(rawValue)) return
      const bbox = (el as SVGGraphicsElement).getBBox?.()
      const area = bbox ? Math.abs(bbox.width * bbox.height) : Number.POSITIVE_INFINITY
      const center = this.toSvgCenter(el, svgNode)
      const prev = byTarget.get(String(target))
      if (!prev || area < prev.area) {
        if (!el.hasAttribute('data-layout-transform')) {
          const baseTransform = el.getAttribute(SvgAttributes.Transform)
          if (baseTransform != null) el.setAttribute('data-layout-transform', baseTransform)
        }
        if (!el.hasAttribute('data-layout-center-x')) {
          el.setAttribute('data-layout-center-x', String(center.x))
        }
        byTarget.set(String(target), { el, area, value: rawValue, x: center.x, y: center.y })
      }
    })
    return Array.from(byTarget.entries())
      .map(([target, point]) => ({
        el: point.el,
        target,
        value: point.value,
        x: point.x,
        y: point.y,
      }))
      .sort((a, b) => a.x - b.x)
  }

  private applyPointXTransition(
    transition: d3.Transition<SVGElement, JsonValue, d3.BaseType, JsonValue>,
    entry: LinePointEntry,
    targetX: number,
  ) {
    transition
      .filter(function () {
        return this === entry.el
      })
      .attr(SvgAttributes.Opacity, 1)
    const tag = entry.el.tagName.toLowerCase()
    if (tag === SvgElements.Circle) {
      transition
        .filter(function () {
          return this === entry.el
        })
        .attr(SvgAttributes.CX, targetX)
      return
    }
    if (tag === SvgElements.Rect) {
      const width = Number(entry.el.getAttribute(SvgAttributes.Width))
      const left = Number.isFinite(width) ? targetX - width / 2 : targetX
      transition
        .filter(function () {
          return this === entry.el
        })
        .attr(SvgAttributes.X, left)
      return
    }

    const baseTransform = entry.el.getAttribute('data-layout-transform') ?? entry.el.getAttribute(SvgAttributes.Transform) ?? ''
    if (!entry.el.hasAttribute('data-layout-transform')) {
      entry.el.setAttribute('data-layout-transform', baseTransform)
    }
    const baseXRaw = Number(entry.el.getAttribute('data-layout-center-x'))
    const baseX = Number.isFinite(baseXRaw) ? baseXRaw : entry.x
    if (!entry.el.hasAttribute('data-layout-center-x')) {
      entry.el.setAttribute('data-layout-center-x', String(baseX))
    }
    const dx = targetX - baseX
    const transform = [baseTransform.trim(), `translate(${dx},0)`].filter((token) => token.length > 0).join(' ')
    transition
      .filter(function () {
        return this === entry.el
      })
      .attr(SvgAttributes.Transform, transform)
  }

  private async updateLinePathForFilter(chartId: string | undefined, points: Array<{ x: number; y: number }>) {
    const svg = d3.select(this.container).select(SvgElements.Svg)
    if (svg.empty()) return
    const scope = chartId ? svg.selectAll(`[${DataAttributes.ChartId}="${String(chartId)}"]`) : svg
    const linePathSelection = scope
      .selectAll<SVGPathElement, JsonValue>(SvgElements.Path)
      .filter(function () {
        const el = this as SVGPathElement
        if (el.classList.contains(SvgClassNames.Annotation)) return false
        const hasTargetLike =
          el.hasAttribute(DataAttributes.Target) || el.hasAttribute(DataAttributes.Value) || el.hasAttribute(DataAttributes.Id)
        if (hasTargetLike) return false
        const style = window.getComputedStyle(el)
        return style.fill === 'none' || style.stroke !== 'none'
      })
    const linePathNode = linePathSelection.node()
    if (!linePathNode) return
    const linePath = d3.select(linePathNode as SVGPathElement)

    if (points.length < 2) {
      const fade = linePath.transition().duration(NON_SPLIT_EXIT_MS).attr(SvgAttributes.Opacity, 0)
      await waitTransition(fade)
      return
    }

    const lineGen = d3
      .line<{ x: number; y: number }>()
      .x((d) => d.x)
      .y((d) => d.y)
    const pathData = lineGen(points)
    if (!pathData) return
    const node = linePath.node()
    if (!node || !node.parentElement) return
    const style = window.getComputedStyle(node)
    const targetOpacity = Number(style.opacity)
    const nextOpacity = Number.isFinite(targetOpacity) ? targetOpacity : 1
    const temp = d3
      .select(node.parentElement)
      .append(SvgElements.Path)
      .attr(SvgAttributes.Class, 'line-filter-buffer')
      .attr(SvgAttributes.D, pathData)
      .attr(SvgAttributes.Fill, 'none')
      .attr(SvgAttributes.Stroke, style.stroke || '#1d4ed8')
      .attr(SvgAttributes.StrokeWidth, style.strokeWidth || 2)
      .attr(SvgAttributes.Opacity, 0)

    const fadeOut = linePath.transition().duration(NON_SPLIT_EXIT_MS).attr(SvgAttributes.Opacity, 0)
    const fadeIn = temp.transition().duration(NON_SPLIT_ENTER_MS + NON_SPLIT_UPDATE_MS).attr(SvgAttributes.Opacity, nextOpacity)
    await Promise.all([waitTransition(fadeOut), waitTransition(fadeIn)])
    linePath.attr(SvgAttributes.D, pathData).attr(SvgAttributes.Opacity, nextOpacity)
    temp.remove()
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
    const keptLabels = kept.map((entry) => entry.target)
    const keptSet = new Set(keptLabels)
    const left = d3.min(entries.map((entry) => entry.x)) ?? 0
    const right = d3.max(entries.map((entry) => entry.x)) ?? left
    const xScale = d3.scalePoint<string>().domain(keptLabels).range([left, right])

    const hidden = entries.filter((entry) => !keptSet.has(entry.target))
    const hiddenTransition = d3
      .selectAll<SVGElement, unknown>(hidden.map((entry) => entry.el) as SVGElement[])
      .style('display', null)
      .transition()
      .duration(NON_SPLIT_EXIT_MS)
      .attr(SvgAttributes.Opacity, 0)
    await waitTransition(hiddenTransition)
    d3.selectAll<SVGElement, unknown>(hidden.map((entry) => entry.el) as SVGElement[]).style('display', 'none')

    if (kept.length) {
      const shownSelection = d3
        .selectAll<SVGElement, unknown>(kept.map((entry) => entry.el) as SVGElement[])
        .style('display', null)
        .attr(SvgAttributes.Opacity, 1) as unknown as d3.Selection<SVGElement, JsonValue, d3.BaseType, JsonValue>
      const shownTransition = shownSelection.transition().duration(NON_SPLIT_ENTER_MS + NON_SPLIT_UPDATE_MS)
      kept.forEach((entry) => {
        const targetX = xScale(entry.target)
        if (targetX == null) return
        this.applyPointXTransition(shownTransition, entry, targetX)
      })
      await waitTransition(shownTransition)
    }

    const svg = d3.select(this.container).select(SvgElements.Svg)
    const scope = op.chartId ? svg.selectAll(`[${DataAttributes.ChartId}="${String(op.chartId)}"]`) : svg
    const ticks = scope.selectAll<SVGGElement, unknown>(SvgSelectors.XAxisTicks)
    const tickTransition = ticks.transition().duration(NON_SPLIT_UPDATE_MS)
    ticks.each(function () {
      const tick = d3.select(this)
      const label = tick.select(SvgElements.Text).text().trim()
      const x = xScale(label)
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

    const nextPoints = kept
      .map((entry) => {
        const x = xScale(entry.target)
        if (x == null) return null
        return { x, y: entry.y }
      })
      .filter((point): point is { x: number; y: number } => point !== null)
    await this.updateLinePathForFilter(op.chartId, nextPoints)
  }

  override run(op: DrawOp): void | Promise<void> {
    // Line-chart specific axis.y rect handling (y-axis band near labels)
    if (
      op.action === DrawAction.Rect &&
      op.rect?.mode === DrawRectModes.Axis &&
      op.rect?.axis?.y !== undefined &&
      op.rect?.axis?.x === undefined
    ) {
      this.rectAxisY(op)
      return
    }

    if (op.action === DrawAction.LineTrace || (op as any).trace) {
      this.lineTrace(op)
      return
    }
    if (op.action === DrawAction.Filter) {
      return this.filter(op)
    }
    // disable unsupported actions for line chart
    if (op.action === DrawAction.Sort || op.action === DrawAction.Split || op.action === DrawAction.Unsplit || op.action === DrawAction.BarSegment) {
      console.warn('Unsupported draw action for line chart', op.action)
      return
    }
    return super.run(op)
  }

  /**
   * Draw rect band along y-axis label area for line charts.
   * Uses value→y mapping (ticks or marks) and a narrow width based on left margin.
   */
  private rectAxisY(op: DrawOp) {
    const rectSpec = op.rect
    if (!rectSpec?.axis?.y) return

    const svg = d3.select(this.container).select(SvgElements.Svg)
    if (svg.empty()) return
    const svgNode = svg.node() as SVGSVGElement | null
    if (!svgNode) return
    const yValues = Array.isArray(rectSpec.axis.y) ? rectSpec.axis.y.map(Number) : [Number(rectSpec.axis.y)]
    if (yValues.some((v) => !Number.isFinite(v))) return

    const mapY = this.yValueToSvgY(this.selectScope(op.chartId), svgNode)
    const viewBox = svgNode.viewBox?.baseVal
    const svgRect = svgNode.getBoundingClientRect()
    const scaleX = viewBox && svgRect.width > 0 ? viewBox.width / svgRect.width : 1
    const scaleY = viewBox && svgRect.height > 0 ? viewBox.height / svgRect.height : 1

    // x범위: y축 라벨 텍스트들의 bbox 합집합을 사용, 없으면 좌측 6%폭 사용
    const axisTexts: SVGGraphicsElement[] = Array.from(
      svgNode.querySelectorAll<SVGGraphicsElement>(`.${SvgClassNames.YAxisLabel}`),
    )
    const fallbackAxisTexts =
      axisTexts.length === 0
        ? Array.from(
            svgNode.querySelectorAll<SVGGraphicsElement>(SvgSelectors.VegaRoleAxisLabelText),
          ).filter((el) => {
            const axisGroup = el.closest('[aria-label]')
            const aria = axisGroup?.getAttribute('aria-label')?.toLowerCase() || ''
            return aria.includes('y-axis')
          })
        : []
    const combinedAxisTexts = axisTexts.length ? axisTexts : fallbackAxisTexts
    let minX = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let maxTextH = 0
    combinedAxisTexts.forEach((el) => {
      const bbox = el.getBoundingClientRect()
      minX = Math.min(minX, bbox.left)
      maxX = Math.max(maxX, bbox.right)
      maxTextH = Math.max(maxTextH, bbox.height)
    })
    let xLeft: number
    let xRight: number
    if (combinedAxisTexts.length > 0 && Number.isFinite(minX) && Number.isFinite(maxX)) {
      const padding = 4 * scaleX
      xLeft = (viewBox?.x ?? 0) + (minX - svgRect.left) * scaleX - padding
      xRight = (viewBox?.x ?? 0) + (maxX - svgRect.left) * scaleX + padding
    } else {
      const bandWidth = Math.max(16 * scaleX, svgRect.width * 0.06 * scaleX)
      xLeft = (viewBox?.x ?? 0)
      xRight = xLeft + bandWidth
    }
    const bandWidth = Math.max(xRight - xLeft, 12 * scaleX)

    // mapY 는 값이 범위 밖이면 null을 반환할 수 있으므로 최소/최대 값으로 clamp
    const markVals: number[] = []
    svg.selectAll<SVGElement, any>(SvgSelectors.DataTargets).each(function () {
      const vAttr = (this as Element).getAttribute(DataAttributes.Value)
      const v = vAttr != null ? Number(vAttr) : NaN
      if (Number.isFinite(v)) markVals.push(v)
    })
    const minVal = markVals.length ? Math.min(...markVals) : null
    const maxVal = markVals.length ? Math.max(...markVals) : null
    const layer = d3.select(ensureAnnotationLayer(svgNode, op.chartId ?? null)) as any

    const toPos = (v: number) => {
      const y = mapY(v)
      if (y != null) return y
      if (minVal != null && v < minVal) return mapY(minVal)
      if (maxVal != null && v > maxVal) return mapY(maxVal)
      return null
    }
    if (yValues.length === 1) {
      const y = toPos(yValues[0])
      if (y == null) return
      const height = Math.max(10 * scaleY, Math.min(18 * scaleY, (maxTextH || svgRect.height * 0.04) * scaleY))
      layer
        .append(SvgElements.Rect)
        .attr(SvgAttributes.Class, `${SvgClassNames.Annotation} ${SvgClassNames.RectAnnotation}`)
        .attr(DataAttributes.ChartId, op.chartId ?? null)
        .attr(SvgAttributes.X, xLeft)
        .attr(SvgAttributes.Y, y - height / 2)
        .attr(SvgAttributes.Width, bandWidth)
        .attr(SvgAttributes.Height, height)
        .attr(SvgAttributes.Fill, rectSpec.style?.fill ?? 'none')
        .attr(SvgAttributes.Opacity, rectSpec.style?.opacity ?? 1)
        .attr(SvgAttributes.Stroke, rectSpec.style?.stroke ?? '#111827')
        .attr(SvgAttributes.StrokeWidth, rectSpec.style?.strokeWidth ?? 1)
      return
    }

    if (yValues.length === 2) {
      const y1 = toPos(yValues[0])
      const y2 = toPos(yValues[1])
      if (y1 == null || y2 == null) return
      const yTop = Math.min(y1, y2)
      const yBottom = Math.max(y1, y2)
      layer
        .append(SvgElements.Rect)
        .attr(SvgAttributes.Class, `${SvgClassNames.Annotation} ${SvgClassNames.RectAnnotation}`)
        .attr(DataAttributes.ChartId, op.chartId ?? null)
        .attr(SvgAttributes.X, xLeft)
        .attr(SvgAttributes.Y, yTop)
        .attr(SvgAttributes.Width, bandWidth)
        .attr(SvgAttributes.Height, yBottom - yTop)
        .attr(SvgAttributes.Fill, rectSpec.style?.fill ?? 'none')
        .attr(SvgAttributes.Opacity, rectSpec.style?.opacity ?? 1)
        .attr(SvgAttributes.Stroke, rectSpec.style?.stroke ?? '#111827')
        .attr(SvgAttributes.StrokeWidth, rectSpec.style?.strokeWidth ?? 1)
    }
  }
}

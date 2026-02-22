import { DataAttributes, SvgClassNames, SvgElements, SvgSelectors } from '../../interfaces'
import { normalizedPointToSvg } from './coords'
import type { BarSegmentCommit, NormalizedPoint } from './types'

type AxisTick = { value: number; y: number }

type BarSpan = {
  target: string
  left: number
  right: number
  centerX: number
  centerY: number
  value: number
}

export type BarSegmentScope = {
  svg: SVGSVGElement
  scopeElement: Element
  chartId?: string
  xRange: { start: number; end: number }
  ticks: AxisTick[]
  bars: BarSpan[]
}

type SvgScale = {
  scaleX: number
  scaleY: number
  offsetX: number
  offsetY: number
}

function getSvgScale(svg: SVGSVGElement): SvgScale {
  const svgRect = svg.getBoundingClientRect()
  const viewBox = svg.viewBox?.baseVal
  const scaleX = viewBox && svgRect.width > 0 ? viewBox.width / svgRect.width : 1
  const scaleY = viewBox && svgRect.height > 0 ? viewBox.height / svgRect.height : 1
  return {
    scaleX,
    scaleY,
    offsetX: viewBox?.x ?? 0,
    offsetY: viewBox?.y ?? 0,
  }
}

function clientRectToSvgRect(svg: SVGSVGElement, rect: DOMRect) {
  const svgRect = svg.getBoundingClientRect()
  const { scaleX, scaleY, offsetX, offsetY } = getSvgScale(svg)
  return {
    left: offsetX + (rect.left - svgRect.left) * scaleX,
    right: offsetX + (rect.right - svgRect.left) * scaleX,
    top: offsetY + (rect.top - svgRect.top) * scaleY,
    bottom: offsetY + (rect.bottom - svgRect.top) * scaleY,
  }
}

function parseNumericLabel(text: string): number | null {
  const cleaned = text.trim().replace(/,/g, '')
  if (!cleaned) return null
  const numeric = Number(cleaned)
  if (Number.isFinite(numeric)) return numeric
  const normalized = cleaned.replace(/[^\d.+-eE]/g, '')
  const fallback = Number(normalized)
  return Number.isFinite(fallback) ? fallback : null
}

function collectBars(scopeElement: Element, svg: SVGSVGElement): BarSpan[] {
  const bars = Array.from(scopeElement.querySelectorAll<SVGRectElement>(`${SvgElements.Rect}[${DataAttributes.Target}]`))
    .filter((bar) => !bar.classList.contains(SvgClassNames.Annotation))
    .map((bar) => {
      const target = bar.getAttribute(DataAttributes.Target)
      if (!target) return null
      const value = Number(bar.getAttribute(DataAttributes.Value))
      const rect = clientRectToSvgRect(svg, bar.getBoundingClientRect())
      return {
        target: String(target),
        left: rect.left,
        right: rect.right,
        centerX: (rect.left + rect.right) * 0.5,
        centerY: (rect.top + rect.bottom) * 0.5,
        value,
      } as BarSpan
    })
    .filter((entry): entry is BarSpan => !!entry)
  return bars
}

function collectYAxisTicks(scopeElement: Element, svg: SVGSVGElement, bars: BarSpan[]): AxisTick[] {
  const ticks = Array.from(scopeElement.querySelectorAll<SVGTextElement>(SvgSelectors.YAxisText))
    .map((textNode) => {
      const value = parseNumericLabel(textNode.textContent ?? '')
      if (value == null) return null
      const rect = clientRectToSvgRect(svg, textNode.getBoundingClientRect())
      return { value, y: (rect.top + rect.bottom) * 0.5 } as AxisTick
    })
    .filter((entry): entry is AxisTick => !!entry)

  if (ticks.length >= 2) {
    return ticks
  }

  // Fallback for custom axes: infer (value,y) pairs directly from bars.
  const fallbackTicks = bars
    .map((bar) => ({ value: bar.value, y: bar.centerY }))
    .filter((tick) => Number.isFinite(tick.value) && Number.isFinite(tick.y))

  if (fallbackTicks.length < 2) return []
  return fallbackTicks
}

function inferValueFromY(y: number, ticks: AxisTick[]): number | null {
  if (!Number.isFinite(y) || ticks.length < 2) return null
  const sorted = ticks
    .slice()
    .filter((tick) => Number.isFinite(tick.y) && Number.isFinite(tick.value))
    .sort((a, b) => a.y - b.y)
  if (sorted.length < 2) return null

  const pairFor = (a: AxisTick, b: AxisTick) => {
    if (!Number.isFinite(a.y) || !Number.isFinite(b.y) || a.y === b.y) return null
    const t = (y - a.y) / (b.y - a.y)
    return a.value + (b.value - a.value) * t
  }

  if (y <= sorted[0].y) {
    return pairFor(sorted[0], sorted[1])
  }
  if (y >= sorted[sorted.length - 1].y) {
    return pairFor(sorted[sorted.length - 2], sorted[sorted.length - 1])
  }
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const current = sorted[i]
    const next = sorted[i + 1]
    if (y >= current.y && y <= next.y) {
      return pairFor(current, next)
    }
  }
  return null
}

function dedupe(values: string[]) {
  return Array.from(new Set(values.map((value) => String(value).trim()).filter((value) => value.length > 0)))
}

function resolveTargetKeysInRange(bars: BarSpan[], xStart: number, xEnd: number): string[] {
  if (!bars.length) return []
  const left = Math.min(xStart, xEnd)
  const right = Math.max(xStart, xEnd)
  const span = Math.abs(right - left)

  if (span < 2) {
    const nearest = bars
      .slice()
      .sort((a, b) => Math.abs(a.centerX - xEnd) - Math.abs(b.centerX - xEnd))[0]
    return nearest ? [nearest.target] : []
  }

  return dedupe(
    bars.filter((bar) => bar.right >= left && bar.left <= right).map((bar) => bar.target),
  )
}

function resolveScopeElement(
  svg: SVGSVGElement,
  eventTarget: EventTarget | null,
  startPoint: NormalizedPoint,
) {
  if (eventTarget instanceof Element && svg.contains(eventTarget)) {
    const grouped = eventTarget.closest(`[${DataAttributes.ChartId}]`)
    if (grouped) return grouped
  }

  const groups = Array.from(svg.querySelectorAll(`[${DataAttributes.ChartId}]`))
  if (!groups.length) return svg

  const startSvg = normalizedPointToSvg(svg, startPoint)
  if (!startSvg) return groups[0]

  for (const group of groups) {
    const rect = clientRectToSvgRect(svg, group.getBoundingClientRect())
    if (
      startSvg.x >= rect.left &&
      startSvg.x <= rect.right &&
      startSvg.y >= rect.top &&
      startSvg.y <= rect.bottom
    ) {
      return group
    }
  }
  return groups[0]
}

export function resolveBarSegmentScope(
  container: HTMLElement,
  eventTarget: EventTarget | null,
  startPoint: NormalizedPoint,
): BarSegmentScope | null {
  const svg = container.querySelector(SvgElements.Svg)
  if (!(svg instanceof SVGSVGElement)) return null
  const scopeElement = resolveScopeElement(svg, eventTarget, startPoint)
  const bars = collectBars(scopeElement, svg)
  if (!bars.length) return null
  const ticks = collectYAxisTicks(scopeElement, svg, bars)
  if (!ticks.length) return null
  const xRange = {
    start: Math.min(...bars.map((bar) => bar.left)),
    end: Math.max(...bars.map((bar) => bar.right)),
  }
  const chartId = scopeElement.getAttribute(DataAttributes.ChartId) ?? undefined
  return {
    svg,
    scopeElement,
    chartId,
    xRange,
    ticks,
    bars,
  }
}

export function buildBarSegmentCommit(
  scope: BarSegmentScope,
  startPoint: NormalizedPoint,
  endPoint: NormalizedPoint,
): BarSegmentCommit | null {
  const startSvg = normalizedPointToSvg(scope.svg, startPoint)
  const endSvg = normalizedPointToSvg(scope.svg, endPoint)
  if (!startSvg || !endSvg) return null

  const thresholdRaw = inferValueFromY(endSvg.y, scope.ticks)
  if (thresholdRaw == null || !Number.isFinite(thresholdRaw)) return null
  const threshold = Number(thresholdRaw.toFixed(4))
  const keys = resolveTargetKeysInRange(scope.bars, startSvg.x, endSvg.x)
  if (!keys.length) return null

  return {
    threshold,
    when: endPoint.y > startPoint.y ? 'gte' : 'lte',
    keys,
    chartId: scope.chartId,
  }
}

export function resolveBarSegmentPreview(scope: BarSegmentScope, point: NormalizedPoint) {
  const pointSvg = normalizedPointToSvg(scope.svg, point)
  if (!pointSvg) return null
  return {
    x1: scope.xRange.start,
    x2: scope.xRange.end,
    y: pointSvg.y,
  }
}

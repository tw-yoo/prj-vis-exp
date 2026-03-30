import { expandLayoutModel, type LayoutModel, type LayoutOverflow } from './chartLayout'

type MeasureOptions = {
  paddingPx?: number
  tolerancePx?: number
}

type RenderWithMeasuredLayoutOptions = {
  maxPasses?: number
  measure?: MeasureOptions
}

function measureRects(elements: Element[]) {
  return elements
    .map((element) => element.getBoundingClientRect())
    .filter((rect) => Number.isFinite(rect.left) && Number.isFinite(rect.top) && Number.isFinite(rect.right) && Number.isFinite(rect.bottom))
}

function parseViewBox(svg: SVGSVGElement) {
  const raw = svg.getAttribute('viewBox')?.trim() ?? ''
  const parts = raw.split(/\s+/).map(Number)
  if (parts.length === 4 && parts.every(Number.isFinite)) {
    return { minX: parts[0], minY: parts[1], width: parts[2], height: parts[3] }
  }
  return null
}

function isRenderableElement(element: Element) {
  if (!(element instanceof SVGGraphicsElement) && !(element instanceof SVGTextContentElement)) return false
  const text = element.textContent?.trim() ?? ''
  if (element instanceof SVGTextElement || element instanceof SVGTSpanElement) {
    return text.length > 0
  }
  return true
}

function adjustAxisTitlePositions(svg: SVGSVGElement, minGapPx: number) {
  const svgRect = svg.getBoundingClientRect()
  const viewBox = parseViewBox(svg)
  if (!viewBox || svgRect.width <= 0 || svgRect.height <= 0) return

  const scaleX = viewBox.width / svgRect.width
  const scaleY = viewBox.height / svgRect.height

  const xTitle = svg.querySelector('.x-axis-label')
  const xAxisRects = measureRects(Array.from(svg.querySelectorAll('.x-axis')))
  if (xTitle instanceof SVGTextElement && xAxisRects.length > 0) {
    const xTitleRect = xTitle.getBoundingClientRect()
    const xAxisBottom = xAxisRects.reduce((max, rect) => Math.max(max, rect.bottom), Number.NEGATIVE_INFINITY)
    const overlap = xAxisBottom + minGapPx - xTitleRect.top
    if (overlap > 0) {
      const currentY = Number(xTitle.getAttribute('y') ?? '0')
      xTitle.setAttribute('y', String(currentY + overlap * scaleY))
    }
  }

  const yTitle = svg.querySelector('.y-axis-label')
  const yAxisRects = measureRects(Array.from(svg.querySelectorAll('.y-axis')))
  if (yTitle instanceof SVGTextElement && yAxisRects.length > 0) {
    const yTitleRect = yTitle.getBoundingClientRect()
    const yAxisLeft = yAxisRects.reduce((min, rect) => Math.min(min, rect.left), Number.POSITIVE_INFINITY)
    const overlap = yTitleRect.right + minGapPx - yAxisLeft
    if (overlap > 0) {
      const currentY = Number(yTitle.getAttribute('y') ?? '0')
      yTitle.setAttribute('y', String(currentY - overlap * scaleX))
    }
  }
}

export function measureRenderedSvgOverflow(container: HTMLElement, options: MeasureOptions = {}): LayoutOverflow {
  const svg = container.querySelector('svg')
  if (!(svg instanceof SVGSVGElement)) {
    return { left: 0, right: 0, top: 0, bottom: 0 }
  }

  const svgRect = svg.getBoundingClientRect()
  const viewBox = parseViewBox(svg)
  if (!viewBox || svgRect.width <= 0 || svgRect.height <= 0) {
    return { left: 0, right: 0, top: 0, bottom: 0 }
  }

  const descendants = Array.from(svg.querySelectorAll('*')).filter(isRenderableElement)
  if (!descendants.length) {
    return { left: 0, right: 0, top: 0, bottom: 0 }
  }

  let minLeft = Number.POSITIVE_INFINITY
  let minTop = Number.POSITIVE_INFINITY
  let maxRight = Number.NEGATIVE_INFINITY
  let maxBottom = Number.NEGATIVE_INFINITY

  descendants.forEach((node) => {
    const rect = node.getBoundingClientRect()
    if (!Number.isFinite(rect.left) || !Number.isFinite(rect.top) || !Number.isFinite(rect.right) || !Number.isFinite(rect.bottom)) {
      return
    }
    if (rect.width === 0 && rect.height === 0) return
    minLeft = Math.min(minLeft, rect.left)
    minTop = Math.min(minTop, rect.top)
    maxRight = Math.max(maxRight, rect.right)
    maxBottom = Math.max(maxBottom, rect.bottom)
  })

  if (!Number.isFinite(minLeft) || !Number.isFinite(minTop) || !Number.isFinite(maxRight) || !Number.isFinite(maxBottom)) {
    return { left: 0, right: 0, top: 0, bottom: 0 }
  }

  const paddingPx = Math.max(0, options.paddingPx ?? 12)
  const scaleX = viewBox.width / svgRect.width
  const scaleY = viewBox.height / svgRect.height
  let leftOverflow = Math.max(0, svgRect.left - minLeft + paddingPx) * scaleX
  let rightOverflow = Math.max(0, maxRight - svgRect.right + paddingPx) * scaleX
  let topOverflow = Math.max(0, svgRect.top - minTop + paddingPx) * scaleY
  let bottomOverflow = Math.max(0, maxBottom - svgRect.bottom + paddingPx) * scaleY

  const xTitle = svg.querySelector('.x-axis-label')
  const xAxisRects = measureRects(Array.from(svg.querySelectorAll('.x-axis')))
  if (xTitle instanceof SVGTextElement && xAxisRects.length > 0) {
    const xTitleRect = xTitle.getBoundingClientRect()
    const xAxisBottom = xAxisRects.reduce((max, rect) => Math.max(max, rect.bottom), Number.NEGATIVE_INFINITY)
    const overlap = xAxisBottom + paddingPx - xTitleRect.top
    if (overlap > 0) {
      bottomOverflow = Math.max(bottomOverflow, overlap * scaleY)
    }
  }

  const yTitle = svg.querySelector('.y-axis-label')
  const yAxisRects = measureRects(Array.from(svg.querySelectorAll('.y-axis')))
  if (yTitle instanceof SVGTextElement && yAxisRects.length > 0) {
    const yTitleRect = yTitle.getBoundingClientRect()
    const yAxisLeft = yAxisRects.reduce((min, rect) => Math.min(min, rect.left), Number.POSITIVE_INFINITY)
    const overlap = yTitleRect.right + paddingPx - yAxisLeft
    if (overlap > 0) {
      leftOverflow = Math.max(leftOverflow, overlap * scaleX)
    }
  }

  return {
    left: leftOverflow,
    right: rightOverflow,
    top: topOverflow,
    bottom: bottomOverflow,
  }
}

function hasMeaningfulOverflow(overflow: LayoutOverflow, tolerancePx = 2) {
  return overflow.left > tolerancePx || overflow.right > tolerancePx || overflow.top > tolerancePx || overflow.bottom > tolerancePx
}

function layoutChanged(prev: LayoutModel, next: LayoutModel, tolerancePx = 0.5) {
  return (
    Math.abs(prev.canvas.width - next.canvas.width) > tolerancePx ||
    Math.abs(prev.canvas.height - next.canvas.height) > tolerancePx ||
    Math.abs(prev.padding.left - next.padding.left) > tolerancePx ||
    Math.abs(prev.padding.right - next.padding.right) > tolerancePx ||
    Math.abs(prev.padding.top - next.padding.top) > tolerancePx ||
    Math.abs(prev.padding.bottom - next.padding.bottom) > tolerancePx
  )
}

export function renderWithMeasuredLayout<T>(
  container: HTMLElement,
  initialLayout: LayoutModel,
  renderPass: (layout: LayoutModel) => T,
  options: RenderWithMeasuredLayoutOptions = {},
) {
  const maxPasses = Math.max(1, Math.floor(options.maxPasses ?? 4))
  const tolerancePx = Math.max(0, options.measure?.tolerancePx ?? 2)
  const minGapPx = Math.max(0, options.measure?.paddingPx ?? initialLayout.tickLayout.clearanceMinGap ?? 12)

  let layout = initialLayout
  let result = renderPass(layout)
  let svg = container.querySelector('svg')
  if (svg instanceof SVGSVGElement) {
    adjustAxisTitlePositions(svg, minGapPx)
  }
  for (let pass = 1; pass < maxPasses; pass += 1) {
    const overflow = measureRenderedSvgOverflow(container, {
      ...options.measure,
      paddingPx: minGapPx,
    })
    if (!hasMeaningfulOverflow(overflow, tolerancePx)) break
    const nextLayout = expandLayoutModel(layout, overflow)
    if (!layoutChanged(layout, nextLayout, tolerancePx)) break
    layout = nextLayout
    result = renderPass(layout)
    svg = container.querySelector('svg')
    if (svg instanceof SVGSVGElement) {
      adjustAxisTitlePositions(svg, minGapPx)
    }
  }
  return result
}

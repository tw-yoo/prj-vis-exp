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
  if (!viewBox) return

  // During the split animation, the host carries `transform: scaleX(0)` so
  // `getBoundingClientRect()` returns width=0 (and width-derived scales are
  // bogus). Vertical positions of children are unaffected by scaleX, so the
  // x-axis-label vs tick-label overlap check is still meaningful — we just
  // need a sane fallback for the y scale factor. Use the SVG element's
  // layout dimensions (`clientWidth`/`clientHeight`), which are unaffected
  // by CSS transforms, before falling back to a 1:1 ratio.
  const fallbackWidth = svg.clientWidth || svg.parentElement?.clientWidth || viewBox.width
  const fallbackHeight = svg.clientHeight || svg.parentElement?.clientHeight || viewBox.height
  const effWidth = svgRect.width > 0 ? svgRect.width : fallbackWidth
  const effHeight = svgRect.height > 0 ? svgRect.height : fallbackHeight
  if (effWidth <= 0 || effHeight <= 0) return

  const scaleX = viewBox.width / effWidth
  const scaleY = viewBox.height / effHeight
  // Only horizontal measurements (y-axis-label vs y-axis ticks) are
  // unreliable when the SVG is at scaleX(0). Skip the y-title adjustment in
  // that case and still run the x-title one (vertical-only measurements).
  const horizontalUnreliable = svgRect.width <= 0

  const xTitle = svg.querySelector('.x-axis-label')
  const xAxisRects = measureRects(Array.from(svg.querySelectorAll('.x-axis')))
  if (xTitle instanceof SVGTextElement && xAxisRects.length > 0) {
    const xTitleRect = xTitle.getBoundingClientRect()
    const xAxisBottom = xAxisRects.reduce((max, rect) => Math.max(max, rect.bottom), Number.NEGATIVE_INFINITY)
    const deltaPx = xAxisBottom + minGapPx - xTitleRect.top
    if (Math.abs(deltaPx) > 0.5) {
      const currentY = Number(xTitle.getAttribute('y') ?? '0')
      xTitle.setAttribute('y', String(currentY + deltaPx * scaleY))
    }
  }

  if (horizontalUnreliable) return

  const yTitle = svg.querySelector('.y-axis-label')
  const yAxisRects = measureRects(Array.from(svg.querySelectorAll('.y-axis')))
  if (yTitle instanceof SVGTextElement && yAxisRects.length > 0) {
    const yTitleRect = yTitle.getBoundingClientRect()
    const yAxisLeft = yAxisRects.reduce((min, rect) => Math.min(min, rect.left), Number.POSITIVE_INFINITY)
    const deltaPx = yAxisLeft - minGapPx - yTitleRect.right
    if (Math.abs(deltaPx) > 0.5) {
      const currentY = Number(yTitle.getAttribute('y') ?? '0')
      yTitle.setAttribute('y', String(currentY + deltaPx * scaleX))
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
  // Bail out when the SVG isn't currently laid out at non-zero size. Trying
  // to measure during a parent's `transform: scaleX(0)` (the split animation
  // setup) collapses every descendant's horizontal extent to a point and
  // produces nonsense `leftOverflow` values from elements like the y-axis
  // label that genuinely extend leftward at scaleX(1). Leaving the loop
  // alone here is safe: the multi-pass refinement reruns later when the
  // surface is no longer scaled (e.g. when an op triggers a re-render).
  if (!viewBox || svgRect.width <= 0 || svgRect.height <= 0) {
    return { left: 0, right: 0, top: 0, bottom: 0 }
  }

  // Same hazard, intermediate frames: the split animation transitions the
  // host from `scaleX(0)` to `scaleX(1)` over 600ms. If a render lands while
  // the host is e.g. at `scaleX(0.05)`, `svgRect.width` is positive but tiny
  // and the per-pass scaleX (`viewBox.width / svgRect.width`) becomes huge —
  // a few visual pixels of y-title overlap turn into hundreds of viewBox
  // units of `leftOverflow`, then `expandLayoutModel` blows the canvas up.
  // Case 0s6zi9dyw22qo4rp's split-right surface used to render with
  // `viewBox≈1103×377` and `plot-w=160` because of this. Detect a non-
  // identity transform on the container and bail out — when the host
  // settles at scaleX(1) the chart can be re-measured if a later op
  // triggers a re-render.
  if (containerHasShrinkingTransform(container)) {
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
  const rightOverflow = Math.max(0, maxRight - svgRect.right + paddingPx) * scaleX
  const topOverflow = Math.max(0, svgRect.top - minTop + paddingPx) * scaleY
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

function containerHasShrinkingTransform(container: HTMLElement): boolean {
  if (typeof getComputedStyle !== 'function') return false
  let current: Element | null = container
  while (current && current !== document.documentElement) {
    const transform = getComputedStyle(current).transform
    if (transform && transform !== 'none') {
      // Parse matrix(a, b, c, d, tx, ty). When `a` (scaleX) < 1 the element
      // is currently being shrunk — we treat any non-identity transform
      // along the ancestor chain as a hazard rather than try to compose
      // multiple matrices: the split animation is the only place this
      // matters in practice and it sets a single `scaleX(0…1)` on the host.
      const matrixMatch = /matrix\(\s*([-+\d.eE]+)\s*,/.exec(transform)
      if (matrixMatch) {
        const a = Number(matrixMatch[1])
        if (Number.isFinite(a) && a < 0.99) return true
      } else if (transform !== 'matrix(1, 0, 0, 1, 0, 0)') {
        return true
      }
    }
    current = current.parentElement
  }
  return false
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

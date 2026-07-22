import { DataAttributes } from '../interfaces'

// Always-visible numeric value labels for the evaluation viewer. Like the
// hover tooltip, this is a post-render DOM pass over the shared mark contract
// (rect.main-bar / circle carrying data-value etc.), so the same code labels
// all four study systems (Ours live engine, B1/B2 stored SVGs, B3 expert JS)
// without touching the chart engine.
const OVERLAY_CLASS = 'chart-value-labels'
const TARGET_SELECTOR = `rect.main-bar[${DataAttributes.XValue}][${DataAttributes.YValue}], circle[${DataAttributes.XValue}][${DataAttributes.YValue}]`

// Marks the filter ops hide get opacity 0 (or near it); their labels must not
// appear. Dimmed (out-of-scope) marks keep a dimmed label instead.
const HIDDEN_OPACITY_THRESHOLD = 0.15
const MIN_SEGMENT_HEIGHT_FOR_INSIDE_LABEL = 12
const BASE_FONT_SIZE = 10

const pendingTimers: WeakMap<HTMLElement, number> = new WeakMap()
const numericFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 })

export type ValueLabelOptions = {
  // Delay before reading mark positions — for renderers whose step code kicks
  // off d3 transitions it does not await (B2 d3_code, B3 expert functions).
  settleMs?: number
  // Fade the fresh labels in instead of popping.
  fade?: boolean
}

function resolveLabelText(mark: SVGElement): string | null {
  const raw = mark.getAttribute(DataAttributes.Value)
  if (raw !== null && raw.trim() !== '') {
    const num = Number(raw)
    if (Number.isFinite(num)) return numericFormatter.format(num)
    return raw.trim()
  }
  const display = mark.getAttribute(DataAttributes.YValue)
  return display && display.trim() !== '' ? display.trim() : null
}

type Box = { x: number; y: number; w: number; h: number }

function boxesOverlap(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

// Maps a point from a mark's local space into the overlay group's own
// coordinate space, so labels appended there align regardless of how each
// system nests its transformed <g> layers. Built by composing screen-space
// matrices (mark→screen, then screen→overlay): getCTM alone can fold in the
// viewBox→viewport scale on some browsers, which the overlay group does not
// carry, and that mismatch drifts labels off their marks.
function toOverlayPoint(
  overlayFromScreen: DOMMatrix,
  mark: SVGGraphicsElement,
  x: number,
  y: number,
): { x: number; y: number } | null {
  const markToScreen = mark.getScreenCTM()
  if (!markToScreen) return null
  const point = new DOMPoint(x, y).matrixTransform(overlayFromScreen.multiply(markToScreen))
  return { x: point.x, y: point.y }
}

// Rects that stack on the same x column (stacked-bar segments) get their
// labels centered INSIDE the segment; standalone bars get labels above.
function computeStackedColumns(overlayFromScreen: DOMMatrix, rects: SVGRectElement[]): Set<SVGRectElement> {
  const byColumn = new Map<string, SVGRectElement[]>()
  rects.forEach((rect) => {
    const root = toOverlayPoint(overlayFromScreen, rect, Number(rect.getAttribute('x') ?? 0), 0)
    if (!root) return
    const key = String(Math.round(root.x / 4))
    const list = byColumn.get(key)
    if (list) list.push(rect)
    else byColumn.set(key, [rect])
  })
  const stacked = new Set<SVGRectElement>()
  byColumn.forEach((list) => {
    if (list.length > 1) list.forEach((rect) => stacked.add(rect))
  })
  return stacked
}

function labelFontSize(svg: SVGSVGElement): number {
  // Downscaled surfaces (split layout) shrink SVG user units on screen; bump
  // the font so labels stay legible, mirroring annotationFontSize's intent.
  const viewBoxWidth = svg.viewBox?.baseVal?.width || 0
  const clientWidth = svg.getBoundingClientRect().width || 0
  if (viewBoxWidth > 0 && clientWidth > 0 && clientWidth < viewBoxWidth) {
    const ratio = Math.min(1.6, viewBoxWidth / clientWidth)
    return Math.round(BASE_FONT_SIZE * ratio)
  }
  return BASE_FONT_SIZE
}

function renderLabelsForSvg(svg: SVGSVGElement) {
  svg.querySelectorAll(`g.${OVERLAY_CLASS}`).forEach((g) => g.remove())

  const marks = Array.from(svg.querySelectorAll<SVGGraphicsElement>(TARGET_SELECTOR))
  if (!marks.length) return null

  const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'g')
  overlay.setAttribute('class', OVERLAY_CLASS)
  overlay.setAttribute('pointer-events', 'none')
  overlay.setAttribute('aria-hidden', 'true')
  svg.appendChild(overlay)

  const overlayScreenCTM = overlay.getScreenCTM()
  if (!overlayScreenCTM) return overlay
  const overlayFromScreen = overlayScreenCTM.inverse()

  const rects = marks.filter((m): m is SVGRectElement => m instanceof SVGRectElement)
  const stackedRects = computeStackedColumns(overlayFromScreen, rects)
  const fontSize = labelFontSize(svg)
  const placedBoxes: Box[] = []

  marks.forEach((mark) => {
    const style = getComputedStyle(mark)
    if (style.display === 'none' || style.visibility === 'hidden') return
    const markOpacity = Number(style.opacity)
    if (Number.isFinite(markOpacity) && markOpacity < HIDDEN_OPACITY_THRESHOLD) return

    const text = resolveLabelText(mark)
    if (!text) return

    let anchor: { x: number; y: number } | null = null
    let baseline = 'auto'
    let textAnchor = 'middle'
    // Filled when a segment is too short for an inside label: a short connector
    // from the segment edge to the outside label placed beside the bar.
    let leader: { x1: number; y1: number; x2: number; y2: number } | null = null

    if (mark instanceof SVGRectElement) {
      const x = Number(mark.getAttribute('x') ?? 0)
      const y = Number(mark.getAttribute('y') ?? 0)
      const width = Number(mark.getAttribute('width') ?? 0)
      const height = Number(mark.getAttribute('height') ?? 0)
      if (width <= 0 || height <= 0) return
      const rawValue = Number(mark.getAttribute(DataAttributes.Value))
      const isNegative = Number.isFinite(rawValue) && rawValue < 0

      if (stackedRects.has(mark)) {
        if (height < MIN_SEGMENT_HEIGHT_FOR_INSIDE_LABEL) {
          // Too thin to hold text — anchor the label just outside the bar at the
          // segment's mid-height, with a leader line so it stays unambiguous.
          // Near the right edge of the plot, flip it to the left of the bar.
          const rightEdge = toOverlayPoint(overlayFromScreen, mark, x + width, y + height / 2)
          const leftEdge = toOverlayPoint(overlayFromScreen, mark, x, y + height / 2)
          if (!rightEdge || !leftEdge) return
          const gap = 6
          const estTextWidth = text.length * fontSize * 0.62
          const viewRight = (svg.viewBox?.baseVal?.x ?? 0) + (svg.viewBox?.baseVal?.width ?? 0)
          const flipsLeft = rightEdge.x + gap + estTextWidth > viewRight - 2
          if (flipsLeft) {
            anchor = { x: leftEdge.x - gap, y: leftEdge.y }
            textAnchor = 'end'
            leader = { x1: leftEdge.x, y1: leftEdge.y, x2: leftEdge.x - gap + 1, y2: leftEdge.y }
          } else {
            anchor = { x: rightEdge.x + gap, y: rightEdge.y }
            textAnchor = 'start'
            leader = { x1: rightEdge.x, y1: rightEdge.y, x2: rightEdge.x + gap - 1, y2: rightEdge.y }
          }
          baseline = 'middle'
        } else {
          anchor = toOverlayPoint(overlayFromScreen, mark, x + width / 2, y + height / 2)
          baseline = 'middle'
        }
      } else if (isNegative) {
        anchor = toOverlayPoint(overlayFromScreen, mark, x + width / 2, y + height)
        if (anchor) anchor.y += fontSize + 2
      } else {
        // Bar top, then lift the label above it.
        anchor = toOverlayPoint(overlayFromScreen, mark, x + width / 2, y)
        if (anchor) {
          const above = anchor.y - 4
          // A max-height bar's label would leave the viewBox top; drop it just
          // inside the bar instead.
          anchor.y = above - fontSize < 0 ? anchor.y + fontSize + 4 : above
        }
      }
    } else if (mark instanceof SVGCircleElement) {
      const cx = Number(mark.getAttribute('cx') ?? 0)
      const cy = Number(mark.getAttribute('cy') ?? 0)
      const r = Number(mark.getAttribute('r') ?? 3)
      anchor = toOverlayPoint(overlayFromScreen, mark, cx, cy - r)
      if (anchor) {
        anchor.y -= 4
        if (anchor.y - fontSize < 0) anchor.y += r * 2 + fontSize + 8
      }
    }

    if (!anchor) return

    if (leader) {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
      line.setAttribute('x1', String(leader.x1))
      line.setAttribute('y1', String(leader.y1))
      line.setAttribute('x2', String(leader.x2))
      line.setAttribute('y2', String(leader.y2))
      line.setAttribute('stroke', '#6b7280')
      line.setAttribute('stroke-width', '1')
      if (Number.isFinite(markOpacity) && markOpacity < 0.95) line.setAttribute('opacity', String(markOpacity))
      overlay.appendChild(line)
    }

    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    label.textContent = text
    label.setAttribute('x', String(anchor.x))
    label.setAttribute('y', String(anchor.y))
    label.setAttribute('text-anchor', textAnchor)
    if (baseline !== 'auto') label.setAttribute('dominant-baseline', baseline)
    label.setAttribute('font-size', String(fontSize))
    label.setAttribute('font-weight', '600')
    label.setAttribute('fill', '#1f2937')
    label.setAttribute('stroke', '#ffffff')
    label.setAttribute('stroke-width', '3')
    label.setAttribute('stroke-linejoin', 'round')
    label.setAttribute('paint-order', 'stroke')
    if (Number.isFinite(markOpacity) && markOpacity < 0.95) {
      label.setAttribute('opacity', String(markOpacity))
    }
    overlay.appendChild(label)

    // Greedy de-clutter: drop a label that would overlap an already-placed one
    // (adjacent line points on dense charts). The hover tooltip still covers
    // any skipped datum. Outside leader labels (short stacked segments) are
    // exempt — they carry the only readable copy of an otherwise-hidden value,
    // and a leader keeps them unambiguous even when crowded.
    const bbox = label.getBBox()
    const box: Box = { x: bbox.x, y: bbox.y, w: bbox.width, h: bbox.height }
    if (!leader && placedBoxes.some((placed) => boxesOverlap(placed, box))) {
      label.remove()
      return
    }
    placedBoxes.push(box)
  })

  return overlay
}

function applyNow(container: HTMLElement, fade: boolean) {
  const svgs = Array.from(container.querySelectorAll<SVGSVGElement>('svg'))
  svgs.forEach((svg) => {
    const overlay = renderLabelsForSvg(svg)
    if (overlay && fade) {
      overlay.style.opacity = '0'
      requestAnimationFrame(() => {
        overlay.style.transition = 'opacity 300ms ease'
        overlay.style.opacity = '1'
      })
    }
  })
}

export function applyChartValueLabels(container: HTMLElement, options: ValueLabelOptions = {}) {
  const { settleMs, fade = false } = options
  const pending = pendingTimers.get(container)
  if (pending !== undefined) {
    window.clearTimeout(pending)
    pendingTimers.delete(container)
  }
  if (settleMs && settleMs > 0) {
    const timer = window.setTimeout(() => {
      pendingTimers.delete(container)
      applyNow(container, fade)
    }, settleMs)
    pendingTimers.set(container, timer)
    return
  }
  applyNow(container, fade)
}

export function clearChartValueLabels(container: HTMLElement) {
  const pending = pendingTimers.get(container)
  if (pending !== undefined) {
    window.clearTimeout(pending)
    pendingTimers.delete(container)
  }
  container.querySelectorAll(`svg g.${OVERLAY_CLASS}`).forEach((g) => g.remove())
}

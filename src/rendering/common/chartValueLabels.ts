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

// Per-container in-flight rAF watcher id (applyChartValueLabelsWhenSettled), so
// a new step / item switch cancels a stale watcher before it draws onto the
// next chart.
const pendingRaf: WeakMap<HTMLElement, number> = new WeakMap()
// Rounding to 2 decimals collapses distinct data points onto one label
// (0.127 and 0.128 both read "0.13"), which is a correctness bug on a study
// chart. Precision is chosen per chart: the fewest decimals (from 2 up to this
// cap) that keep every distinct value's label distinct.
const MIN_FRACTION_DIGITS = 2
const MAX_FRACTION_DIGITS = 6

// Settle watcher: if no transition has started within this window, treat the
// chart as static and label immediately (B2 scenes are static SVG swaps).
const NO_ANIMATION_GRACE_MS = 200
// Hard cap so a stuck/looping transition can never withhold labels forever.
const SETTLE_MAX_WAIT_MS = 5000

export type ValueLabelOptions = {
  // Fade the fresh labels in instead of popping.
  fade?: boolean
}

export type SettleOptions = ValueLabelOptions & {
  graceMs?: number
  maxWaitMs?: number
}

// Fewest decimals (MIN..MAX) at which no two distinct values share a label.
function chooseFractionDigits(values: number[]): number {
  const distinct = Array.from(new Set(values.filter((v) => Number.isFinite(v))))
  for (let digits = MIN_FRACTION_DIGITS; digits < MAX_FRACTION_DIGITS; digits += 1) {
    const formatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: digits })
    const seen = new Set<string>()
    let collision = false
    for (const value of distinct) {
      const label = formatter.format(value)
      if (seen.has(label)) {
        collision = true
        break
      }
      seen.add(label)
    }
    if (!collision) return digits
  }
  return MAX_FRACTION_DIGITS
}

function resolveLabelText(mark: SVGElement, formatter: Intl.NumberFormat): string | null {
  const raw = mark.getAttribute(DataAttributes.Value)
  if (raw !== null && raw.trim() !== '') {
    const num = Number(raw)
    if (Number.isFinite(num)) return formatter.format(num)
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

  // Chart-wide precision: enough decimals that no two distinct values collapse
  // to the same label, so 0.127 and 0.128 stay distinguishable.
  const rawValues = marks
    .map((m) => Number(m.getAttribute(DataAttributes.Value)))
    .filter((v) => Number.isFinite(v))
  const formatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: chooseFractionDigits(rawValues) })

  const rects = marks.filter((m): m is SVGRectElement => m instanceof SVGRectElement)
  const stackedRects = computeStackedColumns(overlayFromScreen, rects)
  const fontSize = labelFontSize(svg)
  const placedBoxes: Box[] = []
  // An operation may already print a mark's value ON it (the answer highlight —
  // findExtremum / retrieveValue / nth …). Those labels are protected from
  // removal (see isProtectedFromRemoval), so if we ALSO labelled that mark the
  // value would show twice. Collect the operation layer's numeric value labels
  // up front (screen boxes) and skip the overlay label for any mark one sits on.
  const opValueLabelRects = Array.from(
    // Op value labels live either inside the annotation layer or carry an
    // `operation-next-*` class directly (e.g. simpleBar's extremum label sits
    // outside the layer group) — match both so none slip through.
    svg.querySelectorAll<SVGTextElement>('.annotation-layer text, text[class*="operation-next"]'),
  )
    .filter((t) => /^-?\d[\d.,\s]*%?$/.test((t.textContent ?? '').trim()))
    .map((t) => t.getBoundingClientRect())
  // Marks we end up labelling — used to erase any baked-in value number the
  // source chart already drew on the same mark, so ours isn't a duplicate.
  const labeledMarks: SVGGraphicsElement[] = []

  marks.forEach((mark) => {
    const style = getComputedStyle(mark)
    if (style.display === 'none' || style.visibility === 'hidden') return
    const markOpacity = Number(style.opacity)
    if (Number.isFinite(markOpacity) && markOpacity < HIDDEN_OPACITY_THRESHOLD) return

    const text = resolveLabelText(mark, formatter)
    if (!text) return

    // Skip marks an operation already value-labelled (same region as
    // removeBakedValueLabels uses, with headroom for a number above a bar top),
    // so the op's answer label isn't shadowed by a duplicate overlay label.
    if (opValueLabelRects.length) {
      const mr = mark.getBoundingClientRect()
      // Headroom above the bar top: an op result label (e.g. the extremum "380")
      // is lifted a full label-height clear of the top, further than a baked
      // value number, so 16px missed it by a hair. The horizontal test keeps
      // this to the bar's own column, so a generous vertical reach is safe.
      const headroom = fontSize * 2 + 10
      const covered = opValueLabelRects.some((b) => {
        const cx = b.x + b.width / 2
        const cy = b.y + b.height / 2
        return cx >= mr.x - 1 && cx <= mr.right + 1 && cy >= mr.top - headroom && cy <= mr.bottom + 2
      })
      if (covered) return
    }

    let anchor: { x: number; y: number } | null = null
    let baseline = 'auto'
    let textAnchor = 'middle'
    // Filled when a segment is too short for an inside label: a short connector
    // from the segment edge to the outside label placed beside the bar.
    let leader: { x1: number; y1: number; x2: number; y2: number } | null = null
    // Fallback spot (below a point) tried before dropping a colliding label, so
    // adjacent line points like 0.128 / 0.127 both stay visible.
    let altAnchor: { x: number; y: number } | null = null

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
      const below = toOverlayPoint(overlayFromScreen, mark, cx, cy + r)
      if (below) altAnchor = { x: below.x, y: below.y + fontSize + 4 }
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
    let box: Box = { x: bbox.x, y: bbox.y, w: bbox.width, h: bbox.height }
    if (!leader && placedBoxes.some((placed) => boxesOverlap(placed, box))) {
      // Retry at the fallback spot (below a point) before giving up, so both
      // members of a close pair survive.
      if (altAnchor) {
        label.setAttribute('x', String(altAnchor.x))
        label.setAttribute('y', String(altAnchor.y))
        const retry = label.getBBox()
        box = { x: retry.x, y: retry.y, w: retry.width, h: retry.height }
      }
      if (!altAnchor || placedBoxes.some((placed) => boxesOverlap(placed, box))) {
        label.remove()
        return
      }
    }
    placedBoxes.push(box)
    labeledMarks.push(mark)
  })

  removeBakedValueLabels(svg, labeledMarks)

  return overlay
}

// A source chart may already print its own value number on a bar/point. Where
// we've drawn our own label for that mark, erase the baked one so the value
// isn't shown twice. Only marks we actually labelled are touched (so a chart
// whose marks we can't label keeps its numbers), and axis ticks, legend text,
// and operation annotations are protected.
function isProtectedFromRemoval(text: Element): boolean {
  if (text.closest(`.${OVERLAY_CLASS}`)) return true
  if (text.closest('.tick')) return true
  let el: Element | null = text
  for (let depth = 0; el && depth < 4; depth += 1, el = el.parentElement) {
    const cls = el.getAttribute('class') ?? ''
    if (/axis|legend|annotation|operation-next|panel-title|summary/i.test(cls)) return true
    if (
      el.hasAttribute('data-series') ||
      el.hasAttribute('data-group-value') ||
      el.hasAttribute('data-base-axis-label-transform')
    ) {
      return true
    }
  }
  return false
}

function removeBakedValueLabels(svg: SVGSVGElement, labeledMarks: SVGGraphicsElement[]) {
  if (!labeledMarks.length) return
  const markRects = labeledMarks.map((m) => m.getBoundingClientRect())
  svg.querySelectorAll('text').forEach((text) => {
    if (isProtectedFromRemoval(text)) return
    const value = text.textContent?.trim() ?? ''
    // Purely-numeric text only (a value label), never a category/word.
    if (!/^-?\d[\d.,\s]*%?$/.test(value)) return
    const rect = text.getBoundingClientRect()
    const cx = rect.x + rect.width / 2
    const cy = rect.y + rect.height / 2
    // Inside a labelled mark's box, allowing a little headroom for value
    // numbers printed just above a bar top.
    const onLabeledMark = markRects.some(
      (m) => cx >= m.x - 1 && cx <= m.right + 1 && cy >= m.top - 16 && cy <= m.bottom + 2,
    )
    if (onLabeledMark) text.remove()
  })
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

function cancelPendingRaf(container: HTMLElement) {
  const raf = pendingRaf.get(container)
  if (raf !== undefined) {
    cancelAnimationFrame(raf)
    pendingRaf.delete(container)
  }
}

export function applyChartValueLabels(container: HTMLElement, options: ValueLabelOptions = {}) {
  cancelPendingRaf(container)
  applyNow(container, options.fade ?? false)
}

// True while any d3 transition is scheduled or running anywhere in the chart:
// d3-transition stores live schedules on `node.__transition` and deletes the
// property once every schedule on that node (delays included) has ended, so an
// absence across the whole subtree means the animation is over.
function hasActiveTransition(container: HTMLElement): boolean {
  const svgs = container.querySelectorAll('svg')
  for (const svg of svgs) {
    if ((svg as unknown as { __transition?: unknown }).__transition) return true
    const nodes = svg.querySelectorAll('*')
    for (const node of nodes) {
      if ((node as unknown as { __transition?: unknown }).__transition) return true
    }
  }
  return false
}

// Apply labels the moment the chart's animation ends, instead of guessing a
// fixed delay. Watches for d3 transitions to drain (see hasActiveTransition);
// a chart that never animates (B2's static scene swaps) is labelled after a
// short grace. Supersedes any earlier watcher on the same container.
export function applyChartValueLabelsWhenSettled(container: HTMLElement, options: SettleOptions = {}) {
  const { fade = false, graceMs = NO_ANIMATION_GRACE_MS, maxWaitMs = SETTLE_MAX_WAIT_MS } = options
  cancelPendingRaf(container)

  const start = performance.now()
  let sawActive = false
  let quietFrames = 0

  const tick = () => {
    const active = hasActiveTransition(container)
    if (active) {
      sawActive = true
      quietFrames = 0
    } else {
      quietFrames += 1
    }
    const elapsed = performance.now() - start
    // Settled once a seen animation has been quiet for 2 frames (debounce
    // against the brief gap between chained transitions), or nothing ever
    // animated within the grace window, or the safety cap is reached.
    const settled =
      (sawActive && quietFrames >= 2) ||
      (!sawActive && elapsed >= graceMs) ||
      elapsed >= maxWaitMs
    if (settled) {
      pendingRaf.delete(container)
      applyNow(container, fade)
      return
    }
    pendingRaf.set(container, requestAnimationFrame(tick))
  }

  pendingRaf.set(container, requestAnimationFrame(tick))
}

export function clearChartValueLabels(container: HTMLElement) {
  cancelPendingRaf(container)
  container.querySelectorAll(`svg g.${OVERLAY_CLASS}`).forEach((g) => g.remove())
}

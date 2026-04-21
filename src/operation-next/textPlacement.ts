import * as d3 from 'd3'
import { CHART_TEXT_COLLISION } from '../rendering/config/chartTextConfig'
import { SvgAttributes, SvgClassNames, SvgElements } from '../rendering/interfaces'

type BoxBounds = { x: number; y: number; width: number; height: number }

type TextPlacementOptions = {
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>
  text: d3.Selection<SVGTextElement, unknown, d3.BaseType, unknown>
  preferred: { x: number; y: number }
  anchorElement?: Element | null
  viewport?: BoxBounds
}

function clampNonNegative(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0
}

function boxArea(box: BoxBounds) {
  return clampNonNegative(box.width) * clampNonNegative(box.height)
}

function intersectionArea(a: BoxBounds, b: BoxBounds) {
  const x1 = Math.max(a.x, b.x)
  const y1 = Math.max(a.y, b.y)
  const x2 = Math.min(a.x + a.width, b.x + b.width)
  const y2 = Math.min(a.y + a.height, b.y + b.height)
  return Math.max(0, x2 - x1) * Math.max(0, y2 - y1)
}

function expandBox(box: BoxBounds, padding: number): BoxBounds {
  return {
    x: box.x - padding,
    y: box.y - padding,
    width: box.width + padding * 2,
    height: box.height + padding * 2,
  }
}

function svgViewport(svgNode: SVGSVGElement): BoxBounds {
  const viewBox = svgNode.viewBox?.baseVal
  if (viewBox && viewBox.width > 0 && viewBox.height > 0) {
    return { x: viewBox.x, y: viewBox.y, width: viewBox.width, height: viewBox.height }
  }
  const rect = svgNode.getBoundingClientRect()
  return { x: 0, y: 0, width: rect.width, height: rect.height }
}

function safeBox(node: Element | null): BoxBounds | null {
  if (!node || !('getBBox' in node)) return null
  try {
    const box = (node as SVGGraphicsElement).getBBox()
    if (!(box.width >= 0 && box.height >= 0)) return null
    return { x: box.x, y: box.y, width: box.width, height: box.height }
  } catch {
    return null
  }
}

function collectObstacles(svgNode: SVGSVGElement, textNode: SVGTextElement): BoxBounds[] {
  const selector = [
    `${SvgElements.Rect}.${SvgClassNames.MainBar}`,
    `${SvgElements.Line}.${SvgClassNames.LineAnnotation}`,
    `${SvgElements.Text}.${SvgClassNames.TextAnnotation}`,
  ].join(',')

  return Array.from(svgNode.querySelectorAll<Element>(selector))
    .filter((node) => node !== textNode)
    .map((node) => safeBox(node))
    .filter((box): box is BoxBounds => box != null)
}

function buildCandidates(preferred: { x: number; y: number }, anchorElement?: Element | null) {
  const candidates: Array<{ x: number; y: number }> = []
  const seen = new Set<string>()
  const push = (x: number, y: number) => {
    const key = `${x.toFixed(2)}:${y.toFixed(2)}`
    if (seen.has(key)) return
    seen.add(key)
    candidates.push({ x, y })
  }

  push(preferred.x, preferred.y)
  const anchorBox = safeBox(anchorElement ?? null)
  const anchorCenterY = anchorBox ? anchorBox.y + anchorBox.height / 2 : null
  const preferUp = anchorCenterY == null ? true : preferred.y <= anchorCenterY
  const primarySign = preferUp ? -1 : 1
  const secondarySign = -primarySign

  for (let radius = CHART_TEXT_COLLISION.stepPx; radius <= CHART_TEXT_COLLISION.maxRadiusAnchorPx; radius += CHART_TEXT_COLLISION.stepPx) {
    const primaryDy = primarySign * radius
    const secondaryDy = secondarySign * radius
    ;[
      { dx: 0, dy: primaryDy },
      { dx: -radius, dy: primaryDy },
      { dx: radius, dy: primaryDy },
      { dx: -radius, dy: 0 },
      { dx: radius, dy: 0 },
      { dx: 0, dy: secondaryDy },
      { dx: -radius, dy: secondaryDy },
      { dx: radius, dy: secondaryDy },
    ].forEach(({ dx, dy }) => push(preferred.x + dx, preferred.y + dy))
  }

  return candidates
}

export function placeOperationTextLabel(options: TextPlacementOptions) {
  const svgNode = options.svg.node()
  const textNode = options.text.node()
  if (!svgNode || !textNode) return options.preferred

  const viewport = options.viewport ?? svgViewport(svgNode)
  const allowed = {
    x: viewport.x + CHART_TEXT_COLLISION.viewportPaddingPx,
    y: viewport.y + CHART_TEXT_COLLISION.viewportPaddingPx,
    width: Math.max(0, viewport.width - CHART_TEXT_COLLISION.viewportPaddingPx * 2),
    height: Math.max(0, viewport.height - CHART_TEXT_COLLISION.viewportPaddingPx * 2),
  }
  const obstacles = collectObstacles(svgNode, textNode)
  const anchorBox = safeBox(options.anchorElement ?? null)
  const anchorCenterY = anchorBox ? anchorBox.y + anchorBox.height / 2 : null

  let best = { ...options.preferred, score: Number.POSITIVE_INFINITY }
  buildCandidates(options.preferred, options.anchorElement).forEach((candidate) => {
    options.text.attr(SvgAttributes.X, candidate.x).attr(SvgAttributes.Y, candidate.y)
    const textBox = safeBox(textNode)
    if (!textBox) return

    const paddedText = expandBox(textBox, CHART_TEXT_COLLISION.obstaclePaddingPx)
    const overlapArea = obstacles.reduce((sum, box) => sum + intersectionArea(paddedText, expandBox(box, CHART_TEXT_COLLISION.obstaclePaddingPx)), 0)
    const insideArea = intersectionArea(textBox, allowed)
    const outsideArea = Math.max(0, boxArea(textBox) - insideArea)
    const displacement = Math.hypot(candidate.x - options.preferred.x, candidate.y - options.preferred.y)
    const sidePenalty =
      anchorCenterY != null &&
      Math.sign(options.preferred.y - anchorCenterY) !== 0 &&
      Math.sign(candidate.y - anchorCenterY) !== 0 &&
      Math.sign(options.preferred.y - anchorCenterY) !== Math.sign(candidate.y - anchorCenterY)
        ? CHART_TEXT_COLLISION.sideFlipPenalty
        : 0
    const score =
      overlapArea * CHART_TEXT_COLLISION.scoreWeightOverlap +
      outsideArea * CHART_TEXT_COLLISION.scoreWeightOutside +
      displacement +
      sidePenalty

    if (score < best.score) best = { x: candidate.x, y: candidate.y, score }
  })

  options.text.attr(SvgAttributes.X, best.x).attr(SvgAttributes.Y, best.y)
  return { x: best.x, y: best.y }
}

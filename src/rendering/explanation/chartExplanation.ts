import { DataAttributes, SvgAttributes, SvgClassNames, SvgElements } from '../interfaces'
import { CHART_TEXT_SIZE } from '../config/chartTextConfig'

const SVG_NS = 'http://www.w3.org/2000/svg'
const MAX_EXPLANATION_LINE_CHARS = 72
const BACKGROUND_PADDING_X = 10
const BACKGROUND_PADDING_Y = 4

export type ChartExplanationContent = {
  text: string
}

function normalizeText(value: string | undefined) {
  return (value ?? '').replace(/\s+/g, ' ').trim()
}

function truncateText(value: string, maxChars: number) {
  if (value.length <= maxChars) return value
  const slice = value.slice(0, Math.max(0, maxChars - 1)).trimEnd()
  const lastSpace = slice.lastIndexOf(' ')
  const truncated = lastSpace >= Math.max(12, Math.floor(maxChars * 0.5)) ? slice.slice(0, lastSpace) : slice
  return `${truncated.trimEnd()}…`
}

function wrapExplanationLines(value: string) {
  const normalized = normalizeText(value)
  if (!normalized) return []
  if (normalized.length <= MAX_EXPLANATION_LINE_CHARS) return [normalized]
  const words = normalized.split(/\s+/)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (next.length <= MAX_EXPLANATION_LINE_CHARS || current.length === 0) {
      current = next
      continue
    }
    lines.push(current)
    current = word
    if (lines.length === 2) break
  }
  if (lines.length < 2 && current) {
    lines.push(current)
  }
  if (lines.length > 2) {
    lines.splice(2)
  }
  if (lines.length === 2) {
    lines[1] = truncateText(lines[1], MAX_EXPLANATION_LINE_CHARS)
  }
  return lines.map((line) => line.trim()).filter((line) => line.length > 0)
}

function resolveExplanationLines(content: ChartExplanationContent) {
  return wrapExplanationLines(content.text).slice(0, 2)
}

function getRootSvg(container: HTMLElement) {
  const svg = container.querySelector('svg')
  return svg instanceof SVGSVGElement ? svg : null
}

function getViewBoxSize(svg: SVGSVGElement) {
  const viewBox = svg.viewBox?.baseVal
  if (viewBox && viewBox.width > 0 && viewBox.height > 0) {
    return { width: viewBox.width, height: viewBox.height }
  }
  const rect = svg.getBoundingClientRect()
  return { width: rect.width, height: rect.height }
}

function readNumericAttr(svg: SVGSVGElement, attr: string) {
  const raw = Number(svg.getAttribute(attr))
  return Number.isFinite(raw) ? raw : null
}

function resolveExplanationBand(svg: SVGSVGElement, height: number) {
  const top = readNumericAttr(svg, DataAttributes.ExplanationTop)
  const bandHeight = readNumericAttr(svg, DataAttributes.ExplanationHeight)
  if (top != null && bandHeight != null && bandHeight > 0) {
    return { top, height: bandHeight }
  }

  const rawMarginTop = readNumericAttr(svg, DataAttributes.MarginTop)
  const marginTop = rawMarginTop != null && rawMarginTop > 0 ? rawMarginTop : Math.max(24, height * 0.16)
  const fallbackHeight = Math.max(32, Math.min(48, marginTop - 16))
  return {
    top: Math.max(8, Math.min(16, Math.max(8, marginTop - fallbackHeight - 8))),
    height: fallbackHeight,
  }
}

function ensureExplanationLayer(svg: SVGSVGElement) {
  const existing = Array.from(svg.children).find((child) =>
    child instanceof SVGGElement && child.classList.contains(SvgClassNames.ExplanationLayer),
  )
  if (existing instanceof SVGGElement) return existing

  const layer = svg.ownerDocument.createElementNS(SVG_NS, SvgElements.Group) as SVGGElement
  layer.setAttribute('class', SvgClassNames.ExplanationLayer)
  layer.setAttribute('pointer-events', 'none')
  svg.appendChild(layer)
  return layer
}

export function clearChartExplanation(container: HTMLElement) {
  const svg = getRootSvg(container)
  if (!svg) return
  const layer = Array.from(svg.children).find((child) =>
    child instanceof SVGGElement && child.classList.contains(SvgClassNames.ExplanationLayer),
  )
  if (layer) layer.remove()
}

export function renderChartExplanation(container: HTMLElement, content: ChartExplanationContent | null) {
  const svg = getRootSvg(container)
  if (!svg || !content) {
    clearChartExplanation(container)
    return
  }

  const lines = resolveExplanationLines(content)
  if (!lines.length) {
    clearChartExplanation(container)
    return
  }

  const layer = ensureExplanationLayer(svg)
  layer.replaceChildren()

  const { width, height } = getViewBoxSize(svg)
  const band = resolveExplanationBand(svg, height)
  const x = width / 2
  const y = band.top + 2

  const text = svg.ownerDocument.createElementNS(SVG_NS, SvgElements.Text) as SVGTextElement
  text.setAttribute('class', SvgClassNames.ExplanationText)
  text.setAttribute(SvgAttributes.X, String(x))
  text.setAttribute(SvgAttributes.Y, String(y))
  text.setAttribute(SvgAttributes.TextAnchor, 'middle')
  text.setAttribute(SvgAttributes.DominantBaseline, 'hanging')
  text.setAttribute(SvgAttributes.Fill, '#111827')

  lines.forEach((line, index) => {
    const tspan = svg.ownerDocument.createElementNS(SVG_NS, SvgElements.TSpan) as SVGTSpanElement
    tspan.setAttribute(SvgAttributes.X, String(x))
    tspan.setAttribute('dy', index === 0 ? '0' : '1.2em')
    tspan.setAttribute(SvgAttributes.FontSize, String(CHART_TEXT_SIZE.explanationPrimary))
    tspan.setAttribute(SvgAttributes.FontWeight, 'bold')
    tspan.textContent = line
    text.appendChild(tspan)
  })

  layer.appendChild(text)

  const bbox = text.getBBox()
  const background = svg.ownerDocument.createElementNS(SVG_NS, SvgElements.Rect) as SVGRectElement
  background.setAttribute('class', SvgClassNames.ExplanationBackground)
  background.setAttribute(SvgAttributes.X, String(bbox.x - BACKGROUND_PADDING_X))
  background.setAttribute(SvgAttributes.Y, String(bbox.y - BACKGROUND_PADDING_Y))
  background.setAttribute(SvgAttributes.Width, String(bbox.width + BACKGROUND_PADDING_X * 2))
  background.setAttribute(SvgAttributes.Height, String(bbox.height + BACKGROUND_PADDING_Y * 2))
  background.setAttribute(SvgAttributes.Fill, 'rgba(255,255,255,0.92)')
  background.setAttribute(SvgAttributes.Stroke, 'rgba(17,24,39,0.08)')
  background.setAttribute(SvgAttributes.StrokeWidth, '1')
  background.setAttribute(SvgAttributes.RX, '6')

  layer.insertBefore(background, text)
}

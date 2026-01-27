import * as d3 from 'd3'
import type { JsonObject, JsonValue } from '../../types'
import { DataAttributes, SvgAttributes, SvgClassNames, SvgElements, SvgSelectors } from '../interfaces'

// Loosen d3 selection typing to reduce downstream generic incompatibilities
type D3Datum = any
type D3Selection = d3.Selection<any, D3Datum, any, any>

// ---------------------------------------------------------------------------
// Animation configuration (ported from animationConfig.js)
// ---------------------------------------------------------------------------

export const DURATIONS = {
  HIGHLIGHT: 600,
  FADE: 400,
  DIM: 400,
  GUIDELINE_DRAW: 400,
  LABEL_FADE_IN: 400,
  REPOSITION: 1000,
  STACK: 1200,
  REMOVE: 300,
  COUNT_INTERVAL: 30,
  NTH_COUNT: 50,
  NTH_HIGHLIGHT: 150,
  FILTER_DELAY: 700,
  SUM_DELAY: 200,
}

export const OPACITIES = {
  FULL: 1,
  DIM: 0.2,
  SEMI_DIM: 0.3,
  HIDDEN: 0,
}

export const STYLES = {
  GUIDELINE: {
    strokeDasharray: '4 4',
    strokeWidth: 1.5,
    opacity: 1,
  },
  THRESHOLD: {
    strokeDasharray: '5 5',
    strokeWidth: 2,
    opacity: 1,
  },
  VALUE_LABEL: {
    fontSize: 12,
    fontWeight: 'bold',
    textAnchor: 'middle' as const,
    stroke: 'white',
    strokeWidth: 3,
    paintOrder: 'stroke',
  },
  AGGREGATE_LABEL: {
    fontSize: 12,
    fontWeight: 'bold',
    stroke: 'white',
    strokeWidth: 3,
    paintOrder: 'stroke',
  },
  LABEL_BACKGROUND: {
    fill: 'white',
    rx: 3,
    opacity: 0.9,
  },
  RETRIEVE_LINE: {
    strokeWidth: 2,
    strokeDasharray: '5,5',
  },
}

export const EASINGS = {
  DEFAULT: d3.easeCubicInOut,
  SMOOTH: d3.easeCubicOut,
  LINEAR: d3.easeLinear,
}

export const OFFSETS = {
  LABEL_ABOVE_BAR: -6,
  LABEL_ABOVE_LINE: -10,
  LABEL_BESIDE_BAR: 4,
  BRIDGE_OFFSET: -8,
  NTH_ORDINAL_Y: -15,
  NTH_VALUE_Y: -1,
}

// ---------------------------------------------------------------------------
// Animation helpers (ported from animationHelpers.js)
// ---------------------------------------------------------------------------

export async function fadeElements(selection: D3Selection, targetOpacity: number, duration = DURATIONS.FADE) {
  if (!selection || selection.empty()) return Promise.resolve()
  return selection.transition().duration(duration).ease(EASINGS.SMOOTH).attr(SvgAttributes.Opacity, targetOpacity).end()
}

export async function changeBarColor(selection: D3Selection, color: string, duration = DURATIONS.HIGHLIGHT) {
  if (!selection || selection.empty()) return Promise.resolve()
  return selection.transition().duration(duration).ease(EASINGS.SMOOTH).attr(SvgAttributes.Fill, color).end()
}

export async function dimOthers(allElements: D3Selection, selectedElements: D3Selection, opacity = OPACITIES.DIM) {
  const selectedNodes = new Set(selectedElements.nodes?.() ?? [])
  const others = allElements.filter((_d, i, nodes) => !selectedNodes.has(nodes[i] as Element))
  return fadeElements(others, opacity, DURATIONS.DIM)
}

export async function drawHorizontalGuideline(
  svg: D3Selection,
  yPosition: number,
  color: string,
  margins: { top: number; left: number },
  plotWidth: number,
  style: 'dashed' | 'solid' = 'dashed',
) {
  const yAbsolute = margins.top + yPosition
  const strokeDasharray = style === 'dashed' ? STYLES.GUIDELINE.strokeDasharray : 'none'

  const line = svg
    .append(SvgElements.Line)
    .attr(SvgAttributes.Class, `${SvgClassNames.Annotation} ${SvgClassNames.Guideline}`)
    .attr(SvgAttributes.X1, margins.left)
    .attr(SvgAttributes.Y1, yAbsolute)
    .attr(SvgAttributes.X2, margins.left)
    .attr(SvgAttributes.Y2, yAbsolute)
    .attr(SvgAttributes.Stroke, color)
    .attr(SvgAttributes.StrokeDasharray, strokeDasharray)
    .attr(SvgAttributes.StrokeWidth, STYLES.GUIDELINE.strokeWidth)

  return line
    .transition()
    .duration(DURATIONS.GUIDELINE_DRAW)
    .ease(EASINGS.SMOOTH)
    .attr(SvgAttributes.X2, margins.left + plotWidth)
    .end()
}

export async function drawVerticalGuideline(
  svg: D3Selection,
  xPosition: number,
  yStart: number,
  yEnd: number,
  color: string,
  margins: { top: number; left: number },
  style: 'dashed' | 'solid' = 'dashed',
) {
  const xAbsolute = margins.left + xPosition
  const yStartAbsolute = margins.top + yStart
  const yEndAbsolute = margins.top + yEnd

  const strokeDasharray = style === 'dashed' ? STYLES.GUIDELINE.strokeDasharray : 'none'

  const line = svg
    .append(SvgElements.Line)
    .attr(SvgAttributes.Class, `${SvgClassNames.Annotation} ${SvgClassNames.Guideline}`)
    .attr(SvgAttributes.X1, xAbsolute)
    .attr(SvgAttributes.Y1, yStartAbsolute)
    .attr(SvgAttributes.X2, xAbsolute)
    .attr(SvgAttributes.Y2, yStartAbsolute)
    .attr(SvgAttributes.Stroke, color)
    .attr(SvgAttributes.StrokeDasharray, strokeDasharray)
    .attr(SvgAttributes.StrokeWidth, STYLES.GUIDELINE.strokeWidth)

  return line
    .transition()
    .duration(DURATIONS.GUIDELINE_DRAW)
    .ease(EASINGS.SMOOTH)
    .attr(SvgAttributes.Y2, yEndAbsolute)
    .end()
}

export async function addValueLabel(
  svg: D3Selection,
  x: number,
  y: number,
  text: string,
  color: string,
  options: {
    fontSize?: number
    fontWeight?: string | number
    textAnchor?: string
    className?: string
  } = {},
) {
  const {
    fontSize = STYLES.VALUE_LABEL.fontSize,
    fontWeight = STYLES.VALUE_LABEL.fontWeight,
    textAnchor = STYLES.VALUE_LABEL.textAnchor,
    className = SvgClassNames.Annotation,
  } = options

  const label = svg
    .append(SvgElements.Text)
    .attr(SvgAttributes.Class, className)
    .attr(SvgAttributes.X, x)
    .attr(SvgAttributes.Y, y)
    .attr(SvgAttributes.TextAnchor, textAnchor)
    .style('font-size', `${fontSize}px`)
    .style('font-weight', fontWeight)
    .attr(SvgAttributes.Fill, color)
    .attr(SvgAttributes.Stroke, STYLES.VALUE_LABEL.stroke)
    .attr(SvgAttributes.StrokeWidth, STYLES.VALUE_LABEL.strokeWidth)
    .attr(SvgAttributes.PaintOrder, STYLES.VALUE_LABEL.paintOrder)
    .text(text)
    .attr(SvgAttributes.Opacity, 0)

  return label.transition().duration(DURATIONS.LABEL_FADE_IN).attr(SvgAttributes.Opacity, 1).end()
}

export async function addLabelBackground(svg: D3Selection, x: number, y: number, width: number, height: number) {
  const bg = svg
    .append(SvgElements.Rect)
    .attr(SvgAttributes.Class, `${SvgClassNames.Annotation} ${SvgClassNames.LabelBackground}`)
    .attr(SvgAttributes.X, x - width / 2)
    .attr(SvgAttributes.Y, y)
    .attr(SvgAttributes.Width, width)
    .attr(SvgAttributes.Height, height)
    .attr(SvgAttributes.Fill, STYLES.LABEL_BACKGROUND.fill)
    .attr(SvgAttributes.RX, STYLES.LABEL_BACKGROUND.rx)
    .attr(SvgAttributes.Opacity, 0)

  return bg
    .transition()
    .duration(DURATIONS.LABEL_FADE_IN)
    .attr(SvgAttributes.Opacity, STYLES.LABEL_BACKGROUND.opacity)
    .end()
}

export async function drawAggregateResult(
  svg: D3Selection,
  margins: { top: number; left: number },
  plot: { w: number; h?: number },
  yPos: number,
  color: string,
  labelText: string,
) {
  const yAbsolute = margins.top + yPos

  svg
    .append(SvgElements.Line)
    .attr(SvgAttributes.Class, `${SvgClassNames.Annotation} ${SvgClassNames.ValueLine}`)
    .attr(SvgAttributes.X1, margins.left)
    .attr(SvgAttributes.Y1, yAbsolute)
    .attr(SvgAttributes.X2, margins.left + plot.w)
    .attr(SvgAttributes.Y2, yAbsolute)
    .attr(SvgAttributes.Stroke, color)
    .attr(SvgAttributes.StrokeWidth, STYLES.THRESHOLD.strokeWidth)
    .attr(SvgAttributes.StrokeDasharray, STYLES.THRESHOLD.strokeDasharray)

  const centerX = margins.left + plot.w / 2
  const centerY = yAbsolute + OFFSETS.LABEL_ABOVE_LINE

  return addValueLabel(svg, centerX, centerY, labelText, color, {
    fontSize: STYLES.AGGREGATE_LABEL.fontSize,
    fontWeight: STYLES.AGGREGATE_LABEL.fontWeight,
  })
}

export async function drawDiffBridge(
  svg: D3Selection,
  margins: { left: number; top?: number },
  plot: { w: number; h?: number },
  posA: number,
  posB: number,
  color: string,
  labelText: string,
) {
  const minY = Math.min(posA, posB)
  const maxY = Math.max(posA, posB)
  const diffX = margins.left + plot.w + OFFSETS.BRIDGE_OFFSET

  const bridge = svg
    .append(SvgElements.Line)
    .attr(SvgAttributes.Class, `${SvgClassNames.Annotation} ${SvgClassNames.DiffLine}`)
    .attr(SvgAttributes.X1, diffX)
    .attr(SvgAttributes.X2, diffX)
    .attr(SvgAttributes.Y1, minY)
    .attr(SvgAttributes.Y2, minY)
    .attr(SvgAttributes.Stroke, color)
    .attr(SvgAttributes.StrokeWidth, STYLES.THRESHOLD.strokeWidth)
    .attr(SvgAttributes.StrokeDasharray, STYLES.THRESHOLD.strokeDasharray)

  await bridge.transition().duration(DURATIONS.GUIDELINE_DRAW).attr(SvgAttributes.Y2, maxY).end()

  const labelY = (minY + maxY) / 2
  return addValueLabel(svg, diffX - 6, labelY, labelText, color, { textAnchor: 'end' })
}

export async function drawRetrieveLine(
  svg: D3Selection,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  color: string,
) {
  const line = svg
    .append(SvgElements.Line)
    .attr(SvgAttributes.Class, `${SvgClassNames.RetrieveLine} ${SvgClassNames.Annotation}`)
    .attr(SvgAttributes.X1, startX)
    .attr(SvgAttributes.X2, startX)
    .attr(SvgAttributes.Y1, startY)
    .attr(SvgAttributes.Y2, startY)
    .attr(SvgAttributes.Stroke, color)
    .attr(SvgAttributes.StrokeWidth, STYLES.RETRIEVE_LINE.strokeWidth)
    .attr(SvgAttributes.StrokeDasharray, STYLES.RETRIEVE_LINE.strokeDasharray)
    .attr(SvgAttributes.Opacity, 0)

  return line
    .transition()
    .duration(DURATIONS.GUIDELINE_DRAW)
    .attr(SvgAttributes.X2, endX)
    .attr(SvgAttributes.Y2, endY)
    .attr(SvgAttributes.Opacity, 1)
    .end()
}

export async function parallel(...animations: Array<Promise<void> | (() => Promise<void>)>) {
  return Promise.all(
    animations.map((anim) => {
      if (typeof anim === 'function') return anim()
      return anim
    }),
  )
}

export async function sequence(...animations: Array<Promise<void> | (() => Promise<void>)>) {
  for (const anim of animations) {
    if (typeof anim === 'function') {
      await anim()
    } else {
      await anim
    }
  }
}

export const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// ---------------------------------------------------------------------------
// Chart context helpers (ported/refactored from chartContext.js)
// ---------------------------------------------------------------------------
function selectPlotGroup(svg: D3Selection, preferPlotArea = true): D3Selection {
  if (!svg || typeof (svg as any).select !== 'function') return d3.select(null) as unknown as D3Selection
  if (preferPlotArea) {
    const plot = svg.select(SvgSelectors.PlotArea)
    if (!plot.empty()) return plot as unknown as D3Selection
  }
  const g = svg.select(SvgElements.Group)
  return (g.empty() ? svg.select(SvgSelectors.PlotArea) : g) as unknown as D3Selection
}

export type ChartContext = {
  svg: D3Selection
  g: D3Selection
  margins: { left: number; top: number }
  plot: { w: number; h: number }
  xField?: string | null
  yField?: string | null
  colorField?: string | null
  facetField?: string | null
  chartInfo?: JsonObject | null
}

function findSvg(container: HTMLElement | SVGSVGElement | null) {
  if (!container) return null
  if (container instanceof SVGSVGElement) return container
  return container.querySelector(SvgElements.Svg)
}

/**
 * Read chart-level attributes and convenience references.
 * @param container Root container (chart host) or the svg element itself.
 */
/**
 * Read chart-level attributes and convenience references from a host container or svg.
 * Returns svg/g selections plus sizing metadata encoded in data-* attributes.
 */
export function getChartContext(
  container: HTMLElement | SVGSVGElement | null,
  opts: { preferPlotArea?: boolean } = {},
): ChartContext {
  const { preferPlotArea = true } = opts
  const svgNode = findSvg(container)
  const svg: D3Selection = svgNode ? (d3.select(svgNode) as any) : (d3.select(null) as any)

  const margins = {
    left: +(svgNode?.getAttribute(DataAttributes.MarginLeft) || 0),
    top: +(svgNode?.getAttribute(DataAttributes.MarginTop) || 0),
  }
  const plot = {
    w: +(svgNode?.getAttribute(DataAttributes.PlotWidth) || 0),
    h: +(svgNode?.getAttribute(DataAttributes.PlotHeight) || 0),
  }

  const g = selectPlotGroup(svg, preferPlotArea)

  return {
    svg,
    g,
    margins,
    plot,
    xField: svgNode?.getAttribute(DataAttributes.XField),
    yField: svgNode?.getAttribute(DataAttributes.YField),
    colorField: svgNode?.getAttribute(DataAttributes.ColorField),
    facetField: svgNode?.getAttribute(DataAttributes.FacetField),
    chartInfo: (svgNode as { __chartInfo?: JsonObject })?.__chartInfo ?? null,
  }
}

/** Factory returning a context getter with preferred options preset. */
export function makeGetSvgAndSetup(opts: { preferPlotArea?: boolean } = {}) {
  return (container: HTMLElement | SVGSVGElement | null) => getChartContext(container, opts)
}

/** Adjust x/y-axis label clearance by nudging titles if they overlap ticks. */
export function ensureXAxisLabelClearance(chartId: string, opts: { attempts?: number; minGap?: number; maxShift?: number } = {}) {
  const attempts = Math.max(1, Math.floor(opts.attempts ?? 3))
  let remaining = attempts
  const schedule = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (cb: FrameRequestCallback) => setTimeout(cb, 16)

  const step = () => {
    if (remaining <= 0) return
    remaining -= 1
    schedule(() => {
      const container = document.getElementById(chartId)
      if (!container) return
      const svg = container.querySelector('svg')
      if (!svg) return
      const xTitle = svg.querySelector(SvgSelectors.XAxisLabelText) as SVGTextElement | null
      const xAxis = svg.querySelector(SvgSelectors.XAxisGroup) as SVGGElement | null
      if (xTitle && xAxis) {
        const titleRect = xTitle.getBoundingClientRect()
        const axisRect = xAxis.getBoundingClientRect()
        if (titleRect && axisRect) {
          const overlap = axisRect.bottom + (opts.minGap ?? 12) - titleRect.top
          if (overlap > 0) {
            const currentY = parseFloat(xTitle.getAttribute('y') || '0')
            xTitle.setAttribute('y', String(currentY + Math.min(overlap, opts.maxShift ?? 120)))
          }
        }
      }
      const yTitle = svg.querySelector(SvgSelectors.YAxisLabelText) as SVGTextElement | null
      const yAxis = svg.querySelector(SvgSelectors.YAxisGroup) as SVGGElement | null
      if (yTitle && yAxis) {
        const titleRect = yTitle.getBoundingClientRect()
        const axisRect = yAxis.getBoundingClientRect()
        if (titleRect && axisRect) {
          const overlap = titleRect.right - (axisRect.left - (opts.minGap ?? 12))
          if (overlap > 0) {
            const currentY = parseFloat(yTitle.getAttribute('y') || '0')
            yTitle.setAttribute('y', String(currentY - Math.min(overlap, opts.maxShift ?? 120)))
          }
        }
      }
    })
  }
  step()
}

/** Shrink SVG viewBox to fit its contents with a small padding to reduce extra whitespace. */
export function shrinkSvgViewBox(container: HTMLElement | SVGSVGElement | null, pad = 6) {
  const svg = d3.select(container as any).select(SvgElements.Svg)
  if (svg.empty()) return
  const node = svg.node() as SVGSVGElement | null
  if (!node || typeof node.getBBox !== 'function') return
  const bbox = node.getBBox()
  if (!bbox || !Number.isFinite(bbox.width) || !Number.isFinite(bbox.height)) return
  const x = Math.max(0, bbox.x - pad)
  const y = Math.max(0, bbox.y - pad)
  const w = bbox.width + pad * 2
  const h = bbox.height + pad * 2
  node.setAttribute(SvgAttributes.ViewBox, `${x} ${y} ${w} ${h}`)
}

// ---------------------------------------------------------------------------
// Annotation helpers (ported from annotations.js)
// ---------------------------------------------------------------------------

export const DEFAULT_ANNOTATION_SELECTORS = [
  SvgSelectors.Annotation,
  '.filter-label',
  '.sort-label',
  '.value-tag',
  '.range-line',
  `.${SvgClassNames.ValueLine}`,
  '.threshold-line',
  '.threshold-label',
  '.compare-label',
  '.extremum-highlight',
  '.extremum-label',
]

export function clearAnnotations(svg: D3Selection, extraSelectors: string[] = []) {
  const selectors = [...DEFAULT_ANNOTATION_SELECTORS, ...extraSelectors].filter(Boolean)
  if (!selectors.length) return
  svg.selectAll(selectors.join(', ')).remove()
}
// @ts-nocheck

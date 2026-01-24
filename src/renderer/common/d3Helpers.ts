import * as d3 from 'd3'
import type { JsonObject, JsonValue } from '../../types'

type D3Datum = JsonValue
type D3Selection = d3.Selection<d3.BaseType, D3Datum, d3.BaseType, D3Datum>

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
  return selection.transition().duration(duration).ease(EASINGS.SMOOTH).attr('opacity', targetOpacity).end()
}

export async function changeBarColor(selection: D3Selection, color: string, duration = DURATIONS.HIGHLIGHT) {
  if (!selection || selection.empty()) return Promise.resolve()
  return selection.transition().duration(duration).ease(EASINGS.SMOOTH).attr('fill', color).end()
}

export async function dimOthers(allElements: D3Selection, selectedElements: D3Selection, opacity = OPACITIES.DIM) {
  const selectedNodes = new Set(selectedElements.nodes?.() ?? [])
  const others = allElements.filter(function filterFn(this: Element) {
    return !selectedNodes.has(this)
  })
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
    .append('line')
    .attr('class', 'annotation guideline')
    .attr('x1', margins.left)
    .attr('y1', yAbsolute)
    .attr('x2', margins.left)
    .attr('y2', yAbsolute)
    .attr('stroke', color)
    .attr('stroke-dasharray', strokeDasharray)
    .attr('stroke-width', STYLES.GUIDELINE.strokeWidth)

  return line
    .transition()
    .duration(DURATIONS.GUIDELINE_DRAW)
    .ease(EASINGS.SMOOTH)
    .attr('x2', margins.left + plotWidth)
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
    .append('line')
    .attr('class', 'annotation guideline')
    .attr('x1', xAbsolute)
    .attr('y1', yStartAbsolute)
    .attr('x2', xAbsolute)
    .attr('y2', yStartAbsolute)
    .attr('stroke', color)
    .attr('stroke-dasharray', strokeDasharray)
    .attr('stroke-width', STYLES.GUIDELINE.strokeWidth)

  return line
    .transition()
    .duration(DURATIONS.GUIDELINE_DRAW)
    .ease(EASINGS.SMOOTH)
    .attr('y2', yEndAbsolute)
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
    className = 'annotation',
  } = options

  const label = svg
    .append('text')
    .attr('class', className)
    .attr('x', x)
    .attr('y', y)
    .attr('text-anchor', textAnchor)
    .style('font-size', `${fontSize}px`)
    .style('font-weight', fontWeight)
    .attr('fill', color)
    .attr('stroke', STYLES.VALUE_LABEL.stroke)
    .attr('stroke-width', STYLES.VALUE_LABEL.strokeWidth)
    .attr('paint-order', STYLES.VALUE_LABEL.paintOrder)
    .text(text)
    .attr('opacity', 0)

  return label.transition().duration(DURATIONS.LABEL_FADE_IN).attr('opacity', 1).end()
}

export async function addLabelBackground(svg: D3Selection, x: number, y: number, width: number, height: number) {
  const bg = svg
    .append('rect')
    .attr('class', 'annotation label-bg')
    .attr('x', x - width / 2)
    .attr('y', y)
    .attr('width', width)
    .attr('height', height)
    .attr('fill', STYLES.LABEL_BACKGROUND.fill)
    .attr('rx', STYLES.LABEL_BACKGROUND.rx)
    .attr('opacity', 0)

  return bg.transition().duration(DURATIONS.LABEL_FADE_IN).attr('opacity', STYLES.LABEL_BACKGROUND.opacity).end()
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
    .append('line')
    .attr('class', 'annotation value-line')
    .attr('x1', margins.left)
    .attr('y1', yAbsolute)
    .attr('x2', margins.left + plot.w)
    .attr('y2', yAbsolute)
    .attr('stroke', color)
    .attr('stroke-width', STYLES.THRESHOLD.strokeWidth)
    .attr('stroke-dasharray', STYLES.THRESHOLD.strokeDasharray)

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
    .append('line')
    .attr('class', 'annotation diff-line')
    .attr('x1', diffX)
    .attr('x2', diffX)
    .attr('y1', minY)
    .attr('y2', minY)
    .attr('stroke', color)
    .attr('stroke-width', STYLES.THRESHOLD.strokeWidth)
    .attr('stroke-dasharray', STYLES.THRESHOLD.strokeDasharray)

  await bridge.transition().duration(DURATIONS.GUIDELINE_DRAW).attr('y2', maxY).end()

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
    .append('line')
    .attr('class', 'retrieve-line annotation')
    .attr('x1', startX)
    .attr('x2', startX)
    .attr('y1', startY)
    .attr('y2', startY)
    .attr('stroke', color)
    .attr('stroke-width', STYLES.RETRIEVE_LINE.strokeWidth)
    .attr('stroke-dasharray', STYLES.RETRIEVE_LINE.strokeDasharray)
    .attr('opacity', 0)

  return line
    .transition()
    .duration(DURATIONS.GUIDELINE_DRAW)
    .attr('x2', endX)
    .attr('y2', endY)
    .attr('opacity', 1)
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
function selectPlotGroup(svg: D3Selection, preferPlotArea = true) {
  if (!svg || typeof svg.select !== 'function') return d3.select(null)
  if (preferPlotArea) {
    const plot = svg.select('.plot-area')
    if (!plot.empty()) return plot
  }
  const g = svg.select('g')
  return g.empty() ? svg.select('.plot-area') : g
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
  return container.querySelector('svg')
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
  const svg = svgNode ? d3.select(svgNode) : d3.select(null)

  const margins = {
    left: +(svgNode?.getAttribute('data-m-left') || 0),
    top: +(svgNode?.getAttribute('data-m-top') || 0),
  }
  const plot = {
    w: +(svgNode?.getAttribute('data-plot-w') || 0),
    h: +(svgNode?.getAttribute('data-plot-h') || 0),
  }

  const g = selectPlotGroup(svg, preferPlotArea)

  return {
    svg,
    g,
    margins,
    plot,
    xField: svgNode?.getAttribute('data-x-field'),
    yField: svgNode?.getAttribute('data-y-field'),
    colorField: svgNode?.getAttribute('data-color-field'),
    facetField: svgNode?.getAttribute('data-facet-field'),
    chartInfo: (svgNode as { __chartInfo?: JsonObject })?.__chartInfo ?? null,
  }
}

/** Factory returning a context getter with preferred options preset. */
export function makeGetSvgAndSetup(opts: { preferPlotArea?: boolean } = {}) {
  return (container: HTMLElement | SVGSVGElement | null) => getChartContext(container, opts)
}

// ---------------------------------------------------------------------------
// Annotation helpers (ported from annotations.js)
// ---------------------------------------------------------------------------

export const DEFAULT_ANNOTATION_SELECTORS = [
  '.annotation',
  '.filter-label',
  '.sort-label',
  '.value-tag',
  '.range-line',
  '.value-line',
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

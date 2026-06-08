import * as d3 from 'd3'
import type { SurfaceManager } from '../runtime/surfaceManager'
import type { OperationSpec } from '../domain/operation/types'
import { COLORS, DURATIONS, EASINGS } from '../rendering/common/d3Helpers'
import { DataAttributes, SvgAttributes, SvgClassNames, SvgElements } from '../rendering/interfaces'
import {
  OPERATION_ROLE_ATTRIBUTE,
  RESULT_REF_ATTRIBUTE,
  diffEndpointSelectors,
  operationResultRef,
  resolveDerivedDiffEndpoint,
} from './diffEndpoint'
import { ensureAnnotationLayer, readNumberAttr, resolveAnnotationViewport } from './primitives/annotationLayer'
import { drawReferenceLine } from './primitives/drawReferenceLine'
import { formatOperationValue } from './primitives/formatValue'

const SPLIT_DIFF_OVERLAY_CLASS = 'operation-next-split-diff-overlay'
const SPLIT_DIFF_ELEMENT_CLASS = 'operation-next-split-diff'
const SPLIT_DEBUG_PREFIX = '[split-simple-bar-debug]'
const SHARED_Y_AXIS_COMPACTED_ATTRIBUTE = 'data-shared-y-axis-compacted'
const SHARED_Y_AXIS_COMPACT_OFFSET_ATTRIBUTE = 'data-shared-y-axis-compact-offset'
const SHARED_COLOR_LEGEND_COMPACTED_ATTRIBUTE = 'data-shared-color-legend-compacted'
const SHARED_COLOR_LEGEND_COMPACT_OFFSET_ATTRIBUTE = 'data-shared-color-legend-compact-offset'
// Mirror of the left padding kept after dropping the legend reserve. The
// chartLayout module uses ~18 for bar charts and a similar value for line
// charts; using a constant keeps this independent of whether y-axis
// compaction already collapsed marginLeft to 0.
const SHARED_COLOR_LEGEND_RIGHT_PADDING = 18
// Standalone legend panel mounted as the last flex child of the split
// container when a grouped/stacked split hides the legend on BOTH chart
// surfaces (so neither chart is widened by the legend reserve → equal sizes).
const SPLIT_LEGEND_PANEL_CLASS = 'surface-split-legend'
// Marks a split host whose flex-grow was scaled by the legend-compaction
// policy, so SurfaceManager's post-animation `finalizeHost` / `applyLayoutStyles`
// do NOT reset it back to `flex: 1 1 0` and undo the equal-sizing.
const SPLIT_FLEX_MANAGED_DATASET = 'splitFlexManaged'

function isSplitDebugEnabled() {
  return Boolean((globalThis as typeof globalThis & { __OPERATION_NEXT_DEBUG__?: unknown }).__OPERATION_NEXT_DEBUG__)
}

function splitDebug(label: string, payload: Record<string, unknown>) {
  if (!isSplitDebugEnabled()) return
  try {
    console.info(SPLIT_DEBUG_PREFIX, label, JSON.stringify(payload))
  } catch {
    console.info(SPLIT_DEBUG_PREFIX, label, payload)
  }
}

function summarizeElementRect(element: Element | null | undefined) {
  if (!element) return null
  const rect = element.getBoundingClientRect()
  return {
    x: Number(rect.x.toFixed(1)),
    y: Number(rect.y.toFixed(1)),
    width: Number(rect.width.toFixed(1)),
    height: Number(rect.height.toFixed(1)),
    left: Number(rect.left.toFixed(1)),
    right: Number(rect.right.toFixed(1)),
    top: Number(rect.top.toFixed(1)),
    bottom: Number(rect.bottom.toFixed(1)),
  }
}

type SurfaceReferenceLine = {
  host: HTMLElement
  svg: SVGSVGElement
  line: SVGLineElement
  refKey: string
}

type ScreenReferenceLine = {
  y: number
  x1: number
  x2: number
}

function activeHorizontalSplitSurfaces(surfaceManager: SurfaceManager | null | undefined) {
  const layout = surfaceManager?.getLayout()
  if (!layout || layout.type !== 'split-horizontal') return null
  const surfaces = layout.surfaces.filter((surface) => surface.id !== 'root')
  if (surfaces.length < 2) return null
  return surfaces as typeof layout.surfaces
}

function parseTranslate(transform: string | null | undefined) {
  const match = /translate\(\s*([-+\d.]+)(?:[,\s]+([-+\d.]+))?\s*\)/.exec(transform ?? '')
  if (!match) return null
  return {
    x: Number(match[1]) || 0,
    y: Number(match[2]) || 0,
  }
}

/**
 * Every plot group in the SVG: a non-faceted chart has exactly one (the
 * axes + bars group), a faceted chart has one per facet panel. All must move
 * together when reclaiming the shared y-axis margin.
 */
function allPlotGroups(svg: SVGSVGElement): SVGGElement[] {
  return Array.from(svg.children).filter(
    (child): child is SVGGElement =>
      child instanceof SVGGElement && child.querySelector(`rect.${SvgClassNames.MainBar}`) != null,
  )
}

function shiftNumericAttr(node: SVGElement | null, attr: string, offset: number) {
  if (!node) return
  const current = Number(node.getAttribute(attr))
  if (!Number.isFinite(current)) return
  node.setAttribute(attr, String(current - offset))
}

function compactSharedYAxisSurface(host: HTMLElement) {
  const svg = host.querySelector<SVGSVGElement>(SvgElements.Svg)
  if (!svg) return null
  if (svg.getAttribute(SHARED_Y_AXIS_COMPACTED_ATTRIBUTE) === 'true') {
    host.dataset.sharedYAxisCompacted = 'true'
    return {
      compacted: false,
      reason: 'already-compacted',
      offset: Number(svg.getAttribute(SHARED_Y_AXIS_COMPACT_OFFSET_ATTRIBUTE) ?? 0) || 0,
    }
  }

  const marginLeft = Number(svg.getAttribute(DataAttributes.MarginLeft) ?? 0)
  if (!Number.isFinite(marginLeft) || marginLeft <= 0) {
    return { compacted: false, reason: 'invalid-margin-left', offset: marginLeft }
  }

  const plotGroups = allPlotGroups(svg)
  if (plotGroups.length === 0) return { compacted: false, reason: 'plot-group-not-found', offset: marginLeft }

  // Offset is the reclaimed left-margin (the hidden y-axis gutter), derived from
  // the first plot group's x. ALL plot groups then shift by that SAME offset so
  // the inter-panel spacing of a faceted chart is preserved (shifting only the
  // first panel detached it and pushed the rest past the viewBox edge).
  const marginTop = Number(svg.getAttribute(DataAttributes.MarginTop) ?? 0)
  const firstX = parseTranslate(plotGroups[0].getAttribute(SvgAttributes.Transform))?.x ?? marginLeft
  const offset = Math.min(marginLeft, firstX)

  if (!Number.isFinite(offset) || offset <= 0) {
    return { compacted: false, reason: 'invalid-offset', offset }
  }

  plotGroups.forEach((group) => {
    const t = parseTranslate(group.getAttribute(SvgAttributes.Transform))
    const gx = t?.x ?? marginLeft
    const gy = t?.y ?? marginTop
    group.setAttribute(SvgAttributes.Transform, `translate(${gx - offset},${gy})`)
  })
  shiftNumericAttr(svg.querySelector<SVGElement>(`.${SvgClassNames.XAxisLabel}`), SvgAttributes.X, offset)

  svg.setAttribute(DataAttributes.MarginLeft, String(Math.max(0, marginLeft - offset)))
  svg.setAttribute(SHARED_Y_AXIS_COMPACTED_ATTRIBUTE, 'true')
  svg.setAttribute(SHARED_Y_AXIS_COMPACT_OFFSET_ATTRIBUTE, String(offset))
  host.dataset.sharedYAxisCompacted = 'true'

  return {
    compacted: true,
    reason: 'compacted',
    offset,
    previousMarginLeft: marginLeft,
    nextMarginLeft: Math.max(0, marginLeft - offset),
  }
}

/**
 * Symmetric counterpart of `compactSharedYAxisSurface`. When a surface's
 * color legend is hidden (because a neighbor still shows it), the SVG's
 * `viewBox` still reserves ~legendWidth + legendOffsetX on the right side.
 * With `preserveAspectRatio="xMidYMid meet"` plus equal `flex: 1 1 0`
 * sizing, that reserve renders as visible blank space between the two
 * split charts.
 *
 * Fix: shrink the viewBox's right edge down to `marginLeft + plotWidth +
 * small right padding`, AND scale the host's flex-grow by the same ratio
 * so the SVG keeps the same pixel scale as the still-full neighbor (bars
 * line up across the boundary).
 *
 * Idempotent via `data-shared-color-legend-compacted="true"`.
 * Mirrors the y-axis policy: applied only to surfaces with index < lastIndex.
 */
function compactSharedColorLegendSurface(host: HTMLElement) {
  const svg = host.querySelector<SVGSVGElement>(SvgElements.Svg)
  if (!svg) return null
  if (svg.getAttribute(SHARED_COLOR_LEGEND_COMPACTED_ATTRIBUTE) === 'true') {
    host.dataset.sharedColorLegendCompacted = 'true'
    return {
      compacted: false,
      reason: 'already-compacted',
      offset: Number(svg.getAttribute(SHARED_COLOR_LEGEND_COMPACT_OFFSET_ATTRIBUTE) ?? 0) || 0,
    }
  }

  const legend = svg.querySelector<SVGElement>(`.${SvgClassNames.ColorLegend}`)
  if (!legend) return { compacted: false, reason: 'no-legend' }

  const viewBoxAttr = svg.getAttribute(SvgAttributes.ViewBox) ?? ''
  const viewBoxParts = viewBoxAttr.trim().split(/[\s,]+/).map(Number)
  if (viewBoxParts.length !== 4 || viewBoxParts.some((value) => !Number.isFinite(value))) {
    return { compacted: false, reason: 'invalid-viewbox' }
  }
  const [vbX, vbY, vbW, vbH] = viewBoxParts

  const marginLeft = Number(svg.getAttribute(DataAttributes.MarginLeft) ?? 0)
  const plotWidth = Number(svg.getAttribute(DataAttributes.PlotWidth) ?? 0)
  if (!Number.isFinite(marginLeft) || !Number.isFinite(plotWidth) || plotWidth <= 0) {
    return { compacted: false, reason: 'invalid-plot-metrics' }
  }

  const newViewBoxWidth = marginLeft + plotWidth + SHARED_COLOR_LEGEND_RIGHT_PADDING
  if (!(newViewBoxWidth > 0) || newViewBoxWidth >= vbW) {
    return { compacted: false, reason: 'no-savings', newViewBoxWidth, currentViewBoxWidth: vbW }
  }

  const offset = vbW - newViewBoxWidth
  svg.setAttribute(SvgAttributes.ViewBox, `${vbX} ${vbY} ${newViewBoxWidth} ${vbH}`)
  svg.setAttribute(SHARED_COLOR_LEGEND_COMPACTED_ATTRIBUTE, 'true')
  svg.setAttribute(SHARED_COLOR_LEGEND_COMPACT_OFFSET_ATTRIBUTE, String(offset))
  host.dataset.sharedColorLegendCompacted = 'true'

  // Scale flex-grow so the compacted surface receives proportionally less
  // pixel width, keeping the same `pixels per viewBox-unit` ratio as the
  // still-full neighbor. Mark the host as managed so SurfaceManager's
  // post-animation `finalizeHost` / `applyLayoutStyles` won't reset it back
  // to `flex: 1 1 0` and undo the equal-sizing across panels.
  const flexGrow = newViewBoxWidth / vbW
  host.style.flex = `${flexGrow} 1 0`
  host.dataset[SPLIT_FLEX_MANAGED_DATASET] = 'true'

  return {
    compacted: true,
    reason: 'compacted',
    offset,
    newViewBoxWidth,
    previousViewBoxWidth: vbW,
    flexGrow,
  }
}

export function applySplitSharedYAxisPolicy(surfaceManager: SurfaceManager | null | undefined) {
  const surfaces = activeHorizontalSplitSurfaces(surfaceManager)
  if (!surfaces) {
    splitDebug('splitVisuals.applySharedYAxisPolicy-no-surfaces', {})
    return
  }

  surfaces.forEach((surface, index) => {
    const host = surface.hostElement as HTMLElement
    const hideYAxis = index > 0
    host.dataset.sharedYAxisHidden = hideYAxis ? 'true' : 'false'
    host.querySelectorAll<SVGElement>(`.${SvgClassNames.YAxis}, .${SvgClassNames.YAxisLabel}`).forEach((node) => {
      node.style.display = hideYAxis ? 'none' : ''
      node.setAttribute('aria-hidden', hideYAxis ? 'true' : 'false')
    })
    if (hideYAxis) {
      compactSharedYAxisSurface(host)
    }

    // Hide + compact the color legend out of EVERY chart surface (not just the
    // left). Carrying the legend inside a surface's viewBox widens it, so with
    // equal `flex: 1 1 0` the legend-bearing panel renders smaller. With the
    // legend compacted out of all surfaces (and each flex-scaled ∝ its content
    // width by `compactSharedColorLegendSurface`), the bars render at the same
    // scale across panels. The legend is shown once in a dedicated panel
    // (`mountSplitLegendPanel`, below). Runs AFTER the y-axis compaction so it
    // reads the already-reduced `marginLeft`.
    const hideColorLegend = true
    host.dataset.sharedColorLegendHidden = hideColorLegend ? 'true' : 'false'
    host.querySelectorAll<SVGElement>(`.${SvgClassNames.ColorLegend}`).forEach((node) => {
      node.style.display = hideColorLegend ? 'none' : ''
      node.setAttribute('aria-hidden', hideColorLegend ? 'true' : 'false')
    })
    if (hideColorLegend) {
      compactSharedColorLegendSurface(host)
    }
  })

  // Shared legend now lives in its own far-right panel so neither chart carries
  // it (keeps the two charts equal size).
  mountSplitLegendPanel(surfaceManager)
  splitDebug('splitVisuals.applySharedYAxisPolicy-applied', {
    surfaces: surfaces.map((surface, index) => {
      const host = surface.hostElement as HTMLElement
      return {
        id: surface.id,
        index,
        sharedYAxisHidden: host.dataset.sharedYAxisHidden ?? null,
        sharedColorLegendHidden: host.dataset.sharedColorLegendHidden ?? null,
        sharedColorLegendCompacted: host.dataset.sharedColorLegendCompacted ?? null,
        hostFlex: host.style.flex || null,
        hostRect: summarizeElementRect(host),
        yAxisCount: host.querySelectorAll(`.${SvgClassNames.YAxis}`).length,
        yLabelCount: host.querySelectorAll(`.${SvgClassNames.YAxisLabel}`).length,
        colorLegendCount: host.querySelectorAll(`.${SvgClassNames.ColorLegend}`).length,
        svgCount: host.querySelectorAll(SvgElements.Svg).length,
      }
    }),
  })
}

/**
 * Mount (or refresh) the shared color legend as a compact horizontal strip
 * ABOVE the two chart panels, so neither chart's viewBox carries the legend and
 * both use the FULL container width (a side legend stole ~half the width and
 * shrank the charts — the reported problem). The split container is set to
 * `flex-wrap: wrap`; the legend is a full-width row pinned first via `order:-1`,
 * and the two chart panels wrap to the row below (still flex-scaled for equal
 * bar size). Built as lightweight HTML so long labels wrap naturally. The
 * (series, color) pairs come from a surface's `g.color-legend` — which carries
 * ALL series (the filter applier skips legend-narrowing on split surfaces).
 * Idempotent; no-op when there is no color legend (e.g. simple bar).
 */
function mountSplitLegendPanel(surfaceManager: SurfaceManager | null | undefined) {
  const surfaces = activeHorizontalSplitSurfaces(surfaceManager)
  if (!surfaces) return
  const firstHost = surfaces[0].hostElement as HTMLElement
  const container = firstHost.closest('.surface-layout--split') as HTMLElement | null
  if (!container) return

  // Idempotent re-apply: drop any prior panel and its wrap mode.
  container.querySelectorAll(`:scope > .${SPLIT_LEGEND_PANEL_CLASS}`).forEach((node) => node.remove())
  container.style.flexWrap = ''

  // Source legend: the first surface that actually has one.
  let sourceLegend: SVGGElement | null = null
  for (const surface of surfaces) {
    const host = surface.hostElement as HTMLElement
    const legend = host.querySelector<SVGGElement>(`${SvgElements.Svg} .${SvgClassNames.ColorLegend}`)
    if (legend) {
      sourceLegend = legend
      break
    }
  }
  if (!sourceLegend) return

  // Title (the one legend <text> without a data-series) + (series, color) items.
  const title =
    Array.from(sourceLegend.querySelectorAll('text')).find((t) => !t.hasAttribute(DataAttributes.Series))
      ?.textContent ?? ''
  const seen = new Set<string>()
  const items: Array<{ series: string; color: string }> = []
  sourceLegend.querySelectorAll<SVGCircleElement>(`circle[${DataAttributes.Series}]`).forEach((circle) => {
    const series = circle.getAttribute(DataAttributes.Series) ?? ''
    if (!series || seen.has(series)) return
    seen.add(series)
    items.push({ series, color: circle.getAttribute(SvgAttributes.Fill) ?? '#999' })
  })
  if (items.length === 0) return

  const panel = document.createElement('div')
  panel.className = SPLIT_LEGEND_PANEL_CLASS
  panel.style.cssText =
    'flex:0 0 100%;order:-1;display:flex;flex-wrap:wrap;align-items:center;' +
    'gap:4px 16px;padding:2px 4px 6px;font-family:sans-serif;font-size:14px;pointer-events:none;'

  if (title) {
    const titleEl = document.createElement('span')
    titleEl.textContent = title
    titleEl.style.cssText = 'font-weight:700;margin-right:4px;'
    panel.appendChild(titleEl)
  }
  items.forEach(({ series, color }) => {
    const item = document.createElement('span')
    item.style.cssText = 'display:inline-flex;align-items:center;gap:6px;white-space:nowrap;'
    const dot = document.createElement('span')
    dot.style.cssText = `width:12px;height:12px;border-radius:50%;flex:0 0 auto;background:${color};`
    const label = document.createElement('span')
    label.textContent = series
    item.append(dot, label)
    panel.appendChild(item)
  })

  // Wrap mode: legend takes the first full-width row, the two chart panels wrap
  // to the row below and share its full width (by their managed flex-grow).
  container.style.flexWrap = 'wrap'
  container.appendChild(panel)
}

function readOperationRefs(operation: OperationSpec) {
  const selectors = diffEndpointSelectors(operation)
  const aggregateHint = typeof operation.aggregate === 'string' ? operation.aggregate : undefined
  const endpointA = resolveDerivedDiffEndpoint(selectors.targetA, aggregateHint)
  const endpointB = resolveDerivedDiffEndpoint(selectors.targetB, aggregateHint)
  if (!endpointA || !endpointB) return null
  return { endpointA, endpointB }
}

function findReferenceLine(host: HTMLElement, refKey: string): SurfaceReferenceLine | null {
  const svg = host.querySelector<SVGSVGElement>(SvgElements.Svg)
  if (!svg) return null
  const lines = Array.from(svg.querySelectorAll<SVGLineElement>(`line[${RESULT_REF_ATTRIBUTE}]`))
  const line = lines.find((candidate) => candidate.getAttribute(RESULT_REF_ATTRIBUTE) === refKey)
  return line ? { host, svg, line, refKey } : null
}

function accumulatedTranslate(node: Element) {
  let x = 0
  let y = 0
  let current: Element | null = node
  while (current && current.tagName.toLowerCase() !== SvgElements.Svg) {
    const transform = current.getAttribute(SvgAttributes.Transform) ?? ''
    const match = /translate\(\s*([-+\d.]+)(?:[,\s]+([-+\d.]+))?\s*\)/.exec(transform)
    if (match) {
      x += Number(match[1]) || 0
      y += Number(match[2]) || 0
    }
    current = current.parentElement
  }
  return { x, y }
}

function inferSvgYForValue(svg: SVGSVGElement, value: number) {
  // Bar chart: use rect tops
  const barPoints = Array.from(svg.querySelectorAll<SVGRectElement>(`rect.${SvgClassNames.MainBar}`))
    .map((rect) => {
      const datumValue = Number(rect.getAttribute(DataAttributes.Value))
      const y = readNumberAttr(rect, SvgAttributes.Y)
      if (!Number.isFinite(datumValue) || y == null) return null
      return { value: datumValue, y: accumulatedTranslate(rect).y + y }
    })
    .filter((point): point is { value: number; y: number } => point != null)

  if (barPoints.length >= 2) {
    const first = barPoints[0]
    const second = barPoints.find((point) => point.value !== first.value)
    if (first && second) {
      const slope = (second.y - first.y) / (second.value - first.value)
      return first.y + slope * (value - first.value)
    }
  }

  // Line chart: use circle cy (data points)
  const marginTop = Number(svg.getAttribute(DataAttributes.MarginTop) ?? 0)
  const circlePoints = Array.from(
    svg.querySelectorAll<SVGCircleElement>(`circle[${DataAttributes.Value}]`),
  )
    .map((circle) => {
      const datumValue = Number(circle.getAttribute(DataAttributes.Value))
      const cy = readNumberAttr(circle, SvgAttributes.CY)
      if (!Number.isFinite(datumValue) || cy == null) return null
      return { value: datumValue, y: marginTop + cy }
    })
    .filter((point): point is { value: number; y: number } => point != null)

  const first = circlePoints[0]
  const second = circlePoints.find((point) => first && point.value !== first.value)
  if (first && second) {
    const slope = (second.y - first.y) / (second.value - first.value)
    return first.y + slope * (value - first.value)
  }

  const plotHeight = Number(svg.getAttribute(DataAttributes.PlotHeight) ?? 0)
  const maxValue = Math.max(...circlePoints.map((p) => p.value), value, 1)
  return marginTop + plotHeight - (value / maxValue) * plotHeight
}

async function ensureFallbackReferenceLine(host: HTMLElement, refKey: string, value: number) {
  const existing = findReferenceLine(host, refKey)
  if (existing) return existing

  const svgNode = host.querySelector<SVGSVGElement>(SvgElements.Svg)
  if (!svgNode) return null
  const svg = d3.select(svgNode)
  const layer = ensureAnnotationLayer(svg)
  const marginLeft = Number(svgNode.getAttribute(DataAttributes.MarginLeft) ?? 0)
  const plotWidth = Number(svgNode.getAttribute(DataAttributes.PlotWidth) ?? 0)
  const y = inferSvgYForValue(svgNode, value)

  await drawReferenceLine({
    layer,
    cssClass: 'operation-next-average',
    x1: marginLeft,
    x2: marginLeft + plotWidth,
    y,
    svg,
    viewport: resolveAnnotationViewport(svg),
  })

  layer
    .selectAll<SVGElement, unknown>('.operation-next-average')
    .filter(function () {
      return this.getAttribute(RESULT_REF_ATTRIBUTE) == null
    })
    .attr(RESULT_REF_ATTRIBUTE, refKey)
    .attr(OPERATION_ROLE_ATTRIBUTE, 'average-reference')

  return findReferenceLine(host, refKey)
}

function toStageCoordinates(line: SurfaceReferenceLine, stageRect: DOMRect): ScreenReferenceLine {
  const rect = line.line.getBoundingClientRect()
  return {
    y: rect.top + rect.height / 2 - stageRect.top,
    x1: rect.left - stageRect.left,
    x2: rect.right - stageRect.left,
  }
}

function ensureOverlay(stage: HTMLElement, resultRef: string, width: number, height: number) {
  stage.querySelectorAll<SVGSVGElement>(`svg.${SPLIT_DIFF_OVERLAY_CLASS}`).forEach((overlay) => {
    if (overlay.getAttribute(RESULT_REF_ATTRIBUTE) === resultRef) overlay.remove()
  })

  if (getComputedStyle(stage).position === 'static') {
    stage.style.position = 'relative'
  }

  const overlay = document.createElementNS('http://www.w3.org/2000/svg', SvgElements.Svg)
  overlay.setAttribute(SvgAttributes.Class, SPLIT_DIFF_OVERLAY_CLASS)
  overlay.setAttribute(SvgAttributes.ViewBox, `0 0 ${width} ${height}`)
  overlay.setAttribute(RESULT_REF_ATTRIBUTE, resultRef)
  overlay.setAttribute(OPERATION_ROLE_ATTRIBUTE, 'split-diff-arrow')
  overlay.style.position = 'absolute'
  overlay.style.left = '0'
  overlay.style.top = '0'
  overlay.style.width = '100%'
  overlay.style.height = '100%'
  overlay.style.overflow = 'visible'
  overlay.style.pointerEvents = 'none'
  overlay.style.zIndex = '5'
  stage.appendChild(overlay)
  return d3.select(overlay)
}

export async function tryDrawSplitScalarDiffAnnotation(params: {
  container: HTMLElement
  surfaceManager?: SurfaceManager
  operation: OperationSpec
  result: unknown[]
}) {
  const surfaces = activeHorizontalSplitSurfaces(params.surfaceManager)
  const operationId = (params.operation as OperationSpec & { id?: unknown }).id
  splitDebug('splitVisuals.tryDrawSplitScalarDiff-start', {
    hasSurfaces: Boolean(surfaces),
    operation: {
      op: params.operation.op,
      id: typeof operationId === 'string' ? operationId : null,
      targetA: params.operation.targetA ?? null,
      targetB: params.operation.targetB ?? null,
      inputs: params.operation.meta?.inputs ?? [],
    },
    resultCount: params.result.length,
    containerRect: summarizeElementRect(params.container),
  })
  if (!surfaces) {
    console.log('[tryDrawSplitScalarDiffAnnotation] no surfaces (surfaceManager undefined or layout not split-horizontal)')
    return false
  }

  const refs = readOperationRefs(params.operation)
  if (!refs) {
    console.log('[tryDrawSplitScalarDiffAnnotation] readOperationRefs returned null', {
      targetA: params.operation.targetA ?? null,
      targetB: params.operation.targetB ?? null,
    })
    splitDebug('splitVisuals.tryDrawSplitScalarDiff-no-refs', {})
    return false
  }

  const [leftSurface, rightSurface] = surfaces
  const leftHost = leftSurface.hostElement as HTMLElement
  const rightHost = rightSurface.hostElement as HTMLElement
  const leftRef =
    findReferenceLine(leftHost, refs.endpointA.refKey) ??
    await ensureFallbackReferenceLine(leftHost, refs.endpointA.refKey, refs.endpointA.value)
  const rightRef =
    findReferenceLine(rightHost, refs.endpointB.refKey) ??
    await ensureFallbackReferenceLine(rightHost, refs.endpointB.refKey, refs.endpointB.value)

  console.log('[tryDrawSplitScalarDiffAnnotation] ref lines', {
    leftRefKey: refs.endpointA.refKey,
    leftRefValue: refs.endpointA.value,
    rightRefKey: refs.endpointB.refKey,
    rightRefValue: refs.endpointB.value,
    leftRefFound: Boolean(leftRef),
    rightRefFound: Boolean(rightRef),
  })
  splitDebug('splitVisuals.tryDrawSplitScalarDiff-ref-lines', {
    leftRefKey: refs.endpointA.refKey,
    rightRefKey: refs.endpointB.refKey,
    leftRefFound: Boolean(leftRef),
    rightRefFound: Boolean(rightRef),
    leftHostRect: summarizeElementRect(leftHost),
    rightHostRect: summarizeElementRect(rightHost),
    leftLineRect: summarizeElementRect(leftRef?.line),
    rightLineRect: summarizeElementRect(rightRef?.line),
  })
  if (!leftRef || !rightRef) {
    console.log('[tryDrawSplitScalarDiffAnnotation] missing ref lines → returning false')
    return false
  }

  const stageRect = params.container.getBoundingClientRect()
  const leftRect = leftHost.getBoundingClientRect()
  const rightRect = rightHost.getBoundingClientRect()
  const leftLine = toStageCoordinates(leftRef, stageRect)
  const rightLine = toStageCoordinates(rightRef, stageRect)
  const arrowX = (leftRect.right + rightRect.left) / 2 - stageRect.left
  const topY = Math.min(leftLine.y, rightLine.y)
  const bottomY = Math.max(leftLine.y, rightLine.y)
  const resultRef = operationResultRef(params.operation) ?? 'split-diff'
  const differenceValue = Number((params.result[0] as { value?: unknown } | undefined)?.value)
  const overlay = ensureOverlay(params.container, resultRef, stageRect.width, stageRect.height)
  splitDebug('splitVisuals.tryDrawSplitScalarDiff-geometry', {
    resultRef,
    stageRect: summarizeElementRect(params.container),
    leftRect: summarizeElementRect(leftHost),
    rightRect: summarizeElementRect(rightHost),
    leftLine,
    rightLine,
    arrowX,
    topY,
    bottomY,
    differenceValue,
  })

  const shaft = overlay
    .append(SvgElements.Line)
    .attr(SvgAttributes.Class, `${SvgClassNames.LineAnnotation} ${SPLIT_DIFF_ELEMENT_CLASS} split-diff-shaft`)
    .attr(SvgAttributes.X1, arrowX)
    .attr(SvgAttributes.X2, arrowX)
    .attr(SvgAttributes.Y1, (topY + bottomY) / 2)
    .attr(SvgAttributes.Y2, (topY + bottomY) / 2)
    .attr(SvgAttributes.Stroke, COLORS.ANNOTATION_RED)
    .attr(SvgAttributes.StrokeWidth, 2)

  await shaft
    .transition()
    .duration(DURATIONS.HIGHLIGHT)
    .ease(EASINGS.SMOOTH)
    .attr(SvgAttributes.Y1, topY)
    .attr(SvgAttributes.Y2, bottomY)
    .end()
    .catch(() => {})

  const head = 8
  overlay
    .selectAll<SVGLineElement, { x1: number; y1: number; x2: number; y2: number }>(`line.${SPLIT_DIFF_ELEMENT_CLASS}.arrow-head`)
    .data([
      { x1: arrowX, y1: topY, x2: arrowX - head, y2: topY + head },
      { x1: arrowX, y1: topY, x2: arrowX + head, y2: topY + head },
      { x1: arrowX, y1: bottomY, x2: arrowX - head, y2: bottomY - head },
      { x1: arrowX, y1: bottomY, x2: arrowX + head, y2: bottomY - head },
    ])
    .enter()
    .append(SvgElements.Line)
    .attr(SvgAttributes.Class, `${SvgClassNames.LineAnnotation} ${SPLIT_DIFF_ELEMENT_CLASS} arrow-head`)
    .attr(SvgAttributes.X1, (datum) => datum.x1)
    .attr(SvgAttributes.Y1, (datum) => datum.y1)
    .attr(SvgAttributes.X2, (datum) => datum.x2)
    .attr(SvgAttributes.Y2, (datum) => datum.y2)
    .attr(SvgAttributes.Stroke, COLORS.ANNOTATION_RED)
    .attr(SvgAttributes.StrokeWidth, 2)

  overlay
    .append(SvgElements.Text)
    .attr(SvgAttributes.Class, `${SvgClassNames.TextAnnotation} ${SPLIT_DIFF_ELEMENT_CLASS} difference-label`)
    .attr(SvgAttributes.X, arrowX + 12)
    .attr(SvgAttributes.Y, (topY + bottomY) / 2)
    .attr(SvgAttributes.DominantBaseline, 'middle')
    .attr(SvgAttributes.FontSize, 12)
    .attr(SvgAttributes.FontWeight, 700)
    .attr(SvgAttributes.Fill, COLORS.ANNOTATION_RED)
    .text(`Difference: ${formatOperationValue(differenceValue)}`)

  splitDebug('splitVisuals.tryDrawSplitScalarDiff-done', {
    resultRef,
    overlayCount: params.container.querySelectorAll(`svg.${SPLIT_DIFF_OVERLAY_CLASS}`).length,
  })
  return true
}

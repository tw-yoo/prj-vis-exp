import * as d3 from 'd3'
import type { JsonValue } from '../../types'
import { DataAttributes, SvgAttributes, SvgClassNames, SvgElements, SvgSelectors } from '../interfaces'
import { resolveAnnotationKeyForDrawOp } from './annotationKey'
import {
  DrawAction,
  DrawLineModes,
  DrawRectModes,
  DrawTextModes,
  type DrawBandSpec,
  type DrawArrowSpec,
  type DrawLineMode,
  type DrawScalarPanelSpec,
  type DrawLineSpec,
  type DrawOp,
  type DrawRectMode,
  type DrawRectSpec,
  type DrawSelect,
  type DrawTextMode,
} from './types'
import { toSvgCenter as toSvgCenterUtil } from './utils/coords'
import { ensureAnnotationLayer } from './utils/annotationLayer'
import { MIN_DRAW_DURATION_MS } from './animationPolicy'

type AnySelection = d3.Selection<any, unknown, any, any>
type DrawViewport = {
  x: number
  y: number
  width: number
  height: number
  layerParent: Element
}

const addArrowHead = (
  layer: AnySelection,
  tipX: number,
  tipY: number,
  direction: { x: number; y: number },
  style: { stroke?: string; strokeWidth?: number; opacity?: number },
  arrowSpec: DrawArrowSpec,
  annotationKey?: string | null,
  annotationNodeId?: string | null,
) => {
  const length = Math.max(arrowSpec.length ?? 12, 1)
  const width = Math.max(arrowSpec.width ?? length * 0.6, 1)
  const baseX = tipX - direction.x * length
  const baseY = tipY - direction.y * length
  const perpX = -direction.y
  const perpY = direction.x
  const leftX = baseX + perpX * width * 0.5
  const leftY = baseY + perpY * width * 0.5
  const rightX = baseX - perpX * width * 0.5
  const rightY = baseY - perpY * width * 0.5
  const path = `M ${tipX} ${tipY} L ${leftX} ${leftY} L ${rightX} ${rightY} Z`
  const stroke = arrowSpec.style?.stroke ?? style.stroke ?? '#111827'
  const strokeWidth = arrowSpec.style?.strokeWidth ?? style.strokeWidth ?? 2
  const opacity = arrowSpec.style?.opacity ?? style.opacity ?? 1
  const fill = arrowSpec.style?.fill ?? stroke

  const arrow = layer
    .append(SvgElements.Path)
    .attr(SvgAttributes.Class, `${SvgClassNames.Annotation} ${SvgClassNames.LineAnnotation} arrowhead`)
    .attr(DataAttributes.AnnotationKey, annotationKey ?? null)
    .attr(DataAttributes.AnnotationNodeId, annotationNodeId ?? null)
    .attr(SvgAttributes.D, path)
    .attr(SvgAttributes.Fill, fill)
    .attr(SvgAttributes.Stroke, stroke)
    .attr(SvgAttributes.StrokeWidth, strokeWidth)
    .attr(SvgAttributes.Opacity, 0)
  arrow.transition().duration(MIN_DRAW_DURATION_MS).attr(SvgAttributes.Opacity, opacity)
}

// ─── Annotation collision-avoidance utilities ─────────────────────────────────

type BoxBounds = { x: number; y: number; width: number; height: number }

/** Returns true if boxes a and b overlap (with optional padding). */
function overlapsBox(a: BoxBounds, b: BoxBounds, padding = 2): boolean {
  return (
    a.x < b.x + b.width + padding &&
    a.x + a.width + padding > b.x &&
    a.y < b.y + b.height + padding &&
    a.y + a.height + padding > b.y
  )
}

/**
 * Greedy minimal-movement nudge: shifts `candidate` vertically by the
 * smallest amount needed to avoid overlapping any box in `placed`.
 * Caps total movement at `maxNudge` to preserve semantic meaning.
 */
function nudgeToAvoidOverlap(
  candidate: BoxBounds,
  placed: BoxBounds[],
  maxNudge = 40,
): { dx: number; dy: number } {
  let totalDy = 0
  for (let pass = 0; pass < 4; pass++) {
    const shifted: BoxBounds = { ...candidate, y: candidate.y + totalDy }
    const blocker = placed.find((p) => overlapsBox(shifted, p))
    if (!blocker) break
    const shiftUp = blocker.y - (shifted.y + shifted.height) - 2
    const shiftDown = blocker.y + blocker.height - shifted.y + 2
    const delta = Math.abs(shiftUp) <= Math.abs(shiftDown) ? shiftUp : shiftDown
    totalDy += delta
    if (Math.abs(totalDy) > maxNudge) {
      totalDy = Math.sign(totalDy) * maxNudge
      break
    }
  }
  return { dx: 0, dy: totalDy }
}

// ──────────────────────────────────────────────────────────────────────────────

const drawLineWithArrow = (
  layer: AnySelection,
  chartId: string | undefined,
  lineSpec: DrawLineSpec,
  coords: { x1: number; y1: number; x2: number; y2: number },
  annotationKey?: string | null,
  annotationNodeId?: string | null,
) => {
  const stroke = lineSpec.style?.stroke ?? '#111827'
  const strokeWidth = lineSpec.style?.strokeWidth ?? 2
  const opacity = lineSpec.style?.opacity ?? 1

  const line = layer
    .append(SvgElements.Line)
    .attr(SvgAttributes.Class, `${SvgClassNames.Annotation} ${SvgClassNames.LineAnnotation}`)
    .attr(DataAttributes.ChartId, chartId ?? null)
    .attr(DataAttributes.AnnotationKey, annotationKey ?? null)
    .attr(DataAttributes.AnnotationNodeId, annotationNodeId ?? null)
    .attr(SvgAttributes.X1, coords.x1)
    .attr(SvgAttributes.Y1, coords.y1)
    .attr(SvgAttributes.X2, coords.x2)
    .attr(SvgAttributes.Y2, coords.y2)
    .attr(SvgAttributes.Stroke, stroke)
    .attr(SvgAttributes.StrokeWidth, strokeWidth)
    .attr(SvgAttributes.Opacity, 0)
  line.transition().duration(MIN_DRAW_DURATION_MS).attr(SvgAttributes.Opacity, opacity)

  const arrowSpec = lineSpec.arrow
  if (!arrowSpec || (!arrowSpec.start && !arrowSpec.end)) return
  const dx = coords.x2 - coords.x1
  const dy = coords.y2 - coords.y1
  const dist = Math.hypot(dx, dy)
  if (dist <= 0) return
  const direction = { x: dx / dist, y: dy / dist }

  if (arrowSpec.start) {
    addArrowHead(
      layer,
      coords.x1,
      coords.y1,
      { x: -direction.x, y: -direction.y },
      { stroke, strokeWidth, opacity },
      arrowSpec,
      annotationKey,
      annotationNodeId,
    )
  }
  if (arrowSpec.end) {
    addArrowHead(
      layer,
      coords.x2,
      coords.y2,
      direction,
      { stroke, strokeWidth, opacity },
      arrowSpec,
      annotationKey,
      annotationNodeId,
    )
  }
}

function normalizeLineMode(mode: unknown): DrawLineMode | null {
  if (typeof mode !== 'string') return null
  const raw = mode.trim().toLowerCase()
  if (!raw) return null
  if (raw === DrawLineModes.Angle) return DrawLineModes.Angle
  if (raw === DrawLineModes.Connect) return DrawLineModes.Connect
  if (raw === DrawLineModes.ConnectPanelScalar || raw === 'connect-panel-scalar' || raw === 'panel-scalar-connect') {
    return DrawLineModes.ConnectPanelScalar
  }
  if (
    raw === DrawLineModes.HorizontalFromX ||
    raw === 'horizontal-from-x' ||
    raw === 'horizontal_from_x' ||
    raw === 'horizontalfromx' ||
    raw === 'hlinex'
  ) {
    return DrawLineModes.HorizontalFromX
  }
  if (
    raw === DrawLineModes.HorizontalFromY ||
    raw === 'horizontal-from-y' ||
    raw === 'horizontal_from_y' ||
    raw === 'horizontalfromy' ||
    raw === 'hliney'
  ) {
    return DrawLineModes.HorizontalFromY
  }
  if (raw === DrawLineModes.DiffBracket || raw === 'diff-bracket' || raw === 'diffbracket') {
    return DrawLineModes.DiffBracket
  }
  return null
}

function resolveAnnotationNodeId(op: DrawOp): string | null {
  const nodeId = typeof op.meta?.nodeId === 'string' ? op.meta.nodeId.trim() : ''
  if (nodeId.length > 0) return nodeId
  const rawId = typeof (op as { id?: unknown }).id === 'string' ? ((op as { id?: string }).id ?? '').trim() : ''
  return rawId.length > 0 ? rawId : null
}

function formatScalarPanelNumber(value: number) {
  if (!Number.isFinite(value)) return ''
  let text = value.toFixed(2)
  text = text.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '')
  if (text === '-0') return '0'
  return text
}

function toWrappedLines(label: string, maxCharsPerLine: number, maxLines: number): string[] {
  const normalized = String(label ?? '').trim().replace(/\s+/g, ' ')
  if (!normalized) return ['']
  const safeMaxChars = Math.max(6, Math.floor(maxCharsPerLine))
  const safeMaxLines = Math.max(1, Math.floor(maxLines))
  const words = normalized.split(' ')
  const lines: string[] = []
  let current = ''

  const pushCurrent = () => {
    if (!current) return
    lines.push(current)
    current = ''
  }

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (candidate.length <= safeMaxChars) {
      current = candidate
      continue
    }
    if (!current) {
      lines.push(word.slice(0, safeMaxChars))
      continue
    }
    pushCurrent()
    current = word
    if (lines.length >= safeMaxLines) break
  }
  pushCurrent()

  if (lines.length > safeMaxLines) lines.length = safeMaxLines

  const consumed = lines.join(' ').length
  if (consumed < normalized.length && lines.length > 0) {
    const lastIndex = lines.length - 1
    const last = lines[lastIndex]
    const clipped = last.length >= safeMaxChars ? `${last.slice(0, Math.max(1, safeMaxChars - 1))}…` : `${last}…`
    lines[lastIndex] = clipped
  }
  return lines
}

export abstract class BaseDrawHandler {
  protected container: HTMLElement

  /**
   * Tracks bounding boxes of placed text annotations per chartId.
   * Keyed by chartId (or '' for global). Reset in clearAnnotations().
   */
  private _placedAnnotationBoxes = new Map<string, BoxBounds[]>()

  constructor(container: HTMLElement) {
    this.container = container
  }

  /**
   * After a text node is appended to the SVG, nudge it to avoid overlapping
   * previously placed annotations, then record its final bounding box.
   * Returns the final y coordinate used.
   */
  protected nudgeAndRecordTextBox(
    textNode: d3.Selection<SVGTextElement, unknown, SVGElement | null, unknown>,
    y: number,
    chartId?: string,
  ): number {
    const el = textNode.node() as SVGGraphicsElement | null
    if (!el || typeof el.getBBox !== 'function') return y
    try {
      const rawBBox = el.getBBox()
      if (rawBBox.width === 0) return y
      const key = chartId ?? ''
      const placed = this._placedAnnotationBoxes.get(key) ?? []
      const { dy } = nudgeToAvoidOverlap(rawBBox, placed)
      const finalY = y + dy
      if (dy !== 0) {
        textNode.attr(SvgAttributes.Y, finalY)
      }
      placed.push({ x: rawBBox.x, y: rawBBox.y + dy, width: rawBBox.width, height: rawBBox.height })
      this._placedAnnotationBoxes.set(key, placed)
      return finalY
    } catch {
      return y
    }
  }

  /** Center of an element in SVG coordinates. Falls back to boundingClientRect if CTM is unavailable. */
  protected toSvgCenter(el: Element, svgNode: SVGSVGElement) {
    return toSvgCenterUtil(el, svgNode)
  }

  protected abstract selectElements(
    select?: DrawSelect,
    chartId?: string,
  ): d3.Selection<SVGElement, JsonValue, d3.BaseType, JsonValue>
  protected abstract allMarks(chartId?: string): d3.Selection<SVGElement, JsonValue, d3.BaseType, JsonValue>
  protected defaultColor(): string {
    return '#69b3a2'
  }

  private parsePathNumbers(pathValue: string | null | undefined) {
    if (!pathValue) return [] as number[]
    return pathValue.match(/-?\d+(?:\.\d+)?/g)?.map(Number).filter(Number.isFinite) ?? []
  }

  private resolveSvgSize(svgNode: SVGSVGElement) {
    const viewBox = svgNode.viewBox?.baseVal
    const width = viewBox && Number.isFinite(viewBox.width) ? viewBox.width : svgNode.getBoundingClientRect().width
    const height = viewBox && Number.isFinite(viewBox.height) ? viewBox.height : svgNode.getBoundingClientRect().height
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null
    return { width, height }
  }

  private computeGlobalTextMinNormalizedY(svgNode: SVGSVGElement) {
    const svgSize = this.resolveSvgSize(svgNode)
    if (!svgSize || !(svgSize.height > 0)) return 0
    const marginTopRaw = svgNode.getAttribute(DataAttributes.MarginTop)
    const plotHeightRaw = svgNode.getAttribute(DataAttributes.PlotHeight)
    if (marginTopRaw == null || plotHeightRaw == null) return 0
    const marginTop = Number(marginTopRaw)
    const plotHeight = Number(plotHeightRaw)
    if (!(Number.isFinite(marginTop) && Number.isFinite(plotHeight))) return 0
    const axisBaselinePx = marginTop + plotHeight
    if (!(axisBaselinePx >= 0 && axisBaselinePx <= svgSize.height)) return 0
    const axisBaselineNorm = (svgSize.height - axisBaselinePx) / svgSize.height
    const clearanceNorm = 8 / svgSize.height
    return Math.max(0, Math.min(1, axisBaselineNorm + clearanceNorm))
  }

  private resolveLineAnchorY(
    svgNode: SVGSVGElement,
    annotationNodeId: string,
    chartId?: string | null,
  ) {
    const quotedNodeId = String(annotationNodeId).replace(/"/g, '\\"')
    const candidates = Array.from(
      svgNode.querySelectorAll<SVGLineElement>(
        `${SvgElements.Line}.${SvgClassNames.Annotation}.${SvgClassNames.LineAnnotation}[${DataAttributes.AnnotationNodeId}="${quotedNodeId}"]`,
      ),
    ).filter((line) => {
      if (chartId == null || chartId === '') return true
      return (line.getAttribute(DataAttributes.ChartId) ?? '') === chartId
    })
    if (!candidates.length) return null
    const last = candidates[candidates.length - 1]
    const y1 = Number(last.getAttribute(SvgAttributes.Y1))
    const y2 = Number(last.getAttribute(SvgAttributes.Y2))
    if (!Number.isFinite(y1) || !Number.isFinite(y2)) return null
    return Math.min(y1, y2)
  }

  private isPanelGroupNode(node: Element) {
    if (!(node instanceof SVGGElement)) return false
    if (node.classList.contains(SvgClassNames.AnnotationLayer)) return false
    const explicit = (node.getAttribute(DataAttributes.ChartPanel) ?? '').trim().toLowerCase()
    if (explicit === 'true') return true
    if (node.querySelector(SvgSelectors.XAxisGroup) || node.querySelector(SvgSelectors.YAxisGroup)) return true
    return node.querySelector(SvgSelectors.DataTargets) != null
  }

  private resolvePanelGroup(svgNode: SVGSVGElement, chartId?: string) {
    if (!chartId) return null
    const quotedChartId = chartId.replace(/"/g, '\\"')
    const explicitGroups = Array.from(
      svgNode.querySelectorAll<SVGGElement>(
        `${SvgElements.Group}[${DataAttributes.ChartId}="${quotedChartId}"][${DataAttributes.ChartPanel}="true"]`,
      ),
    ).filter((node) => !node.classList.contains(SvgClassNames.AnnotationLayer))
    if (explicitGroups.length) return explicitGroups[0]

    const candidates = Array.from(
      svgNode.querySelectorAll<SVGGElement>(`${SvgElements.Group}[${DataAttributes.ChartId}="${quotedChartId}"]`),
    ).filter((node) => this.isPanelGroupNode(node))
    if (!candidates.length) return null
    let picked = candidates[0]
    let maxArea = -1
    candidates.forEach((candidate) => {
      const rect = candidate.getBoundingClientRect()
      const area = rect.width * rect.height
      if (Number.isFinite(area) && area > maxArea) {
        maxArea = area
        picked = candidate
      }
    })
    return picked
  }

  private resolvePanelViewport(svgNode: SVGSVGElement, chartId?: string): DrawViewport {
    const svgSize = this.resolveSvgSize(svgNode)
    const fallbackWidth = svgSize?.width ?? 0
    const fallbackHeight = svgSize?.height ?? 0
    if (!chartId) {
      return {
        x: 0,
        y: 0,
        width: fallbackWidth,
        height: fallbackHeight,
        layerParent: svgNode,
      }
    }

    const panel = this.resolvePanelGroup(svgNode, chartId)
    if (!panel) {
      return {
        x: 0,
        y: 0,
        width: fallbackWidth,
        height: fallbackHeight,
        layerParent: svgNode,
      }
    }

    const readNumber = (attr: string) => {
      const raw = Number(panel.getAttribute(attr))
      return Number.isFinite(raw) ? raw : null
    }
    const metaX = readNumber(DataAttributes.PanelPlotX)
    const metaY = readNumber(DataAttributes.PanelPlotY)
    const metaW = readNumber(DataAttributes.PanelPlotWidth)
    const metaH = readNumber(DataAttributes.PanelPlotHeight)
    if (metaX != null && metaY != null && metaW != null && metaH != null && metaW > 0 && metaH > 0) {
      return {
        x: metaX,
        y: metaY,
        width: metaW,
        height: metaH,
        layerParent: panel,
      }
    }

    const xAxisPath = panel.querySelector<SVGPathElement>(`${SvgSelectors.XAxisGroup} path.domain`)
    const yAxisPath = panel.querySelector<SVGPathElement>(`${SvgSelectors.YAxisGroup} path.domain`)
    const xNums = this.parsePathNumbers(xAxisPath?.getAttribute(SvgAttributes.D))
    const yNums = this.parsePathNumbers(yAxisPath?.getAttribute(SvgAttributes.D))
    if (xNums.length >= 4 && yNums.length >= 4) {
      const xValues = xNums.filter((_, idx) => idx % 2 === 0)
      const yAxisYValues = yNums.filter((_, idx) => idx % 2 === 1)
      const width = Math.max(...xValues) - Math.min(...xValues)
      const top = Math.min(...yAxisYValues)
      const bottom = Math.max(...yAxisYValues)
      const height = bottom - top
      if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
        return {
          x: Math.min(...xValues),
          y: top,
          width,
          height,
          layerParent: panel,
        }
      }
    }

    let bbox: { x: number; y: number; width: number; height: number } | null = null
    try {
      const panelBox = panel.getBBox()
      if (panelBox.width > 0 && panelBox.height > 0) {
        bbox = { x: panelBox.x, y: panelBox.y, width: panelBox.width, height: panelBox.height }
      }
    } catch {
      bbox = null
    }
    if (bbox && Number.isFinite(bbox.width) && Number.isFinite(bbox.height) && bbox.width > 0 && bbox.height > 0) {
      return {
        x: bbox.x,
        y: bbox.y,
        width: bbox.width,
        height: bbox.height,
        layerParent: panel,
      }
    }

    return {
      x: 0,
      y: 0,
      width: fallbackWidth,
      height: fallbackHeight,
      layerParent: panel,
    }
  }

  protected selectScope(chartId?: string) {
    const svg = d3.select(this.container).select(SvgElements.Svg)
    if (!chartId) return svg as unknown as d3.Selection<d3.BaseType, JsonValue, d3.BaseType, JsonValue>
    const svgNode = svg.node() as SVGSVGElement | null
    if (!svgNode) return d3.select(null) as unknown as d3.Selection<d3.BaseType, JsonValue, d3.BaseType, JsonValue>
    const panel = this.resolvePanelGroup(svgNode, chartId)
    if (panel) {
      return d3.select(panel) as unknown as d3.Selection<d3.BaseType, JsonValue, d3.BaseType, JsonValue>
    }
    const quotedChartId = String(chartId).replace(/"/g, '\\"')
    const candidates = svg
      .selectAll<SVGGElement, JsonValue>(`${SvgElements.Group}[${DataAttributes.ChartId}="${quotedChartId}"]`)
      .filter((_, index, nodes) => this.isPanelGroupNode(nodes[index] as Element))
    return candidates.empty()
      ? (d3.select(null) as unknown as d3.Selection<d3.BaseType, JsonValue, d3.BaseType, JsonValue>)
      : (candidates as unknown as d3.Selection<d3.BaseType, JsonValue, d3.BaseType, JsonValue>)
  }

  protected isDataMarkElement(el: Element) {
    const tag = el.tagName.toLowerCase()
    if (tag !== SvgElements.Rect && tag !== SvgElements.Path && tag !== SvgElements.Circle) return false
    if (el.classList.contains('background') || el.classList.contains(SvgClassNames.Annotation)) return false
    if (el.closest?.(`.${SvgClassNames.AnnotationLayer}`)) return false
    if (el.classList.contains(SvgClassNames.MainBar)) return true

    const hasDataIdentity = [
      el.getAttribute(DataAttributes.Target),
      el.getAttribute(DataAttributes.Id),
      el.getAttribute(DataAttributes.Value),
      el.getAttribute(DataAttributes.Series),
    ].some((value) => (value ?? '').trim().length > 0)
    if (hasDataIdentity) return true

    const roleDescription = (el.getAttribute('aria-roledescription') ?? '').toLowerCase()
    return roleDescription === 'bar'
  }

  protected filterDataMarks(
    selection: d3.Selection<SVGElement, JsonValue, d3.BaseType, JsonValue>,
  ): d3.Selection<SVGElement, JsonValue, d3.BaseType, JsonValue> {
    const handler = this
    return selection.filter(function () {
      return handler.isDataMarkElement(this as Element)
    })
  }

  protected drawDebugEnabled() {
    if (typeof window === 'undefined') return false
    return Boolean((window as unknown as { __WORKBENCH_DRAW_DEBUG__?: boolean }).__WORKBENCH_DRAW_DEBUG__)
  }

  protected logSelectionDebug(
    event: string,
    op: DrawOp,
    selection: d3.Selection<SVGElement, JsonValue, d3.BaseType, JsonValue>,
  ) {
    if (!this.drawDebugEnabled()) return
    const nodes = selection.nodes()
    const sample = nodes.slice(0, 5).map((node) => ({
      tag: node.tagName.toLowerCase(),
      className: node.getAttribute(SvgAttributes.Class) ?? '',
      id: node.getAttribute(DataAttributes.Id) ?? '',
      target: node.getAttribute(DataAttributes.Target) ?? '',
      value: node.getAttribute(DataAttributes.Value) ?? '',
      series: node.getAttribute(DataAttributes.Series) ?? '',
    }))
    console.info(`[draw:${event}]`, {
      action: op.action,
      chartId: op.chartId ?? null,
      mark: op.select?.mark ?? null,
      field: op.select?.field ?? null,
      keys: op.select?.keys ?? [],
      count: nodes.length,
      sample,
    })
  }

  protected selectBarMarks(
    scope: d3.Selection<d3.BaseType, JsonValue, d3.BaseType, JsonValue>,
  ): d3.Selection<SVGRectElement, JsonValue, d3.BaseType, JsonValue> {
    const mainBars = scope.selectAll<SVGRectElement, JsonValue>(SvgSelectors.MainBars)
    if (!mainBars.empty()) return mainBars
    const fallback = scope
      .selectAll<SVGElement, JsonValue>(SvgSelectors.DataTargets)
      .filter(function () {
        const el = this as Element
        const tag = el.tagName.toLowerCase()
        if (tag !== SvgElements.Rect && tag !== SvgElements.Path) return false
        return !el.classList.contains('background') && !el.classList.contains(SvgClassNames.Annotation)
      })
    return fallback as unknown as d3.Selection<SVGRectElement, JsonValue, d3.BaseType, JsonValue>
  }

  protected applyTransition<T extends d3.BaseType, D, P extends d3.BaseType, Q>(
    selection: d3.Selection<T, D, P, Q>,
  ): d3.Transition<T, D, P, Q> {
    return selection.transition().duration(MIN_DRAW_DURATION_MS)
  }

  protected filterByKeys(
    selection: d3.Selection<SVGElement, JsonValue, d3.BaseType, JsonValue>,
    keys?: Array<string | number>,
    field?: string,
  ) {
    if (!keys || keys.length === 0) return selection
    const keyTokens = new Set<string>()
    keys.forEach((key) => {
      this.toMatchTokens(String(key)).forEach((token) => keyTokens.add(token))
    })
    const normalizedField = this.resolveSelectFieldAttribute(field)
    const inferredField = field && !normalizedField ? this.inferSelectFieldAttribute(selection, keyTokens) : null
    const effectiveField = normalizedField ?? inferredField
    const matches = (raw: string | null | undefined) => {
      if (!raw) return false
      for (const token of this.toMatchTokens(raw)) {
        if (keyTokens.has(token)) return true
      }
      return false
    }
    return selection.filter(function () {
      const el = this as Element
      const candidates = effectiveField
        ? effectiveField === 'id'
          ? [el.id]
          : [el.getAttribute(effectiveField)]
        : [
            el.getAttribute(DataAttributes.Id),
            el.getAttribute(DataAttributes.Target),
            el.getAttribute(DataAttributes.Value),
            el.getAttribute(DataAttributes.Series),
            el.id,
          ]
      for (const candidate of candidates) {
        if (matches(candidate)) return true
      }
      return false
    })
  }

  protected filterBySelect(
    selection: d3.Selection<SVGElement, JsonValue, d3.BaseType, JsonValue>,
    select?: DrawSelect,
  ) {
    return this.filterByKeys(selection, select?.keys, select?.field)
  }

  private resolveSelectFieldAttribute(field?: string) {
    if (typeof field !== 'string') return null
    const normalized = field.trim().toLowerCase()
    if (!normalized) return null

    const aliasMap = new Map<string, string>([
      ['id', 'id'],
      [DataAttributes.Id, DataAttributes.Id],
      ['target', DataAttributes.Target],
      ['x', DataAttributes.Target],
      [DataAttributes.Target, DataAttributes.Target],
      ['value', DataAttributes.Value],
      ['y', DataAttributes.Value],
      [DataAttributes.Value, DataAttributes.Value],
      ['series', DataAttributes.Series],
      ['group', DataAttributes.Series],
      ['color', DataAttributes.Series],
      [DataAttributes.Series, DataAttributes.Series],
    ])
    const aliased = aliasMap.get(normalized)
    if (aliased) return aliased

    const svg = d3.select(this.container).select(SvgElements.Svg)
    if (svg.empty()) return null
    const svgNode = svg.node() as SVGSVGElement | null
    if (!svgNode) return null
    const xField = (svgNode.getAttribute(DataAttributes.XField) ?? '').trim().toLowerCase()
    const yField = (svgNode.getAttribute(DataAttributes.YField) ?? '').trim().toLowerCase()
    const colorField = (svgNode.getAttribute(DataAttributes.ColorField) ?? '').trim().toLowerCase()

    if (xField && normalized === xField) return DataAttributes.Target
    if (yField && normalized === yField) return DataAttributes.Value
    if (colorField && normalized === colorField) return DataAttributes.Series
    return null
  }

  private inferSelectFieldAttribute(
    selection: d3.Selection<SVGElement, JsonValue, d3.BaseType, JsonValue>,
    keyTokens: Set<string>,
  ) {
    const candidates = [DataAttributes.Target, DataAttributes.Series, DataAttributes.Value, DataAttributes.Id, 'id'] as const
    let bestAttr: (typeof candidates)[number] | null = null
    let bestScore = 0

    const matches = (raw: string | null | undefined) => {
      if (!raw) return false
      for (const token of this.toMatchTokens(raw)) {
        if (keyTokens.has(token)) return true
      }
      return false
    }

    candidates.forEach((candidate) => {
      let score = 0
      selection.each(function () {
        const el = this as Element
        const raw = candidate === 'id' ? el.id : el.getAttribute(candidate)
        if (matches(raw)) score += 1
      })
      if (score > bestScore) {
        bestScore = score
        bestAttr = candidate
      }
    })

    return bestScore > 0 ? bestAttr : null
  }

  private toMatchTokens(raw: string) {
    const value = String(raw ?? '').trim()
    if (!value) return []
    const tokens = new Set<string>()
    tokens.add(value)

    const numeric = Number(value)
    if (Number.isFinite(numeric)) tokens.add(String(numeric))

    const date = new Date(value)
    if (Number.isFinite(date.getTime())) {
      const iso = date.toISOString()
      tokens.add(iso)
      tokens.add(iso.slice(0, 10))
      tokens.add(iso.slice(0, 7))
      tokens.add(String(date.getUTCFullYear()))
    }

    const plainDate = /^(\d{4})[-/](\d{1,2})(?:[-/](\d{1,2}))?$/.exec(value)
    if (plainDate) {
      const year = plainDate[1]
      const month = plainDate[2].padStart(2, '0')
      tokens.add(year)
      tokens.add(`${year}-${month}`)
      if (plainDate[3]) {
        const day = plainDate[3].padStart(2, '0')
        tokens.add(`${year}-${month}-${day}`)
      }
    }

    const isoPrefix = /^(\d{4})-(\d{2})-(\d{2})T/.exec(value)
    if (isoPrefix) {
      tokens.add(isoPrefix[1])
      tokens.add(`${isoPrefix[1]}-${isoPrefix[2]}`)
      tokens.add(`${isoPrefix[1]}-${isoPrefix[2]}-${isoPrefix[3]}`)
    }

    return Array.from(tokens)
  }

  protected yValueToSvgY(
    scope: d3.Selection<d3.BaseType, JsonValue, d3.BaseType, JsonValue>,
    svgNode: SVGSVGElement,
  ) {
    const tickCenters: Array<{ value: number; y: number }> = []
    const svgRect = svgNode.getBoundingClientRect()
    const viewBox = svgNode.viewBox?.baseVal
    const scaleY = viewBox && svgRect.height > 0 ? viewBox.height / svgRect.height : 1

    scope.selectAll<SVGTextElement, JsonValue>(SvgSelectors.YAxisText).each(function () {
      const text = (this as SVGTextElement).textContent?.trim() ?? ''
      const value = Number(text)
      if (!Number.isFinite(value)) return
      const elRect = (this as Element).getBoundingClientRect()
      const y = (viewBox?.y ?? 0) + (elRect.top - svgRect.top + elRect.height / 2) * scaleY
      tickCenters.push({ value, y })
    })
    if (tickCenters.length < 2) {
      scope
        .selectAll<SVGTextElement, JsonValue>(SvgSelectors.VegaAxisLabelCandidates)
        .filter(function () {
          const el = this as SVGTextElement
          const hasYAxisAria = (node: Element | null) => {
            let cur: Element | null = node
            while (cur) {
              const aria = (cur.getAttribute('aria-label') ?? '').toLowerCase()
              if (aria.includes('y-axis') || aria.includes('y axis')) return true
              cur = cur.parentElement
            }
            return false
          }
          return hasYAxisAria(el)
        })
        .each(function () {
          const text = (this as SVGTextElement).textContent?.trim().replace(/,/g, '') ?? ''
          const value = Number(text)
          if (!Number.isFinite(value)) return
          const elRect = (this as Element).getBoundingClientRect()
          const y = (viewBox?.y ?? 0) + (elRect.top - svgRect.top + elRect.height / 2) * scaleY
          tickCenters.push({ value, y })
        })
    }
    const markCenters: Array<{ value: number; y: number }> = []
    scope.selectAll<SVGElement, JsonValue>(SvgSelectors.DataTargets).each((_, i, nodes) => {
      const el = nodes[i] as Element
      if (!this.isDataMarkElement(el)) return
      const vAttr = el.getAttribute(DataAttributes.Value)
      const v = vAttr != null ? Number(vAttr) : NaN
      if (!Number.isFinite(v)) return
      const { y } = this.toSvgCenter(el, svgNode)
      markCenters.push({ value: v, y })
    })

    const centers = tickCenters.length >= 2 ? tickCenters : markCenters
    if (centers.length < 2) return (_value: number) => null
    centers.sort((a, b) => a.value - b.value)

    return (value: number) => {
      if (!Number.isFinite(value)) return null
      const exact = centers.find((t) => t.value === value)
      if (exact) return exact.y

      let lower = centers[0]
      let upper = centers[centers.length - 1]
      for (let i = 0; i < centers.length - 1; i += 1) {
        const a = centers[i]
        const b = centers[i + 1]
        if (value >= a.value && value <= b.value) {
          lower = a
          upper = b
          break
        }
      }
      if (value < centers[0].value) {
        lower = centers[0]
        upper = centers[1]
      } else if (value > centers[centers.length - 1].value) {
        upper = centers[centers.length - 1]
        lower = centers[centers.length - 2]
      }
      if (upper.value === lower.value) return null
      const t = (value - lower.value) / (upper.value - lower.value)
      return lower.y + (upper.y - lower.y) * t
    }
  }

  protected yAxisPixelRange(scope: d3.Selection<d3.BaseType, JsonValue, d3.BaseType, JsonValue>) {
    const tickYs: number[] = []
    scope.selectAll<SVGGElement, JsonValue>(`${SvgSelectors.YAxisGroup} .${SvgClassNames.Tick}`).each(function () {
      const transform = (this as SVGGElement).getAttribute(SvgAttributes.Transform) ?? ''
      const match = /translate\(\s*([-\d+.eE]+)(?:[,\s]+([-\d+.eE]+))?\s*\)/.exec(transform)
      if (!match) return
      const y = Number(match[2] ?? NaN)
      if (Number.isFinite(y)) tickYs.push(y)
    })
    if (tickYs.length >= 2) {
      return { top: Math.min(...tickYs), bottom: Math.max(...tickYs) }
    }

    const domainPath = scope.select<SVGPathElement>(`${SvgSelectors.YAxisGroup} path.domain`)
    const d = domainPath.attr(SvgAttributes.D)
    if (typeof d !== 'string' || d.trim().length === 0) return null
    const nums = d.match(/-?\d+(?:\.\d+)?/g)?.map(Number).filter(Number.isFinite) ?? []
    if (nums.length < 4) return null
    const yA = Number(nums[1])
    const yB = Number(nums[3])
    if (!(Number.isFinite(yA) && Number.isFinite(yB))) return null
    return { top: Math.min(yA, yB), bottom: Math.max(yA, yB) }
  }

  protected buildNiceYScale(
    scope: d3.Selection<d3.BaseType, JsonValue, d3.BaseType, JsonValue>,
    values: number[],
  ) {
    const finite = values.filter(Number.isFinite)
    if (!finite.length) return null
    const range = this.yAxisPixelRange(scope)
    if (!range) return null

    let domainMin = Math.min(0, ...finite)
    let domainMax = Math.max(0, ...finite)
    if (domainMin === domainMax) {
      if (domainMin === 0) domainMax = 1
      else if (domainMin > 0) domainMin = 0
      else domainMax = 0
    }
    return d3.scaleLinear().domain([domainMin, domainMax]).nice().range([range.bottom, range.top])
  }

  clear(chartId?: string) {
    // Non-split clear should only reset annotations to avoid visual flicker.
    const marks = this.allMarks(chartId)
    marks.interrupt()
    marks.attr(SvgAttributes.Opacity, 1)
    this.clearAnnotations(chartId)
  }

  highlight(op: DrawOp) {
    const color = op.style?.color || '#ef4444'
    const selected = this.selectElements(op.select, op.chartId)
    this.logSelectionDebug('highlight:selected', op, selected)
    if ((op.select?.keys?.length ?? 0) > 0 && selected.empty()) {
      if (this.drawDebugEnabled()) {
        console.warn('[draw:highlight] skipped because no mark matched select.keys', {
          chartId: op.chartId ?? null,
          mark: op.select?.mark ?? null,
          field: op.select?.field ?? null,
          keys: op.select?.keys ?? [],
        })
      }
      return
    }
    selected.interrupt()
    selected.each(function () {
      const node = this as SVGElement
      const el = d3.select(node)
      const fill = (el.attr(SvgAttributes.Fill) ?? '').trim().toLowerCase()
      const stroke = (el.attr(SvgAttributes.Stroke) ?? '').trim().toLowerCase()
      const hasFill = fill.length > 0 && fill !== 'none' && fill !== 'transparent'
      const hasStroke = stroke.length > 0 && stroke !== 'none' && stroke !== 'transparent'
      if (hasFill || !hasStroke) {
        el.attr(SvgAttributes.Fill, color)
        return
      }
      el.attr(SvgAttributes.Stroke, color)
    })
    if (op.style?.opacity != null) {
      selected.attr(SvgAttributes.Opacity, op.style.opacity)
    }
  }

  dim(op: DrawOp) {
    const opacity = op.style?.opacity ?? 0.25
    const selected = this.selectElements(op.select, op.chartId)
    this.logSelectionDebug('dim:selected', op, selected)
    if ((op.select?.keys?.length ?? 0) > 0 && selected.empty()) {
      if (this.drawDebugEnabled()) {
        console.warn('[draw:dim] skipped because no mark matched select.keys', {
          chartId: op.chartId ?? null,
          mark: op.select?.mark ?? null,
          field: op.select?.field ?? null,
          keys: op.select?.keys ?? [],
        })
      }
      return
    }
    const all = this.allMarks(op.chartId)
    this.logSelectionDebug('dim:all', op, all)
    all.interrupt()
    const selectedNodes = new Set(selected.nodes())
    all.attr(SvgAttributes.Opacity, function () {
      return selectedNodes.has(this as SVGElement) ? 1 : opacity
    })
  }

  text(op: DrawOp) {
    const textSpec = op.text
    const value = textSpec?.value
    if (!value) return
    const annotationKey = resolveAnnotationKeyForDrawOp(op)
    const annotationNodeId = resolveAnnotationNodeId(op)

    const svg = d3.select(this.container).select(SvgElements.Svg)
    if (svg.empty()) return
    const svgNode = svg.node() as SVGSVGElement | null
    if (!svgNode) return

    const mode: DrawTextMode =
      textSpec?.mode ?? (op.select?.keys?.length ? DrawTextModes.Anchor : DrawTextModes.Normalized)
    const offsetX = textSpec?.offset?.x ?? 0
    const offsetY = textSpec?.offset?.y ?? (mode === DrawTextModes.Anchor ? -6 : 0)

    const style = textSpec?.style

    const resolveTextValue = (el?: Element) => {
      if (typeof value === 'string') return value
      if (!el) return null
      const candidates = [
        el.getAttribute(DataAttributes.Id),
        el.getAttribute(DataAttributes.Target),
        el.getAttribute(DataAttributes.Value),
        el.getAttribute(DataAttributes.Series),
        el.id,
      ].filter(Boolean) as string[]
      if (value && typeof value === 'object') {
        const byAttrName = [
          DataAttributes.Id,
          DataAttributes.Target,
          DataAttributes.Value,
          DataAttributes.Series,
          'id',
        ]
        for (const key of byAttrName) {
          if ((value as Record<string, unknown>)[key] != null) {
            const mapped = (value as Record<string, unknown>)[key]
            return typeof mapped === 'string' ? mapped : String(mapped)
          }
        }
      }
      for (const key of candidates) {
        if (value[key] != null) return value[key]
      }
      return null
    }

    if (mode === DrawTextModes.Anchor) {
      const selection = this.selectElements(op.select, op.chartId)
      if (selection.empty()) return
      const handler = this
      selection.each(function () {
        const el = this as SVGGraphicsElement
        if (!el || typeof el.getBBox !== 'function') return
        const bbox = el.getBBox()
        const x = bbox.x + bbox.width / 2 + offsetX
        const y = bbox.y + offsetY
        const textValue = resolveTextValue(el)
        if (!textValue) return
        const layerParent = el.parentElement ?? svgNode
        const layer = d3.select(ensureAnnotationLayer(layerParent, op.chartId ?? null))
        const textNode = layer
          .append(SvgElements.Text)
          .attr(SvgAttributes.Class, `${SvgClassNames.Annotation} ${SvgClassNames.TextAnnotation}`)
          .attr(DataAttributes.ChartId, op.chartId ?? null)
          .attr(DataAttributes.AnnotationKey, annotationKey ?? null)
          .attr(DataAttributes.AnnotationNodeId, annotationNodeId ?? null)
          .attr(SvgAttributes.X, x)
          .attr(SvgAttributes.Y, y)
          .attr(SvgAttributes.TextAnchor, 'middle')
          .attr(SvgAttributes.DominantBaseline, 'ideographic')
          .attr(SvgAttributes.Fill, style?.color ?? '#111827')
          .attr(SvgAttributes.FontSize, style?.fontSize ?? 12)
          .attr(SvgAttributes.FontWeight, style?.fontWeight ?? 'bold')
          .attr(SvgAttributes.Opacity, 0)
          .attr(SvgAttributes.FontFamily, style?.fontFamily ?? null)
          .text(textValue)
        handler.nudgeAndRecordTextBox(
          textNode as unknown as d3.Selection<SVGTextElement, unknown, SVGElement | null, unknown>,
          y,
          op.chartId,
        )
        handler.applyTransition(textNode).attr(SvgAttributes.Opacity, style?.opacity ?? 1)
      })
      return
    }

    if (mode === DrawTextModes.Normalized) {
      const pos = textSpec?.position
      if (!pos) {
        console.warn('draw:text requires text.position when mode=normalized', op)
        return
      }
      const viewport = this.resolvePanelViewport(svgNode, op.chartId)
      const width = viewport.width
      const height = viewport.height
      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return

      const clamp = (n: number) => Math.max(0, Math.min(1, n))
      const textValue = typeof value === 'string' ? value : null
      if (!textValue) return

      const normalizedX = clamp(pos.x)
      let normalizedY = clamp(pos.y)
      if (!op.chartId) {
        const minY = this.computeGlobalTextMinNormalizedY(svgNode)
        if (normalizedY < minY) {
          normalizedY = minY
        }
      }
      const x = viewport.x + normalizedX * width + offsetX
      const yFromNormalized = viewport.y + (1 - normalizedY) * height + offsetY
      const lineAnchorY =
        annotationNodeId != null ? this.resolveLineAnchorY(svgNode, annotationNodeId, op.chartId ?? null) : null
      const y =
        lineAnchorY == null
          ? yFromNormalized
          : Math.max(viewport.y + 8, Math.min(viewport.y + viewport.height - 2, lineAnchorY - 8 + offsetY))

      const layer = d3.select(ensureAnnotationLayer(viewport.layerParent, op.chartId ?? null))
      const textNode = layer
        .append(SvgElements.Text)
        .attr(SvgAttributes.Class, `${SvgClassNames.Annotation} ${SvgClassNames.TextAnnotation}`)
        .attr(DataAttributes.ChartId, op.chartId ?? null)
        .attr(DataAttributes.AnnotationKey, annotationKey ?? null)
        .attr(DataAttributes.AnnotationNodeId, annotationNodeId ?? null)
        .attr(SvgAttributes.X, x)
        .attr(SvgAttributes.Y, y)
        .attr(SvgAttributes.TextAnchor, 'middle')
        .attr(SvgAttributes.DominantBaseline, 'middle')
        .attr(SvgAttributes.Fill, style?.color ?? '#111827')
        .attr(SvgAttributes.FontSize, style?.fontSize ?? 12)
        .attr(SvgAttributes.FontWeight, style?.fontWeight ?? 'bold')
        .attr(SvgAttributes.Opacity, 0)
        .attr(SvgAttributes.FontFamily, style?.fontFamily ?? null)
        .text(textValue)
      this.nudgeAndRecordTextBox(
        textNode as unknown as d3.Selection<SVGTextElement, unknown, SVGElement | null, unknown>,
        y,
        op.chartId,
      )
      this.applyTransition(textNode).attr(SvgAttributes.Opacity, style?.opacity ?? 1)
      return
    }
  }

  rect(op: DrawOp) {
    const rectSpec: DrawRectSpec | undefined = op.rect
    if (!rectSpec) return
    const annotationKey = resolveAnnotationKeyForDrawOp(op)
    const annotationNodeId = resolveAnnotationNodeId(op)
    const svg = d3.select(this.container).select(SvgElements.Svg)
    if (svg.empty()) return

    const svgNode = svg.node() as SVGSVGElement | null
    if (!svgNode) return
    const viewport = this.resolvePanelViewport(svgNode, op.chartId)
    const normalizedLayer = d3.select(ensureAnnotationLayer(viewport.layerParent, op.chartId ?? null))
    const layer = d3.select(ensureAnnotationLayer(svgNode, op.chartId ?? null))
    const viewBox = svgNode.viewBox?.baseVal
    const width = viewBox && Number.isFinite(viewBox.width) ? viewBox.width : svgNode.getBoundingClientRect().width
    const height = viewBox && Number.isFinite(viewBox.height) ? viewBox.height : svgNode.getBoundingClientRect().height
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return

    const clamp = (n: number) => Math.max(0, Math.min(1, n))
    const mode: DrawRectMode = rectSpec.mode ?? DrawRectModes.Normalized
    let centerX: number | null = null
    let centerY: number | null = null
    if (mode === DrawRectModes.Normalized) {
      const pos = rectSpec.position
      const size = rectSpec.size
      if (!pos || !size) {
        console.warn('draw:rect requires rect.position and rect.size when mode=normalized', op)
        return
      }
      centerX = viewport.x + clamp(pos.x) * viewport.width
      centerY = viewport.y + (1 - clamp(pos.y)) * viewport.height
    } else if (mode === DrawRectModes.DataPoint) {
      const pointX = rectSpec.point?.x
      const size = rectSpec.size
      if (pointX == null || !size) {
        console.warn('draw:rect requires rect.point.x and rect.size when mode=data-point', op)
        return
      }
      const label = String(pointX)
      const scope = this.selectScope(op.chartId)
      const candidates = scope.selectAll<SVGElement, JsonValue>(SvgSelectors.DataTargets).filter(function () {
        const el = this as Element
        const target = el.getAttribute(DataAttributes.Target) || el.getAttribute(DataAttributes.Id)
        return target != null && String(target) === label
      })
      if (candidates.empty()) return
      const nodes = candidates.nodes() as SVGGraphicsElement[]
      const pick = nodes.reduce<SVGGraphicsElement | null>((best, current) => {
        if (!best) return current
        const bestBBox = typeof best.getBBox === 'function' ? best.getBBox() : null
        const currBBox = typeof current.getBBox === 'function' ? current.getBBox() : null
        const bestArea = bestBBox ? Math.abs(bestBBox.width * bestBBox.height) : Number.POSITIVE_INFINITY
        const currArea = currBBox ? Math.abs(currBBox.width * currBBox.height) : Number.POSITIVE_INFINITY
        return currArea < bestArea ? current : best
      }, null)
      const node = pick as SVGGraphicsElement | null
      if (!node) return

      const svgRect = svgNode.getBoundingClientRect()
      const viewBox = svgNode.viewBox?.baseVal
      const scaleX = viewBox && svgRect.width > 0 ? viewBox.width / svgRect.width : 1
      const scaleY = viewBox && svgRect.height > 0 ? viewBox.height / svgRect.height : 1

      centerX = (viewBox?.x ?? 0) + (node.getBoundingClientRect().left - svgRect.left + node.getBoundingClientRect().width / 2) * scaleX
      const rawValue = node.getAttribute(DataAttributes.Value)
      const value = rawValue != null ? Number(rawValue) : NaN
      if (node.tagName.toLowerCase() === SvgElements.Rect) {
        const elRect = node.getBoundingClientRect()
        const yTop = (viewBox?.y ?? 0) + (elRect.top - svgRect.top) * scaleY
        const yBottom = (viewBox?.y ?? 0) + (elRect.bottom - svgRect.top) * scaleY
        if (Number.isFinite(value)) {
          centerY = value >= 0 ? yTop : yBottom
        } else {
          centerY = (yTop + yBottom) / 2
        }
      } else {
        const center = this.toSvgCenter(node, svgNode)
        centerY = center.y
      }
    } else if (mode === DrawRectModes.Axis) {
      const axis = rectSpec.axis
      if (!axis) {
        console.warn('draw:rect requires rect.axis when mode=axis', op)
        return
      }
      if (axis.x != null && axis.y != null) {
        console.warn('draw:rect axis mode expects only one of axis.x or axis.y', op)
        return
      }
      let axisRect: { x: number; y: number; width: number; height: number } | null = null
      let missingYLabel: boolean | null = null
      let missingLabelText: string | null = null

      if (axis.x != null) {
        const scope = this.selectScope(op.chartId)
        const labels = Array.isArray(axis.x) ? axis.x.map(String) : [String(axis.x)]
        const svgRect = svgNode.getBoundingClientRect()
        const scaleX = viewBox && svgRect.width > 0 ? viewBox.width / svgRect.width : 1
        const scaleY = viewBox && svgRect.height > 0 ? viewBox.height / svgRect.height : 1
        let tickInfos: Array<{ label: string; centerX: number; minX: number; maxX: number; minY: number; height: number }> = []
        scope.selectAll<SVGGElement, JsonValue>(SvgSelectors.XAxisTicks).each(function () {
          const tick = this as SVGGElement
          const text = tick.querySelector('text')
          const label = text?.textContent?.trim()
          if (!label) return
          const bbox = tick.getBoundingClientRect()
          tickInfos.push({
            label,
            centerX: (viewBox?.x ?? 0) + (bbox.left - svgRect.left + bbox.width / 2) * scaleX,
            minX: (viewBox?.x ?? 0) + (bbox.left - svgRect.left) * scaleX,
            maxX: (viewBox?.x ?? 0) + (bbox.right - svgRect.left) * scaleX,
            minY: (viewBox?.y ?? 0) + (bbox.top - svgRect.top) * scaleY,
            height: bbox.height * scaleY,
          })
        })
        // fallback: use mark centers when axis ticks are unavailable
        if (!tickInfos.length) {
          const markInfos: Array<{ label: string; centerX: number }> = []
          scope.selectAll<SVGElement, JsonValue>(SvgSelectors.DataTargets).each((_, i, nodes) => {
            const el = nodes[i] as Element
            const lbl = el.getAttribute(DataAttributes.Target) || el.getAttribute(DataAttributes.Id)
            if (!lbl) return
            const pt = this.toSvgCenter(el, svgNode)
            markInfos.push({ label: String(lbl), centerX: pt.x })
          })
          markInfos.sort((a, b) => a.centerX - b.centerX)
          tickInfos = markInfos.map((m, idx, arr) => {
            const prev = arr[idx - 1]
            const next = arr[idx + 1]
            const spacingPrev = prev ? m.centerX - prev.centerX : next ? next.centerX - m.centerX : 10
            const spacingNext = next ? next.centerX - m.centerX : spacingPrev
            const minX = prev ? (prev.centerX + m.centerX) / 2 : m.centerX - spacingPrev / 2
            const maxX = next ? (m.centerX + next.centerX) / 2 : m.centerX + spacingNext / 2
            return { label: m.label, centerX: m.centerX, minX, maxX, minY: 0, height: 12 }
          })
        }
        if (!tickInfos.length) return
        tickInfos.sort((a, b) => a.centerX - b.centerX)

        const findTick = (lbl: string) => tickInfos.find((t) => t.label === lbl)
        if (labels.length === 1) {
          const target = findTick(labels[0])
          if (!target) return
          const idx = tickInfos.indexOf(target)
          const prev = tickInfos[idx - 1]
          const next = tickInfos[idx + 1]
          const spacingPrev = prev ? target.centerX - prev.centerX : next ? next.centerX - target.centerX : target.height || 1
          const spacingNext = next ? next.centerX - target.centerX : spacingPrev
          const left = prev ? (prev.centerX + target.centerX) / 2 : target.centerX - spacingNext / 2
          const right = next ? (target.centerX + next.centerX) / 2 : target.centerX + spacingPrev / 2
          const paddingY = 2
          const rectHeight = target.height + paddingY * 2
          axisRect = {
            x: left,
            width: right - left,
            y: target.minY - paddingY,
            height: rectHeight,
          }
        } else if (labels.length === 2) {
          const first = findTick(labels[0])
          const second = findTick(labels[1])
          if (!first || !second) return
          const [a, b] = first.centerX <= second.centerX ? [first, second] : [second, first]
          const startIdx = tickInfos.indexOf(a)
          const endIdx = tickInfos.indexOf(b)
          const prev = tickInfos[startIdx - 1]
          const next = tickInfos[endIdx + 1]
          const spacingLeft = prev ? a.centerX - prev.centerX : tickInfos[1] ? tickInfos[1].centerX - a.centerX : a.height || 1
          const spacingRight =
            next && tickInfos[tickInfos.length - 2]
              ? next.centerX - b.centerX
              : tickInfos[tickInfos.length - 1].centerX - tickInfos[tickInfos.length - 2]?.centerX || a.height || 1
          const left = prev ? (prev.centerX + a.centerX) / 2 : a.centerX - spacingLeft / 2
          const right = next ? (b.centerX + next.centerX) / 2 : b.centerX + spacingRight / 2
          const involved = tickInfos.slice(startIdx, endIdx + 1)
          const minY = Math.min(...involved.map((t) => t.minY))
          const maxH = Math.max(...involved.map((t) => t.height))
          const paddingY = 2
          axisRect = {
            x: left,
            width: right - left,
            y: minY - paddingY,
            height: maxH + paddingY * 2,
          }
        } else {
          console.warn('draw:rect axis.x supports 1 or 2 labels', op)
        }
      }
      if (axis.y != null) {
        const scope = this.selectScope(op.chartId)
        const yValues = Array.isArray(axis.y) ? axis.y.map(Number) : [Number(axis.y)]
        if (yValues.some((v) => !Number.isFinite(v))) return

        const svgRect = svgNode.getBoundingClientRect()
        const scaleX = viewBox && svgRect.width > 0 ? viewBox.width / svgRect.width : 1
        const scaleY = viewBox && svgRect.height > 0 ? viewBox.height / svgRect.height : 1

        let tickInfos: Array<{
          value: number
          centerY: number
          minY: number
          maxY: number
          minX: number
          maxX: number
          height: number
        }> = []
        let tickSource: 'y-axis-class' | 'role-axis-label' | 'marks' | 'unknown' = 'unknown'
        // 1) Preferred: explicit y-axis class (bar charts)
        scope.selectAll<SVGGElement, JsonValue>(`.${SvgClassNames.YAxis} .${SvgClassNames.Tick}`).each(function () {
          const tick = this as SVGGElement
          const text = tick.querySelector('text')
          const label = text?.textContent?.trim()
          const num = Number(label?.replace?.(/,/g, '') ?? label)
          if (!Number.isFinite(num)) return
          const bbox = text?.getBoundingClientRect() ?? tick.getBoundingClientRect()
          const minX = (bbox.left - svgRect.left) * scaleX
          const maxX = (bbox.right - svgRect.left) * scaleX
          tickInfos.push({
            value: num,
            centerY: (viewBox?.y ?? 0) + (bbox.top - svgRect.top + bbox.height / 2) * scaleY,
            minY: (viewBox?.y ?? 0) + (bbox.top - svgRect.top) * scaleY,
            maxY: (viewBox?.y ?? 0) + (bbox.bottom - svgRect.top) * scaleY,
            minX: (viewBox?.x ?? 0) + minX,
            maxX: (viewBox?.x ?? 0) + maxX,
            height: bbox.height * scaleY,
          })
          tickSource = 'y-axis-class'
        })
        // 2) Vega-Lite axes often use role/aria-label / role-axis-label classes; capture them (y-axis only)
        if (!tickInfos.length) {
          scope
            .selectAll<SVGTextElement, any>(SvgSelectors.VegaAxisLabelCandidates)
            .filter(function () {
              const el = this as SVGTextElement
              const cls = (el.getAttribute('class') || '').toLowerCase()
              const parent = el.parentElement
              const ariaSelf = el.getAttribute('aria-label')?.toLowerCase() || ''
              const ariaParent = parent?.getAttribute('aria-label')?.toLowerCase() || ''
              const axisAncestor = el.closest('[aria-label*=\"y-axis\"], [aria-label*=\"y axis\"]')
              const isAxisLabel = cls.includes('role-axis-label') || ariaSelf.includes('y-axis') || ariaParent.includes('y-axis') || axisAncestor
              return Boolean(isAxisLabel)
            })
            .each(function () {
              const el = this as SVGTextElement
              const str = String(el.textContent ?? '').trim().replace(/,/g, '')
              const num = Number(str)
              if (!Number.isFinite(num)) return
              const bbox = el.getBoundingClientRect()
              const minX = (bbox.left - svgRect.left) * scaleX
              const maxX = (bbox.right - svgRect.left) * scaleX
              tickInfos.push({
                value: num,
                centerY: (viewBox?.y ?? 0) + (bbox.top - svgRect.top + bbox.height / 2) * scaleY,
                minY: (viewBox?.y ?? 0) + (bbox.top - svgRect.top) * scaleY,
                maxY: (viewBox?.y ?? 0) + (bbox.bottom - svgRect.top) * scaleY,
                minX: (viewBox?.x ?? 0) + minX,
                maxX: (viewBox?.x ?? 0) + maxX,
                height: bbox.height * scaleY,
              })
              tickSource = 'role-axis-label'
            })
        }
        if (!tickInfos.length) {
          const markInfos: Array<{ value: number; centerY: number; minX: number; maxX: number }> = []
          scope.selectAll<SVGElement, JsonValue>(SvgSelectors.DataTargets).each((_, i, nodes) => {
            const el = nodes[i] as Element
            const vAttr = el.getAttribute(DataAttributes.Value)
            const val = vAttr != null ? Number(vAttr) : NaN
            if (!Number.isFinite(val)) return
            const pt = this.toSvgCenter(el, svgNode)
            const bbox = (el as SVGGraphicsElement).getBBox?.()
            const halfW = bbox ? bbox.width / 2 : 4
            markInfos.push({ value: val, centerY: pt.y, minX: pt.x - halfW, maxX: pt.x + halfW })
          })
          // Deduplicate by y-value, keep the point closest to the y-axis (smallest |x|)
          const uniqueMap = new Map<number, { value: number; centerY: number; minX: number; maxX: number }>()
          markInfos.forEach((m) => {
            const prev = uniqueMap.get(m.value)
            const dist = Math.abs(m.minX) + Math.abs(m.maxX)
            const prevDist = prev ? Math.abs(prev.minX) + Math.abs(prev.maxX) : Infinity
            if (!prev || dist < prevDist) uniqueMap.set(m.value, m)
          })
          const deduped = Array.from(uniqueMap.values()).sort((a, b) => a.value - b.value)
          tickInfos = deduped.map((m) => ({
            value: m.value,
            centerY: m.centerY,
            minY: m.centerY,
            maxY: m.centerY,
            minX: m.minX,
            maxX: m.maxX,
            height: 8,
          }))
          tickSource = 'marks'
        }
        if (!tickInfos.length) return
        tickInfos.sort((a, b) => a.value - b.value)
        const paddingX = 4 * scaleX
        const paddingY = 2 * scaleY

        // y축 밴드는 실제 텍스트 폭을 기준으로 x범위를 계산
        const finiteMinXs = tickInfos.map((t) => t.minX).filter((v) => Number.isFinite(v))
        const finiteMaxXs = tickInfos.map((t) => t.maxX).filter((v) => Number.isFinite(v))
        const overallMinX =
          finiteMinXs.length && finiteMaxXs.length
            ? Math.min(...finiteMinXs) - paddingX
            : -paddingX
        const overallMaxX =
          finiteMinXs.length && finiteMaxXs.length
            ? Math.max(...finiteMaxXs) + paddingX
            : paddingX
        const overallCenterX = (overallMinX + overallMaxX) / 2

        const findTickByValue = (v: number) => {
          const EPS = 1e-6
          return tickInfos.find((t) => Math.abs(t.value - v) < EPS)
        }

        const minGap = (() => {
          const diffs: number[] = []
          for (let i = 0; i < tickInfos.length - 1; i += 1) {
            diffs.push(Math.abs(tickInfos[i + 1].centerY - tickInfos[i].centerY))
          }
          return diffs.length ? Math.min(...diffs) : height * 0.05
        })()

        const mapYValue = (v: number) => {
          const exact = findTickByValue(v)
          if (exact) return { y: exact.centerY, height: exact.height }
          let lower = tickInfos[0]
          let upper = tickInfos[tickInfos.length - 1]
          for (let i = 0; i < tickInfos.length - 1; i += 1) {
            const a = tickInfos[i]
            const b = tickInfos[i + 1]
            if (v >= a.value && v <= b.value) {
              lower = a
              upper = b
              break
            }
          }
          if (upper.value === lower.value) return null
          const t = clamp((v - lower.value) / (upper.value - lower.value))
          const y = lower.centerY + (upper.centerY - lower.centerY) * t
          const heightInterp = lower.height + (upper.height - lower.height) * t
          return { y, height: Math.max(heightInterp, 0) }
        }

        if (yValues.length === 1) {
          const pos = mapYValue(yValues[0])
          if (!pos) return
          missingYLabel = !findTickByValue(yValues[0])
          missingLabelText = missingYLabel ? String(yValues[0]) : null
          const rectLeft = overallMinX
          const rectRight = overallMaxX
          const bandHeight = Math.max(pos.height || minGap * 0.6, minGap * 0.4)
          axisRect = {
            x: rectLeft,
            width: rectRight - rectLeft,
            y: pos.y - bandHeight / 2 - paddingY,
            height: bandHeight + paddingY * 2,
          }
        } else if (yValues.length === 2) {
          const posA = mapYValue(yValues[0])
          const posB = mapYValue(yValues[1])
          if (!posA || !posB) return
          missingYLabel = !findTickByValue(yValues[0]) || !findTickByValue(yValues[1])
          missingLabelText = missingYLabel ? `${yValues[0]}–${yValues[1]}` : null
          const yTop = Math.min(posA.y, posB.y)
          const yBottom = Math.max(posA.y, posB.y)
          const rectLeft = overallMinX
          const rectRight = overallMaxX
          axisRect = {
            x: rectLeft,
            width: rectRight - rectLeft,
            y: yTop - paddingY,
            height: yBottom - yTop + paddingY * 2,
          }
        } else {
          console.warn('draw:rect axis.y supports 1 or 2 values', op)
        }
      }
      if (axisRect) {
        centerX = axisRect.x + axisRect.width / 2
        centerY = axisRect.y + axisRect.height / 2
        const rectWidth = axisRect.width
        const rectHeight = axisRect.height
        const x = axisRect.x
        const y = axisRect.y
        const rectNode = layer
          .append(SvgElements.Rect)
          .attr(SvgAttributes.Class, `${SvgClassNames.Annotation} ${SvgClassNames.RectAnnotation}`)
          .attr(DataAttributes.ChartId, op.chartId ?? null)
          .attr(DataAttributes.AnnotationKey, annotationKey ?? null)
          .attr(DataAttributes.AnnotationNodeId, annotationNodeId ?? null)
          .attr(SvgAttributes.X, x)
          .attr(SvgAttributes.Y, y)
          .attr(SvgAttributes.Width, rectWidth)
          .attr(SvgAttributes.Height, rectHeight)
          .attr(SvgAttributes.Fill, rectSpec.style?.fill ?? 'none')
          .attr(SvgAttributes.Opacity, 0)
          .attr(SvgAttributes.Stroke, rectSpec.style?.stroke ?? '#111827')
          .attr(SvgAttributes.StrokeWidth, rectSpec.style?.strokeWidth ?? 1)
        this.applyTransition(rectNode).attr(SvgAttributes.Opacity, rectSpec.style?.opacity ?? 1)

        if (axis.y != null && missingYLabel === true && missingLabelText) {
          const textNode = layer
            .append(SvgElements.Text)
            .attr(SvgAttributes.Class, `${SvgClassNames.Annotation} ${SvgClassNames.TextAnnotation}`)
            .attr(DataAttributes.ChartId, op.chartId ?? null)
            .attr(DataAttributes.AnnotationKey, annotationKey ?? null)
            .attr(DataAttributes.AnnotationNodeId, annotationNodeId ?? null)
            .attr(SvgAttributes.X, centerX)
            .attr(SvgAttributes.Y, centerY)
            .attr(SvgAttributes.TextAnchor, 'middle')
            .attr(SvgAttributes.DominantBaseline, 'middle')
            .attr(SvgAttributes.Fill, rectSpec.style?.stroke ?? '#111827')
            .attr(SvgAttributes.FontSize, 12)
            .attr(SvgAttributes.FontWeight, 'bold')
            .attr(SvgAttributes.Opacity, 0)
            .attr(SvgAttributes.Stroke, 'white')
            .attr(SvgAttributes.StrokeWidth, 0.75)
            .attr(SvgAttributes.PaintOrder, 'stroke')
            .text(missingLabelText)
          this.applyTransition(textNode).attr(SvgAttributes.Opacity, 1)
        }
        return
      }
    }

    if (centerX == null || centerY == null) return
    const sizeWidthBase = mode === DrawRectModes.Normalized ? viewport.width : width
    const sizeHeightBase = mode === DrawRectModes.Normalized ? viewport.height : height
    const rectWidth = (rectSpec.size?.width ?? 0) * sizeWidthBase
    const rectHeight = (rectSpec.size?.height ?? 0) * sizeHeightBase
    if (!rectWidth || !rectHeight) {
      console.warn('draw:rect size is required for normalized mode', op)
      return
    }

    const x = centerX - rectWidth / 2
    const y = centerY - rectHeight / 2

    const drawLayer = mode === DrawRectModes.Normalized ? normalizedLayer : layer
    const rectNode = drawLayer
      .append(SvgElements.Rect)
      .attr(SvgAttributes.Class, `${SvgClassNames.Annotation} ${SvgClassNames.RectAnnotation}`)
      .attr(DataAttributes.ChartId, op.chartId ?? null)
      .attr(DataAttributes.AnnotationKey, annotationKey ?? null)
      .attr(DataAttributes.AnnotationNodeId, annotationNodeId ?? null)
      .attr(SvgAttributes.X, x)
      .attr(SvgAttributes.Y, y)
      .attr(SvgAttributes.Width, rectWidth)
      .attr(SvgAttributes.Height, rectHeight)
      .attr(SvgAttributes.Fill, rectSpec.style?.fill ?? 'none')
      .attr(SvgAttributes.Opacity, 0)
      .attr(SvgAttributes.Stroke, rectSpec.style?.stroke ?? '#111827')
      .attr(SvgAttributes.StrokeWidth, rectSpec.style?.strokeWidth ?? 1)
    this.applyTransition(rectNode).attr(SvgAttributes.Opacity, rectSpec.style?.opacity ?? 1)
  }

  line(op: DrawOp) {
    const lineSpec: DrawLineSpec | undefined = op.line
    if (!lineSpec) return
    const annotationKey = resolveAnnotationKeyForDrawOp(op)
    const annotationNodeId = resolveAnnotationNodeId(op)
    const svg = d3.select(this.container).select(SvgElements.Svg)
    if (svg.empty()) return

    const svgNode = svg.node() as SVGSVGElement | null
    if (!svgNode) return
    const viewBox = svgNode.viewBox?.baseVal
    const width = viewBox && Number.isFinite(viewBox.width) ? viewBox.width : svgNode.getBoundingClientRect().width
    const height = viewBox && Number.isFinite(viewBox.height) ? viewBox.height : svgNode.getBoundingClientRect().height
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return

    const hasNormalizedPosition = Boolean(lineSpec.position?.start && lineSpec.position?.end && !lineSpec.mode)
    const normalizedViewport = hasNormalizedPosition ? this.resolvePanelViewport(svgNode, op.chartId) : null
    const layerParent = normalizedViewport?.layerParent ?? svgNode
    const layer = d3.select(ensureAnnotationLayer(layerParent, op.chartId ?? null))

    const scope = this.selectScope(op.chartId)
    const mapY = this.yValueToSvgY(scope, svgNode)

    // Normalized position line (used by JSON ops / interaction snapshots without mode).
    if (hasNormalizedPosition && normalizedViewport) {
      const clamp = (value: number) => Math.max(0, Math.min(1, value))
      const x1 = normalizedViewport.x + clamp(lineSpec.position!.start.x) * normalizedViewport.width
      const y1 = normalizedViewport.y + (1 - clamp(lineSpec.position!.start.y)) * normalizedViewport.height
      const x2 = normalizedViewport.x + clamp(lineSpec.position!.end.x) * normalizedViewport.width
      const y2 = normalizedViewport.y + (1 - clamp(lineSpec.position!.end.y)) * normalizedViewport.height
      drawLineWithArrow(layer, op.chartId, lineSpec, { x1, y1, x2, y2 }, annotationKey, annotationNodeId)
      return
    }

    const explicitMode = normalizeLineMode(lineSpec.mode)
    const mode =
      explicitMode ??
      (lineSpec.hline?.x != null
        ? DrawLineModes.HorizontalFromX
        : lineSpec.hline?.y != null
          ? DrawLineModes.HorizontalFromY
          : DrawLineModes.Angle)
    if (lineSpec.mode != null && explicitMode == null && this.drawDebugEnabled()) {
      console.warn('[draw:line] unknown mode token; inferred mode from payload shape', {
        mode: lineSpec.mode,
        inferredMode: mode,
        chartId: op.chartId ?? null,
      })
    }
    if (mode === DrawLineModes.ConnectPanelScalar) {
      const panelScalar = lineSpec.panelScalar
      if (!panelScalar?.start || !panelScalar?.end) return
      const startChartId = String(panelScalar.start.chartId || '').trim()
      const endChartId = String(panelScalar.end.chartId || '').trim()
      const startValue = Number(panelScalar.start.value)
      const endValue = Number(panelScalar.end.value)
      if (!startChartId || !endChartId || !Number.isFinite(startValue) || !Number.isFinite(endValue)) return

      const svgRect = svgNode.getBoundingClientRect()
      const viewBoxLocal = svgNode.viewBox?.baseVal
      const scaleX = viewBoxLocal && svgRect.width > 0 ? viewBoxLocal.width / svgRect.width : 1
      const scaleY = viewBoxLocal && svgRect.height > 0 ? viewBoxLocal.height / svgRect.height : 1
      const viewBoxX = viewBoxLocal?.x ?? 0
      const viewBoxY = viewBoxLocal?.y ?? 0

      const toViewBoxPoint = (clientX: number, clientY: number) => ({
        x: (clientX - svgRect.left) * scaleX + viewBoxX,
        y: (clientY - svgRect.top) * scaleY + viewBoxY,
      })

      const panelRectForChart = (chartId: string) => {
        const quotedChartId = chartId.replace(/"/g, '\\"')
        const explicit = Array.from(
          svgNode.querySelectorAll<SVGGElement>(
            `${SvgElements.Group}[${DataAttributes.ChartId}="${quotedChartId}"][${DataAttributes.ChartPanel}="true"]`,
          ),
        )
        const groups = explicit.length
          ? explicit
          : Array.from(svgNode.querySelectorAll<SVGGElement>(`${SvgElements.Group}[${DataAttributes.ChartId}]`)).filter(
              (node) =>
                node.getAttribute(DataAttributes.ChartId) === chartId &&
                !node.classList.contains(SvgClassNames.AnnotationLayer),
            )
        if (!groups.length) return null
        let picked: SVGGElement | null = null
        let maxArea = -1
        for (const group of groups) {
          const rect = group.getBoundingClientRect()
          if (!(rect.width > 0 && rect.height > 0)) continue
          const area = rect.width * rect.height
          if (area > maxArea) {
            maxArea = area
            picked = group
          }
        }
        if (!picked) return null
        const rect = picked.getBoundingClientRect()
        const topLeft = toViewBoxPoint(rect.left, rect.top)
        const bottomRight = toViewBoxPoint(rect.right, rect.bottom)
        if (
          !Number.isFinite(topLeft.x) ||
          !Number.isFinite(topLeft.y) ||
          !Number.isFinite(bottomRight.x) ||
          !Number.isFinite(bottomRight.y)
        ) {
          return null
        }
        const left = Math.min(topLeft.x, bottomRight.x)
        const right = Math.max(topLeft.x, bottomRight.x)
        const top = Math.min(topLeft.y, bottomRight.y)
        const bottom = Math.max(topLeft.y, bottomRight.y)
        return {
          left,
          right,
          top,
          bottom,
          centerX: (left + right) / 2,
          centerY: (top + bottom) / 2,
        }
      }

      const resolvePanelY = (chartId: string, requested: number) => {
        const panelScope = this.selectScope(chartId)
        const mapYLocal = this.yValueToSvgY(panelScope, svgNode)
        const direct = mapYLocal(requested)
        if (direct != null) return direct
        const panelValues = panelScope
          .selectAll<SVGElement, JsonValue>(SvgSelectors.DataTargets)
          .nodes()
          .map((node) => Number((node as Element).getAttribute(DataAttributes.Value)))
          .filter(Number.isFinite)
        if (!panelValues.length) return null
        const minValue = Math.min(...panelValues)
        const maxValue = Math.max(...panelValues)
        const clamped = Math.max(minValue, Math.min(maxValue, requested))
        return mapYLocal(clamped)
      }

      const startRect = panelRectForChart(startChartId)
      const endRect = panelRectForChart(endChartId)
      if (!startRect || !endRect) return

      const yStart = resolvePanelY(startChartId, startValue)
      const yEnd = resolvePanelY(endChartId, endValue)
      if (yStart == null || yEnd == null) return

      const orientationToken = typeof panelScalar.orientationHint === 'string'
        ? panelScalar.orientationHint.trim().toLowerCase()
        : ''
      const orientation = orientationToken === 'horizontal' || orientationToken === 'vertical'
        ? orientationToken
        : Math.abs(startRect.centerX - endRect.centerX) >= Math.abs(startRect.centerY - endRect.centerY)
          ? 'horizontal'
          : 'vertical'

      if (orientation === 'horizontal') {
        const [leftRect, rightRect] =
          startRect.centerX <= endRect.centerX ? [startRect, endRect] : [endRect, startRect]
        const xMid = (leftRect.right + rightRect.left) / 2
        drawLineWithArrow(
          layer,
          undefined,
          lineSpec,
          { x1: xMid, y1: yStart, x2: xMid, y2: yEnd },
          annotationKey,
          annotationNodeId,
        )
        return
      }

      const [topRect, bottomRect] =
        startRect.centerY <= endRect.centerY ? [startRect, endRect] : [endRect, startRect]
      const yMid = (topRect.bottom + bottomRect.top) / 2
      drawLineWithArrow(
        layer,
        undefined,
        lineSpec,
        { x1: startRect.centerX, y1: yMid, x2: endRect.centerX, y2: yMid },
        annotationKey,
        annotationNodeId,
      )
      return
    }
    if (mode === DrawLineModes.Angle) {
      if (!lineSpec.axis || lineSpec.angle == null || lineSpec.length == null) return
      const xLabel = String(lineSpec.axis.x)
      const xTick = scope.selectAll<SVGTextElement, JsonValue>(SvgSelectors.XAxisText).filter(function () {
        return (this as SVGTextElement).textContent?.trim() === xLabel
      })
      if (xTick.empty()) return
      const xPt = this.toSvgCenter(xTick.node() as SVGTextElement, svgNode)
      const startY = mapY(lineSpec.axis.y) ?? xPt.y
      const endY = mapY(lineSpec.axis.y + lineSpec.length) ?? startY
      if (startY == null || endY == null) return

      const lengthPx = Math.abs(endY - startY)
      const angle = ((lineSpec.angle % 360) + 360) % 360
      const rad = ((angle - 90) * Math.PI) / 180
      const dx = Math.cos(rad) * lengthPx
      const dy = Math.sin(rad) * lengthPx

      drawLineWithArrow(
        layer,
        op.chartId,
        lineSpec,
        {
          x1: xPt.x,
          y1: startY,
          x2: xPt.x + dx,
          y2: startY + dy,
        },
        annotationKey,
        annotationNodeId,
      )
      return
    }

    if (mode === DrawLineModes.Connect) {
      const toViewBoxPoint = (clientX: number, clientY: number) => {
        const svgRect = svgNode.getBoundingClientRect()
        const viewBox = svgNode.viewBox?.baseVal
        const scaleX = viewBox && svgRect.width > 0 ? viewBox.width / svgRect.width : 1
        const scaleY = viewBox && svgRect.height > 0 ? viewBox.height / svgRect.height : 1
        return {
          x: (clientX - svgRect.left) * scaleX + (viewBox?.x ?? 0),
          y: (clientY - svgRect.top) * scaleY + (viewBox?.y ?? 0),
        }
      }

      const resolveAnchorPoint = (node: Element, yValue: number) => {
        if (node instanceof SVGRectElement) {
          const svgRect = svgNode.getBoundingClientRect()
          const nodeRect = node.getBoundingClientRect()
          const viewBox = svgNode.viewBox?.baseVal
          const scaleX = viewBox && svgRect.width > 0 ? viewBox.width / svgRect.width : 1
          const scaleY = viewBox && svgRect.height > 0 ? viewBox.height / svgRect.height : 1
          if (Number.isFinite(scaleX) && Number.isFinite(scaleY) && scaleX > 0 && scaleY > 0) {
            const centerX = (nodeRect.left - svgRect.left + nodeRect.width / 2) * scaleX + (viewBox?.x ?? 0)
            // Bars: use top edge for positive values, bottom edge for negative values.
            const edgeY = yValue >= 0 ? nodeRect.top : nodeRect.bottom
            const anchorY = (edgeY - svgRect.top) * scaleY + (viewBox?.y ?? 0)
            if (Number.isFinite(centerX) && Number.isFinite(anchorY)) {
              return { x: centerX, y: anchorY, exact: true as const }
            }
          }
        }
        if (node instanceof SVGCircleElement) {
          const cx = Number(node.getAttribute(SvgAttributes.CX))
          const cy = Number(node.getAttribute(SvgAttributes.CY))
          if (Number.isFinite(cx) && Number.isFinite(cy)) return { x: cx, y: cy, exact: true as const }
        }
        // Vega/custom bar marks may be <path> or other shapes. Use visual bbox top/bottom edge.
        const nodeRect = node.getBoundingClientRect()
        if (Number.isFinite(nodeRect.width) && Number.isFinite(nodeRect.height) && nodeRect.width > 0 && nodeRect.height > 0) {
          const center = toViewBoxPoint(nodeRect.left + nodeRect.width / 2, nodeRect.top + nodeRect.height / 2)
          const edge = yValue >= 0
            ? toViewBoxPoint(nodeRect.left + nodeRect.width / 2, nodeRect.top)
            : toViewBoxPoint(nodeRect.left + nodeRect.width / 2, nodeRect.bottom)
          if (Number.isFinite(center.x) && Number.isFinite(edge.y)) {
            return { x: center.x, y: edge.y, exact: true as const }
          }
        }
        const pt = this.toSvgCenter(node, svgNode)
        return { x: pt.x, y: pt.y, exact: false as const }
      }

      const pointFor = (label: string, series?: string | number) => {
        const matchesTarget = function (this: SVGElement) {
          const el = this as Element
          const target = el.getAttribute(DataAttributes.Target) || el.getAttribute(DataAttributes.Id)
          if (target == null || String(target) !== String(label)) return false
          if (series == null) return true
          const markSeries = el.getAttribute(DataAttributes.Series)
          return markSeries != null && String(markSeries) === String(series)
        }
        const mainBarCandidates = scope
          .selectAll<SVGRectElement, JsonValue>(SvgSelectors.MainBars)
          .filter(matchesTarget)
          .nodes() as Element[]
        const fallbackCandidates = scope
          .selectAll<SVGElement, JsonValue>(SvgSelectors.DataTargets)
          .filter(matchesTarget)
          .nodes() as Element[]
        const candidates = mainBarCandidates.length ? mainBarCandidates : fallbackCandidates
        if (!candidates.length) return null
        const node = candidates[0]
        const valueAttr = node.getAttribute(DataAttributes.Value)
        const yValue = valueAttr != null ? Number(valueAttr) : NaN
        if (!Number.isFinite(yValue)) return null
        const shapeAnchor = resolveAnchorPoint(node, yValue)
        const mappedY = mapY(yValue)
        // For bars/points, the DOM anchor is already exact and should win.
        // mapY interpolation can drift when axis/tick extraction is noisy.
        const y = shapeAnchor.exact ? shapeAnchor.y : (mappedY ?? shapeAnchor.y)
        if (!Number.isFinite(y)) return null
        return { x: shapeAnchor.x, y }
      }
      const connectBy = lineSpec.connectBy
      const pair = lineSpec.pair
      if (!connectBy && (!pair || pair.x.length !== 2)) return
      const a = connectBy
        ? pointFor(String(connectBy.start.target), connectBy.start.series)
        : pointFor(String(pair!.x[0]))
      const b = connectBy
        ? pointFor(String(connectBy.end.target), connectBy.end.series)
        : pointFor(String(pair!.x[1]))
      if (!a || !b) return
      drawLineWithArrow(layer, op.chartId, lineSpec, { x1: a.x, y1: a.y, x2: b.x, y2: b.y }, annotationKey, annotationNodeId)
      return
    }

    if (mode === DrawLineModes.HorizontalFromX || mode === DrawLineModes.HorizontalFromY) {
      let y: number | null = null
      const nodes = this
        .filterDataMarks(scope.selectAll<SVGElement, JsonValue>(SvgSelectors.DataTargets))
        .nodes()
        .filter((node) => {
          const el = node as SVGGraphicsElement
          const display = (el.getAttribute('display') ?? '').trim().toLowerCase()
          if (display === 'none') return false
          const styleDisplay = (el as SVGGraphicsElement).style?.display ?? ''
          if (styleDisplay.toLowerCase() === 'none') return false
          const rect = el.getBoundingClientRect()
          return Number.isFinite(rect.left) && Number.isFinite(rect.right) && rect.width > 0 && rect.height >= 0
        })
      if (!nodes.length) return
      const svgRect = svgNode.getBoundingClientRect()
      const viewBoxLocal = svgNode.viewBox?.baseVal
      const scaleX = viewBoxLocal && svgRect.width > 0 ? viewBoxLocal.width / svgRect.width : 1
      const viewBoxX = viewBoxLocal?.x ?? 0
      const left = Math.min(
        ...nodes.map((n) => viewBoxX + (n.getBoundingClientRect().left - svgRect.left) * scaleX),
      )
      const right = Math.max(
        ...nodes.map((n) => viewBoxX + (n.getBoundingClientRect().right - svgRect.left) * scaleX),
      )
      let x1 = left
      const x2 = right
      const numericMarkValues = nodes
        .map((node) => Number((node as Element).getAttribute(DataAttributes.Value)))
        .filter(Number.isFinite)
      const domainMin = numericMarkValues.length ? Math.min(...numericMarkValues) : null
      const domainMax = numericMarkValues.length ? Math.max(...numericMarkValues) : null

      const resolveHorizontalY = (requested: number) => {
        if (!Number.isFinite(requested)) return null
        if (domainMin == null || domainMax == null) return mapY(requested)

        const clamped = Math.min(domainMax, Math.max(domainMin, requested))
        if (clamped !== requested) {
          console.warn('[draw:line] hline-y value clamped to axis domain', {
            requested,
            clamped,
            domainMin,
            domainMax,
            chartId: op.chartId ?? null,
          })
        }

        const mapped = mapY(clamped)
        if (mapped != null) return mapped
        return clamped <= domainMin ? mapY(domainMin) : mapY(domainMax)
      }

      const axisGroup = scope.select<SVGGraphicsElement>(SvgSelectors.YAxisGroup).node()
      if (axisGroup) {
        const axisRect = axisGroup.getBoundingClientRect()
        if (axisRect.width > 0) {
          const axisRight = (viewBoxLocal?.x ?? 0) + (axisRect.right - svgRect.left) * scaleX
          if (Number.isFinite(axisRight) && axisRight < x1) {
            x1 = axisRight
          }
        }
      }

      if (mode === DrawLineModes.HorizontalFromX) {
        const label = lineSpec.hline?.x
        if (!label) return
        const mark = scope.selectAll<SVGElement, JsonValue>(SvgSelectors.DataTargets).filter(function () {
          const el = this as Element
          const target = el.getAttribute(DataAttributes.Target) || el.getAttribute(DataAttributes.Id)
          return target != null && String(target) === String(label)
        })
        if (mark.empty()) return
        const node = mark.node() as Element
        const valueAttr = node.getAttribute(DataAttributes.Value)
        const yValue = valueAttr != null ? Number(valueAttr) : NaN
        if (!Number.isFinite(yValue)) return
        y = mapY(yValue) ?? this.toSvgCenter(node, svgNode).y
      } else {
        const yValue = lineSpec.hline?.y
        if (yValue == null) return
        y = resolveHorizontalY(Number(yValue))
        if (y == null && domainMin != null && domainMax != null) {
          y = mapY(domainMin) ?? mapY(domainMax)
        }
      }

      if (y == null) {
        if (mode === DrawLineModes.HorizontalFromY) {
          console.warn('draw:line hline-y skipped: unable to resolve y-position', {
            requested: lineSpec.hline?.y,
            domainMin,
            domainMax,
            chartId: op.chartId ?? null,
          })
        }
        return
      }
      drawLineWithArrow(layer, op.chartId, lineSpec, { x1, y1: y, x2, y2: y }, annotationKey, annotationNodeId)
    }

    // ─── DiffBracket mode ────────────────────────────────────────────────────
    // Draws a vertical bracket line at the right edge of the chart, spanning
    // from bracketSpec.startY to bracketSpec.endY (normalized 0=bottom,1=top).
    if (mode === DrawLineModes.DiffBracket) {
      const bracketSpec = lineSpec.bracket
      if (!bracketSpec) return
      const viewport = this.resolvePanelViewport(svgNode, op.chartId)
      const clamp01 = (n: number) => Math.max(0, Math.min(1, n))

      let bracketX: number
      if (bracketSpec.normalizedX != null) {
        // Caller specified an exact normalized X — convert to SVG coords.
        bracketX = viewport.x + clamp01(bracketSpec.normalizedX) * viewport.width
      } else {
        // Auto-compute: use the rightmost edge of all visible data marks + padding.
        const visibleNodes = this.filterDataMarks(
          scope.selectAll<SVGElement, JsonValue>(SvgSelectors.DataTargets),
        )
          .nodes()
          .filter((node) => {
            const el = node as SVGGraphicsElement
            const display = (el.getAttribute('display') ?? '').trim().toLowerCase()
            if (display === 'none') return false
            if ((el as SVGGraphicsElement).style?.display?.toLowerCase() === 'none') return false
            const rect = el.getBoundingClientRect()
            return rect.width > 0 && rect.height > 0
          })
        if (!visibleNodes.length) return
        const svgRect = svgNode.getBoundingClientRect()
        const viewBoxLocal = svgNode.viewBox?.baseVal
        const scaleX = viewBoxLocal && svgRect.width > 0 ? viewBoxLocal.width / svgRect.width : 1
        const vbX = viewBoxLocal?.x ?? 0
        const marksRight = Math.max(
          ...visibleNodes.map((n) => vbX + (n.getBoundingClientRect().right - svgRect.left) * scaleX),
        )
        bracketX = marksRight + 8
      }

      const toSvgY = (ny: number) => viewport.y + (1 - clamp01(ny)) * viewport.height
      const y1 = toSvgY(bracketSpec.startY)
      const y2 = toSvgY(bracketSpec.endY)

      drawLineWithArrow(layer, op.chartId, lineSpec, { x1: bracketX, y1, x2: bracketX, y2 }, annotationKey, annotationNodeId)
    }
  }

  protected band(op: DrawOp) {
    const spec: DrawBandSpec | undefined = op.band
    if (!spec) return
    const annotationKey = resolveAnnotationKeyForDrawOp(op)
    const annotationNodeId = resolveAnnotationNodeId(op)
    const svg = d3.select(this.container).select(SvgElements.Svg)
    if (svg.empty()) return
    const svgNode = svg.node() as SVGSVGElement | null
    if (!svgNode) return
    const layer = d3.select(ensureAnnotationLayer(svgNode, op.chartId ?? null))
    const viewBox = svgNode.viewBox?.baseVal
    const width = viewBox && Number.isFinite(viewBox.width) ? viewBox.width : svgNode.getBoundingClientRect().width
    const height =
      viewBox && Number.isFinite(viewBox.height) ? viewBox.height : svgNode.getBoundingClientRect().height
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return

    const [start, end] = spec.range
    const style = spec.style ?? {}
    const fill = style.fill ?? 'rgba(59,130,246,0.16)'
    const stroke = style.stroke ?? '#3b82f6'
    const strokeWidth = style.strokeWidth ?? 1.5
    const opacity = style.opacity ?? 1

    if (spec.axis === 'x') {
      const scope = this.selectScope(op.chartId)
      const ticks = scope.selectAll<SVGGElement, JsonValue>(SvgSelectors.XAxisTicks)
      const svgRect = svgNode.getBoundingClientRect()
      const scaleX = viewBox && svgRect.width > 0 ? viewBox.width / svgRect.width : 1
      const positions: Array<{ label: string; x: number }> = []
      ticks.each(function () {
        const tick = this as SVGGElement
        const text = tick.querySelector('text')?.textContent?.trim()
        if (!text) return
        const bbox = tick.getBoundingClientRect()
        positions.push({
          label: text,
          x: (viewBox?.x ?? 0) + (bbox.left - svgRect.left + bbox.width / 2) * scaleX,
        })
      })
      const resolveX = (label: string | number) => positions.find((p) => p.label === String(label))?.x ?? null
      const xStart = resolveX(start)
      const xEnd = resolveX(end)
      if (xStart == null || xEnd == null) return
      const left = Math.min(xStart, xEnd)
      const right = Math.max(xStart, xEnd)
      const band = layer
        .append(SvgElements.Rect)
        .attr(SvgAttributes.Class, `${SvgClassNames.Annotation} ${SvgClassNames.RectAnnotation}`)
        .attr(DataAttributes.ChartId, op.chartId ?? null)
        .attr(DataAttributes.AnnotationKey, annotationKey ?? null)
        .attr(DataAttributes.AnnotationNodeId, annotationNodeId ?? null)
        .attr(SvgAttributes.X, left)
        .attr(SvgAttributes.Y, 0)
        .attr(SvgAttributes.Width, right - left)
        .attr(SvgAttributes.Height, height)
        .attr(SvgAttributes.Fill, fill)
        .attr(SvgAttributes.Opacity, 0)
        .attr(SvgAttributes.Stroke, stroke)
        .attr(SvgAttributes.StrokeWidth, strokeWidth)
      if (spec.label) {
        const labelNode = layer
          .append(SvgElements.Text)
          .attr(SvgAttributes.Class, `${SvgClassNames.Annotation} ${SvgClassNames.TextAnnotation}`)
          .attr(DataAttributes.ChartId, op.chartId ?? null)
          .attr(DataAttributes.AnnotationKey, annotationKey ?? null)
          .attr(DataAttributes.AnnotationNodeId, annotationNodeId ?? null)
          .attr(SvgAttributes.X, left + (right - left) / 2)
          .attr(SvgAttributes.Y, 12)
          .attr(SvgAttributes.TextAnchor, 'middle')
          .attr(SvgAttributes.Fill, stroke)
          .attr(SvgAttributes.FontSize, 12)
          .attr(SvgAttributes.FontWeight, 'bold')
          .attr(SvgAttributes.Opacity, 0)
          .text(spec.label)
        this.applyTransition(labelNode).attr(SvgAttributes.Opacity, 1)
      }
      this.applyTransition(band).attr(SvgAttributes.Opacity, opacity)
      return
    }

    // y-axis band
    const yMin = Number(start)
    const yMax = Number(end)
    if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) return
    const scope = this.selectScope(op.chartId)
    const mapY = this.yValueToSvgY(scope, svgNode)
    const yA = mapY(yMin)
    const yB = mapY(yMax)
    if (yA == null || yB == null) return
    const top = Math.min(yA, yB)
    const h = Math.abs(yA - yB)
    const band = layer
      .append(SvgElements.Rect)
      .attr(SvgAttributes.Class, `${SvgClassNames.Annotation} ${SvgClassNames.RectAnnotation}`)
      .attr(DataAttributes.ChartId, op.chartId ?? null)
      .attr(DataAttributes.AnnotationKey, annotationKey ?? null)
      .attr(DataAttributes.AnnotationNodeId, annotationNodeId ?? null)
      .attr(SvgAttributes.X, 0)
      .attr(SvgAttributes.Y, top)
      .attr(SvgAttributes.Width, width)
      .attr(SvgAttributes.Height, h)
      .attr(SvgAttributes.Fill, fill)
      .attr(SvgAttributes.Opacity, 0)
      .attr(SvgAttributes.Stroke, stroke)
      .attr(SvgAttributes.StrokeWidth, strokeWidth)
    if (spec.label) {
      const labelNode = layer
        .append(SvgElements.Text)
        .attr(SvgAttributes.Class, `${SvgClassNames.Annotation} ${SvgClassNames.TextAnnotation}`)
        .attr(DataAttributes.ChartId, op.chartId ?? null)
        .attr(DataAttributes.AnnotationKey, annotationKey ?? null)
        .attr(DataAttributes.AnnotationNodeId, annotationNodeId ?? null)
        .attr(SvgAttributes.X, width - 8)
        .attr(SvgAttributes.Y, top - 4)
        .attr(SvgAttributes.TextAnchor, 'end')
        .attr(SvgAttributes.Fill, stroke)
        .attr(SvgAttributes.FontSize, 12)
        .attr(SvgAttributes.FontWeight, 'bold')
        .attr(SvgAttributes.Opacity, 0)
        .text(spec.label)
      this.applyTransition(labelNode).attr(SvgAttributes.Opacity, 1)
    }
    this.applyTransition(band).attr(SvgAttributes.Opacity, opacity)
  }

  protected scalarPanel(op: DrawOp) {
    const spec: DrawScalarPanelSpec | undefined = op.scalarPanel
    if (!spec) return
    const annotationNodeId = resolveAnnotationNodeId(op)
    const absolute = spec.absolute ?? true
    const leftRaw = Number(spec.left?.value)
    const rightRaw = Number(spec.right?.value)
    if (!Number.isFinite(leftRaw) || !Number.isFinite(rightRaw)) return
    const leftValue = absolute ? Math.abs(leftRaw) : leftRaw
    const rightValue = absolute ? Math.abs(rightRaw) : rightRaw
    const layout = spec.layout ?? 'inset'
    const fullReplace = layout === 'full-replace'

    const svg = d3.select(this.container).select(SvgElements.Svg)
    if (svg.empty()) return
    const svgNode = svg.node() as SVGSVGElement | null
    if (!svgNode) return
    const layer = d3.select(ensureAnnotationLayer(svgNode, op.chartId ?? null))
    const chartId = op.chartId ?? null

    const viewBox = svgNode.viewBox?.baseVal
    const width = viewBox && Number.isFinite(viewBox.width) ? viewBox.width : svgNode.getBoundingClientRect().width
    const height = viewBox && Number.isFinite(viewBox.height) ? viewBox.height : svgNode.getBoundingClientRect().height
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return

    const position = spec.position ?? { x: 0.62, y: 0.72, width: 0.34, height: 0.22 }
    const panelX = fullReplace ? 0 : Math.max(0, Math.min(width - 24, position.x * width))
    const panelY = fullReplace ? 0 : Math.max(0, Math.min(height - 24, position.y * height))
    const panelWidth = fullReplace ? width : Math.max(120, Math.min(width - panelX, position.width * width))
    const panelHeight = fullReplace ? height : Math.max(80, Math.min(height - panelY, position.height * height))

    const style = spec.style ?? {}
    const panelFill = style.panelFill ?? (fullReplace ? '#ffffff' : 'rgba(255,255,255,0.96)')
    const panelStroke = style.panelStroke ?? '#cbd5e1'
    const leftFill = style.leftFill ?? '#ef4444'
    const rightFill = style.rightFill ?? '#0ea5e9'
    const lineStroke = style.lineStroke ?? '#ef4444'
    const arrowStroke = style.arrowStroke ?? '#0ea5e9'
    const textColor = style.textColor ?? '#111827'

    const panelKey = `${layout}|${spec.left.label}|${spec.right.label}`
    const panelClass = 'scalar-panel'
    const allPanels = layer.selectAll<SVGGElement, unknown>(`g.${panelClass}`)
    const targetPanels = allPanels.filter(function () {
      const el = this as Element
      const sameChart = (el.getAttribute(DataAttributes.ChartId) ?? null) === chartId
      return sameChart && (el.getAttribute('data-panel-key') ?? '') === panelKey
    })
    if (fullReplace) {
      allPanels
        .filter(function () {
          const el = this as Element
          const sameChart = (el.getAttribute(DataAttributes.ChartId) ?? null) === chartId
          const sameKey = (el.getAttribute('data-panel-key') ?? '') === panelKey
          return sameChart && !sameKey
        })
        .remove()
    }
    const panel = (
      targetPanels.empty()
        ? layer
            .append(SvgElements.Group)
            .attr(SvgAttributes.Class, `${SvgClassNames.Annotation} ${panelClass}`)
            .attr(DataAttributes.ChartId, chartId)
            .attr(DataAttributes.AnnotationNodeId, annotationNodeId ?? null)
            .attr('data-panel-key', panelKey)
            .attr('opacity', 0)
        : targetPanels
    ) as d3.Selection<SVGGElement, unknown, d3.BaseType, unknown>

    panel
      .attr(SvgAttributes.Transform, `translate(${panelX},${panelY})`)
      .attr(DataAttributes.AnnotationNodeId, annotationNodeId ?? null)

    if (targetPanels.empty()) {
      this.applyTransition(panel).attr('opacity', 1)
    }

    panel.selectAll('*').remove()

    panel.selectAll('.scalar-panel-delta').remove()
    panel.selectAll('.scalar-panel-arrow').remove()

    const marginFromAttr = (name: string, fallback: number) => {
      const raw = Number(svg.attr(name))
      return Number.isFinite(raw) ? raw : fallback
    }
    const fullMarginLeft = marginFromAttr(DataAttributes.MarginLeft, Math.max(48, panelWidth * 0.12))
    const fullMarginTop = marginFromAttr(DataAttributes.MarginTop, Math.max(24, panelHeight * 0.12))
    const fullPlotWidth = marginFromAttr(DataAttributes.PlotWidth, Math.max(140, panelWidth - fullMarginLeft - 24))
    const fullPlotHeight = marginFromAttr(DataAttributes.PlotHeight, Math.max(100, panelHeight - fullMarginTop - 42))

    const padX = fullReplace ? fullMarginLeft : 10
    const padTop = fullReplace ? fullMarginTop : 10
    const padBottom = fullReplace ? (panelHeight - (fullMarginTop + fullPlotHeight)) : 18
    const bottomY = fullReplace ? (fullMarginTop + fullPlotHeight) : (panelHeight - padBottom)
    const topY = padTop
    const barWidth = fullReplace ? Math.max(36, fullPlotWidth * 0.2) : Math.max(14, panelWidth * 0.16)
    const leftCenterX = fullReplace ? (fullMarginLeft + fullPlotWidth * 0.3) : (panelWidth * 0.32)
    const rightCenterX = fullReplace ? (fullMarginLeft + fullPlotWidth * 0.7) : (panelWidth * 0.68)

    const axisX1 = fullReplace ? fullMarginLeft : padX
    const axisX2 = fullReplace ? fullMarginLeft + fullPlotWidth : (panelWidth - padX)
    const axisY = bottomY
    const valueMax = Math.max(leftValue, rightValue, 0)
    const yMax = valueMax > 0 ? valueMax * 1.1 : 1

    const barYScale = d3
      .scaleLinear()
      .domain([0, yMax])
      .range([bottomY, topY])

    const leftTopY = barYScale(leftValue)
    const rightTopY = barYScale(rightValue)
    const zeroY = axisY

    const bg = panel.append(SvgElements.Rect).attr('class', 'scalar-panel-bg')
    bg
      .attr(SvgAttributes.X, 0)
      .attr(SvgAttributes.Y, 0)
      .attr(SvgAttributes.Width, panelWidth)
      .attr(SvgAttributes.Height, panelHeight)
      .attr(SvgAttributes.RX, 8)
      .attr(SvgAttributes.Fill, panelFill)
      .attr(SvgAttributes.Stroke, panelStroke)
      .attr(SvgAttributes.StrokeWidth, 1)
      .attr(SvgAttributes.Opacity, 1)

    const baseline = panel.append(SvgElements.Line).attr('class', 'scalar-panel-baseline')
    baseline
      .attr(SvgAttributes.X1, axisX1)
      .attr(SvgAttributes.Y1, zeroY)
      .attr(SvgAttributes.X2, axisX2)
      .attr(SvgAttributes.Y2, zeroY)
      .attr(SvgAttributes.Stroke, '#94a3b8')
      .attr(SvgAttributes.StrokeWidth, 1.25)
      .attr(SvgAttributes.Opacity, 0.8)

    if (fullReplace) {
      const yAxis = panel.append(SvgElements.Group).attr('class', 'scalar-panel-y-axis')
      const tickCount = 4
      for (let i = 0; i <= tickCount; i += 1) {
        const tickValue = (yMax / tickCount) * i
        const y = barYScale(tickValue)
        yAxis
          .append(SvgElements.Line)
          .attr(SvgAttributes.X1, fullMarginLeft - 6)
          .attr(SvgAttributes.Y1, y)
          .attr(SvgAttributes.X2, fullMarginLeft)
          .attr(SvgAttributes.Y2, y)
          .attr(SvgAttributes.Stroke, '#1f2937')
          .attr(SvgAttributes.StrokeWidth, 1)
        yAxis
          .append(SvgElements.Text)
          .attr(SvgAttributes.X, fullMarginLeft - 10)
          .attr(SvgAttributes.Y, y)
          .attr(SvgAttributes.TextAnchor, 'end')
          .attr(SvgAttributes.DominantBaseline, 'middle')
          .attr(SvgAttributes.Fill, '#111827')
          .attr(SvgAttributes.FontSize, 11)
          .text(formatScalarPanelNumber(tickValue))
      }
      yAxis
        .append(SvgElements.Line)
        .attr(SvgAttributes.X1, fullMarginLeft)
        .attr(SvgAttributes.Y1, topY)
        .attr(SvgAttributes.X2, fullMarginLeft)
        .attr(SvgAttributes.Y2, axisY)
        .attr(SvgAttributes.Stroke, '#111827')
        .attr(SvgAttributes.StrokeWidth, 1.2)
    }

    const leftBar = panel.append(SvgElements.Rect).attr('class', 'scalar-panel-bar-left')
    leftBar
      .attr(SvgAttributes.Fill, leftFill)
      .attr(SvgAttributes.X, leftCenterX - barWidth / 2)
      .attr(SvgAttributes.Width, barWidth)
      .attr(SvgAttributes.Y, Math.min(leftTopY, zeroY))
      .attr(SvgAttributes.Height, Math.abs(zeroY - leftTopY))

    const rightBar = panel.append(SvgElements.Rect).attr('class', 'scalar-panel-bar-right')
    rightBar
      .attr(SvgAttributes.Fill, rightFill)
      .attr(SvgAttributes.X, rightCenterX - barWidth / 2)
      .attr(SvgAttributes.Width, barWidth)
      .attr(SvgAttributes.Y, Math.min(rightTopY, zeroY))
      .attr(SvgAttributes.Height, Math.abs(zeroY - rightTopY))

    const labelFontSize = fullReplace ? 11 : 11
    const labelYBase = fullReplace ? (axisY + 18) : (panelHeight - 4)
    const labelGap = Math.max(40, rightCenterX - leftCenterX)
    const labelMaxWidth = fullReplace ? Math.max(96, labelGap - 24) : Math.max(64, barWidth * 2.2)
    const maxCharsPerLine = Math.max(8, Math.floor(labelMaxWidth / 6.4))

    const leftLabelLines = toWrappedLines(spec.left.label, maxCharsPerLine, fullReplace ? 2 : 1)
    const leftLabel = panel.append(SvgElements.Text).attr('class', 'scalar-panel-label-left')
    leftLabel
      .attr(SvgAttributes.X, leftCenterX)
      .attr(SvgAttributes.Y, labelYBase)
      .attr(SvgAttributes.TextAnchor, 'middle')
      .attr(SvgAttributes.Fill, textColor)
      .attr(SvgAttributes.FontSize, labelFontSize)
      .attr(SvgAttributes.FontWeight, 600)
    leftLabelLines.forEach((line, idx) => {
      leftLabel
        .append(SvgElements.TSpan)
        .attr(SvgAttributes.X, leftCenterX)
        .attr('dy', idx === 0 ? 0 : 12)
        .text(line)
    })

    const rightLabelLines = toWrappedLines(spec.right.label, maxCharsPerLine, fullReplace ? 2 : 1)
    const rightLabel = panel.append(SvgElements.Text).attr('class', 'scalar-panel-label-right')
    rightLabel
      .attr(SvgAttributes.X, rightCenterX)
      .attr(SvgAttributes.Y, labelYBase)
      .attr(SvgAttributes.TextAnchor, 'middle')
      .attr(SvgAttributes.Fill, textColor)
      .attr(SvgAttributes.FontSize, labelFontSize)
      .attr(SvgAttributes.FontWeight, 600)
    rightLabelLines.forEach((line, idx) => {
      rightLabel
        .append(SvgElements.TSpan)
        .attr(SvgAttributes.X, rightCenterX)
        .attr('dy', idx === 0 ? 0 : 12)
        .text(line)
    })

    const leftValueText = panel.append(SvgElements.Text).attr('class', 'scalar-panel-value-left')
    leftValueText
      .attr(SvgAttributes.X, leftCenterX)
      .attr(SvgAttributes.Y, Math.min(leftTopY, zeroY) - (fullReplace ? 8 : 4))
      .attr(SvgAttributes.TextAnchor, 'middle')
      .attr(SvgAttributes.Fill, textColor)
      .attr(SvgAttributes.FontSize, fullReplace ? 16 : 11)
      .attr(SvgAttributes.FontWeight, 'bold')
      .text(formatScalarPanelNumber(leftValue))

    const rightValueText = panel.append(SvgElements.Text).attr('class', 'scalar-panel-value-right')
    rightValueText
      .attr(SvgAttributes.X, rightCenterX)
      .attr(SvgAttributes.Y, Math.min(rightTopY, zeroY) - (fullReplace ? 8 : 4))
      .attr(SvgAttributes.TextAnchor, 'middle')
      .attr(SvgAttributes.Fill, textColor)
      .attr(SvgAttributes.FontSize, fullReplace ? 16 : 11)
      .attr(SvgAttributes.FontWeight, 'bold')
      .text(formatScalarPanelNumber(rightValue))

    const compareLine = panel.append(SvgElements.Line).attr('class', 'scalar-panel-compare-line')
    const compareLineStroke = spec.mode === 'diff' ? arrowStroke : lineStroke
    compareLine
      .attr(SvgAttributes.X1, leftCenterX)
      .attr(SvgAttributes.Y1, leftTopY)
      .attr(SvgAttributes.X2, rightCenterX)
      .attr(SvgAttributes.Y2, rightTopY)
      .attr(SvgAttributes.Stroke, compareLineStroke)
      .attr(SvgAttributes.StrokeWidth, 2)
      .attr(SvgAttributes.Opacity, 0.95)
    this.applyTransition(compareLine)
      .attr(SvgAttributes.X1, leftCenterX)
      .attr(SvgAttributes.Y1, leftTopY)
      .attr(SvgAttributes.X2, rightCenterX)
      .attr(SvgAttributes.Y2, rightTopY)

    if (spec.mode !== 'diff') return

    const arrowOpSpec: DrawLineSpec = {
      style: { stroke: arrowStroke, strokeWidth: 2, opacity: 0 },
      arrow: {
        end: true,
        style: { stroke: arrowStroke, fill: arrowStroke, strokeWidth: 2, opacity: 0.95 },
      },
    }
    const arrowGroup = panel.append(SvgElements.Group).attr('class', 'scalar-panel-arrow')
    drawLineWithArrow(arrowGroup as unknown as AnySelection, op.chartId, arrowOpSpec, {
      x1: leftCenterX,
      y1: leftTopY,
      x2: rightCenterX,
      y2: rightTopY,
    })
    this.applyTransition(arrowGroup).attr(SvgAttributes.Opacity, 1)

    const deltaRaw = spec.delta?.value ?? (leftValue - rightValue)
    const deltaValue = absolute ? Math.abs(deltaRaw) : deltaRaw
    const deltaLabel = spec.delta?.label ?? 'Δ'
    const deltaText = panel
      .append(SvgElements.Text)
      .attr(SvgAttributes.Class, 'scalar-panel-delta')
      .attr(SvgAttributes.X, (leftCenterX + rightCenterX) / 2)
      .attr(SvgAttributes.Y, Math.min(leftTopY, rightTopY) - (fullReplace ? 16 : 12))
      .attr(SvgAttributes.TextAnchor, 'middle')
      .attr(SvgAttributes.Fill, textColor)
      .attr(SvgAttributes.FontSize, fullReplace ? 16 : 12)
      .attr(SvgAttributes.FontWeight, 'bold')
      .attr(SvgAttributes.Opacity, 0)
      .text(`${deltaLabel}: ${formatScalarPanelNumber(deltaValue)}`)
    this.applyTransition(deltaText).attr(SvgAttributes.Opacity, 1)
  }

  run(op: DrawOp): void | Promise<void> {
    switch (op.action) {
      case DrawAction.Clear:
        this.clear(op.chartId)
        break
      case DrawAction.Highlight:
        this.highlight(op)
        break
      case DrawAction.Dim:
        this.dim(op)
        break
      case DrawAction.Text:
        this.text(op)
        break
      case DrawAction.Rect:
        this.rect(op)
        break
      case DrawAction.Line:
        this.line(op)
        break
      case DrawAction.Band:
        this.band(op)
        break
      case DrawAction.ScalarPanel:
        this.scalarPanel(op)
        break
      case DrawAction.Filter:
        console.warn('Filter action not implemented for this chart type')
        break
      case DrawAction.Sort:
        // Default no-op; chart-specific handlers may override
        console.warn('Sort action not implemented for this chart type')
        break
      default:
        console.warn('Unsupported draw action', op.action, op)
    }
  }

  protected clearAnnotations(chartId?: string) {
    // Reset collision-avoidance state for the cleared scope.
    if (!chartId) {
      this._placedAnnotationBoxes.clear()
    } else {
      this._placedAnnotationBoxes.delete(chartId)
    }
    const svg = d3.select(this.container).select(SvgElements.Svg)
    if (!chartId) {
      svg.selectAll(SvgSelectors.Annotation).remove()
      return
    }
    const scope = this.selectScope(chartId)
    scope.selectAll(SvgSelectors.Annotation).remove()
    svg
      .selectAll<SVGElement, JsonValue>(`${SvgSelectors.Annotation}[${DataAttributes.ChartId}="${String(chartId)}"]`)
      .remove()
  }
}

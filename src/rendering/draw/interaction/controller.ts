import type { DrawLineSpec, DrawRectSpec } from '../types'
import { SvgAttributes, SvgElements } from '../../interfaces'
import { clientPointToNormalized, normalizedPointToSvg, normalizedRectFromPoints } from './coords'
import { findMarkFromEventTarget } from './hitTest'
import { buildBarSegmentCommit, resolveBarSegmentPreview, resolveBarSegmentScope, type BarSegmentScope } from './barSegment'
import {
  DrawInteractionTools,
  type BarSegmentCommit,
  type DrawInteractionControllerState,
  type DrawInteractionHit,
  type NormalizedPoint,
  type PointerClientPoint,
} from './types'

const PREVIEW_LAYER_CLASS = 'interaction-preview-layer'
const PREVIEW_MARK_CLASS = 'interaction-preview-mark'
const MIN_DRAG_DELTA = 0.003

type DragState = {
  tool:
    | typeof DrawInteractionTools.Rect
    | typeof DrawInteractionTools.Line
    | typeof DrawInteractionTools.BarSegment
  pointerId: number
  start: NormalizedPoint
  segmentScope?: BarSegmentScope
}

export type DrawInteractionControllerOptions = {
  container: HTMLElement
  getState: () => DrawInteractionControllerState
  onHighlightPick: (hit: DrawInteractionHit) => void
  onDimPick: (hit: DrawInteractionHit) => void
  onLineTracePick: (hit: DrawInteractionHit) => void
  onFilterPick: (hit: DrawInteractionHit) => void
  onSplitPick: (hit: DrawInteractionHit) => void
  onSeriesFilterPick: (hit: DrawInteractionHit) => void
  onTextPlace: (position: NormalizedPoint, client: PointerClientPoint) => void
  onRectCommit: (spec: DrawRectSpec) => void
  onLineCommit: (spec: DrawLineSpec) => void
  onBarSegmentCommit: (segment: BarSegmentCommit) => void
  onEscape?: () => void
}

export type DrawInteractionController = {
  clearPreview: () => void
  dispose: () => void
}

function ensurePreviewLayer(svg: SVGSVGElement) {
  let layer = svg.querySelector<SVGGElement>(`.${PREVIEW_LAYER_CLASS}`)
  if (layer) return layer
  layer = document.createElementNS('http://www.w3.org/2000/svg', SvgElements.Group)
  layer.setAttribute('class', PREVIEW_LAYER_CLASS)
  layer.setAttribute('pointer-events', 'none')
  svg.appendChild(layer)
  return layer
}

function clearPreviewLayer(container: HTMLElement) {
  const svg = container.querySelector(SvgElements.Svg)
  if (!(svg instanceof SVGSVGElement)) return
  const layer = svg.querySelector<SVGGElement>(`.${PREVIEW_LAYER_CLASS}`)
  if (!layer) return
  layer.replaceChildren()
}

function renderRectPreview(
  container: HTMLElement,
  start: NormalizedPoint,
  end: NormalizedPoint,
  state: DrawInteractionControllerState,
) {
  const svg = container.querySelector(SvgElements.Svg)
  if (!(svg instanceof SVGSVGElement)) return
  const layer = ensurePreviewLayer(svg)
  const startPoint = normalizedPointToSvg(svg, start)
  const endPoint = normalizedPointToSvg(svg, end)
  if (!startPoint || !endPoint) return

  const minX = Math.min(startPoint.x, endPoint.x)
  const maxX = Math.max(startPoint.x, endPoint.x)
  const minY = Math.min(startPoint.y, endPoint.y)
  const maxY = Math.max(startPoint.y, endPoint.y)

  layer.replaceChildren()
  const rect = document.createElementNS('http://www.w3.org/2000/svg', SvgElements.Rect)
  rect.setAttribute('class', PREVIEW_MARK_CLASS)
  rect.setAttribute(SvgAttributes.X, String(minX))
  rect.setAttribute(SvgAttributes.Y, String(minY))
  rect.setAttribute(SvgAttributes.Width, String(maxX - minX))
  rect.setAttribute(SvgAttributes.Height, String(maxY - minY))
  rect.setAttribute(SvgAttributes.Fill, state.rectStyle.fill)
  rect.setAttribute(SvgAttributes.Stroke, state.rectStyle.stroke)
  rect.setAttribute(SvgAttributes.StrokeWidth, String(state.rectStyle.strokeWidth))
  rect.setAttribute(SvgAttributes.Opacity, String(Math.min(1, Math.max(0.1, state.rectStyle.opacity))))
  rect.setAttribute(SvgAttributes.StrokeDasharray, '5 3')
  layer.appendChild(rect)
}

function renderLinePreview(
  container: HTMLElement,
  start: NormalizedPoint,
  end: NormalizedPoint,
  state: DrawInteractionControllerState,
) {
  const svg = container.querySelector(SvgElements.Svg)
  if (!(svg instanceof SVGSVGElement)) return
  const layer = ensurePreviewLayer(svg)
  const startPoint = normalizedPointToSvg(svg, start)
  const endPoint = normalizedPointToSvg(svg, end)
  if (!startPoint || !endPoint) return

  layer.replaceChildren()
  const line = document.createElementNS('http://www.w3.org/2000/svg', SvgElements.Line)
  line.setAttribute('class', PREVIEW_MARK_CLASS)
  line.setAttribute(SvgAttributes.X1, String(startPoint.x))
  line.setAttribute(SvgAttributes.Y1, String(startPoint.y))
  line.setAttribute(SvgAttributes.X2, String(endPoint.x))
  line.setAttribute(SvgAttributes.Y2, String(endPoint.y))
  line.setAttribute(SvgAttributes.Stroke, state.lineStyle.stroke)
  line.setAttribute(SvgAttributes.StrokeWidth, String(state.lineStyle.strokeWidth))
  line.setAttribute(SvgAttributes.Opacity, String(state.lineStyle.opacity))
  line.setAttribute(SvgAttributes.StrokeDasharray, '5 3')
  layer.appendChild(line)
}

function renderBarSegmentPreview(
  container: HTMLElement,
  scope: BarSegmentScope,
  end: NormalizedPoint,
  state: DrawInteractionControllerState,
) {
  const svg = container.querySelector(SvgElements.Svg)
  if (!(svg instanceof SVGSVGElement)) return
  const layer = ensurePreviewLayer(svg)
  const preview = resolveBarSegmentPreview(scope, end)
  if (!preview) return

  layer.replaceChildren()
  const line = document.createElementNS('http://www.w3.org/2000/svg', SvgElements.Line)
  line.setAttribute('class', PREVIEW_MARK_CLASS)
  line.setAttribute(SvgAttributes.X1, String(preview.x1))
  line.setAttribute(SvgAttributes.Y1, String(preview.y))
  line.setAttribute(SvgAttributes.X2, String(preview.x2))
  line.setAttribute(SvgAttributes.Y2, String(preview.y))
  line.setAttribute(SvgAttributes.Stroke, state.segmentStyle.stroke)
  line.setAttribute(SvgAttributes.StrokeWidth, String(state.segmentStyle.strokeWidth))
  line.setAttribute(SvgAttributes.Opacity, String(state.segmentStyle.opacity))
  line.setAttribute(SvgAttributes.StrokeDasharray, '6 4')
  layer.appendChild(line)
}

export function createDrawInteractionController(options: DrawInteractionControllerOptions): DrawInteractionController {
  const {
    container,
    getState,
    onHighlightPick,
    onDimPick,
    onLineTracePick,
    onFilterPick,
    onSplitPick,
    onSeriesFilterPick,
    onTextPlace,
    onRectCommit,
    onLineCommit,
    onBarSegmentCommit,
    onEscape,
  } = options

  let dragState: DragState | null = null

  const handleClick = (event: MouseEvent) => {
    const state = getState()
    if (!state.enabled) return
    if (dragState) return
    if (
      state.tool !== DrawInteractionTools.Highlight &&
      state.tool !== DrawInteractionTools.Dim &&
      state.tool !== DrawInteractionTools.LineTrace &&
      state.tool !== DrawInteractionTools.Filter &&
      state.tool !== DrawInteractionTools.Split &&
      state.tool !== DrawInteractionTools.SeriesFilter
    ) {
      return
    }

    const hit = findMarkFromEventTarget(event.target, container)
    if (!hit) return

    if (state.tool === DrawInteractionTools.Highlight) {
      onHighlightPick(hit)
      return
    }
    if (state.tool === DrawInteractionTools.Dim) {
      onDimPick(hit)
      return
    }
    if (state.tool === DrawInteractionTools.LineTrace) {
      onLineTracePick(hit)
      return
    }
    if (state.tool === DrawInteractionTools.Filter) {
      onFilterPick(hit)
      return
    }
    if (state.tool === DrawInteractionTools.Split) {
      onSplitPick(hit)
      return
    }
    onSeriesFilterPick(hit)
  }

  const handlePointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return
    const state = getState()
    if (!state.enabled) return

    const svg = container.querySelector(SvgElements.Svg)
    if (!(svg instanceof SVGSVGElement)) return

    if (state.tool === DrawInteractionTools.Text) {
      const point = clientPointToNormalized(svg, event.clientX, event.clientY)
      if (!point) return
      onTextPlace(point, { x: event.clientX, y: event.clientY })
      event.preventDefault()
      return
    }

    if (
      state.tool !== DrawInteractionTools.Rect &&
      state.tool !== DrawInteractionTools.Line &&
      state.tool !== DrawInteractionTools.BarSegment
    ) {
      return
    }
    const point = clientPointToNormalized(svg, event.clientX, event.clientY)
    if (!point) return

    const resolvedSegmentScope =
      state.tool === DrawInteractionTools.BarSegment
        ? resolveBarSegmentScope(container, event.target, point)
        : null
    const segmentScope = resolvedSegmentScope ?? undefined
    if (state.tool === DrawInteractionTools.BarSegment && !segmentScope) return

    dragState = {
      tool: state.tool,
      pointerId: event.pointerId,
      start: point,
      segmentScope,
    }

    if (state.tool === DrawInteractionTools.Rect) {
      renderRectPreview(container, point, point, state)
    } else if (state.tool === DrawInteractionTools.BarSegment && segmentScope) {
      renderBarSegmentPreview(container, segmentScope, point, state)
    } else {
      renderLinePreview(container, point, point, state)
    }
    event.preventDefault()
  }

  const handlePointerMove = (event: PointerEvent) => {
    if (!dragState) return
    if (event.pointerId !== dragState.pointerId) return
    const state = getState()
    const svg = container.querySelector(SvgElements.Svg)
    if (!(svg instanceof SVGSVGElement)) return
    const point = clientPointToNormalized(svg, event.clientX, event.clientY)
    if (!point) return

    if (dragState.tool === DrawInteractionTools.Rect) {
      renderRectPreview(container, dragState.start, point, state)
    } else if (dragState.tool === DrawInteractionTools.BarSegment && dragState.segmentScope) {
      renderBarSegmentPreview(container, dragState.segmentScope, point, state)
    } else {
      renderLinePreview(container, dragState.start, point, state)
    }
    event.preventDefault()
  }

  const handlePointerUp = (event: PointerEvent) => {
    if (!dragState) return
    if (event.pointerId !== dragState.pointerId) return
    const activeDrag = dragState
    const state = getState()
    const svg = container.querySelector(SvgElements.Svg)
    const point = svg instanceof SVGSVGElement ? clientPointToNormalized(svg, event.clientX, event.clientY) : null
    const start = activeDrag.start
    const currentTool = activeDrag.tool
    dragState = null
    clearPreviewLayer(container)
    if (!point) return

    const dx = Math.abs(point.x - start.x)
    const dy = Math.abs(point.y - start.y)
    if (dx < MIN_DRAG_DELTA && dy < MIN_DRAG_DELTA) return

    if (currentTool === DrawInteractionTools.BarSegment && activeDrag.segmentScope) {
      const commit = buildBarSegmentCommit(activeDrag.segmentScope, start, point)
      if (!commit) return
      onBarSegmentCommit(commit)
      return
    }

    if (currentTool === DrawInteractionTools.Rect) {
      const geometry = normalizedRectFromPoints(start, point)
      onRectCommit({
        mode: 'normalized',
        position: geometry.position,
        size: geometry.size,
        style: {
          fill: state.rectStyle.fill,
          stroke: state.rectStyle.stroke,
          strokeWidth: state.rectStyle.strokeWidth,
          opacity: state.rectStyle.opacity,
        },
      })
      return
    }

    onLineCommit({
      position: { start, end: point },
      style: {
        stroke: state.lineStyle.stroke,
        strokeWidth: state.lineStyle.strokeWidth,
        opacity: state.lineStyle.opacity,
      },
      arrow: {
        start: state.lineArrow.start,
        end: state.lineArrow.end,
      },
    })
  }

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return
    if (dragState) {
      dragState = null
      clearPreviewLayer(container)
    }
    onEscape?.()
  }

  container.addEventListener('click', handleClick)
  container.addEventListener('pointerdown', handlePointerDown)
  window.addEventListener('pointermove', handlePointerMove)
  window.addEventListener('pointerup', handlePointerUp)
  window.addEventListener('keydown', handleKeyDown)

  return {
    clearPreview() {
      clearPreviewLayer(container)
    },
    dispose() {
      dragState = null
      clearPreviewLayer(container)
      container.removeEventListener('click', handleClick)
      container.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('keydown', handleKeyDown)
    },
  }
}

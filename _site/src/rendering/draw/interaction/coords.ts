import type { NormalizedPoint } from './types'

export function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

export function clientPointToNormalized(svg: SVGSVGElement, clientX: number, clientY: number): NormalizedPoint | null {
  const rect = svg.getBoundingClientRect()
  if (!Number.isFinite(rect.width) || !Number.isFinite(rect.height) || rect.width <= 0 || rect.height <= 0) {
    return null
  }
  const x = clamp01((clientX - rect.left) / rect.width)
  const y = clamp01(1 - (clientY - rect.top) / rect.height)
  return { x, y }
}

export function normalizedPointToSvg(svg: SVGSVGElement, point: NormalizedPoint) {
  const viewBox = svg.viewBox?.baseVal
  const width = viewBox && viewBox.width > 0 ? viewBox.width : svg.getBoundingClientRect().width
  const height = viewBox && viewBox.height > 0 ? viewBox.height : svg.getBoundingClientRect().height
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null
  }
  return {
    x: clamp01(point.x) * width,
    y: (1 - clamp01(point.y)) * height,
  }
}

export function normalizedRectFromPoints(start: NormalizedPoint, end: NormalizedPoint) {
  const minX = Math.min(clamp01(start.x), clamp01(end.x))
  const maxX = Math.max(clamp01(start.x), clamp01(end.x))
  const minY = Math.min(clamp01(start.y), clamp01(end.y))
  const maxY = Math.max(clamp01(start.y), clamp01(end.y))
  return {
    position: {
      x: (minX + maxX) * 0.5,
      y: (minY + maxY) * 0.5,
    },
    size: {
      width: maxX - minX,
      height: maxY - minY,
    },
  }
}

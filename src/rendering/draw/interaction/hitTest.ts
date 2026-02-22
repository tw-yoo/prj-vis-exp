import { DataAttributes, SvgClassNames, SvgElements } from '../../interfaces'
import type { DrawMark } from '../types'
import type { DrawInteractionHit } from './types'

const MARK_SELECTOR = `${SvgElements.Rect},${SvgElements.Circle},${SvgElements.Path}`

function resolveMarkKey(element: Element): string | null {
  const candidates = [
    element.getAttribute(DataAttributes.Id),
    element.getAttribute(DataAttributes.Target),
    element.getAttribute(DataAttributes.Series),
    element.id,
  ]
  for (const candidate of candidates) {
    if (candidate && candidate.trim().length > 0) {
      return candidate.trim()
    }
  }
  return null
}

function resolveTargetKey(element: Element, fallback: string): string {
  const target = element.getAttribute(DataAttributes.Target)
  if (target && target.trim().length > 0) {
    return target.trim()
  }
  return fallback
}

function resolveSeriesKey(element: Element): string | undefined {
  const series = element.getAttribute(DataAttributes.Series)
  if (!series) return undefined
  const trimmed = series.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function isAnnotationElement(element: Element) {
  if (element.classList.contains(SvgClassNames.Annotation)) return true
  return element.closest(`.${SvgClassNames.Annotation}`) != null
}

export function findMarkFromEventTarget(target: EventTarget | null, container: HTMLElement): DrawInteractionHit | null {
  if (!(target instanceof Element)) return null
  const svg = container.querySelector(SvgElements.Svg)
  if (!(svg instanceof SVGSVGElement)) return null

  const markElement = target.closest(MARK_SELECTOR)
  if (!(markElement instanceof SVGElement)) return null
  if (!svg.contains(markElement)) return null
  if (isAnnotationElement(markElement)) return null

  const tagName = markElement.tagName.toLowerCase()
  if (tagName !== SvgElements.Rect && tagName !== SvgElements.Circle && tagName !== SvgElements.Path) {
    return null
  }

  const key = resolveMarkKey(markElement)
  if (!key) return null
  const chartScope = markElement.closest(`[${DataAttributes.ChartId}]`)
  const chartId = chartScope?.getAttribute(DataAttributes.ChartId) ?? undefined

  return {
    element: markElement,
    key,
    targetKey: resolveTargetKey(markElement, key),
    seriesKey: resolveSeriesKey(markElement),
    mark: tagName as DrawMark,
    chartId,
  }
}

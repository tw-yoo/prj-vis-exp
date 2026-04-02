import { DataAttributes, SvgClassNames } from '../../interfaces'
import { DEFAULT_ANNOTATION_SELECTORS } from '../../common/d3Helpers'
import { DrawAnnotationLifecycles, type DrawAnnotationLifecycle, type DrawOp } from '../types'

function matchesChartScope(node: Element, chartId?: string | null) {
  if (!chartId) return true
  const direct = (node.getAttribute(DataAttributes.ChartId) ?? '').trim()
  if (direct.length > 0) return direct === chartId
  const parent = node.closest(`[${DataAttributes.ChartId}]`)
  if (!parent) return false
  return (parent.getAttribute(DataAttributes.ChartId) ?? '').trim() === chartId
}

function isTransientAnnotation(node: Element) {
  const lifecycle = (node.getAttribute(DataAttributes.AnnotationLifecycle) ?? '').trim().toLowerCase()
  return lifecycle !== DrawAnnotationLifecycles.Persistent
}

export function resolveAnnotationLifecycle(op: DrawOp): DrawAnnotationLifecycle {
  return op.annotation?.lifecycle ?? DrawAnnotationLifecycles.Transient
}

export function resolveAnnotationSlot(op: DrawOp): string | null {
  const slot = typeof op.annotation?.slot === 'string' ? op.annotation.slot.trim() : ''
  return slot.length > 0 ? slot : null
}

export function removeTransientAnnotationsBySlot(
  root: ParentNode,
  slot: string | null | undefined,
  chartId?: string | null,
) {
  const normalized = typeof slot === 'string' ? slot.trim() : ''
  if (!normalized) return
  const selectors = DEFAULT_ANNOTATION_SELECTORS.join(', ')
  if (!selectors) return
  const nodes = Array.from(root.querySelectorAll<SVGElement>(selectors)).filter((node) => {
    if ((node.getAttribute(DataAttributes.AnnotationSlot) ?? '').trim() !== normalized) return false
    if (!matchesChartScope(node, chartId)) return false
    return isTransientAnnotation(node)
  })
  nodes.forEach((node) => node.remove())

  const layerScope = root instanceof Element ? root : root.firstChild instanceof Element ? root.firstChild.parentElement : null
  const layers = root instanceof Element
    ? Array.from(root.querySelectorAll<SVGGElement>(`.${SvgClassNames.AnnotationLayer}`))
    : Array.from((layerScope ?? document).querySelectorAll<SVGGElement>(`.${SvgClassNames.AnnotationLayer}`))
  layers.forEach((layer) => {
    if (layer.childElementCount === 0) {
      layer.remove()
    }
  })
}

export function applyAnnotationMetadata(
  node: Element,
  metadata: {
    chartId?: string | null
    annotationKey?: string | null
    annotationNodeId?: string | null
    annotationLifecycle?: DrawAnnotationLifecycle
    annotationSlot?: string | null
  },
) {
  const { chartId, annotationKey, annotationNodeId, annotationLifecycle, annotationSlot } = metadata
  if (chartId != null) node.setAttribute(DataAttributes.ChartId, chartId)
  else node.removeAttribute(DataAttributes.ChartId)
  if (annotationKey != null) node.setAttribute(DataAttributes.AnnotationKey, annotationKey)
  else node.removeAttribute(DataAttributes.AnnotationKey)
  if (annotationNodeId != null) node.setAttribute(DataAttributes.AnnotationNodeId, annotationNodeId)
  else node.removeAttribute(DataAttributes.AnnotationNodeId)
  node.setAttribute(DataAttributes.AnnotationLifecycle, annotationLifecycle ?? DrawAnnotationLifecycles.Transient)
  if (annotationSlot != null) node.setAttribute(DataAttributes.AnnotationSlot, annotationSlot)
  else node.removeAttribute(DataAttributes.AnnotationSlot)
}

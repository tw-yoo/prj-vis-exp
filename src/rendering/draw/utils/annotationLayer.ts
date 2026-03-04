import { DataAttributes, SvgClassNames, SvgElements } from '../../interfaces'

const SVG_NS = 'http://www.w3.org/2000/svg'

export function ensureAnnotationLayer(parent: Element, chartId?: string | null): SVGGElement {
  const selector = chartId
    ? `${SvgElements.Group}.${SvgClassNames.AnnotationLayer}[${DataAttributes.ChartId}="${String(chartId)}"]`
    : `${SvgElements.Group}.${SvgClassNames.AnnotationLayer}:not([${DataAttributes.ChartId}])`

  // Important: only reuse direct-child layer of the given parent.
  // Using querySelector() over descendants can accidentally pick an annotation-layer
  // nested in a translated group and break coordinate spaces.
  const existing = Array.from(parent.children).find((child) =>
    child.matches(selector),
  )
  if (existing) return existing as SVGGElement

  const g = parent.ownerDocument.createElementNS(SVG_NS, SvgElements.Group) as SVGGElement
  g.setAttribute('class', SvgClassNames.AnnotationLayer)
  if (chartId) g.setAttribute(DataAttributes.ChartId, String(chartId))
  parent.appendChild(g)
  return g
}

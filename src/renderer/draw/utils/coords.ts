export function toSvgCenter(el: Element, svgNode: SVGSVGElement) {
  const gEl = el as SVGGraphicsElement
  const bbox = gEl.getBBox ? gEl.getBBox() : null
  const elCtm = gEl.getScreenCTM ? gEl.getScreenCTM() : null
  const svgCtm = svgNode.getScreenCTM ? svgNode.getScreenCTM() : null
  if (bbox && elCtm && svgCtm) {
    const pt = svgNode.createSVGPoint()
    pt.x = bbox.x + bbox.width / 2
    pt.y = bbox.y + bbox.height / 2
    const screenPt = pt.matrixTransform(elCtm)
    const svgPt = screenPt.matrixTransform(svgCtm.inverse())
    return { x: svgPt.x, y: svgPt.y }
  }
  // fallback
  const svgRect = svgNode.getBoundingClientRect()
  const elRect = gEl.getBoundingClientRect()
  const viewBox = svgNode.viewBox?.baseVal
  const scaleX = viewBox && svgRect.width > 0 ? viewBox.width / svgRect.width : 1
  const scaleY = viewBox && svgRect.height > 0 ? viewBox.height / svgRect.height : 1
  return {
    x: (viewBox?.x ?? 0) + (elRect.left - svgRect.left + elRect.width / 2) * scaleX,
    y: (viewBox?.y ?? 0) + (elRect.top - svgRect.top + elRect.height / 2) * scaleY,
  }
}


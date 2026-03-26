/**
 * SVGElement를 직렬화된 문자열로 변환
 */
export function captureSvgSnapshot(svg: SVGSVGElement): string {
  const cloned = svg.cloneNode(true) as SVGSVGElement
  return new XMLSerializer().serializeToString(cloned)
}

/**
 * SVG 문자열로부터 축소된 썸네일 HTMLElement 생성
 * @param svgString - 직렬화된 SVG 문자열
 * @param scale - 원본 대비 크기 비율 (e.g. 0.2 = 20%)
 * @param label - 그룹명 라벨 (e.g. 'ops', 'ops2')
 */
export function createSnapshotThumbnail(svgString: string, scale: number, label?: string): HTMLElement {
  const wrapper = document.createElement('div')
  wrapper.className = 'snapshot-thumbnail'
  wrapper.style.cssText = 'display: inline-flex; flex-direction: column; align-items: center; margin-right: 8px;'

  const parser = new DOMParser()
  const svgDoc = parser.parseFromString(svgString, 'image/svg+xml')
  const svgEl = svgDoc.documentElement as unknown as SVGSVGElement

  const viewBox = svgEl.getAttribute('viewBox')?.split(/\s+/)
  const origW = parseFloat(svgEl.getAttribute('width') ?? viewBox?.[2] ?? '400')
  const origH = parseFloat(svgEl.getAttribute('height') ?? viewBox?.[3] ?? '300')
  svgEl.setAttribute('width', String(origW * scale))
  svgEl.setAttribute('height', String(origH * scale))
  svgEl.style.border = '1px solid #ddd'
  svgEl.style.borderRadius = '4px'
  svgEl.style.display = 'block'

  // 흰 배경 rect를 SVG 맨 앞에 삽입 (원본 viewBox 기준 크기 사용)
  const bg = svgDoc.createElementNS('http://www.w3.org/2000/svg', 'rect')
  bg.setAttribute('x', '0')
  bg.setAttribute('y', '0')
  bg.setAttribute('width', String(origW))
  bg.setAttribute('height', String(origH))
  bg.setAttribute('fill', 'white')
  svgEl.insertBefore(bg, svgEl.firstChild)

  wrapper.appendChild(svgEl)

  if (label) {
    const lbl = document.createElement('span')
    lbl.textContent = label
    lbl.style.cssText = 'font-size: 10px; color: #666; margin-top: 4px;'
    wrapper.appendChild(lbl)
  }

  return wrapper
}

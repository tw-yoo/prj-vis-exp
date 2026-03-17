const OVERLAY_ATTR = 'data-visual-sentence-summary'

function overlayHost(container: HTMLElement) {
  return container.parentElement ?? container
}

function ensureOverlay(container: HTMLElement) {
  const host = overlayHost(container)
  let overlay = host.querySelector<HTMLElement>(`[${OVERLAY_ATTR}]`)
  if (overlay) return overlay
  overlay = document.createElement('div')
  overlay.setAttribute(OVERLAY_ATTR, 'true')
  overlay.className = 'chart-sentence-summary-overlay'
  const text = document.createElement('div')
  text.className = 'chart-sentence-summary-text'
  overlay.appendChild(text)
  host.appendChild(overlay)
  return overlay
}

export function renderSentenceSummaryOverlay(container: HTMLElement, text: string) {
  const overlay = ensureOverlay(container)
  const textNode = overlay.querySelector<HTMLElement>('.chart-sentence-summary-text')
  if (!textNode) return
  textNode.textContent = text
}

export function clearSentenceSummaryOverlay(container: HTMLElement) {
  const host = overlayHost(container)
  host.querySelector<HTMLElement>(`[${OVERLAY_ATTR}]`)?.remove()
}

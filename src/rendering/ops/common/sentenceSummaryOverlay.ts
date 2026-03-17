const OVERLAY_ATTR = 'data-visual-sentence-summary'

export type SentenceSummaryOverlayControl = {
  label: string
  disabled?: boolean
  onClick?: (() => void | Promise<void>) | null
}

export type SentenceSummaryOverlayRenderInput =
  | string
  | {
      text: string
      leftControl?: SentenceSummaryOverlayControl
      rightControl?: SentenceSummaryOverlayControl
    }

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

  const left = document.createElement('button')
  left.type = 'button'
  left.className = 'chart-sentence-summary-control is-left'

  const text = document.createElement('div')
  text.className = 'chart-sentence-summary-text'

  const right = document.createElement('button')
  right.type = 'button'
  right.className = 'chart-sentence-summary-control is-right'

  overlay.appendChild(left)
  overlay.appendChild(text)
  overlay.appendChild(right)
  host.appendChild(overlay)
  return overlay
}

function applyControl(node: HTMLButtonElement | null, control?: SentenceSummaryOverlayControl) {
  if (!node) return
  const label = control?.label?.trim() ?? ''
  node.textContent = label
  const disabled = control?.disabled ?? false
  node.disabled = disabled
  if (!disabled && typeof control?.onClick === 'function') {
    node.onclick = () => {
      void control.onClick?.()
    }
  } else {
    node.onclick = null
  }
  node.style.visibility = label.length > 0 ? 'visible' : 'hidden'
}

export function renderSentenceSummaryOverlay(
  container: HTMLElement,
  input: SentenceSummaryOverlayRenderInput,
) {
  const overlay = ensureOverlay(container)
  const textNode = overlay.querySelector<HTMLElement>('.chart-sentence-summary-text')
  const leftNode = overlay.querySelector<HTMLButtonElement>('.chart-sentence-summary-control.is-left')
  const rightNode = overlay.querySelector<HTMLButtonElement>('.chart-sentence-summary-control.is-right')
  if (!textNode) return
  if (typeof input === 'string') {
    textNode.textContent = input
    applyControl(leftNode, undefined)
    applyControl(rightNode, undefined)
    return
  }

  textNode.textContent = input.text
  applyControl(leftNode, input.leftControl)
  applyControl(rightNode, input.rightControl)
}

export function clearSentenceSummaryOverlay(container: HTMLElement) {
  const host = overlayHost(container)
  host.querySelector<HTMLElement>(`[${OVERLAY_ATTR}]`)?.remove()
}

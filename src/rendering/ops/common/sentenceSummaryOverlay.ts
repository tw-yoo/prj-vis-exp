const OVERLAY_ATTR = 'data-visual-sentence-summary'
const OVERLAY_SLOT_ATTR = 'data-summary-overlay-slot'

/**
 * Strip a leading "N. " (or "N) ") from authored sentence text so the rendered
 * numbered badge is the single source of the step number. Mirrors the
 * Evaluation page's `stripLeadingNumber` (src/evaluation/viewer.ts) so all
 * explanation surfaces number their chunks identically.
 */
function stripLeadingNumber(text: string): string {
  return text.replace(/^\s*\d+[.)]\s*/, '')
}

export type SentenceSummaryOverlayControl = {
  label: string
  disabled?: boolean
  onClick?: (() => void | Promise<void>) | null
}

export type SentenceSummaryOverlayItemState = 'active' | 'selected' | 'completed' | 'pending'

export type SentenceSummaryOverlayItem = {
  text: string
  state: SentenceSummaryOverlayItemState
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
  | {
      items: SentenceSummaryOverlayItem[]
    }

function overlayHost(container: HTMLElement | null): HTMLElement | null {
  if (!container) return null
  const stage = container.closest<HTMLElement>('.chart-stage')
  if (stage) {
    const slot = stage.querySelector<HTMLElement>(`[${OVERLAY_SLOT_ATTR}]`)
    if (slot) return slot
  }
  return container.parentElement ?? container
}

function ensureOverlay(container: HTMLElement) {
  const host = overlayHost(container)
  if (!host) {
    throw new Error('renderSentenceSummaryOverlay: missing overlay host')
  }
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

function applyText(node: HTMLElement | null, text: string) {
  if (!node) return
  const value = text.trim()
  node.textContent = value
  node.style.display = value.length > 0 ? '' : 'none'
}

function renderOverlayFrame(overlay: HTMLElement) {
  overlay.className = 'chart-sentence-summary-overlay'
  overlay.replaceChildren()

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

  return { left, text, right }
}

function renderOverlayItems(overlay: HTMLElement, items: SentenceSummaryOverlayItem[]) {
  overlay.className = 'chart-sentence-summary-overlay chart-sentence-summary-overlay--list'
  overlay.replaceChildren()

  const list = document.createElement('div')
  list.className = 'chart-sentence-summary-list'
  items.forEach((item, index) => {
    const rawText = item.text.trim()
    const displayText = rawText.length > 0 ? stripLeadingNumber(rawText) : `operation${index + 1}`
    const hasAction = typeof item.onClick === 'function'
    const node = document.createElement(hasAction ? 'button' : 'span')
    node.className = `chart-sentence-summary-item sentence sentence--${item.state}`

    // Numbered badge (1, 2, 3 …) prefix — matches the Evaluation page so each
    // reasoning step reads as a distinct numbered block across all surfaces.
    const badge = document.createElement('span')
    badge.className = 'sentence__badge'
    badge.textContent = String(index + 1)
    node.appendChild(badge)

    const textNode = document.createElement('span')
    textNode.className = 'sentence__text'
    textNode.textContent = displayText
    node.appendChild(textNode)

    node.setAttribute('data-summary-item-index', String(index))
    node.setAttribute('data-summary-item-state', item.state)
    if (hasAction && node instanceof HTMLButtonElement) {
      node.type = 'button'
      node.disabled = Boolean(item.disabled)
      node.onclick = () => {
        if (!node.disabled) {
          void item.onClick?.()
        }
      }
    }
    list.appendChild(node)
    if (index < items.length - 1) {
      list.appendChild(document.createTextNode(' '))
    }
  })

  overlay.appendChild(list)
}

export function renderSentenceSummaryOverlay(
  container: HTMLElement,
  input: SentenceSummaryOverlayRenderInput,
) {
  const overlay = ensureOverlay(container)
  if (typeof input === 'object' && 'items' in input) {
    renderOverlayItems(overlay, input.items)
    return
  }

  const { left, text, right } = renderOverlayFrame(overlay)
  if (typeof input === 'string') {
    applyText(text, input)
    applyControl(left, undefined)
    applyControl(right, undefined)
    return
  }

  applyText(text, input.text)
  applyControl(left, input.leftControl)
  applyControl(right, input.rightControl)
}

export function clearSentenceSummaryOverlay(container: HTMLElement | null) {
  if (!container) return
  const host = overlayHost(container)
  if (!host) return
  host.querySelector<HTMLElement>(`[${OVERLAY_ATTR}]`)?.remove()
}

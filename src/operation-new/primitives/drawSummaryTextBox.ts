interface DrawSummaryTextBoxOptions {
  // 'top' (default): floating caption absolutely positioned over the chart —
  // the original workbench behaviour. 'bottom': a normal-flow block pinned
  // below the chart so it can never overlap the chart element (evaluation page).
  placement?: 'top' | 'bottom'
}

export function drawSummaryTextBox(
  container: HTMLElement,
  text: string,
  options: DrawSummaryTextBoxOptions = {},
) {
  if (!container) return

  const placement = options.placement ?? 'top'
  const host = container.parentElement || container

  // Ensure the host is positioned so absolute positioning works
  if (getComputedStyle(host).position === 'static') {
    host.style.position = 'relative'
  }

  let overlay = host.querySelector<HTMLElement>('.operation-summary-html-box')

  if (!text) {
    if (overlay) overlay.remove()
    return
  }

  if (!overlay) {
    overlay = document.createElement('div')
    overlay.className = 'operation-summary-html-box'
    overlay.dataset.placement = placement
    overlay.style.transition = 'opacity 180ms ease'

    if (placement === 'bottom') {
      // Normal document flow, placed after the chart in the host, so it sits
      // below the chart and grows the host instead of covering the chart.
      overlay.style.position = 'static'
      overlay.style.margin = '14px auto 0'
      overlay.style.width = 'fit-content'
      overlay.style.maxWidth = '100%'
    } else {
      overlay.style.position = 'absolute'
      // Position it at the top-center
      overlay.style.top = '25px'
      overlay.style.left = '50%'
      overlay.style.transform = 'translateX(-50%)'
    }

    // Aesthetic styling
    overlay.style.backgroundColor = 'rgba(255, 255, 255, 0.95)'
    overlay.style.border = '1px solid #ccc'
    overlay.style.borderRadius = '4px'
    overlay.style.padding = '6px 16px'
    overlay.style.color = '#333'
    overlay.style.fontSize = '20px'
    overlay.style.fontWeight = '800'
    overlay.style.fontFamily = 'sans-serif'
    overlay.style.pointerEvents = 'none' // Don't block interactions with the chart
    overlay.style.zIndex = '1000'
    overlay.style.boxShadow = '0 2px 6px rgba(0,0,0,0.1)'
    overlay.style.textAlign = 'center'
    // Bottom captions can carry full equations; let them wrap instead of
    // overflowing the card. Top (workbench) keeps the original single line.
    overlay.style.whiteSpace = placement === 'bottom' ? 'normal' : 'nowrap'

    // Bottom boxes sit directly after the chart container so they land above
    // any siblings that follow it (e.g. the review panel's question and
    // explanation blocks); top boxes float over the host as before.
    if (placement === 'bottom' && container !== host) container.insertAdjacentElement('afterend', overlay)
    else host.appendChild(overlay)
    overlay.textContent = text
    return
  }

  // Existing bottom-placed box changing text: dip-to-swap fade instead of an
  // instant set (no popping). dataset.pendingText makes rapid successive calls
  // last-writer-wins so replay fast-forwards never leave the box stuck faded.
  if (overlay.dataset.placement === 'bottom' && overlay.textContent !== text) {
    const box = overlay
    box.dataset.pendingText = text
    box.style.opacity = '0'
    window.setTimeout(() => {
      if (box.dataset.pendingText != null) {
        box.textContent = box.dataset.pendingText
        delete box.dataset.pendingText
      }
      box.style.opacity = '1'
    }, 180)
    return
  }

  delete overlay.dataset.pendingText
  overlay.style.opacity = '1'
  overlay.textContent = text
}

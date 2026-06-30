import * as d3 from 'd3'

export function drawSummaryTextBox(container: HTMLElement, text: string) {
  if (!container) return

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
    overlay.style.position = 'absolute'
    // Position it at the top-center
    overlay.style.top = '25px'
    overlay.style.left = '50%'
    overlay.style.transform = 'translateX(-50%)'

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
    overlay.style.whiteSpace = 'nowrap'

    host.appendChild(overlay)
  }

  overlay.textContent = text
}

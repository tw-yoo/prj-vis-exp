const DEFAULT_PRESENTATION_FADE_MS = 260

const EMPHASIS_COLOR_PATTERNS = [
  '#ef4444',
  '#dc2626',
  'rgb(239,68,68)',
  'rgb(220,38,38)',
  'rgba(239,68,68',
  'rgba(220,38,38',
]

export type MarkPresentationSnapshot = {
  svgClone: SVGSVGElement
}

export type PresentationTransitionPlan = {
  durationMs?: number
}

function normalizeColor(value: string | null) {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, '')
}

function hasEmphasisColor(node: Element) {
  const fill = normalizeColor(node.getAttribute('fill'))
  const stroke = normalizeColor(node.getAttribute('stroke'))
  return EMPHASIS_COLOR_PATTERNS.some((pattern) => fill.includes(pattern) || stroke.includes(pattern))
}

function hasEmphasisOpacity(node: Element) {
  const raw = node.getAttribute('opacity')
  if (raw == null || raw.trim().length === 0) return false
  const opacity = Number(raw)
  return Number.isFinite(opacity) && opacity < 0.999
}

function hostContainsEmphasis(host: HTMLElement) {
  const svg = Array.from(host.querySelectorAll('svg')).find(
    (node) => !node.closest('.chart-presentation-handoff-overlay'),
  )
  if (!svg) return false
  if (svg.querySelector('.annotation')) return true
  const marks = svg.querySelectorAll('rect, path, circle, line, text')
  return Array.from(marks).some((node) => hasEmphasisColor(node) || hasEmphasisOpacity(node))
}

function clearExistingOverlays(host: HTMLElement) {
  host.querySelectorAll<HTMLElement>('.chart-presentation-handoff-overlay').forEach((node) => node.remove())
}

export function captureMarkPresentationSnapshot(host: HTMLElement): MarkPresentationSnapshot | null {
  if (!hostContainsEmphasis(host)) return null
  const svg = Array.from(host.querySelectorAll('svg')).find(
    (node) => !node.closest('.chart-presentation-handoff-overlay'),
  )
  if (!(svg instanceof SVGSVGElement)) return null
  return {
    svgClone: svg.cloneNode(true) as SVGSVGElement,
  }
}

export function playPresentationTransition(
  host: HTMLElement,
  snapshot: MarkPresentationSnapshot | null,
  plan?: PresentationTransitionPlan,
) {
  if (!snapshot) return

  clearExistingOverlays(host)

  const overlay = document.createElement('div')
  overlay.className = 'chart-presentation-handoff-overlay'
  overlay.style.opacity = '1'

  const clone = snapshot.svgClone
  clone.style.display = 'block'
  clone.style.width = '100%'
  clone.style.height = '100%'
  clone.style.maxWidth = '100%'
  clone.style.overflow = 'visible'
  clone.style.pointerEvents = 'none'
  overlay.appendChild(clone)

  host.appendChild(overlay)

  const durationMs = Math.max(0, Math.round(plan?.durationMs ?? DEFAULT_PRESENTATION_FADE_MS))
  const removeOverlay = () => {
    if (overlay.parentElement === host) overlay.remove()
  }

  requestAnimationFrame(() => {
    overlay.style.transition = `opacity ${durationMs}ms ease`
    overlay.style.opacity = '0'
  })

  window.setTimeout(removeOverlay, durationMs + 40)
}

import { DataAttributes } from '../interfaces'

export function getRenderEpoch(container: HTMLElement) {
  const raw = container.getAttribute(DataAttributes.RenderEpoch)
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : 0
}

export function bumpRenderEpoch(container: HTMLElement, target?: HTMLElement | null) {
  const nextEpoch = getRenderEpoch(container) + 1
  container.setAttribute(DataAttributes.RenderEpoch, String(nextEpoch))
  if (target && target !== container) {
    target.setAttribute(DataAttributes.RenderEpoch, String(nextEpoch))
  }
  return nextEpoch
}

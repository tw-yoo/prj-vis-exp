const BASE_TRANSFORM_DATA_KEY = 'baseAxisLabelTransform'
const BASE_ANCHOR_DATA_KEY = 'baseAxisLabelAnchor'

type AutoXAxisTickLabelRotationOptions = {
  candidateAngles?: number[]
  overlapTolerancePx?: number
  maxUnrotatedLabelLength?: number
  allowDensityReduction?: boolean
  maxDensityStep?: number
  tickElements?: SVGElement[]
}

export type XAxisTickLabelLayoutResult = {
  angleDeg: number
  overlapPx: number
  densityStep: number
}

function ensureBaseTransform(label: SVGTextElement) {
  if (label.dataset[BASE_TRANSFORM_DATA_KEY] == null) {
    label.dataset[BASE_TRANSFORM_DATA_KEY] = label.getAttribute('transform') ?? ''
  }
  return label.dataset[BASE_TRANSFORM_DATA_KEY] ?? ''
}

function ensureBaseAnchor(label: SVGTextElement) {
  if (label.dataset[BASE_ANCHOR_DATA_KEY] == null) {
    label.dataset[BASE_ANCHOR_DATA_KEY] = label.getAttribute('text-anchor') ?? 'middle'
  }
  return label.dataset[BASE_ANCHOR_DATA_KEY] ?? 'middle'
}

function stripRotateTransform(transform: string) {
  return transform.replace(/\s*rotate\([^)]*\)/g, '').trim()
}

function getRenderableLabels(labels: SVGTextElement[]) {
  return labels.filter((label) => (label.textContent ?? '').trim().length > 0)
}

function getVisibleRenderableLabels(labels: SVGTextElement[]) {
  return getRenderableLabels(labels).filter((label) => {
    const display = label.style.display || label.getAttribute('display')
    return display !== 'none'
  })
}

function calcTotalXOverlap(labels: SVGTextElement[]) {
  const positioned = labels
    .map((label) => ({ label, rect: label.getBoundingClientRect() }))
    .filter(({ rect }) => Number.isFinite(rect.left) && Number.isFinite(rect.right))
    .sort(
      (a, b) =>
        (a.rect.left + a.rect.right) / 2 -
        (b.rect.left + b.rect.right) / 2,
    )

  let total = 0
  for (let i = 0; i < positioned.length - 1; i += 1) {
    const current = positioned[i].rect
    const next = positioned[i + 1].rect
    const overlapX = current.right - next.left
    const overlapY = Math.min(current.bottom, next.bottom) - Math.max(current.top, next.top)
    if (overlapX > 0 && overlapY > 1) total += overlapX
  }
  return total
}

function shouldShowByStep(index: number, total: number, step: number) {
  if (step <= 1) return true
  if (index === 0 || index === total - 1) return true
  return index % step === 0
}

function setAxisTickDensity(labels: SVGTextElement[], tickElements: SVGElement[], step: number) {
  const safeStep = Math.max(1, Math.floor(step))
  labels.forEach((label, index) => {
    const visible = shouldShowByStep(index, labels.length, safeStep)
    label.style.display = visible ? '' : 'none'
  })
  tickElements.forEach((tick, index) => {
    const visible = shouldShowByStep(index, tickElements.length, safeStep)
    ;(tick as SVGElement).style.display = visible ? '' : 'none'
  })
}

export function setXAxisTickLabelAngle(labels: SVGTextElement[], angleDeg: number) {
  const targetLabels = getRenderableLabels(labels)
  targetLabels.forEach((label) => {
    const baseTransform = stripRotateTransform(ensureBaseTransform(label))
    const baseAnchor = ensureBaseAnchor(label)
    if (angleDeg === 0) {
      if (baseTransform) label.setAttribute('transform', baseTransform)
      else label.removeAttribute('transform')
      label.setAttribute('text-anchor', baseAnchor)
      return
    }

    const mergedTransform = baseTransform ? `${baseTransform} rotate(${angleDeg})` : `rotate(${angleDeg})`
    label.setAttribute('transform', mergedTransform)
    label.setAttribute('text-anchor', 'end')
  })
}

function measureOverlapAtAngle(labels: SVGTextElement[], angleDeg: number) {
  setXAxisTickLabelAngle(labels, angleDeg)
  return calcTotalXOverlap(labels)
}

export function autoRotateXAxisTickLabels(
  labels: SVGTextElement[],
  options: AutoXAxisTickLabelRotationOptions = {},
) {
  const targetLabels = getRenderableLabels(labels)
  const tickElements = (options.tickElements ?? []).filter((tick) => tick != null)
  if (targetLabels.length <= 1) {
    setAxisTickDensity(targetLabels, tickElements, 1)
    return {
      angleDeg: 0,
      overlapPx: 0,
      densityStep: 1,
    } satisfies XAxisTickLabelLayoutResult
  }

  const candidateAngles = options.candidateAngles ?? [-25, -35, -45, -60, -75, -90]
  const overlapTolerancePx = options.overlapTolerancePx ?? 1
  const maxUnrotatedLabelLength = options.maxUnrotatedLabelLength ?? 12
  const allowDensityReduction = options.allowDensityReduction ?? false
  const maxDensityStep = Math.max(1, Math.floor(options.maxDensityStep ?? 8))
  const maxLabelLength = targetLabels.reduce((maxLen, label) => {
    const len = (label.textContent ?? '').trim().length
    return len > maxLen ? len : maxLen
  }, 0)

  setAxisTickDensity(targetLabels, tickElements, 1)

  let bestAngle = 0
  let bestOverlap = measureOverlapAtAngle(targetLabels, 0)
  let bestDensityStep = 1

  if (bestOverlap <= overlapTolerancePx && maxLabelLength <= maxUnrotatedLabelLength) {
    setXAxisTickLabelAngle(targetLabels, 0)
    return {
      angleDeg: 0,
      overlapPx: bestOverlap,
      densityStep: 1,
    } satisfies XAxisTickLabelLayoutResult
  }

  candidateAngles.forEach((angle) => {
    const overlap = measureOverlapAtAngle(targetLabels, angle)
    if (overlap < bestOverlap) {
      bestOverlap = overlap
      bestAngle = angle
    }
  })

  setXAxisTickLabelAngle(targetLabels, bestAngle)

  if (allowDensityReduction && bestOverlap > overlapTolerancePx && targetLabels.length > 2) {
    let selectedOverlap = bestOverlap
    let selectedStep = 1
    const maxStep = Math.min(maxDensityStep, Math.max(2, targetLabels.length - 1))
    for (let step = 2; step <= maxStep; step += 1) {
      setAxisTickDensity(targetLabels, tickElements, step)
      setXAxisTickLabelAngle(targetLabels, bestAngle)
      const overlap = calcTotalXOverlap(getVisibleRenderableLabels(targetLabels))
      if (overlap < selectedOverlap) {
        selectedOverlap = overlap
        selectedStep = step
      }
      if (overlap <= overlapTolerancePx) {
        selectedOverlap = overlap
        selectedStep = step
        break
      }
    }
    setAxisTickDensity(targetLabels, tickElements, selectedStep)
    bestOverlap = selectedOverlap
    bestDensityStep = selectedStep
  } else {
    setAxisTickDensity(targetLabels, tickElements, 1)
  }

  return {
    angleDeg: bestAngle,
    overlapPx: bestOverlap,
    densityStep: bestDensityStep,
  } satisfies XAxisTickLabelLayoutResult
}

const BASE_TRANSFORM_DATA_KEY = 'baseAxisLabelTransform'
const BASE_ANCHOR_DATA_KEY = 'baseAxisLabelAnchor'

type AutoXAxisTickLabelRotationOptions = {
  candidateAngles?: number[]
  overlapTolerancePx?: number
  maxUnrotatedLabelLength?: number
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
  if (targetLabels.length <= 1) return 0

  const candidateAngles = options.candidateAngles ?? [-25, -35, -45, -60, -75, -90]
  const overlapTolerancePx = options.overlapTolerancePx ?? 1
  const maxUnrotatedLabelLength = options.maxUnrotatedLabelLength ?? 12
  const maxLabelLength = targetLabels.reduce((maxLen, label) => {
    const len = (label.textContent ?? '').trim().length
    return len > maxLen ? len : maxLen
  }, 0)

  let bestAngle = 0
  let bestOverlap = measureOverlapAtAngle(targetLabels, 0)

  if (bestOverlap <= overlapTolerancePx && maxLabelLength <= maxUnrotatedLabelLength) {
    setXAxisTickLabelAngle(targetLabels, 0)
    return 0
  }

  candidateAngles.forEach((angle) => {
    const overlap = measureOverlapAtAngle(targetLabels, angle)
    if (overlap < bestOverlap) {
      bestOverlap = overlap
      bestAngle = angle
    }
  })

  if (bestAngle === 0) {
    setXAxisTickLabelAngle(targetLabels, 0)
    return 0
  }

  setXAxisTickLabelAngle(targetLabels, bestAngle)
  return bestAngle
}

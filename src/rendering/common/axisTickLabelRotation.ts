const BASE_TRANSFORM_DATA_KEY = 'baseAxisLabelTransform'
const BASE_ANCHOR_DATA_KEY = 'baseAxisLabelAnchor'
const BASE_DY_DATA_KEY = 'baseAxisLabelDy'
const REFERENCE_X_DATA_KEY = 'rotationReferenceX'
const REFERENCE_Y_DATA_KEY = 'rotationReferenceY'
const REFERENCE_KIND_DATA_KEY = 'rotationReferenceKind'

type AutoXAxisTickLabelRotationOptions = {
  candidateAngles?: number[]
  overlapTolerancePx?: number
  maxUnrotatedLabelLength?: number
  allowDensityReduction?: boolean
  maxDensityStep?: number
  tickElements?: SVGElement[]
  rotatedAnchor?: 'middle' | 'end'
  showAllTicksByDefault?: boolean
  rotationReferencePolicy?: 'center' | 'sign-aware-edge-midpoint'
  prepareLabelsForAngle?: (angleDeg: number) => void
}

export type XAxisTickLabelLayoutResult = {
  angleDeg: number
  overlapPx: number
  densityStep: number
}

type RotationScore = {
  maxSlotOverflow: number
  slotOverflow: number
  overlap: number
  angleAbs: number
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

function ensureBaseDy(label: SVGTextElement) {
  if (label.dataset[BASE_DY_DATA_KEY] == null) {
    label.dataset[BASE_DY_DATA_KEY] = label.getAttribute('dy') ?? ''
  }
  return label.dataset[BASE_DY_DATA_KEY] ?? ''
}

function stripRotateTransform(transform: string) {
  return transform
    .replace(/\s*translate\([^)]*\)/g, '')
    .replace(/\s*rotate\([^)]*\)/g, '')
    .trim()
}

function resolveLabelAnchorPoint(label: SVGTextElement) {
  const xAttr = label.getAttribute('x')
  const yAttr = label.getAttribute('y')
  const x = Number(xAttr ?? '0')
  const y = Number(yAttr ?? '0')
  return {
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0,
  }
}

function resetLabelToUnrotatedState(label: SVGTextElement) {
  const baseTransform = stripRotateTransform(ensureBaseTransform(label))
  const baseAnchor = ensureBaseAnchor(label)
  const baseDy = ensureBaseDy(label)
  if (baseTransform) label.setAttribute('transform', baseTransform)
  else label.removeAttribute('transform')
  label.setAttribute('text-anchor', baseAnchor)
  if (baseDy) label.setAttribute('dy', baseDy)
  else label.removeAttribute('dy')
  return { baseTransform, baseAnchor, baseDy }
}

function resolveLabelBoundingBox(label: SVGTextElement) {
  try {
    const bbox = label.getBBox()
    if (
      Number.isFinite(bbox.x) &&
      Number.isFinite(bbox.y) &&
      Number.isFinite(bbox.width) &&
      Number.isFinite(bbox.height) &&
      bbox.width > 0 &&
      bbox.height > 0
    ) {
      return {
        x: bbox.x,
        y: bbox.y,
        width: bbox.width,
        height: bbox.height,
      }
    }
  } catch {
    // fall through to anchor pivot
  }
  return null
}

function resolveRotationReference(
  label: SVGTextElement,
  angleDeg: number,
  mode: 'center' | 'sign-aware-edge-midpoint',
) {
  const bbox = resolveLabelBoundingBox(label)
  if (bbox) {
    if (mode === 'center' || angleDeg === 0) {
      return {
        x: bbox.x + bbox.width / 2,
        y: bbox.y + bbox.height / 2,
        kind: 'center' as const,
      }
    }
    return {
      x: angleDeg < 0 ? bbox.x + bbox.width : bbox.x,
      y: bbox.y + bbox.height / 2,
      kind: angleDeg < 0 ? ('trailing-midpoint' as const) : ('leading-midpoint' as const),
    }
  }

  const anchor = resolveLabelAnchorPoint(label)
  return {
    x: anchor.x,
    y: anchor.y,
    kind: 'anchor-fallback' as const,
  }
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

function resolveTickCenterPx(tick: SVGElement) {
  const line = tick.querySelector('line')
  const rect = (line instanceof SVGLineElement ? line : tick).getBoundingClientRect()
  if (!Number.isFinite(rect.left) || !Number.isFinite(rect.right)) return Number.NaN
  return (rect.left + rect.right) / 2
}

function calcTotalSlotOverflow(labels: SVGTextElement[], tickElements: SVGElement[]) {
  if (labels.length === 0 || tickElements.length !== labels.length) return 0
  const centers = tickElements.map(resolveTickCenterPx)
  let total = 0
  labels.forEach((label, index) => {
    const center = centers[index]
    if (!Number.isFinite(center)) return
    const prev = index > 0 ? centers[index - 1] : Number.NaN
    const next = index < centers.length - 1 ? centers[index + 1] : Number.NaN
    const leftBoundary = Number.isFinite(prev) ? (prev + center) / 2 : center - (Number.isFinite(next) ? (next - center) / 2 : 0)
    const rightBoundary = Number.isFinite(next) ? (center + next) / 2 : center + (Number.isFinite(prev) ? (center - prev) / 2 : 0)
    const rect = label.getBoundingClientRect()
    if (!Number.isFinite(rect.left) || !Number.isFinite(rect.right)) return
    total += Math.max(0, leftBoundary - rect.left)
    total += Math.max(0, rect.right - rightBoundary)
  })
  return total
}

function calcMaxSlotOverflow(labels: SVGTextElement[], tickElements: SVGElement[]) {
  if (labels.length === 0 || tickElements.length !== labels.length) return 0
  const centers = tickElements.map(resolveTickCenterPx)
  let maxOverflow = 0
  labels.forEach((label, index) => {
    const center = centers[index]
    if (!Number.isFinite(center)) return
    const prev = index > 0 ? centers[index - 1] : Number.NaN
    const next = index < centers.length - 1 ? centers[index + 1] : Number.NaN
    const leftBoundary = Number.isFinite(prev) ? (prev + center) / 2 : center - (Number.isFinite(next) ? (next - center) / 2 : 0)
    const rightBoundary = Number.isFinite(next) ? (center + next) / 2 : center + (Number.isFinite(prev) ? (center - prev) / 2 : 0)
    const rect = label.getBoundingClientRect()
    if (!Number.isFinite(rect.left) || !Number.isFinite(rect.right)) return
    maxOverflow = Math.max(maxOverflow, Math.max(0, leftBoundary - rect.left), Math.max(0, rect.right - rightBoundary))
  })
  return maxOverflow
}

function isBetterRotationScore(candidate: RotationScore, current: RotationScore) {
  if (candidate.overlap < current.overlap - 0.5) return true
  if (candidate.overlap > current.overlap + 0.5) return false
  if (candidate.maxSlotOverflow < current.maxSlotOverflow - 0.5) return true
  if (candidate.maxSlotOverflow > current.maxSlotOverflow + 0.5) return false
  if (candidate.slotOverflow < current.slotOverflow - 0.5) return true
  if (candidate.slotOverflow > current.slotOverflow + 0.5) return false
  return candidate.angleAbs < current.angleAbs
}

function buildRotationScore(overlap: number, slotOverflow: number, maxSlotOverflow: number, angleAbs: number): RotationScore {
  return {
    maxSlotOverflow,
    slotOverflow,
    overlap,
    angleAbs,
  }
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

export function setXAxisTickLabelAngle(
  labels: SVGTextElement[],
  angleDeg: number,
  options: { rotatedAnchor?: 'middle' | 'end'; rotationReferencePolicy?: 'center' | 'sign-aware-edge-midpoint' } = {},
) {
  const targetLabels = getRenderableLabels(labels)
  const rotatedAnchor = options.rotatedAnchor ?? 'end'
  const rotationReferencePolicy = options.rotationReferencePolicy ?? 'center'
  targetLabels.forEach((label) => {
    const { baseTransform, baseDy } = resetLabelToUnrotatedState(label)
    if (angleDeg === 0) {
      label.setAttribute('text-anchor', ensureBaseAnchor(label))
      const reference = resolveRotationReference(label, 0, 'center')
      label.dataset[REFERENCE_X_DATA_KEY] = String(reference.x)
      label.dataset[REFERENCE_Y_DATA_KEY] = String(reference.y)
      label.dataset[REFERENCE_KIND_DATA_KEY] = reference.kind
      return
    }

    label.setAttribute('text-anchor', rotatedAnchor)
    if (baseDy) label.setAttribute('dy', baseDy)
    else label.removeAttribute('dy')
    const reference = resolveRotationReference(label, angleDeg, rotationReferencePolicy)
    const rotateTransform = `rotate(${angleDeg},0,${reference.y})`
    const translateTransform = `translate(${-reference.x},0)`
    const mergedTransform = [baseTransform, rotateTransform, translateTransform].filter(Boolean).join(' ')
    label.setAttribute('transform', mergedTransform)
    label.dataset[REFERENCE_X_DATA_KEY] = String(reference.x)
    label.dataset[REFERENCE_Y_DATA_KEY] = String(reference.y)
    label.dataset[REFERENCE_KIND_DATA_KEY] = reference.kind
  })
}

function measureOverlapAtAngle(
  labels: SVGTextElement[],
  angleDeg: number,
  options: { rotatedAnchor?: 'middle' | 'end'; rotationReferencePolicy?: 'center' | 'sign-aware-edge-midpoint' } = {},
) {
  setXAxisTickLabelAngle(labels, angleDeg, options)
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
  const rotatedAnchor = options.rotatedAnchor ?? 'end'
  const showAllTicksByDefault = options.showAllTicksByDefault ?? false
  const rotationReferencePolicy = options.rotationReferencePolicy ?? 'center'
  const prepareLabelsForAngle = options.prepareLabelsForAngle
  const maxLabelLength = targetLabels.reduce((maxLen, label) => {
    const len = (label.textContent ?? '').trim().length
    return len > maxLen ? len : maxLen
  }, 0)

  setAxisTickDensity(targetLabels, tickElements, 1)

  let bestAngle = 0
  prepareLabelsForAngle?.(0)
  let bestOverlap = measureOverlapAtAngle(targetLabels, 0, { rotatedAnchor, rotationReferencePolicy })
  let bestSlotOverflow = calcTotalSlotOverflow(targetLabels, tickElements)
  let bestMaxSlotOverflow = calcMaxSlotOverflow(targetLabels, tickElements)
  let bestScore = buildRotationScore(bestOverlap, bestSlotOverflow, bestMaxSlotOverflow, 0)
  let bestDensityStep = 1

  // Detect whether the angle-0 layout required multi-line wrapping. The wrap
  // routine in prepareLabelsForAngle splits a too-wide label into multiple
  // <tspan> rows so it horizontally fits its tick slot — but those extra
  // rows extend vertically into the x-axis-title area below the axis.
  // Horizontal overlap (used by the angle-0 shortcut below) doesn't see this
  // vertical encroachment. Treat multi-line-at-zero as a signal that angle 0
  // isn't really "fitting" and skip the shortcut, so the candidate-angle
  // loop has a chance to find a rotation that lets each label sit on a
  // single line. Concrete case: split surfaces (case 0s6zi9dyw22qo4rp) where
  // a 10-tick x-axis at plot-w=388 yields ~35px slots, narrower than the
  // ~60px needed for "Sep 1896" — without this guard the shortcut chose
  // angle=0 and the wrapped labels collided with the x-axis title.
  const maxLinesAtZero = targetLabels.reduce((maxLines, label) => {
    const tspans = label.querySelectorAll('tspan').length
    return tspans > maxLines ? tspans : maxLines
  }, 0)
  const wrappedAtZero = maxLinesAtZero > 1

  if (
    bestOverlap <= overlapTolerancePx &&
    bestSlotOverflow <= overlapTolerancePx &&
    bestMaxSlotOverflow <= overlapTolerancePx &&
    maxLabelLength <= maxUnrotatedLabelLength &&
    !wrappedAtZero
  ) {
    setXAxisTickLabelAngle(targetLabels, 0)
    return {
      angleDeg: 0,
      overlapPx: bestOverlap,
      densityStep: 1,
    } satisfies XAxisTickLabelLayoutResult
  }

  let resolvedBySafeAngle = false
  candidateAngles.forEach((angle) => {
    prepareLabelsForAngle?.(angle)
    const overlap = measureOverlapAtAngle(targetLabels, angle, { rotatedAnchor, rotationReferencePolicy })
    const slotOverflow = calcTotalSlotOverflow(targetLabels, tickElements)
    const maxSlotOverflow = calcMaxSlotOverflow(targetLabels, tickElements)
    const score = buildRotationScore(overlap, slotOverflow, maxSlotOverflow, Math.abs(angle))
    if (!resolvedBySafeAngle && overlap <= overlapTolerancePx && slotOverflow <= overlapTolerancePx && maxSlotOverflow <= overlapTolerancePx) {
      bestAngle = angle
      bestOverlap = overlap
      bestSlotOverflow = slotOverflow
      bestMaxSlotOverflow = maxSlotOverflow
      bestScore = score
      resolvedBySafeAngle = true
      return
    }
    if (resolvedBySafeAngle) return
    if (isBetterRotationScore(score, bestScore)) {
      bestOverlap = overlap
      bestSlotOverflow = slotOverflow
      bestMaxSlotOverflow = maxSlotOverflow
      bestScore = score
      bestAngle = angle
    }
  })

  prepareLabelsForAngle?.(bestAngle)
  setXAxisTickLabelAngle(targetLabels, bestAngle, { rotatedAnchor, rotationReferencePolicy })

  if (
    allowDensityReduction &&
    !showAllTicksByDefault &&
    (bestOverlap > overlapTolerancePx || bestSlotOverflow > overlapTolerancePx || bestMaxSlotOverflow > overlapTolerancePx) &&
    targetLabels.length > 2
  ) {
    let selectedOverlap = bestOverlap
    let selectedSlotOverflow = bestSlotOverflow
    let selectedMaxSlotOverflow = bestMaxSlotOverflow
    let selectedScore = bestScore
    let selectedStep = 1
    const maxStep = Math.min(maxDensityStep, Math.max(2, targetLabels.length - 1))
    for (let step = 2; step <= maxStep; step += 1) {
      setAxisTickDensity(targetLabels, tickElements, step)
      prepareLabelsForAngle?.(bestAngle)
      setXAxisTickLabelAngle(targetLabels, bestAngle, { rotatedAnchor, rotationReferencePolicy })
      const visibleLabels = getVisibleRenderableLabels(targetLabels)
      const visibleTicks = tickElements.filter((tick) => {
        const display = tick.style.display || tick.getAttribute('display')
        return display !== 'none'
      })
      const overlap = calcTotalXOverlap(visibleLabels)
      const slotOverflow = calcTotalSlotOverflow(visibleLabels, visibleTicks)
      const maxSlotOverflow = calcMaxSlotOverflow(visibleLabels, visibleTicks)
      const score: RotationScore = {
        maxSlotOverflow,
        slotOverflow,
        overlap,
        angleAbs: Math.abs(bestAngle),
      }
      if (isBetterRotationScore(score, selectedScore)) {
        selectedOverlap = overlap
        selectedSlotOverflow = slotOverflow
        selectedMaxSlotOverflow = maxSlotOverflow
        selectedScore = score
        selectedStep = step
      }
      if (overlap <= overlapTolerancePx && slotOverflow <= overlapTolerancePx && maxSlotOverflow <= overlapTolerancePx) {
        selectedOverlap = overlap
        selectedSlotOverflow = slotOverflow
        selectedMaxSlotOverflow = maxSlotOverflow
        selectedScore = score
        selectedStep = step
        break
      }
    }
    setAxisTickDensity(targetLabels, tickElements, selectedStep)
    bestOverlap = selectedOverlap
    bestSlotOverflow = selectedSlotOverflow
    bestMaxSlotOverflow = selectedMaxSlotOverflow
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

import * as d3 from 'd3'
import { autoRotateXAxisTickLabels, setXAxisTickLabelAngle, type XAxisTickLabelLayoutResult } from './axisTickLabelRotation'

type AxisTickSelection = d3.Selection<SVGTextElement, unknown, d3.BaseType, unknown>

type WrapAxisTickLabelOptions = {
  maxCharsPerLine?: number
  lineHeightEm?: number
  rotationDeg?: number | 'auto'
  maxLines?: number
  showAllTicksByDefault?: boolean
  rotationReferencePolicy?: 'center' | 'sign-aware-edge-midpoint'
  allowDensityReduction?: boolean
  maxDensityStep?: number
  overlapTolerancePx?: number
  maxUnrotatedLabelLength?: number
  candidateAngles?: number[]
  rotatedAnchor?: 'middle' | 'end'
  tickElements?: SVGElement[]
}

function resolveTickCenterPx(tick: SVGElement) {
  const line = tick.querySelector('line')
  const rect = (line instanceof SVGLineElement ? line : tick).getBoundingClientRect()
  if (!Number.isFinite(rect.left) || !Number.isFinite(rect.right)) return Number.NaN
  return (rect.left + rect.right) / 2
}

function resolveTickSlotWidthsPx(tickElements: SVGElement[]) {
  const centers = tickElements.map(resolveTickCenterPx)
  return centers.map((center, index) => {
    if (!Number.isFinite(center)) return Number.NaN
    const prev = index > 0 ? centers[index - 1] : Number.NaN
    const next = index < centers.length - 1 ? centers[index + 1] : Number.NaN
    if (Number.isFinite(prev) && Number.isFinite(next)) return Math.max(24, Math.min(center - prev, next - center) * 0.92)
    if (Number.isFinite(prev)) return Math.max(24, (center - prev) * 0.92)
    if (Number.isFinite(next)) return Math.max(24, (next - center) * 0.92)
    return Number.NaN
  })
}

function measureLineWidth(
  text: d3.Selection<SVGTextElement, unknown, d3.BaseType, unknown>,
  line: string,
  baseDy: string,
) {
  text.text(null)
  text.attr('dy', null)
  text.append('tspan').attr('x', 0).attr('dy', baseDy).text(line)
  const node = text.node()
  if (!node) return Number.NaN
  const computed = node.getComputedTextLength()
  if (Number.isFinite(computed) && computed > 0) return computed
  try {
    const bbox = node.getBBox()
    if (Number.isFinite(bbox.width) && bbox.width > 0) return bbox.width
  } catch {
    // ignore
  }
  return Number.NaN
}

function splitTokenByWidth(
  text: d3.Selection<SVGTextElement, unknown, d3.BaseType, unknown>,
  token: string,
  maxWidthPx: number,
  baseDy: string,
) {
  if (!token) return ['']
  if (!Number.isFinite(maxWidthPx) || maxWidthPx <= 0) return [token]

  const pieces: string[] = []
  let current = ''
  for (const char of Array.from(token)) {
    const next = `${current}${char}`
    const width = measureLineWidth(text, next, baseDy)
    if (!current || !Number.isFinite(width) || width <= maxWidthPx) {
      current = next
      continue
    }
    pieces.push(current)
    current = char
  }
  if (current) pieces.push(current)
  return pieces.length > 0 ? pieces : [token]
}

function tokenizeByWidth(
  text: d3.Selection<SVGTextElement, unknown, d3.BaseType, unknown>,
  label: string,
  maxCharsPerLine: number,
  maxWidthPx: number,
  baseDy: string,
) {
  return tokenize(label, maxCharsPerLine).flatMap((token) => {
    const width = measureLineWidth(text, token, baseDy)
    if (!Number.isFinite(width) || width <= maxWidthPx) return [token]
    return splitTokenByWidth(text, token, maxWidthPx, baseDy)
  })
}

function wrapLabelByWidth(
  text: d3.Selection<SVGTextElement, unknown, d3.BaseType, unknown>,
  label: string,
  maxCharsPerLine: number,
  maxLines: number,
  maxWidthPx: number | undefined,
  baseDy: string,
  lineHeightEm: number,
) {
  const safeMaxLines = Math.max(1, Math.floor(maxLines))
  if (!Number.isFinite(maxWidthPx ?? NaN) || (maxWidthPx ?? 0) <= 0) {
    return wrapLabel(label, maxCharsPerLine, safeMaxLines)
  }

  const widthLimit = maxWidthPx as number
  const fullLabelWidth = measureLineWidth(text, label, baseDy)
  const derivedMaxLines = Number.isFinite(fullLabelWidth)
    ? Math.max(safeMaxLines, Math.ceil(fullLabelWidth / Math.max(widthLimit, 1)))
    : safeMaxLines
  const lineBudget = Math.max(derivedMaxLines, 8)
  const tokens = tokenizeByWidth(text, label, maxCharsPerLine, widthLimit, baseDy)
  if (tokens.length === 0) return ['']

  const lines: string[] = []
  let current = ''
  for (const token of tokens) {
    const next = current ? `${current} ${token}` : token
    if (!current) {
      current = next
      continue
    }
    const width = measureLineWidth(text, next, baseDy)
    if (Number.isFinite(width) && width <= (maxWidthPx as number)) {
      current = next
      continue
    }
    lines.push(current)
    current = token
  }
  if (current) lines.push(current)

  if (lines.length <= lineBudget) return lines
  return lines.slice(0, lineBudget)
}

function chunkLongToken(token: string, maxCharsPerLine: number) {
  const parts: string[] = []
  let index = 0
  while (index < token.length) {
    parts.push(token.slice(index, index + maxCharsPerLine))
    index += maxCharsPerLine
  }
  return parts
}

function tokenize(label: string, maxCharsPerLine: number) {
  const normalized = label
    .replace(/\s*[—–-]\s*/g, ' — ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!normalized) return []

  return normalized
    .split(' ')
    .flatMap((token) => (token.length > maxCharsPerLine ? chunkLongToken(token, maxCharsPerLine) : [token]))
}

function wrapLabel(label: string, maxCharsPerLine: number, maxLines: number) {
  const tokens = tokenize(label, maxCharsPerLine)
  if (tokens.length === 0) return ['']

  const lines: string[] = []
  let current = ''
  tokens.forEach((token) => {
    const next = current ? `${current} ${token}` : token
    if (next.length <= maxCharsPerLine || current.length === 0) {
      current = next
      return
    }
    lines.push(current)
    current = token
  })
  if (current) lines.push(current)

  if (lines.length <= maxLines) return lines
  const kept = lines.slice(0, maxLines)
  const overflow = lines.slice(maxLines - 1).join(' ')
  kept[maxLines - 1] = overflow
  return kept
}

function renderWrappedLines(
  text: d3.Selection<SVGTextElement, unknown, d3.BaseType, unknown>,
  lines: string[],
  baseDy: string,
  lineHeightEm: number,
) {
  text.text(null)
  text.attr('dy', null)
  lines.forEach((line, index) => {
    text
      .append('tspan')
      .attr('x', 0)
      .attr('dy', index === 0 ? baseDy : `${lineHeightEm}em`)
      .text(line)
  })
}

export function wrapAxisTickLabels(
  selection: AxisTickSelection,
  options: WrapAxisTickLabelOptions = {},
) {
  const {
    maxCharsPerLine = 18,
    lineHeightEm = 1.05,
    rotationDeg = 'auto',
    maxLines = 4,
    showAllTicksByDefault = false,
    rotationReferencePolicy = 'center',
    allowDensityReduction = false,
    maxDensityStep = 8,
    overlapTolerancePx = 1,
    maxUnrotatedLabelLength = 12,
    candidateAngles,
    rotatedAnchor = 'end',
    tickElements = [],
  } = options

  const labels: SVGTextElement[] = []
  const tickSlotWidthsPx = tickElements.length > 0 ? resolveTickSlotWidthsPx(tickElements) : []
  const rawLabels: string[] = []
  const baseDys: string[] = []
  selection.each(function (_datum, index) {
    const text = d3.select(this)
    const rawLabel = text.text().trim()
    const baseDy = text.attr('dy') || '0.71em'
    labels.push(this)
    rawLabels.push(rawLabel)
    baseDys.push(baseDy)
  })

  const prepareLabelsForAngle = (angleDeg: number) => {
    labels.forEach((label, index) => {
      const text = d3.select(label)
      const rawLabel = rawLabels[index] ?? ''
      const baseDy = baseDys[index] ?? '0.71em'
      const baseWidth = Number.isFinite(tickSlotWidthsPx[index] ?? NaN) ? (tickSlotWidthsPx[index] as number) : undefined
      const absAngle = Math.abs(angleDeg)
      let widthFactor = 1
      let preferredMaxLines = maxLines
      if (absAngle >= 75) {
        widthFactor = 6
        preferredMaxLines = 1
      } else if (absAngle >= 55) {
        widthFactor = 3
        preferredMaxLines = Math.min(maxLines, 2)
      } else if (absAngle > 0) {
        widthFactor = 1 / Math.max(0.35, Math.cos((absAngle * Math.PI) / 180))
      }
      const lines = wrapLabelByWidth(
        text,
        rawLabel,
        maxCharsPerLine,
        preferredMaxLines,
        Number.isFinite(baseWidth ?? NaN) ? (baseWidth as number) * widthFactor : undefined,
        baseDy,
        lineHeightEm,
      )
      renderWrappedLines(text, lines, baseDy, lineHeightEm)
    })
  }

  prepareLabelsForAngle(0)

  if (rotationDeg === 'auto') {
    return autoRotateXAxisTickLabels(labels, {
      candidateAngles,
      overlapTolerancePx,
      showAllTicksByDefault,
      rotationReferencePolicy,
      allowDensityReduction,
      maxDensityStep,
      maxUnrotatedLabelLength,
      rotatedAnchor,
      tickElements,
      prepareLabelsForAngle,
    })
  } else {
    prepareLabelsForAngle(rotationDeg)
    setXAxisTickLabelAngle(labels, rotationDeg, { rotatedAnchor, rotationReferencePolicy })
    return {
      angleDeg: rotationDeg,
      overlapPx: 0,
      densityStep: 1,
    } satisfies XAxisTickLabelLayoutResult
  }
}

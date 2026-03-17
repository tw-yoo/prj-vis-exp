import * as d3 from 'd3'

type AxisTickSelection = d3.Selection<SVGTextElement, unknown, d3.BaseType, unknown>

type WrapAxisTickLabelOptions = {
  maxCharsPerLine?: number
  lineHeightEm?: number
  rotationDeg?: number
  maxLines?: number
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

export function wrapAxisTickLabels(
  selection: AxisTickSelection,
  options: WrapAxisTickLabelOptions = {},
) {
  const {
    maxCharsPerLine = 18,
    lineHeightEm = 1.05,
    rotationDeg = -35,
    maxLines = 4,
  } = options

  selection.each(function () {
    const text = d3.select(this)
    const rawLabel = text.text().trim()
    const lines = wrapLabel(rawLabel, maxCharsPerLine, maxLines)
    text.text(null)
    lines.forEach((line, index) => {
      text
        .append('tspan')
        .attr('x', 0)
        .attr('dy', index === 0 ? '0.71em' : `${lineHeightEm}em`)
        .text(line)
    })
    text.attr('transform', `rotate(${rotationDeg})`).style('text-anchor', 'end')
  })
}

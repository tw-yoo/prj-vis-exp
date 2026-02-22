import { DrawMark, type DrawOp } from '../../draw/types.ts'
import { draw, ops } from '../../../operation/build/authoring'

const DEFAULT_HIGHLIGHT_COLOR = '#ef4444'
const DEFAULT_TEXT_COLOR = '#111827'

function formatNumber(value: number, precision?: number) {
  if (!Number.isFinite(value)) return ''
  if (typeof precision === 'number' && Number.isFinite(precision)) return value.toFixed(precision)
  if (Number.isInteger(value)) return String(value)
  return String(Number(value.toFixed(2)))
}

export function makeHighlightOp(target: string, color?: string): DrawOp {
  return ops.draw.highlight(undefined, draw.select.markKeys(DrawMark.Rect, target), color ?? DEFAULT_HIGHLIGHT_COLOR)
}

export function makeTextOp(target: string, value: number, color?: string, precision?: number): DrawOp {
  const text = formatNumber(value, precision)
  if (!text) return makeHighlightOp(target, color)
  return ops.draw.text(
    undefined,
    draw.select.markKeys(DrawMark.Rect, target),
    draw.textSpec.anchor(
      text,
      draw.style.text(color ?? DEFAULT_TEXT_COLOR, 12, 'bold'),
    ),
  )
}

export function buildHighlightPlan(targets: string[], color?: string): DrawOp[] {
  return targets.map((target) => makeHighlightOp(target, color))
}

export function buildTextPlan(
  result: Array<{ target: string; value: number }>,
  color?: string,
  precision?: number,
): DrawOp[] {
  return result.map((entry) => makeTextOp(entry.target, entry.value, color, precision))
}

import { DrawMark, type DrawOp } from '../../draw/types.ts'
import { draw, ops } from '../../../operation/build/authoring'

const DEFAULT_HIGHLIGHT_COLOR = '#ef4444'
const DEFAULT_TEXT_COLOR = '#111827'

export function formatDrawNumber(value: number, precision?: number) {
  if (!Number.isFinite(value)) return ''
  const digits = typeof precision === 'number' && Number.isFinite(precision)
    ? Math.max(0, Math.min(2, Math.trunc(precision)))
    : 2
  let text = value.toFixed(digits)
  text = text.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '')
  if (text === '-0') return '0'
  return text
}

export function makeHighlightOp(target: string, color?: string): DrawOp {
  return ops.draw.highlight(undefined, draw.select.markKeys(DrawMark.Rect, target), color ?? DEFAULT_HIGHLIGHT_COLOR)
}

export function makeTextOp(target: string, value: number, color?: string, precision?: number): DrawOp {
  const text = formatDrawNumber(value, precision)
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

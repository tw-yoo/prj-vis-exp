import { OperationOp } from '../../../types'
import { DrawAction, DrawMark, DrawTextModes, type DrawOp } from '../../draw/types.ts'

const DEFAULT_HIGHLIGHT_COLOR = '#ef4444'
const DEFAULT_TEXT_COLOR = '#111827'

function formatNumber(value: number, precision?: number) {
  if (!Number.isFinite(value)) return ''
  if (typeof precision === 'number' && Number.isFinite(precision)) return value.toFixed(precision)
  if (Number.isInteger(value)) return String(value)
  return String(Number(value.toFixed(2)))
}

export function makeHighlightOp(target: string, color?: string): DrawOp {
  return {
    op: OperationOp.Draw,
    action: DrawAction.Highlight,
    select: { keys: [target], mark: DrawMark.Rect },
    style: { color: color ?? DEFAULT_HIGHLIGHT_COLOR },
  }
}

export function makeTextOp(target: string, value: number, color?: string, precision?: number): DrawOp {
  const text = formatNumber(value, precision)
  if (!text) return makeHighlightOp(target, color)
  return {
    op: OperationOp.Draw,
    action: DrawAction.Text,
    select: { keys: [target], mark: DrawMark.Rect },
    text: {
      value: text,
      mode: DrawTextModes.Anchor,
      style: { color: color ?? DEFAULT_TEXT_COLOR, fontSize: 12, fontWeight: 'bold' },
    },
  }
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

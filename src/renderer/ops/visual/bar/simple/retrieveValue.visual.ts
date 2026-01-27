import { OperationOp, type DatumValue, type OperationSpec } from '../../../../../types'
import type { DrawOp } from '../../../../draw/types'
import { DrawAction, DrawMark, DrawTextModes } from '../../../../draw/types'

type RetrieveValueVisualOp = OperationSpec & {
  op: typeof OperationOp.RetrieveValue
  visual?: {
    highlightColor?: string
    textColor?: string
    precision?: number
  }
}

function formatNumber(value: number, precision?: number) {
  if (!Number.isFinite(value)) return ''
  if (typeof precision === 'number' && Number.isFinite(precision)) return value.toFixed(precision)
  if (Number.isInteger(value)) return String(value)
  return String(Number(value.toFixed(2)))
}

export function buildSimpleBarRetrieveValueDrawPlan(result: DatumValue[], op: RetrieveValueVisualOp): DrawOp[] {
  const highlightColor = op.visual?.highlightColor ?? '#ef4444'
  const textColor = op.visual?.textColor ?? '#111827'
  const precision = op.visual?.precision ?? op.precision

  const plan: DrawOp[] = []
  const targets: string[] = []
  const seen = new Set<string>()
  const textByTarget: Record<string, string> = {}
  for (const d of result) {
    const t = String(d.target)
    if (!seen.has(t)) {
      seen.add(t)
      targets.push(t)
    }
    textByTarget[t] = formatNumber(d.value, precision)
  }

  for (const target of targets) {
    plan.push({
      op: OperationOp.Draw,
      action: DrawAction.Highlight,
      select: { keys: [target], mark: DrawMark.Rect },
      style: { color: highlightColor },
    })

    const textValue = textByTarget[target]
    if (!textValue) continue

    plan.push({
      op: OperationOp.Draw,
      action: DrawAction.Text,
      select: { keys: [target], mark: DrawMark.Rect },
      text: {
        value: textValue,
        mode: DrawTextModes.Anchor,
        style: { color: textColor, fontSize: 12, fontWeight: 'bold' },
      },
    })
  }
  return plan
}

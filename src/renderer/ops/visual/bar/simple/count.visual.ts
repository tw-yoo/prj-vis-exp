import type { AutoDrawPlanContext } from '../../../../ops/common/executeDataOp.ts'
import type { DatumValue } from '../../../../../types'
import { DrawMark, DrawTextModes, type DrawOp } from '../../../../draw/types'
import type { OpCountSpec } from '../../../../../types/operationSpecs.ts'
import { drawOps } from '../../../../draw/drawOps'

const DEFAULT_HIGHLIGHT_COLOR = '#ef4444'
const DEFAULT_TEXT_COLOR = '#111827'
const DEFAULT_FONT_SIZE = 12
const DEFAULT_FONT_WEIGHT = 'bold'

export function buildSimpleBarCountDrawPlan(
  _result: DatumValue[],
  op: OpCountSpec,
  context?: AutoDrawPlanContext,
): DrawOp[] | null {
  const orderedData = context?.prevWorking ?? []
  if (!orderedData.length) return null
  const highlightColor = DEFAULT_HIGHLIGHT_COLOR
  const textColor = DEFAULT_TEXT_COLOR
  const plan: DrawOp[] = []
  orderedData.forEach((datum, index) => {
    const target = String(datum.target)
    plan.push(
      drawOps.highlight({
        chartId: op.chartId,
        select: { keys: [target], mark: DrawMark.Rect },
        style: { color: highlightColor },
      }),
    )
    plan.push(
      drawOps.text({
        chartId: op.chartId,
        select: { keys: [target], mark: DrawMark.Rect },
        text: {
          value: String(index + 1),
          mode: DrawTextModes.Anchor,
          style: {
            color: textColor,
            fontSize: DEFAULT_FONT_SIZE,
            fontWeight: DEFAULT_FONT_WEIGHT,
          },
        },
      }),
    )
  })
  return plan
}

import type { AutoDrawPlanContext } from '../../../../ops/common/executeDataOp.ts'
import type { DatumValue } from '../../../../../types'
import { DrawMark, type DrawOp } from '../../../../draw/types'
import type { OpCountSpec } from '../../../../../types/operationSpecs.ts'
import { draw, ops } from '../../../../../operation/build/authoring'

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
      ops.draw.highlight(op.chartId, draw.select.markKeys(DrawMark.Rect, target), highlightColor),
    )
    plan.push(
      ops.draw.text(
        op.chartId,
        draw.select.markKeys(DrawMark.Rect, target),
        draw.textSpec.anchor(
          String(index + 1),
          draw.style.text(textColor, DEFAULT_FONT_SIZE, DEFAULT_FONT_WEIGHT),
        ),
      ),
    )
  })
  return plan
}

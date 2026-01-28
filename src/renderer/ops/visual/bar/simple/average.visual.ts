import type { AutoDrawPlanContext } from '../../../../ops/common/executeDataOp.ts'
import { OperationOp, type DatumValue } from '../../../../../types'
import type { DrawOp } from '../../../../draw/types'
import { DrawAction, DrawLineModes } from '../../../../draw/types'
import type {OpAverageSpec} from "../../../../../types/operationSpecs.ts";

const DEFAULT_LINE_COLOR = '#0ea5e9'
const DEFAULT_LINE_OPACITY = 0.8
const DEFAULT_LINE_WIDTH = 2

export function buildSimpleBarAverageDrawPlan(
  result: DatumValue[],
  op: OpAverageSpec,
  _context?: AutoDrawPlanContext,
): DrawOp[] | null {
  if (!result.length) return null
  const datum = result[0]
  const value = datum.value
  if (!Number.isFinite(value)) return null
  return [
    {
      op: OperationOp.Draw,
      action: DrawAction.Line,
      chartId: op.chartId,
      line: {
        mode: DrawLineModes.HorizontalFromY,
        hline: { y: value },
        style: {
          stroke: DEFAULT_LINE_COLOR,
          strokeWidth: DEFAULT_LINE_WIDTH,
          opacity: DEFAULT_LINE_OPACITY,
        },
      },
    },
  ]
}

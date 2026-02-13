import type { AutoDrawPlanContext } from '../../../../ops/common/executeDataOp.ts'
import type { DatumValue } from '../../../../../types'
import type { DrawLineSpec, DrawOp } from '../../../../draw/types'
import { DrawLineModes } from '../../../../draw/types'
import type { OpAverageSpec } from '../../../../../types/operationSpecs.ts'
import { drawOps } from '../../../../draw/drawOps'

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
    drawOps.line({
      chartId: op.chartId,
      line: {
        mode: DrawLineModes.HorizontalFromY,
        hline: { y: value },
        style: {
          stroke: DEFAULT_LINE_COLOR,
          strokeWidth: DEFAULT_LINE_WIDTH,
          opacity: DEFAULT_LINE_OPACITY,
        }
      } satisfies DrawLineSpec,
    }),
  ]
}

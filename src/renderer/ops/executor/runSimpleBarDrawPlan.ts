import { clearAnnotations, getChartContext } from '../../common/d3Helpers'
import { BarDrawHandler } from '../../draw/BarDrawHandler'
import type { DrawOp } from '../../draw/types'
import { DrawAction } from '../../draw/types'
import { runGenericDraw } from '../../draw/genericDraw'

export async function runSimpleBarDrawPlan(
  container: HTMLElement,
  drawPlan: DrawOp[],
  options: { clearBefore?: boolean; handler?: BarDrawHandler } = {},
) {
  const ctx = getChartContext(container)
  if (options.clearBefore) {
    clearAnnotations(ctx.svg)
  }

  const handler = options.handler ?? new BarDrawHandler(container)
  for (const op of drawPlan) {
    handler.run(op)
    if (op.action === DrawAction.Text || op.action === DrawAction.Rect || op.action === DrawAction.Line) {
      runGenericDraw(container, op as any)
    }
  }
}

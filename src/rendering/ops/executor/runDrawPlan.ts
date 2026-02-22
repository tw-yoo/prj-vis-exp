import * as d3 from 'd3'
import { clearAnnotations } from '../../common/d3Helpers.ts'
import { runGenericDraw } from '../../draw/genericDraw.ts'
import type { DrawOp } from '../../draw/types.ts'
import { DrawAction } from '../../draw/types.ts'
import { runSleepOp } from '../common/sleepOp.ts'

const ACTIONS_REQUIRING_GENERIC = new Set<DrawAction>([DrawAction.Text, DrawAction.Rect, DrawAction.Line])

type HandlerLike = {
  run: (op: DrawOp) => void
}

export type RunDrawPlanOptions<H extends HandlerLike> = {
  container: HTMLElement
  handler: H
  drawPlan: DrawOp[]
  clearBefore?: boolean
  svgSelector?: string
}

export async function runDrawPlan<H extends HandlerLike>(options: RunDrawPlanOptions<H>) {
  const { container, drawPlan, handler, clearBefore, svgSelector } = options
  if (!handler || !drawPlan || drawPlan.length === 0) return

  if (clearBefore) {
    const svgTarget = svgSelector ? d3.select(container).select(svgSelector) : d3.select(container).select('svg')
    if (!svgTarget.empty()) {
      clearAnnotations(svgTarget)
    }
  }

  for (const op of drawPlan) {
    if (op.action === DrawAction.Sleep) {
      await runSleepOp(op)
      continue
    }
    handler.run(op)
    if (ACTIONS_REQUIRING_GENERIC.has(op.action ?? ('' as DrawAction))) {
      runGenericDraw(container, op as DrawOp)
    }
  }
}

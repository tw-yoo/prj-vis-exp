import * as d3 from 'd3'
import { clearAnnotations } from '../../common/d3Helpers.ts'
import { runGenericDraw } from '../../draw/genericDraw.ts'
import type { DrawOp } from '../../draw/types.ts'
import { DrawAction } from '../../draw/types.ts'
import { MIN_DRAW_DURATION_MS } from '../../draw/animationPolicy.ts'
import { buildExecutionPhases } from '../common/timeline'

// Chart draw handlers already implement text/rect/line; generic fallback duplicates annotations.
const ACTIONS_REQUIRING_GENERIC = new Set<DrawAction>()
const STRUCTURAL_ACTIONS = new Set<DrawAction>([
  DrawAction.Clear,
  DrawAction.Filter,
  DrawAction.Sort,
  DrawAction.Split,
  DrawAction.Unsplit,
  DrawAction.Sum,
])

type HandlerLike = {
  run: (op: DrawOp) => void | Promise<void>
}

export type RunDrawPlanOptions<H extends HandlerLike> = {
  container: HTMLElement
  handler: H
  drawPlan: DrawOp[]
  clearBefore?: boolean
  svgSelector?: string
}

function buildDrawPlanPhases(drawPlan: DrawOp[]): DrawOp[][] {
  const hasNodeId = drawPlan.some((op) => !!op.meta?.nodeId || typeof (op as { id?: unknown }).id === 'string')
  const hasInputs = drawPlan.some((op) => Array.isArray(op.meta?.inputs) && (op.meta?.inputs?.length ?? 0) > 0)
  if (!hasNodeId || !hasInputs) {
    return drawPlan.map((op) => [op])
  }

  const normalized: DrawOp[] = drawPlan.map((op, index) => {
    if (op.meta?.nodeId || typeof (op as { id?: unknown }).id === 'string') return op
    return { ...op, id: `draw_${index}` }
  })
  const topoPhases = buildExecutionPhases(normalized as any) as DrawOp[][]
  const out: DrawOp[][] = []
  topoPhases.forEach((phase) => {
    if (phase.length <= 1) {
      out.push(phase)
      return
    }
    let buffer: DrawOp[] = []
    const flush = () => {
      if (!buffer.length) return
      out.push(buffer)
      buffer = []
    }
    phase.forEach((op) => {
      if (STRUCTURAL_ACTIONS.has(op.action)) {
        flush()
        out.push([op])
        return
      }
      buffer.push(op)
    })
    flush()
  })
  return out
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

  const phases = buildDrawPlanPhases(drawPlan)
  for (const phase of phases) {
    await Promise.all(
      phase.map(async (op) => {
        const startedAt = Date.now()
        await handler.run(op)
        if (ACTIONS_REQUIRING_GENERIC.has(op.action ?? ('' as DrawAction))) {
          runGenericDraw(container, op as DrawOp)
        }
        const elapsed = Date.now() - startedAt
        if (elapsed < MIN_DRAW_DURATION_MS) {
          await new Promise((resolve) => setTimeout(resolve, MIN_DRAW_DURATION_MS - elapsed))
        }
      }),
    )
  }
}

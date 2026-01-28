import { SimpleLineDrawHandler } from '../../draw/line/SimpleLineDrawHandler.ts'
import type { DrawOp } from '../../draw/types.ts'
import { runDrawPlan } from './runDrawPlan'

export async function runSimpleLineDrawPlan(
  container: HTMLElement,
  drawPlan: DrawOp[],
  options?: { clearBefore?: boolean; handler?: SimpleLineDrawHandler },
) {
  if (!options?.handler) {
    options = { ...options, handler: new SimpleLineDrawHandler(container) }
  }
  await runDrawPlan({
    container,
    handler: options.handler!,
    drawPlan,
    clearBefore: options.clearBefore,
  })
}

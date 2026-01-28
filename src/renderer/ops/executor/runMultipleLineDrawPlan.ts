import type { DrawOp } from '../../draw/types.ts'
import { MultiLineDrawHandler } from '../../draw/line/MultiLineDrawHandler.ts'
import { runDrawPlan } from './runDrawPlan'

export async function runMultipleLineDrawPlan(
  container: HTMLElement,
  drawPlan: DrawOp[],
  options?: { clearBefore?: boolean; handler?: MultiLineDrawHandler },
) {
  if (!options?.handler) {
    options = { ...options, handler: new MultiLineDrawHandler(container) }
  }
  await runDrawPlan({
    container,
    handler: options.handler!,
    drawPlan,
    clearBefore: options.clearBefore,
  })
}

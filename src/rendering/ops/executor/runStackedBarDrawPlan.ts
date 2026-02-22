import type { DrawOp } from '../../draw/types.ts'
import { StackedBarDrawHandler } from '../../draw/bar/StackedBarDrawHandler.ts'
import { runDrawPlan } from './runDrawPlan'

export async function runStackedBarDrawPlan(
  container: HTMLElement,
  drawPlan: DrawOp[],
  options?: { clearBefore?: boolean; handler?: StackedBarDrawHandler },
) {
  if (!options?.handler) {
    options = { ...options, handler: new StackedBarDrawHandler(container) }
  }
  await runDrawPlan({
    container,
    handler: options.handler!,
    drawPlan,
    clearBefore: options.clearBefore,
  })
}

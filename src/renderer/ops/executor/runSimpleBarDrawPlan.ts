import { BarDrawHandler } from '../../draw/BarDrawHandler'
import type { DrawOp } from '../../draw/types'
import { runDrawPlan } from './runDrawPlan'

export async function runSimpleBarDrawPlan(
  container: HTMLElement,
  drawPlan: DrawOp[],
  options?: { clearBefore?: boolean; handler?: BarDrawHandler },
) {
  if (!options?.handler) {
    options = { ...options, handler: new BarDrawHandler(container) }
  }
  await runDrawPlan({
    container,
    handler: options.handler!,
    drawPlan,
    clearBefore: options.clearBefore,
  })
}

import type { DrawOp } from '../../draw/types.ts'
import { GroupedBarDrawHandler } from '../../draw/bar/GroupedBarDrawHandler.ts'
import { runDrawPlan } from './runDrawPlan'

export async function runGroupedBarDrawPlan(
  container: HTMLElement,
  drawPlan: DrawOp[],
  options?: { clearBefore?: boolean; handler?: GroupedBarDrawHandler },
) {
  if (!options?.handler) {
    options = { ...options, handler: new GroupedBarDrawHandler(container) }
  }
  await runDrawPlan({
    container,
    handler: options.handler!,
    drawPlan,
    clearBefore: options.clearBefore,
  })
}

import type { ChartSpec } from '../../../domain/chart'
import type { OpsPlanGroups, OpsPlanInput } from './types'
import { buildOpsPlanContext } from './context'
import { normalizeOpsPlan } from './normalize'

export async function runOpsPlan(
  container: HTMLElement,
  spec: ChartSpec,
  plan: OpsPlanInput,
): Promise<OpsPlanGroups> {
  const context = buildOpsPlanContext(container, spec)
  return normalizeOpsPlan(plan, context)
}

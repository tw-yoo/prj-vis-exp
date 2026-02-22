import type { VegaLiteSpec } from '../../chartRenderer'
import type { OpsPlanGroups, OpsPlanInput } from './types'
import { buildOpsPlanContext } from './context'
import { normalizeOpsPlan } from './normalize'

export async function runOpsPlan(
  container: HTMLElement,
  spec: VegaLiteSpec,
  plan: OpsPlanInput,
): Promise<OpsPlanGroups> {
  const context = buildOpsPlanContext(container, spec)
  return normalizeOpsPlan(plan, context)
}

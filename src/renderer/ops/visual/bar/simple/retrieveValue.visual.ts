import type { AutoDrawPlanContext } from '../../../../ops/common/executeDataOp.ts'
import { OperationOp, type DatumValue } from '../../../../../types'
import type { DrawOp } from '../../../../draw/types'
import { buildHighlightPlan, buildTextPlan } from '../../helpers.ts'
import type {OpRetrieveValueSpec} from "../../../../../types/operationSpecs.ts";

export function buildSimpleBarRetrieveValueDrawPlan(
  result: DatumValue[],
  op: OpRetrieveValueSpec,
  _context?: AutoDrawPlanContext,
): DrawOp[] {
  const precision = op.precision
  const highlightColor = op.visual?.highlightColor
  const textColor = op.visual?.textColor

  const targets: string[] = []
  const seen = new Set<string>()
  const entries: Array<{ target: string; value: number }> = []

  for (const datum of result) {
    const target = String(datum.target)
    if (!seen.has(target)) {
      seen.add(target)
      targets.push(target)
    }
    entries.push({ target, value: datum.value })
  }

  const plan = buildHighlightPlan(targets, highlightColor)
  plan.push(...buildTextPlan(entries, textColor, precision ?? undefined))
  return plan
}

import type { AutoDrawPlanContext } from '../../../../ops/common/executeDataOp.ts'
import { type DatumValue } from '../../../../../types'
import type { DrawOp } from '../../../../draw/types'
import { buildHighlightPlan, buildTextPlan } from '../../helpers.ts'
import type {OpFindExtremumSpec} from "../../../../../types/operationSpecs.ts";

const DEFAULT_EXTREMUM_HIGHLIGHT_COLOR = '#ef4444'
const DEFAULT_EXTREMUM_TEXT_COLOR = '#111827'

export function buildSimpleBarExtremumDrawPlan(
result: DatumValue[],
  op: OpFindExtremumSpec,
  _context?: AutoDrawPlanContext,
): DrawOp[] | null {
  if (!result.length) return null
  const highlightColor = DEFAULT_EXTREMUM_HIGHLIGHT_COLOR
  const textColor = DEFAULT_EXTREMUM_TEXT_COLOR
  const targets = Array.from(new Set(result.map((datum) => String(datum.target))))
  const highlightPlan = buildHighlightPlan(targets, highlightColor)
  const valueEntries = result.map((datum) => ({
    target: String(datum.target),
    value: datum.value,
  }))
  const textPlan = buildTextPlan(valueEntries, textColor)
  return [...highlightPlan, ...textPlan]
}

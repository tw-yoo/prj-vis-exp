import type { AutoDrawPlanContext } from '../../../../ops/common/executeDataOp.ts'
import { OperationOp, type DatumValue } from '../../../../../types'
import type { DrawOp } from '../../../../draw/types'
import { buildHighlightPlan, buildTextPlan } from '../../helpers.ts'
import type {OpNthSpec} from "../../../../../types/operationSpecs.ts";

const DEFAULT_NTH_HIGHLIGHT_COLOR = '#ef4444'
const DEFAULT_NTH_TEXT_COLOR = '#111827'

export function buildSimpleBarNthDrawPlan(
  result: DatumValue[],
  op: OpNthSpec,
  _context?: AutoDrawPlanContext,
): DrawOp[] | null {
  if (!result.length) return null
  const highlightColor = DEFAULT_NTH_HIGHLIGHT_COLOR
  const textColor = DEFAULT_NTH_TEXT_COLOR
  const targets = Array.from(new Set(result.map((datum) => String(datum.target))))
  const highlightPlan = buildHighlightPlan(targets, highlightColor)
  const textEntries = result.map((datum) => ({ target: String(datum.target), value: datum.value }))
  const textPlan = buildTextPlan(textEntries, textColor)
  const withChartId = (op.chartId ? [...highlightPlan, ...textPlan].map((drawOp) => ({ ...drawOp, chartId: op.chartId })) : [...highlightPlan, ...textPlan])
  return withChartId
}

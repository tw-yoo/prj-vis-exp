import { makeBarGroupAverageApplier } from '../barGroup/average'
import type { GroupedBarChartInstance } from '../../../rendering-new/instances/groupedBarInstance'
import { FILTER_ANNOTATION_CLASS } from './filter'

export { AVERAGE_ANNOTATION_CLASS } from '../barGroup/average'

/**
 * grouped-bar average applier — native (shared logic in `barGroup/average.ts`).
 *
 * Group-scoped averages convert the grouped chart to a simple bar of that group
 * (signalled via `storeDerivedChartState`, so the swap survives the next op) and
 * draw the average line on it; otherwise a global average line is drawn across
 * the panels. Either way the line is stamped with the result-ref so a
 * cross-surface diff can resolve it.
 */
export const averageApplier = makeBarGroupAverageApplier<GroupedBarChartInstance>({
  filterClass: FILTER_ANNOTATION_CLASS,
})

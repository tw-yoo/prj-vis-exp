import { makeBarGroupAverageApplier } from '../barGroup/average'
import type { StackedBarChartInstance } from '../../../rendering-new/instances/stackedBarInstance'
import { FILTER_ANNOTATION_CLASS } from './filter'

export { AVERAGE_ANNOTATION_CLASS } from '../barGroup/average'

/**
 * stacked-bar average applier — native (shared logic in `barGroup/average.ts`).
 *
 * Group-scoped averages convert the stacked chart to a simple bar of that
 * group's single series (via `storeDerivedChartState`) and draw the average on
 * it; otherwise a global average line is drawn. The line is stamped with the
 * result-ref so a cross-surface diff can resolve it.
 */
export const averageApplier = makeBarGroupAverageApplier<StackedBarChartInstance>({
  filterClass: FILTER_ANNOTATION_CLASS,
})

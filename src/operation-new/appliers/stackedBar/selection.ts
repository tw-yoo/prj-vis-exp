import {
  makeBarCountApplier,
  makeBarFindExtremumApplier,
  makeBarNthApplier,
} from '../barGroup/selection'
import type { StackedBarChartInstance } from '../../../rendering-new/instances/stackedBarInstance'
import { FILTER_ANNOTATION_CLASS } from './filter'

const EXTREMUM_CLASS = 'operation-next-stacked-bar-extremum'
const NTH_CLASS = 'operation-next-stacked-bar-nth'
const COUNT_CLASS = 'operation-next-stacked-bar-count'

/** stacked-bar findExtremum / nth / count — native (shared `barGroup/selection.ts`). */
export const findExtremumApplier = makeBarFindExtremumApplier<StackedBarChartInstance>(
  EXTREMUM_CLASS,
  FILTER_ANNOTATION_CLASS,
)
export const nthApplier = makeBarNthApplier<StackedBarChartInstance>(NTH_CLASS, FILTER_ANNOTATION_CLASS)
export const countApplier = makeBarCountApplier<StackedBarChartInstance>({
  cssClass: COUNT_CLASS,
  filterClass: FILTER_ANNOTATION_CLASS,
})

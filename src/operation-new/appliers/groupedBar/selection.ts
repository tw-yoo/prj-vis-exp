import {
  makeBarCountApplier,
  makeBarFindExtremumApplier,
  makeBarNthApplier,
} from '../barGroup/selection'
import type { GroupedBarChartInstance } from '../../../rendering-new/instances/groupedBarInstance'
import { FILTER_ANNOTATION_CLASS } from './filter'

const EXTREMUM_CLASS = 'operation-next-grouped-bar-extremum'
const NTH_CLASS = 'operation-next-grouped-bar-nth'
const COUNT_CLASS = 'operation-next-grouped-bar-count'

/** grouped-bar findExtremum / nth / count — native (shared `barGroup/selection.ts`). */
export const findExtremumApplier = makeBarFindExtremumApplier<GroupedBarChartInstance>(
  EXTREMUM_CLASS,
  FILTER_ANNOTATION_CLASS,
)
export const nthApplier = makeBarNthApplier<GroupedBarChartInstance>(NTH_CLASS, FILTER_ANNOTATION_CLASS)
export const countApplier = makeBarCountApplier<GroupedBarChartInstance>({
  cssClass: COUNT_CLASS,
  filterClass: FILTER_ANNOTATION_CLASS,
})

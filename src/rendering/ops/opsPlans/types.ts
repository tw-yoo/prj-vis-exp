import type { DatumValue, OperationSpec } from '../../../types'
import type { ChartTypeValue, ChartSpec } from '../../../domain/chart'

export type OpsPlanGroups = OperationSpec[][]
export type OpsPlanObject = Record<string, OperationSpec[]>

export type OpsPlanContext = {
  container: HTMLElement
  spec: ChartSpec
  chartType: ChartTypeValue | null
  workingData: DatumValue[]
}

export type OpsPlanBuilder = (context: OpsPlanContext) => OpsPlanGroups | OpsPlanObject
export type OpsPlanInput = OpsPlanGroups | OpsPlanObject | OpsPlanBuilder

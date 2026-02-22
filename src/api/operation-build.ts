import { BuildOpsUseCase } from '../application/usecases/buildOpsUseCase'
import {
  exportOps,
  importOpsBuilderStateFromJsonText,
  validateOps,
} from '../operation/build'
import type { ChartTypeValue } from '../domain/chart'
import type { OpsBuilderState } from '../operation/build/builder-core/types'

const buildOpsUseCase = new BuildOpsUseCase<OpsBuilderState, ChartTypeValue | null>({
  exportOps,
  importOpsBuilderStateFromJsonText,
  validateOps,
})

export const buildOps = {
  export: (state: OpsBuilderState, chartType: ChartTypeValue | null) => buildOpsUseCase.export(state, chartType),
  import: (jsonText: string, chartType: ChartTypeValue | null) => buildOpsUseCase.import(jsonText, chartType),
  validate: (state: OpsBuilderState, chartType: ChartTypeValue | null) => buildOpsUseCase.validate(state, chartType),
} as const

export {
  collectOpsBuilderOptionSources,
  exportOps,
  getEmptyOptionSources,
  importOpToBuilderBlock,
  importOpsBuilderStateFromJsonText,
  makeId,
  operationRegistry,
  validateOps,
  type OpsBuilderState,
  type OpsBuilderOptionSources,
  type FieldSchema,
  type FieldOptionsSource,
} from '../operation/build'

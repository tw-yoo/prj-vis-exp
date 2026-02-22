import type { OperationSpec } from '../../domain/operation/types'

export type BuildOpsResult = {
  runnableGroups: OperationSpec[][]
  json: string
}

export type BuildOpsDeps<TState, TChartType> = {
  exportOps: (state: TState, chartType: TChartType) => BuildOpsResult
  importOpsBuilderStateFromJsonText: (jsonText: string, chartType: TChartType) => TState
  validateOps: (state: TState, chartType: TChartType) => Record<string, string>
}

export class BuildOpsUseCase<TState, TChartType> {
  private readonly deps: BuildOpsDeps<TState, TChartType>

  constructor(deps: BuildOpsDeps<TState, TChartType>) {
    this.deps = deps
  }

  export(state: TState, chartType: TChartType) {
    return this.deps.exportOps(state, chartType)
  }

  import(jsonText: string, chartType: TChartType) {
    return this.deps.importOpsBuilderStateFromJsonText(jsonText, chartType)
  }

  validate(state: TState, chartType: TChartType) {
    return this.deps.validateOps(state, chartType)
  }
}

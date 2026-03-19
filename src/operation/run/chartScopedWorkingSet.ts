import type { DatumValue, OperationSpec } from '../../types'

type SelectOperationInput = (args: {
  operation: OperationSpec
  currentWorking: DatumValue[]
  chartScoped: DatumValue[]
}) => DatumValue[]

export function createChartScopedWorkingSet(args: {
  getChartScopedData: (chartId: string, currentWorking: DatumValue[]) => DatumValue[]
  selectOperationInput?: SelectOperationInput
}) {
  const chartWorking = new Map<string, DatumValue[]>()
  const resolveScopeId = (operation: OperationSpec) => {
    const surfaceId = typeof operation.surfaceId === 'string' && operation.surfaceId.trim().length > 0
      ? operation.surfaceId.trim()
      : null
    if (surfaceId) return surfaceId
    const chartId = typeof operation.chartId === 'string' && operation.chartId.trim().length > 0
      ? operation.chartId.trim()
      : null
    return chartId
  }

  const getOperationInput = (operation: OperationSpec, currentWorking: DatumValue[]) => {
    const chartId = resolveScopeId(operation)
    const chartScoped = chartId
      ? chartWorking.get(chartId) ?? args.getChartScopedData(chartId, currentWorking)
      : currentWorking

    if (chartId && !chartWorking.has(chartId)) {
      chartWorking.set(chartId, chartScoped)
    }

    if (!args.selectOperationInput) {
      return chartScoped
    }

    return args.selectOperationInput({
      operation,
      currentWorking,
      chartScoped,
    })
  }

  const handleOperationResult = (operation: OperationSpec, result: DatumValue[], currentWorking: DatumValue[]) => {
    const chartId = resolveScopeId(operation)
    if (chartId) {
      chartWorking.set(chartId, result)
      return currentWorking
    }
    chartWorking.clear()
    return result
  }

  return {
    getOperationInput,
    handleOperationResult,
    clearChartWorking: () => chartWorking.clear(),
  }
}

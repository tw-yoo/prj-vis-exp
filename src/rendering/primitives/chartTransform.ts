import { ChartType, type ChartTypeValue } from '../../domain/chart'
import { OperationOp, type OperationOp as OperationName } from '../../domain/operation/types'
import { primitiveDiff, type PrimitiveImpl } from './types'

export type TransformId =
  | 'stacked-to-grouped'
  | 'grouped-to-simple'
  | 'to-difference-bar'
  | 'multi-to-difference-line'
  | 'stacked-to-simple'
  | 'line-to-bar'

export interface ChartTransformParams {
  from: ChartTypeValue
  to: ChartTypeValue
  withTransition: boolean
}

/** F4 chart-transform primitive descriptor; concrete transforms remain renderer-specific. */
export const chartTransformPrimitive: PrimitiveImpl<ChartTransformParams> = {
  async apply() {
    return Promise.resolve()
  },
  async remove() {
    return Promise.resolve()
  },
  diff: primitiveDiff,
}

export function chartTransformSemanticKey(params: ChartTransformParams): string {
  return `f4:transform:from=${params.from}:to=${params.to}`
}

export function selectTransformation(chartType: ChartTypeValue, opName: OperationName | string | undefined): TransformId | null {
  if (chartType === ChartType.STACKED_BAR && (opName === OperationOp.Diff || opName === OperationOp.PairDiff)) {
    return 'stacked-to-grouped'
  }
  if (chartType === ChartType.MULTI_LINE && opName === OperationOp.PairDiff) {
    return 'multi-to-difference-line'
  }
  return null
}

import type { ChartTypeValue } from '../domain/chart'
import { OperationOp, type OperationOp as OperationName } from '../domain/operation/types'

export type SalienceStrategy = 'dim' | 'remove' | 'grayscale'
export type AnnotationStrategy = 'in-place' | 'derive-chart'
export type ArrowPlacement = 'right-edge' | 'inline'
export type DensityMode = 'all' | 'derive-chart' | 'selective'

export interface ChartTypeOpRule<TValue> {
  chartType?: ChartTypeValue
  op?: OperationName
  value: TValue
}

export interface TensionPolicy {
  salienceStrategy: {
    default: SalienceStrategy
    perOp?: Partial<Record<OperationName, SalienceStrategy>>
  }
  annotationStrategy: {
    default: AnnotationStrategy
    rules?: ChartTypeOpRule<AnnotationStrategy>[]
  }
  arrowPlacement: {
    default: ArrowPlacement
    opOverrides?: Partial<Record<OperationName, ArrowPlacement>>
  }
  densityMode: {
    default: DensityMode
    threshold?: { xCount: number }
  }
  rescaleAfterIsolation: {
    default: boolean
    reversible: boolean
  }
}

export const DEFAULT_POLICY: TensionPolicy = {
  salienceStrategy: {
    default: 'dim',
  },
  annotationStrategy: {
    default: 'in-place',
  },
  arrowPlacement: {
    default: 'right-edge',
    opOverrides: {
      [OperationOp.PairDiff]: 'inline',
    },
  },
  densityMode: {
    default: 'all',
  },
  rescaleAfterIsolation: {
    default: true,
    reversible: true,
  },
}

import type { ChartTypeValue } from '../domain/chart'
import { OperationOp, type OperationOp as OperationName } from '../domain/operation/types'
import type { TensionFrameConfig } from './visualizationFrame'
import type { OperationNode } from './operationTree'

export type AnnotationStrategy = TensionFrameConfig['annotationStrategy']
export type ArrowPlacement = TensionFrameConfig['arrowPlacement']
export type DensityMode = TensionFrameConfig['densityMode']
export type SalienceStrategy = TensionFrameConfig['salienceStrategy']

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

export function resolveFrameConfig(
  policy: TensionPolicy | undefined,
  node: OperationNode,
  chartType: ChartTypeValue,
): TensionFrameConfig {
  const resolvedPolicy = policy ?? DEFAULT_POLICY
  const opName = node.op.op as OperationName | undefined
  return {
    salienceStrategy: resolveOpValue(resolvedPolicy.salienceStrategy.default, resolvedPolicy.salienceStrategy.perOp, opName),
    annotationStrategy: resolveRuleValue(resolvedPolicy.annotationStrategy.default, resolvedPolicy.annotationStrategy.rules, chartType, opName),
    arrowPlacement: resolveOpValue(resolvedPolicy.arrowPlacement.default, resolvedPolicy.arrowPlacement.opOverrides, opName),
    densityMode: resolvedPolicy.densityMode.default,
    rescaleAfterIsolation: resolvedPolicy.rescaleAfterIsolation.default,
  }
}

function resolveOpValue<TValue>(
  fallback: TValue,
  overrides: Partial<Record<OperationName, TValue>> | undefined,
  opName: OperationName | undefined,
) {
  return opName && overrides?.[opName] !== undefined ? overrides[opName] : fallback
}

function resolveRuleValue<TValue>(
  fallback: TValue,
  rules: ChartTypeOpRule<TValue>[] | undefined,
  chartType: ChartTypeValue,
  opName: OperationName | undefined,
) {
  const matched = rules?.find((rule) => {
    const chartMatches = !rule.chartType || rule.chartType === chartType
    const opMatches = !rule.op || rule.op === opName
    return chartMatches && opMatches
  })
  return matched?.value ?? fallback
}

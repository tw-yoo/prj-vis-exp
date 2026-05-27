import { sumData } from '../../../domain/operation/dataOps'
import { OperationOp } from '../../../domain/operation/types'
import { formatOperationValue } from '../../../operation-next/primitives/formatValue'
import type { OperationApplier, ApplierArgs, ApplierResult } from '../../applier'
import type { SimpleBarChartInstance } from '../../../rendering-new/instances/simpleBarInstance'
import { applyAnnotationContextFade } from '../../primitives/contextFade'
import { drawResultBadge } from '../../primitives/drawResultBadge'
import { FILTER_ANNOTATION_CLASS } from './filter'

export const SUM_ANNOTATION_CLASS = 'operation-next-bar-sum'

export const sumApplier: OperationApplier<SimpleBarChartInstance> = {
  op: OperationOp.Sum,

  async apply({ operation, state, instance, options }: ApplierArgs<SimpleBarChartInstance>): Promise<ApplierResult> {
    const result = sumData(state.workingData, operation)
    const value = Number(result[0]?.value)
    console.info('[operation-new] bar applier:sum', {
      nodeId: operation.meta?.nodeId,
      value,
      workingLen: state.workingData.length,
    })

    if (!Number.isFinite(value)) {
      return { result, nextState: { ...state, lastResult: result } }
    }

    applyAnnotationContextFade(
      instance.annotationLayer,
      state.annotationRecords,
      FILTER_ANNOTATION_CLASS,
      options?.referencedResultIds,
    )

    await drawResultBadge({
      layer: instance.annotationLayer,
      cssClass: SUM_ANNOTATION_CLASS,
      text: `Total: ${formatOperationValue(value)}`,
      layout: instance.layout,
      anchor: 'top-center-above',
      fontSize: 16,
    })

    return {
      result,
      nextState: {
        ...state,
        lastResult: result,
        annotationRecords: [
          ...state.annotationRecords,
          { cssClass: SUM_ANNOTATION_CLASS, role: 'result', persistent: false },
        ],
      },
    }
  },
}

import { compareBoolOp } from '../../../domain/operation/dataOps'
import { OperationOp } from '../../../domain/operation/types'
import type { OperationApplier, ApplierArgs, ApplierResult } from '../../applier'
import type { SimpleBarChartInstance } from '../../../rendering-new/instances/simpleBarInstance'
import { applyAnnotationContextFade } from '../../primitives/contextFade'
import { drawResultBadge } from '../../primitives/drawResultBadge'
import { FILTER_ANNOTATION_CLASS } from './filter'

export const COMPARE_BOOL_ANNOTATION_CLASS = 'operation-next-bar-compare-bool'

export const compareBoolApplier: OperationApplier<SimpleBarChartInstance> = {
  op: OperationOp.CompareBool,

  async apply({ operation, state, instance, options }: ApplierArgs<SimpleBarChartInstance>): Promise<ApplierResult> {
    const result = compareBoolOp(state.workingData, operation)
    const value = Number(result[0]?.value)
    console.info('[operation-new] bar applier:compareBool', {
      nodeId: operation.meta?.nodeId,
      bool: value === 1,
      operator: operation.operator,
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
      cssClass: COMPARE_BOOL_ANNOTATION_CLASS,
      text: value === 1 ? 'Yes' : 'No',
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
          { cssClass: COMPARE_BOOL_ANNOTATION_CLASS, role: 'result', persistent: false },
        ],
      },
    }
  },
}

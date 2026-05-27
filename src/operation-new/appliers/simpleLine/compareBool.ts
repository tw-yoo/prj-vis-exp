import { compareBoolOp } from '../../../domain/operation/dataOps'
import { OperationOp } from '../../../domain/operation/types'
import type { OperationApplier, ApplierArgs, ApplierResult } from '../../applier'
import { drawResultBadge } from '../../primitives/drawResultBadge'

export const COMPARE_BOOL_ANNOTATION_CLASS = 'operation-next-line-compare-bool'

export const compareBoolApplier: OperationApplier = {
  op: OperationOp.CompareBool,

  async apply({ operation, state, instance }: ApplierArgs): Promise<ApplierResult> {
    const result = compareBoolOp(state.workingData, operation)
    const value = Number(result[0]?.value)
    console.info('[operation-new] applier:compareBool', {
      nodeId: operation.meta?.nodeId,
      bool: value === 1,
      operator: operation.operator,
    })

    if (!Number.isFinite(value)) {
      return { result, nextState: { ...state, lastResult: result } }
    }

    await drawResultBadge({
      layer: instance.annotationLayer,
      cssClass: COMPARE_BOOL_ANNOTATION_CLASS,
      text: value === 1 ? 'Yes' : 'No',
      layout: instance.layout,
      anchor: 'top-right',
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

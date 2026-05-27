import { countData } from '../../../domain/operation/dataOps'
import { OperationOp } from '../../../domain/operation/types'
import type { OperationApplier, ApplierArgs, ApplierResult } from '../../applier'
import { drawResultBadge } from '../../primitives/drawResultBadge'

export const COUNT_ANNOTATION_CLASS = 'operation-next-line-count'

export const countApplier: OperationApplier = {
  op: OperationOp.Count,

  async apply({ operation, state, instance }: ApplierArgs): Promise<ApplierResult> {
    const result = countData(state.workingData, operation)
    const value = Number(result[0]?.value)
    console.info('[operation-new] applier:count', {
      nodeId: operation.meta?.nodeId,
      value,
      workingLen: state.workingData.length,
    })

    if (!Number.isFinite(value)) {
      return { result, nextState: { ...state, lastResult: result } }
    }

    await drawResultBadge({
      layer: instance.annotationLayer,
      cssClass: COUNT_ANNOTATION_CLASS,
      text: `Count: ${value}`,
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
          { cssClass: COUNT_ANNOTATION_CLASS, role: 'result', persistent: false },
        ],
      },
    }
  },
}

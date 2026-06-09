import { addData } from '../../../domain/operation/dataOps'
import { OperationOp } from '../../../domain/operation/types'
import { formatOperationValue } from '../../../operation-next/primitives/formatValue'
import type { OperationApplier, ApplierArgs, ApplierResult } from '../../applier'
import { drawResultBadge } from '../../primitives/drawResultBadge'

/**
 * Add applier for simple-line. Mirrors simpleLine/sum.ts. Shares a single badge
 * class with `scale` so an arithmetic chain collapses to one final corner
 * label. Previously unregistered → the final answer was never drawn.
 */
export const ARITH_RESULT_ANNOTATION_CLASS = 'operation-next-line-arith-result'

export const addApplier: OperationApplier = {
  op: OperationOp.Add,

  async apply({ operation, state, instance }: ApplierArgs): Promise<ApplierResult> {
    const result = addData(state.workingData, operation)
    const value = Number(result[0]?.value)
    console.info('[operation-new] applier:add', { nodeId: operation.meta?.nodeId, value })

    if (!Number.isFinite(value)) {
      return { result, nextState: { ...state, lastResult: result } }
    }

    await drawResultBadge({
      layer: instance.annotationLayer,
      cssClass: ARITH_RESULT_ANNOTATION_CLASS,
      text: `= ${formatOperationValue(value)}`,
      layout: instance.layout,
      anchor: 'top-right',
    })

    return {
      result,
      nextState: {
        ...state,
        lastResult: result,
        annotationRecords: [
          ...state.annotationRecords.filter((r) => r.cssClass !== ARITH_RESULT_ANNOTATION_CLASS),
          { cssClass: ARITH_RESULT_ANNOTATION_CLASS, role: 'result', persistent: false },
        ],
      },
    }
  },
}

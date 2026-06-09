import { scaleData } from '../../../domain/operation/dataOps'
import { OperationOp } from '../../../domain/operation/types'
import { formatOperationValue } from '../../../operation-next/primitives/formatValue'
import type { OperationApplier, ApplierArgs, ApplierResult } from '../../applier'
import { drawResultBadge } from '../../primitives/drawResultBadge'
import { ARITH_RESULT_ANNOTATION_CLASS } from './add'

/**
 * Scale applier for simple-line. Mirrors simpleLine/sum.ts; shares the badge
 * class with `add`. Previously unregistered → the final answer was never drawn.
 */
export const scaleApplier: OperationApplier = {
  op: OperationOp.Scale,

  async apply({ operation, state, instance }: ApplierArgs): Promise<ApplierResult> {
    const result = scaleData(state.workingData, operation)
    const value = Number(result[0]?.value)
    console.info('[operation-new] applier:scale', { nodeId: operation.meta?.nodeId, value })

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

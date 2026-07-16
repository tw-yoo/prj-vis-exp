import { scaleData } from '../../../domain/operation/dataOps'
import { OperationOp } from '../../../domain/operation/types'
import { formatOperationValue } from '../../../operation-next/primitives/formatValue'
import type { OperationApplier, ApplierArgs, ApplierResult } from '../../applier'
import { drawResultBadge } from '../../primitives/drawResultBadge'

export const SCALE_RESULT_ANNOTATION_CLASS = 'operation-next-line-scale-result'

/**
 * Scale applier for simple-line. Draws its OWN badge one row below `add`'s
 * running total (offsetY slot) — sharing add's class made drawResultBadge's
 * same-class cleanup overwrite the running total, so the viewer lost the
 * intermediate value the step text still referenced.
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
      cssClass: SCALE_RESULT_ANNOTATION_CLASS,
      text: `= ${formatOperationValue(value)}`,
      layout: instance.layout,
      anchor: 'top-left',
      offsetY: 18,
    })

    return {
      result,
      nextState: {
        ...state,
        lastResult: result,
        annotationRecords: [
          ...state.annotationRecords,
          { cssClass: SCALE_RESULT_ANNOTATION_CLASS, role: 'result', persistent: false },
        ],
      },
    }
  },
}

import { scaleData } from '../../../domain/operation/dataOps'
import { OperationOp } from '../../../domain/operation/types'
import { formatOperationValue } from '../../../operation-next/primitives/formatValue'
import type { OperationApplier, ApplierArgs, ApplierResult } from '../../applier'
import type { SimpleBarChartInstance } from '../../../rendering-new/instances/simpleBarInstance'
import { applyAnnotationContextFade } from '../../primitives/contextFade'
import { drawResultBadge } from '../../primitives/drawResultBadge'
import { FILTER_ANNOTATION_CLASS } from './filter'

export const SCALE_RESULT_ANNOTATION_CLASS = 'operation-next-bar-scale-result'

/**
 * Scale applier for simple-bar (e.g. the ×(1/3) that turns a sum of three
 * values into an average). Draws its OWN badge one row below `add`'s running
 * total (offsetY slot) — sharing add's class made drawResultBadge's same-class
 * cleanup overwrite the running total, so the viewer lost the intermediate
 * value the step text still referenced.
 */
export const scaleApplier: OperationApplier<SimpleBarChartInstance> = {
  op: OperationOp.Scale,

  async apply({ operation, state, instance, options }: ApplierArgs<SimpleBarChartInstance>): Promise<ApplierResult> {
    const result = scaleData(state.workingData, operation)
    const value = Number(result[0]?.value)
    console.info('[operation-new] bar applier:scale', {
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
      cssClass: SCALE_RESULT_ANNOTATION_CLASS,
      text: `= ${formatOperationValue(value)}`,
      layout: instance.layout,
      anchor: 'top-right',
      fontSize: 16,
      offsetY: 22,
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

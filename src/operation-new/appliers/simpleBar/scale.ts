import { scaleData } from '../../../domain/operation/dataOps'
import { OperationOp } from '../../../domain/operation/types'
import { formatOperationValue } from '../../../operation-next/primitives/formatValue'
import type { OperationApplier, ApplierArgs, ApplierResult } from '../../applier'
import type { SimpleBarChartInstance } from '../../../rendering-new/instances/simpleBarInstance'
import { applyAnnotationContextFade } from '../../primitives/contextFade'
import { drawResultBadge } from '../../primitives/drawResultBadge'
import { FILTER_ANNOTATION_CLASS } from './filter'
import { ARITH_RESULT_ANNOTATION_CLASS } from './add'

/**
 * Scale applier for simple-bar (e.g. the ×(1/3) that turns a sum of three
 * values into an average). Shares ARITH_RESULT_ANNOTATION_CLASS with `add` so
 * the final value replaces the prior running-total badge in the same corner.
 * Was previously a no-op (no applier registered) — see add.ts header.
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
      cssClass: ARITH_RESULT_ANNOTATION_CLASS,
      text: `= ${formatOperationValue(value)}`,
      layout: instance.layout,
      anchor: 'top-right',
      fontSize: 16,
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

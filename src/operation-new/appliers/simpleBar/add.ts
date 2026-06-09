import { addData } from '../../../domain/operation/dataOps'
import { OperationOp } from '../../../domain/operation/types'
import { formatOperationValue } from '../../../operation-next/primitives/formatValue'
import type { OperationApplier, ApplierArgs, ApplierResult } from '../../applier'
import type { SimpleBarChartInstance } from '../../../rendering-new/instances/simpleBarInstance'
import { applyAnnotationContextFade } from '../../primitives/contextFade'
import { drawResultBadge } from '../../primitives/drawResultBadge'
import { FILTER_ANNOTATION_CLASS } from './filter'

/**
 * Shared by the `add` and `scale` appliers so a chain of arithmetic steps
 * (e.g. retrieveValue×3 → add → add → scale for "average of top-3") collapses
 * to a single final badge. drawResultBadge removes the prior badge of the same
 * class before drawing, so successive arithmetic results cross-fade in the same
 * corner instead of stacking overlapping labels — matching the validation
 * viewer's single-summary idiom (e2_q1.js:444).
 *
 * Previously `add` / `scale` had NO applier on simple-bar, so the runner logged
 * "unknown op (skipped)" and the final answer was never drawn on the chart
 * (audit finding shared-addscale-1 / simpleBar-2).
 */
export const ARITH_RESULT_ANNOTATION_CLASS = 'operation-next-bar-arith-result'

export const addApplier: OperationApplier<SimpleBarChartInstance> = {
  op: OperationOp.Add,

  async apply({ operation, state, instance, options }: ApplierArgs<SimpleBarChartInstance>): Promise<ApplierResult> {
    const result = addData(state.workingData, operation)
    const value = Number(result[0]?.value)
    console.info('[operation-new] bar applier:add', {
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

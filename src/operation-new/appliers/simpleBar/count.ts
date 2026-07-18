import { countData } from '../../../domain/operation/dataOps'
import { OperationOp } from '../../../domain/operation/types'
import type { OperationApplier, ApplierArgs, ApplierResult } from '../../applier'
import type { SimpleBarChartInstance } from '../../../rendering-new/instances/simpleBarInstance'
import { applyAnnotationContextFade } from '../../primitives/contextFade'
import { drawResultBadge } from '../../primitives/drawResultBadge'
import { FILTER_ANNOTATION_CLASS } from './filter'

/**
 * Count applier for simple-bar. Renders "Total N bars" per user feedback
 * (case `0o12tngadmjjux2n`) — the previous behaviour had no on-chart count
 * badge at all. Anchored top-right (matches every other chart type's count
 * badge, e.g. simpleLine/count.ts) — top-center-above collided with Ours'
 * top-center step-summary caption, hiding one or the other. Also runs the
 * cross-op annotation fade so stale prior annotations (e.g. an average label
 * that was a filter threshold) drop out when count is the new focus.
 */
export const COUNT_ANNOTATION_CLASS = 'operation-next-bar-count'

export const countApplier: OperationApplier<SimpleBarChartInstance> = {
  op: OperationOp.Count,

  async apply({ operation, state, instance, options }: ApplierArgs<SimpleBarChartInstance>): Promise<ApplierResult> {
    const result = countData(state.workingData, operation)
    const value = Number(result[0]?.value)
    console.info('[operation-new] bar applier:count', {
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
      cssClass: COUNT_ANNOTATION_CLASS,
      text: `Total ${value} bars`,
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
          ...state.annotationRecords,
          { cssClass: COUNT_ANNOTATION_CLASS, role: 'result', persistent: false },
        ],
      },
    }
  },
}

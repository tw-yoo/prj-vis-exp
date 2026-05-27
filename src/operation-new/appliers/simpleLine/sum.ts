import { sumData } from '../../../domain/operation/dataOps'
import { OperationOp } from '../../../domain/operation/types'
import { formatOperationValue } from '../../../operation-next/primitives/formatValue'
import type { OperationApplier, ApplierArgs, ApplierResult } from '../../applier'
import { drawResultBadge } from '../../primitives/drawResultBadge'

/**
 * Sum applier for simple-line. Strictly bar-only by op-registry semantics, but
 * the executor has a legacy-safe fallback so we keep this applier as well to
 * give users visual feedback in case a sum-on-line spec slips through (e.g.
 * "sum 2011-2017"). Renders as a corner "Total: X" badge.
 */

export const SUM_ANNOTATION_CLASS = 'operation-next-line-sum'

export const sumApplier: OperationApplier = {
  op: OperationOp.Sum,

  async apply({ operation, state, instance }: ApplierArgs): Promise<ApplierResult> {
    const result = sumData(state.workingData, operation)
    const value = Number(result[0]?.value)
    console.info('[operation-new] applier:sum', {
      nodeId: operation.meta?.nodeId,
      value,
      workingLen: state.workingData.length,
    })

    if (!Number.isFinite(value)) {
      return { result, nextState: { ...state, lastResult: result } }
    }

    await drawResultBadge({
      layer: instance.annotationLayer,
      cssClass: SUM_ANNOTATION_CLASS,
      text: `Total: ${formatOperationValue(value)}`,
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
          { cssClass: SUM_ANNOTATION_CLASS, role: 'result', persistent: false },
        ],
      },
    }
  },
}

import { sumData } from '../../../domain/operation/dataOps'
import { OperationOp } from '../../../domain/operation/types'
import { formatOperationValue } from '../../../operation-next/primitives/formatValue'
import type { OperationApplier, ApplierArgs, ApplierResult } from '../../applier'
import type { SimpleBarChartInstance } from '../../../rendering-new/instances/simpleBarInstance'
import { applyAnnotationContextFade } from '../../primitives/contextFade'
import { drawResultBadge } from '../../primitives/drawResultBadge'
import { FILTER_ANNOTATION_CLASS } from './filter'
import { addApplier } from './add'

export const SUM_ANNOTATION_CLASS = 'operation-next-bar-sum'

export const sumApplier: OperationApplier<SimpleBarChartInstance> = {
  op: OperationOp.Sum,

  async apply(args: ApplierArgs<SimpleBarChartInstance>): Promise<ApplierResult> {
    const { operation, state, instance, options } = args
    // op-consolidation Tier 1: folded two-scalar sum (targetA+targetB, formerly add) → add drawing.
    if (operation.targetA != null && operation.targetB != null) {
      return addApplier.apply(args)
    }
    const result = sumData(state.workingData, operation)
    const value = Number(result[0]?.value)
    console.info('[operation-new] bar applier:sum', {
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
      cssClass: SUM_ANNOTATION_CLASS,
      text: `Total: ${formatOperationValue(value)}`,
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
          { cssClass: SUM_ANNOTATION_CLASS, role: 'result', persistent: false },
        ],
      },
    }
  },
}

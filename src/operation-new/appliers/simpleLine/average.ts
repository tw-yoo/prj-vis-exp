import { averageData } from '../../../domain/operation/dataOps'
import { OperationOp } from '../../../domain/operation/types'
import { formatOperationValue } from '../../../operation-next/primitives/formatValue'
import {
  RESULT_REF_ATTRIBUTE,
  isOperationResultReferenced,
  operationResultRef,
} from '../../../operation-next/diffEndpoint'
import type { OperationApplier, ApplierArgs, ApplierResult } from '../../applier'
import { resolveAnnotationViewport } from '../../primitives/annotationLayer'
import { applyAnnotationContextFade } from '../../primitives/contextFade'
import { drawReferenceLine } from '../../primitives/drawReferenceLine'
import { FILTER_ANNOTATION_CLASS } from './filter'

const AVERAGE_ANNOTATION_CLASS = 'operation-next-line-average'

export const averageApplier: OperationApplier = {
  op: OperationOp.Average,

  async apply({ operation, state, instance, options }: ApplierArgs): Promise<ApplierResult> {
    const result = averageData(state.workingData, operation)
    const average = Number(result[0]?.value)
    console.info('[operation-new] applier:average', {
      nodeId: operation.meta?.nodeId,
      average,
      filteredContext: state.salienceMap.size > 0,
      workingLen: state.workingData.length,
    })
    if (!Number.isFinite(average)) {
      return { result, nextState: { ...state, lastResult: result } }
    }

    const layer = instance.annotationLayer
    applyAnnotationContextFade(layer, state.annotationRecords, FILTER_ANNOTATION_CLASS)

    // Selective cleanup: if this average is referenced by a downstream op
    // (e.g. diff over two averages), keep referenced instances and only
    // remove unreferenced same-class elements. Otherwise remove all.
    const referencedResultIds = options?.referencedResultIds
    const persistent = isOperationResultReferenced(operation, referencedResultIds)
    if (!persistent) {
      layer.selectAll(`.${AVERAGE_ANNOTATION_CLASS}`).interrupt().remove()
    } else {
      const refs = new Set((referencedResultIds ?? []).map((id) => String(id).replace(/^ref:/, '')))
      layer
        .selectAll<SVGElement, unknown>(`.${AVERAGE_ANNOTATION_CLASS}`)
        .filter(function () {
          const ref = this.getAttribute(RESULT_REF_ATTRIBUTE)
          return !ref || !refs.has(ref)
        })
        .interrupt()
        .remove()
    }

    const yScale = instance.yScale
    const averageY = instance.layout.marginTop + yScale(average)
    const x1 = instance.layout.marginLeft
    const x2 = instance.layout.marginLeft + instance.layout.plotWidth
    const viewport = resolveAnnotationViewport(instance)

    // Label clarifies "filtered" context purely from state (op-agnostic — any
    // upstream op that populates salienceMap triggers the same wording).
    const isFiltered = state.salienceMap.size > 0
    const labelText = isFiltered
      ? `Avg (filtered): ${formatOperationValue(average)}`
      : `Average: ${formatOperationValue(average)}`

    await drawReferenceLine({
      layer,
      cssClass: AVERAGE_ANNOTATION_CLASS,
      x1,
      x2,
      y: averageY,
      label: labelText,
      svg: instance.svg,
      viewport,
    })

    const resultRef = operationResultRef(operation)
    if (resultRef) {
      layer
        .selectAll<SVGElement, unknown>(`.${AVERAGE_ANNOTATION_CLASS}`)
        .filter(function () {
          return !this.getAttribute(RESULT_REF_ATTRIBUTE)
        })
        .attr(RESULT_REF_ATTRIBUTE, resultRef)
    }

    const newRecord = {
      cssClass: AVERAGE_ANNOTATION_CLASS,
      role: persistent ? ('anchor' as const) : ('result' as const),
      persistent,
      operationId: resultRef == null ? undefined : String(resultRef),
      resultRef: resultRef == null ? undefined : String(resultRef),
    }

    return {
      result,
      nextState: {
        ...state,
        lastResult: result,
        annotationRecords: [...state.annotationRecords, newRecord],
      },
    }
  },
}

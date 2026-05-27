import { averageData } from '../../../domain/operation/dataOps'
import { OperationOp } from '../../../domain/operation/types'
import { DataAttributes } from '../../../rendering/interfaces'
import { formatOperationValue } from '../../../operation-next/primitives/formatValue'
import {
  RESULT_REF_ATTRIBUTE,
  isOperationResultReferenced,
  operationResultRef,
} from '../../../operation-next/diffEndpoint'
import type { OperationApplier, ApplierArgs, ApplierResult } from '../../applier'
import type { SimpleBarChartInstance } from '../../../rendering-new/instances/simpleBarInstance'
import { applyAnnotationContextFade } from '../../primitives/contextFade'
import { drawReferenceLine } from '../../primitives/drawReferenceLine'
import { fadeRemoveAnnotations } from '../../primitives/fadeRemove'
import { FILTER_ANNOTATION_CLASS } from './filter'
import { resolveBarAnnotationViewport, valueToRootY } from './_shared'

export const AVERAGE_ANNOTATION_CLASS = 'operation-next-average'

export const averageApplier: OperationApplier<SimpleBarChartInstance> = {
  op: OperationOp.Average,

  async apply({ operation, state, instance, options }: ApplierArgs<SimpleBarChartInstance>): Promise<ApplierResult> {
    const result = averageData(state.workingData, operation)
    const average = Number(result[0]?.value)
    console.info('[operation-new] bar applier:average', {
      nodeId: operation.meta?.nodeId,
      average,
      filteredContext: state.salienceMap.size > 0,
      workingLen: state.workingData.length,
    })
    if (!Number.isFinite(average)) {
      return { result, nextState: { ...state, lastResult: result } }
    }

    const layer = instance.annotationLayer
    const referencedResultIds = options?.referencedResultIds
    applyAnnotationContextFade(layer, state.annotationRecords, FILTER_ANNOTATION_CLASS, referencedResultIds)

    const persistent = isOperationResultReferenced(operation, referencedResultIds)
    if (!persistent) {
      fadeRemoveAnnotations(layer, AVERAGE_ANNOTATION_CLASS)
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

    const averageY = valueToRootY(instance, average)

    // SVG attribute is the source-of-truth for the plot's left edge within
    // its SVG coordinate system. `instance.layout.marginLeft` can drift away
    // from the SVG when a compacted shared-y-axis surface gets its layout
    // mutated for cross-surface alignment (case 0s6zi9dyw22qo4rp ops2:n4 on
    // split-right: data-m-left="0" on the SVG but instance.layout.marginLeft
    // was the compact-offset, putting the average line outside the plot).
    // Reading the attribute directly keeps the annotation aligned with the
    // plot regardless of which path populated `layout`.
    const svgNode = instance.svg.node()
    const svgMarginLeftAttr = svgNode?.getAttribute(DataAttributes.MarginLeft)
    const svgMarginLeft =
      svgMarginLeftAttr != null && Number.isFinite(Number(svgMarginLeftAttr))
        ? Number(svgMarginLeftAttr)
        : instance.layout.marginLeft
    const x1 = svgMarginLeft
    const x2 = svgMarginLeft + instance.layout.plotWidth

    // Detailed diagnostic logging — helps confirm which marginLeft path was
    // taken when annotations land in unexpected positions on split/compacted
    // surfaces. Safe to leave in: console.info is cheap and only fires per op.
    console.info('[operation-new] bar applier:average DEBUG geometry', {
      nodeId: operation.meta?.nodeId,
      instanceMarginLeft: instance.layout.marginLeft,
      instanceMarginTop: instance.layout.marginTop,
      plotWidth: instance.layout.plotWidth,
      plotHeight: instance.layout.plotHeight,
      svgMarginLeftAttr,
      svgMarginLeftResolved: svgMarginLeft,
      compactOffsetAttr: svgNode?.getAttribute('data-shared-y-axis-compact-offset'),
      averageValue: average,
      averageY,
      x1,
      x2,
      svgViewBox: svgNode?.getAttribute('viewBox'),
      surfaceLayoutType: options?.surfaceManager?.getLayout()?.type ?? null,
    })

    const viewport = resolveBarAnnotationViewport(instance)

    // Either dim-mode (salienceMap populated) or remove-mode (filterContext set
    // but salienceMap empty) counts as "filtered" — the average is over a
    // reduced subset in both cases.
    const isFiltered = state.filterContext != null || state.salienceMap.size > 0
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

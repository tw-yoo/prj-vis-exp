import * as d3 from 'd3'
import { averageData } from '../../../domain/operation/dataOps'
import { OperationOp } from '../../../domain/operation/types'
import { formatOperationValue } from '../../../operation-next/primitives/formatValue'
import {
  RESULT_REF_ATTRIBUTE,
  isOperationResultReferenced,
  operationResultRef,
} from '../../../operation-next/diffEndpoint'
import type { OperationApplier, ApplierArgs, ApplierResult } from '../../applier'
import { applyAnnotationContextFade } from '../../primitives/contextFade'
import { drawReferenceLine } from '../../primitives/drawReferenceLine'
import { fadeRemoveAnnotations } from '../../primitives/fadeRemove'
import type { MultipleLineChartInstance } from '../../../rendering-new/instances/multipleLineInstance'
import { inferBarYFromAxis } from '../barGroup/_shared'
import { FILTER_ANNOTATION_CLASS } from './filter'
import { annotationViewport } from './_shared'

export const AVERAGE_ANNOTATION_CLASS = 'operation-next-multiple-line-average'

/**
 * multiple-line average applier.
 *
 * Visual: a horizontal reference line at the computed average y position,
 * with a label. The y position is inferred from the chart's y-axis tick
 * geometry so we avoid coupling to the renderer's internal scale objects.
 *
 * Branching: if a prior op set `derivedData` AND a scale rescale (pairDiff
 * focus), the average is over those derived deltas — mirrors the legacy
 * `annotateAverage` branch.
 *
 * Persistence: when a downstream op references this average (e.g.
 * diff-over-averages), the annotation is kept and tagged via
 * `RESULT_REF_ATTRIBUTE`; otherwise prior averages fade away first.
 */
export const averageApplier: OperationApplier<MultipleLineChartInstance> = {
  op: OperationOp.Average,

  async apply({
    operation,
    state,
    instance,
    options,
  }: ApplierArgs<MultipleLineChartInstance>): Promise<ApplierResult> {
    const result = averageData(state.workingData, operation)

    const isPairDiff = state.derivedData !== null && state.scaleState !== null
    const isFiltered = state.salienceMap.size > 0
    let averageValue: number
    let labelText: string
    if (isPairDiff) {
      averageValue = d3.mean(state.derivedData ?? [], (d) => Number(d.value)) ?? 0
      labelText = `Avg diff: ${formatOperationValue(averageValue)}`
    } else {
      averageValue = Number(result[0]?.value)
      labelText = isFiltered
        ? `Avg (filtered): ${formatOperationValue(averageValue)}`
        : `Average: ${formatOperationValue(averageValue)}`
    }

    console.info('[operation-new] multi-line applier:average', {
      nodeId: operation.meta?.nodeId,
      averageValue,
      isPairDiff,
      isFiltered,
      workingLen: state.workingData.length,
    })

    if (!Number.isFinite(averageValue)) {
      return { result, nextState: { ...state, lastResult: result } }
    }

    const layer = instance.annotationLayer
    applyAnnotationContextFade(layer, state.annotationRecords, FILTER_ANNOTATION_CLASS)

    const referencedResultIds = options?.referencedResultIds
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

    const yLocal = inferBarYFromAxis(instance.svg, averageValue)
    if (yLocal == null) {
      return { result, nextState: { ...state, lastResult: result } }
    }
    const averageY = instance.layout.marginTop + yLocal
    const marginLeft = instance.layout.marginLeft
    const x1 = marginLeft
    const x2 = marginLeft + instance.layout.plotWidth

    await drawReferenceLine({
      layer,
      cssClass: AVERAGE_ANNOTATION_CLASS,
      x1,
      x2,
      y: averageY,
      label: labelText,
      svg: instance.svg,
      viewport: annotationViewport(instance),
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

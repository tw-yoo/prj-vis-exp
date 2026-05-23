import { filterData } from '../../../domain/operation/dataOps'
import { OperationOp, type DatumValue } from '../../../domain/operation/types'
import { OPACITIES } from '../../../rendering/common/d3Helpers'
import type { OperationApplier, ApplierArgs, ApplierResult } from '../../applier'
import type { StackedBarChartInstance } from '../../../rendering-new/instances/stackedBarInstance'
import { applyAnnotationContextFade } from '../../primitives/contextFade'
import { drawReferenceLine } from '../../primitives/drawReferenceLine'
import { fadeRemoveAnnotations } from '../../primitives/fadeRemove'
import {
  barMarkKeyFromDatum,
  barMarkKeyFromNode,
  inferBarYFromAxis,
  resolveBarThreshold,
} from '../barGroup/_shared'

export const FILTER_ANNOTATION_CLASS = 'operation-next-stacked-bar-filter'

function buildScopeKeys(result: DatumValue[]): Set<string> {
  return new Set(result.map(barMarkKeyFromDatum))
}

/**
 * stacked-bar filter applier.
 *
 * Visual mirror of the grouped-bar variant — every stack segment whose
 * identity falls out of scope fades to DIM in lockstep under a single
 * parent transition. The renderer's stack-recalc logic is preserved
 * (legacy code handles structural rearrangement); the new applier focuses
 * on the smooth opacity transition.
 */
export const filterApplier: OperationApplier<StackedBarChartInstance> = {
  op: OperationOp.Filter,

  async apply({
    operation,
    state,
    instance,
  }: ApplierArgs<StackedBarChartInstance>): Promise<ApplierResult> {
    const result = filterData(state.workingData, operation)
    console.info('[operation-new] stacked-bar applier:filter', {
      nodeId: operation.meta?.nodeId,
      operator: operation.operator,
      workingBefore: state.workingData.length,
      workingAfter: result.length,
    })

    const layer = instance.annotationLayer
    applyAnnotationContextFade(layer, state.annotationRecords, FILTER_ANNOTATION_CLASS)
    fadeRemoveAnnotations(layer, FILTER_ANNOTATION_CLASS)

    const activeKeys = buildScopeKeys(result)

    await instance.transitionFilterScope({
      activeKeys,
      keyOf: barMarkKeyFromNode,
      outOfScopeOpacity: OPACITIES.DIM,
    })

    const threshold = resolveBarThreshold(operation, state.workingData)
    if (threshold != null) {
      const thresholdY = inferBarYFromAxis(instance.svg, threshold)
      if (thresholdY != null) {
        const marginLeft = instance.layout.marginLeft
        const plotWidth = instance.layout.plotWidth
        await drawReferenceLine({
          layer,
          cssClass: FILTER_ANNOTATION_CLASS,
          x1: marginLeft,
          x2: marginLeft + plotWidth,
          y: instance.layout.marginTop + thresholdY,
          label: String(threshold),
          svg: instance.svg,
          viewport: {
            x: marginLeft,
            y: instance.layout.marginTop,
            width: plotWidth + 96,
            height: instance.layout.plotHeight,
          },
        })
      }
    }

    const nextSalienceMap = new Map<string, number>()
    instance.mainBars().each(function () {
      const key = barMarkKeyFromNode(this as SVGElement)
      nextSalienceMap.set(key, activeKeys.has(key) ? OPACITIES.FULL : OPACITIES.DIM)
    })

    return {
      result,
      nextState: {
        ...state,
        workingData: result,
        derivedData: null,
        salienceMap: nextSalienceMap,
        lastResult: result,
        annotationRecords: [
          ...state.annotationRecords,
          { cssClass: FILTER_ANNOTATION_CLASS, role: 'anchor' as const, persistent: true },
        ],
      },
    }
  },
}

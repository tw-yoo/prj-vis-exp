import { filterData } from '../../../domain/operation/dataOps'
import { OperationOp, type DatumValue } from '../../../domain/operation/types'
import { OPACITIES } from '../../../rendering/common/d3Helpers'
import type { OperationApplier, ApplierArgs, ApplierResult } from '../../applier'
import type { GroupedBarChartInstance } from '../../../rendering-new/instances/groupedBarInstance'
import { applyAnnotationContextFade } from '../../primitives/contextFade'
import { drawReferenceLine } from '../../primitives/drawReferenceLine'
import { fadeRemoveAnnotations } from '../../primitives/fadeRemove'
import {
  barMarkKeyFromDatum,
  barMarkKeyFromNode,
  inferBarYFromAxis,
  resolveBarThreshold,
} from '../barGroup/_shared'

export const FILTER_ANNOTATION_CLASS = 'operation-next-grouped-bar-filter'

function buildScopeKeys(result: DatumValue[]): Set<string> {
  return new Set(result.map(barMarkKeyFromDatum))
}

/**
 * grouped-bar filter applier.
 *
 * Visual: out-of-scope main-bars across every panel fade to DIM in lockstep
 * (single shared parent transition). If the filter is a measure threshold,
 * a horizontal reference line is drawn at the threshold y after the salience
 * settles.
 *
 * State: workingData narrows to the filtered subset; salienceMap stores
 * per-mark identity for downstream ops (average, diff).
 */
export const filterApplier: OperationApplier<GroupedBarChartInstance> = {
  op: OperationOp.Filter,

  async apply({
    operation,
    state,
    instance,
  }: ApplierArgs<GroupedBarChartInstance>): Promise<ApplierResult> {
    const result = filterData(state.workingData, operation)
    console.info('[operation-new] grouped-bar applier:filter', {
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

    // Threshold reference line for numeric filters.
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

    // SalienceMap tracks per-bar in/out-of-scope opacity for downstream ops.
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

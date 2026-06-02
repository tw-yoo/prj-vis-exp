import { retrieveValue } from '../../../domain/operation/dataOps'
import { OperationOp } from '../../../domain/operation/types'
import { DataAttributes, SvgAttributes } from '../../../rendering/interfaces'
import { COLORS, DURATIONS } from '../../../rendering/common/d3Helpers'
import { formatOperationValue } from '../../../operation-next/primitives/formatValue'
import type { OperationApplier, ApplierArgs, ApplierResult } from '../../applier'
import type { GroupedBarChartInstance } from '../../../rendering-new/instances/groupedBarInstance'
import { fadeRemoveAnnotations } from '../../primitives/fadeRemove'
import { drawReferenceLine } from '../../primitives/drawReferenceLine'
import { placeValueLabel } from '../../primitives/placeValueLabel'
import {
  barAnnotationViewport,
  rectCenterRootX,
  rectTopRootY,
  resolveBarPlotBounds,
  valueToRootYForBars,
} from '../barGroup/_geometry'

export const RETRIEVE_ANNOTATION_CLASS = 'operation-new-grouped-bar-retrieve-value'

/**
 * grouped-bar retrieveValue applier.
 *
 * Forward (`targetAxis: 'x'`): label every bar whose `data-target === target`
 *   (across all series) with its value above the bar top.
 * Reverse (`targetAxis: 'y'`): draw a horizontal reference line at y=target
 *   across the plot, and label each matching bar with its category.
 *
 * All geometry is read through the shared, compaction-safe `barGroup/_geometry`
 * helpers (SVG `data-m-left` + per-rect transform chain), so labels and the
 * reference line stay aligned on a compacted split-right surface where
 * `instance.layout.marginLeft` has drifted (R5).
 */
export const retrieveValueApplier: OperationApplier<GroupedBarChartInstance> = {
  op: OperationOp.RetrieveValue,

  async apply({ operation, state, instance }: ApplierArgs<GroupedBarChartInstance>): Promise<ApplierResult> {
    const result = retrieveValue(state.workingData, operation)
    const isReverse = operation.targetAxis === 'y'
    console.info('[operation-new] grouped-bar applier:retrieveValue', {
      nodeId: operation.meta?.nodeId,
      target: operation.target,
      targetAxis: operation.targetAxis ?? 'x',
      resultLen: result.length,
    })
    const layer = instance.annotationLayer
    fadeRemoveAnnotations(layer, RETRIEVE_ANNOTATION_CLASS)
    if (result.length === 0) {
      return { result, nextState: { ...state, lastResult: result } }
    }

    const transitions: Promise<unknown>[] = []
    const allBars = instance.mainBars().nodes() as SVGRectElement[]

    if (isReverse) {
      const targetValue = Number(operation.target)
      const refY = valueToRootYForBars(instance, targetValue)
      const { x1, x2 } = resolveBarPlotBounds(instance)
      transitions.push(
        drawReferenceLine({
          layer,
          cssClass: RETRIEVE_ANNOTATION_CLASS,
          x1,
          x2,
          y: refY,
          color: COLORS.ANNOTATION_RED,
          style: 'guideline',
          label: formatOperationValue(targetValue),
          svg: instance.svg,
          viewport: barAnnotationViewport(instance),
          anchorValue: targetValue,
        }).catch(() => undefined),
      )
      result.forEach((datum) => {
        const target = String(datum.target)
        const series = datum.group != null ? String(datum.group) : null
        allBars.forEach((rect) => {
          const rectTarget = rect.getAttribute(DataAttributes.Target)
          const rectSeries = rect.getAttribute(DataAttributes.Series)
          if (rectTarget !== target) return
          if (series != null && rectSeries !== series) return
          const labelNode = placeValueLabel({
            layer,
            svg: instance.svg,
            viewport: barAnnotationViewport(instance),
            preferred: { x: rectCenterRootX(rect), y: rectTopRootY(rect) - 8 },
            text: String(datum.displayTarget ?? datum.target),
            className: RETRIEVE_ANNOTATION_CLASS,
            dataAttrs: [[DataAttributes.Target, target]],
          })
          transitions.push(
            labelNode
              .transition()
              .duration(DURATIONS.LABEL_FADE_IN)
              .style(SvgAttributes.Opacity, 1)
              .end()
              .catch(() => undefined),
          )
        })
      })
    } else {
      result.forEach((datum, index) => {
        const target = String(datum.target)
        const series = datum.group != null ? String(datum.group) : null
        allBars.forEach((rect) => {
          const rectTarget = rect.getAttribute(DataAttributes.Target)
          const rectSeries = rect.getAttribute(DataAttributes.Series)
          if (rectTarget !== target) return
          if (series != null && rectSeries !== series) return
          const value = Number(rect.getAttribute(DataAttributes.Value))
          const labelNode = placeValueLabel({
            layer,
            svg: instance.svg,
            viewport: barAnnotationViewport(instance),
            preferred: { x: rectCenterRootX(rect), y: rectTopRootY(rect) - 10 - index * 16 },
            text: formatOperationValue(value),
            className: RETRIEVE_ANNOTATION_CLASS,
            dataAttrs: [[DataAttributes.Target, target]],
          })
          transitions.push(
            labelNode
              .transition()
              .duration(DURATIONS.LABEL_FADE_IN)
              .style(SvgAttributes.Opacity, 1)
              .end()
              .catch(() => undefined),
          )
        })
      })
    }

    await Promise.all(transitions)

    return {
      result,
      nextState: {
        ...state,
        lastResult: result,
        annotationRecords: [
          ...state.annotationRecords,
          { cssClass: RETRIEVE_ANNOTATION_CLASS, role: 'result' as const, persistent: false },
        ],
      },
    }
  },
}

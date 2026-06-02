import { retrieveValue } from '../../../domain/operation/dataOps'
import { OperationOp } from '../../../domain/operation/types'
import { DataAttributes, SvgAttributes } from '../../../rendering/interfaces'
import { COLORS, DURATIONS } from '../../../rendering/common/d3Helpers'
import { formatOperationValue } from '../../../operation-next/primitives/formatValue'
import type { OperationApplier, ApplierArgs, ApplierResult } from '../../applier'
import { findPointByTarget, pointToRootCoords, resolveAnnotationViewport } from '../../primitives/annotationLayer'
import { placeValueLabel } from '../../primitives/placeValueLabel'
import { fadeRemoveAnnotations } from '../../primitives/fadeRemove'
import { drawVerticalReferenceLine } from '../../primitives/drawVerticalReferenceLine'

const RETRIEVE_ANNOTATION_CLASS = 'operation-next-line-retrieve-value'

export const retrieveValueApplier: OperationApplier = {
  op: OperationOp.RetrieveValue,

  async apply({ operation, state, instance }: ApplierArgs): Promise<ApplierResult> {
    const result = retrieveValue(state.workingData, operation)
    const isReverse = operation.targetAxis === 'y'
    console.info('[operation-new] applier:retrieveValue', {
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

    if (isReverse) {
      // Reverse (y → x): for each matched row, draw a vertical reference line
      // from the plot top down to the point, plus a small x-axis-side label
      // showing the x category.
      const viewport = resolveAnnotationViewport(instance)
      const svg = instance.svg
      const plotTopY = instance.layout.marginTop
      result.forEach((datum) => {
        const pointSel = findPointByTarget(instance, String(datum.target))
        const point = pointSel.nodes()[0]
        if (!point) return
        const metrics = pointToRootCoords(point, instance)
        transitions.push(
          pointSel
            .interrupt()
            .transition()
            .duration(DURATIONS.HIGHLIGHT)
            .attr(SvgAttributes.Fill, COLORS.ANNOTATION_RED)
            .attr(SvgAttributes.R, 6)
            .end()
            .catch(() => {}),
        )
        transitions.push(
          drawVerticalReferenceLine({
            layer,
            cssClass: RETRIEVE_ANNOTATION_CLASS,
            x: metrics.x,
            y1: plotTopY,
            y2: metrics.y,
            style: 'guideline',
            color: COLORS.ANNOTATION_RED,
            label: String(datum.displayTarget ?? datum.target),
            svg,
            viewport,
            anchorValue: String(datum.target),
          }).catch(() => undefined),
        )
      })
    } else {
      // Forward (x → y) — original behavior.
      result.forEach((datum, index) => {
        const pointSel = findPointByTarget(instance, String(datum.target))
        const point = pointSel.nodes()[0]
        if (!point) return
        const metrics = pointToRootCoords(point, instance)
        transitions.push(
          pointSel
            .interrupt()
            .transition()
            .duration(DURATIONS.HIGHLIGHT)
            .attr(SvgAttributes.Fill, COLORS.ANNOTATION_RED)
            .attr(SvgAttributes.R, 6)
            .end()
            .catch(() => {}),
        )
        // Value label above the point (stack offset per index as the starting
        // preference), de-collided by the shared placer.
        const labelNode = placeValueLabel({
          layer,
          svg: instance.svg,
          viewport: resolveAnnotationViewport(instance),
          preferred: { x: metrics.x, y: metrics.y - 10 - index * 16 },
          text: formatOperationValue(metrics.value),
          className: RETRIEVE_ANNOTATION_CLASS,
          dataAttrs: [[DataAttributes.Target, String(datum.target)]],
        })
        transitions.push(
          labelNode
            .transition()
            .duration(DURATIONS.LABEL_FADE_IN)
            .style(SvgAttributes.Opacity, 1)
            .end()
            .catch(() => {}),
        )
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
          { cssClass: RETRIEVE_ANNOTATION_CLASS, role: 'result', persistent: false },
        ],
      },
    }
  },
}

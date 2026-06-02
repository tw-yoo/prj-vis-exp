import * as d3 from 'd3'
import { retrieveValue } from '../../../domain/operation/dataOps'
import { OperationOp } from '../../../domain/operation/types'
import { DataAttributes, SvgAttributes } from '../../../rendering/interfaces'
import { COLORS, DURATIONS } from '../../../rendering/common/d3Helpers'
import { formatOperationValue } from '../../../operation-next/primitives/formatValue'
import type { OperationApplier, ApplierArgs, ApplierResult } from '../../applier'
import { fadeRemoveAnnotations } from '../../primitives/fadeRemove'
import type { MultipleLineChartInstance } from '../../../rendering-new/instances/multipleLineInstance'
import { findMultiLinePoint, pointMetrics, annotationViewport } from './_shared'
import { drawVerticalReferenceLine } from '../../primitives/drawVerticalReferenceLine'
import { placeValueLabel } from '../../primitives/placeValueLabel'

export const RETRIEVE_ANNOTATION_CLASS = 'operation-next-multiple-line-retrieve-value'

/**
 * multiple-line retrieveValue applier.
 *
 * Visual: per matching datum, highlight the matching `<circle>` (across the
 * right series) and append a value label above the point (or below if near
 * the top edge). Label position uses smart above/below heuristic — no
 * collision avoidance, overflow:visible keeps labels rendered past the box.
 *
 * Mirrors legacy `annotateRetrievedValues` but uses the series-aware point
 * finder so multi-series targets resolve to the correct line's circle.
 */
export const retrieveValueApplier: OperationApplier<MultipleLineChartInstance> = {
  op: OperationOp.RetrieveValue,

  async apply({
    operation,
    state,
    instance,
  }: ApplierArgs<MultipleLineChartInstance>): Promise<ApplierResult> {
    const result = retrieveValue(state.workingData, operation)
    const isReverse = operation.targetAxis === 'y'
    console.info('[operation-new] multi-line applier:retrieveValue', {
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
      // Reverse (y → x): one vertical guideline per matched point, with the
      // x category label near the x-axis tick. Multiple series can produce
      // multiple matches at distinct (target, series) pairs.
      const viewport = annotationViewport(instance)
      const plotTopY = instance.layout.marginTop
      result.forEach((datum) => {
        const target = String(datum.target)
        const series = datum.group != null ? String(datum.group) : ''
        const point = findMultiLinePoint(instance, target, series)
        if (!point) return
        const metrics = pointMetrics(point, instance)
        const pointSel = d3.select(point) as unknown as d3.Selection<SVGCircleElement, unknown, null, undefined>
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
            color: COLORS.ANNOTATION_RED,
            style: 'guideline',
            label: String(datum.displayTarget ?? datum.target),
            svg: instance.svg,
            viewport,
            anchorValue: target,
          }).catch(() => undefined),
        )
      })
    } else {
      result.forEach((datum, index) => {
        const target = String(datum.target)
        const series = datum.group != null ? String(datum.group) : ''
        const point = findMultiLinePoint(instance, target, series)
        if (!point) return
        const metrics = pointMetrics(point, instance)

        const pointSel = d3.select(point) as unknown as d3.Selection<SVGCircleElement, unknown, null, undefined>
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

        // Value label above the point (stack offset as starting preference),
        // de-collided by the shared placer.
        const labelNode = placeValueLabel({
          layer,
          svg: instance.svg,
          viewport: annotationViewport(instance),
          preferred: { x: metrics.x, y: metrics.y - 10 - index * 16 },
          text: formatOperationValue(metrics.value),
          className: RETRIEVE_ANNOTATION_CLASS,
          dataAttrs: [[DataAttributes.Target, target]],
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
          { cssClass: RETRIEVE_ANNOTATION_CLASS, role: 'result' as const, persistent: false },
        ],
      },
    }
  },
}

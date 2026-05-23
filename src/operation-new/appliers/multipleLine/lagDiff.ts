import * as d3 from 'd3'
import { lagDiffData } from '../../../domain/operation/dataOps'
import { OperationOp } from '../../../domain/operation/types'
import { SvgAttributes } from '../../../rendering/interfaces'
import { COLORS, DURATIONS } from '../../../rendering/common/d3Helpers'
import { formatSignedOperationValue } from '../../../operation-next/primitives/formatValue'
import type { OperationApplier, ApplierArgs, ApplierResult } from '../../applier'
import { drawDirectionalArrow } from '../../primitives/drawDifferenceArrow'
import { fadeRemoveAnnotations } from '../../primitives/fadeRemove'
import type { MultipleLineChartInstance } from '../../../rendering-new/instances/multipleLineInstance'
import { annotationViewport, findMultiLinePoint, pointMetrics } from './_shared'

export const LAG_DIFF_ANNOTATION_CLASS = 'operation-next-multiple-line-lag-diff'

/**
 * multiple-line lagDiff applier.
 *
 * Visual: per-adjacent-pair directional arrows colored ANNOTATION_BLUE
 * across every series. Endpoints (the two adjacent data points) are
 * highlighted in the same blue with a slightly larger radius. Each pair's
 * arrow + label rides the primitive's internal phase scheduling; all
 * highlight transitions are batched via Promise.all so the function
 * returns after every visible change has settled.
 *
 * State: `derivedData` gets the lagDiff result so a downstream
 * findExtremum can pick the strongest delta and strengthen its arrow.
 */
export const lagDiffApplier: OperationApplier<MultipleLineChartInstance> = {
  op: OperationOp.LagDiff,

  async apply({
    operation,
    state,
    instance,
  }: ApplierArgs<MultipleLineChartInstance>): Promise<ApplierResult> {
    const result = lagDiffData(state.workingData, operation)
    console.info('[operation-new] multi-line applier:lagDiff', {
      nodeId: operation.meta?.nodeId,
      deltaCount: result.length,
      workingLen: state.workingData.length,
    })
    if (result.length === 0) {
      return { result, nextState: { ...state, derivedData: result, lastResult: result } }
    }

    const layer = instance.annotationLayer
    fadeRemoveAnnotations(layer, LAG_DIFF_ANNOTATION_CLASS)
    const viewport = annotationViewport(instance)
    const transitions: Promise<void>[] = []
    const highlightedPoints: SVGCircleElement[] = []

    result.forEach((datum) => {
      if (!datum.prevTarget) return
      const series = datum.group != null ? String(datum.group) : ''
      const prevPoint = findMultiLinePoint(instance, String(datum.prevTarget), series)
      const currentPoint = findMultiLinePoint(instance, String(datum.target), series)
      if (!prevPoint || !currentPoint) {
        console.warn('[operation-new] multi-line lagDiff: adjacent point not found', { datum })
        return
      }
      const prev = pointMetrics(prevPoint, instance)
      const current = pointMetrics(currentPoint, instance)
      if (!highlightedPoints.includes(prevPoint)) highlightedPoints.push(prevPoint)
      if (!highlightedPoints.includes(currentPoint)) highlightedPoints.push(currentPoint)
      transitions.push(
        ...drawDirectionalArrow({
          layer,
          cssClass: LAG_DIFF_ANNOTATION_CLASS,
          fromX: prev.x,
          fromY: prev.y,
          toX: current.x,
          toY: current.y,
          color: COLORS.ANNOTATION_BLUE,
          targetKey: String(datum.target),
          prevTargetKey: String(datum.prevTarget),
          label: formatSignedOperationValue(Number(datum.value)),
          svg: instance.svg,
          viewport,
        }),
      )
    })

    if (highlightedPoints.length > 0) {
      const highlightSet = new Set(highlightedPoints)
      const sel = instance.pointMarks().filter(function () {
        return highlightSet.has(this as SVGCircleElement)
      })
      transitions.push(
        (sel as unknown as d3.Selection<SVGCircleElement, unknown, d3.BaseType, unknown>)
          .interrupt()
          .transition()
          .duration(DURATIONS.HIGHLIGHT)
          .attr(SvgAttributes.Fill, COLORS.ANNOTATION_BLUE)
          .attr(SvgAttributes.R, 6)
          .style(SvgAttributes.Opacity, 1)
          .end()
          .catch(() => {}),
      )
    }

    await Promise.all(transitions)

    return {
      result,
      nextState: {
        ...state,
        derivedData: result,
        lastResult: result,
        annotationRecords: [
          ...state.annotationRecords,
          { cssClass: LAG_DIFF_ANNOTATION_CLASS, role: 'anchor' as const, persistent: true },
        ],
      },
    }
  },
}

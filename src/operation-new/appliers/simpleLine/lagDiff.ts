import { lagDiffData } from '../../../domain/operation/dataOps'
import { OperationOp } from '../../../domain/operation/types'
import { SvgAttributes } from '../../../rendering/interfaces'
import { COLORS, DURATIONS } from '../../../rendering/common/d3Helpers'
import { formatSignedOperationValue } from '../../../operation-next/primitives/formatValue'
import type { OperationApplier, ApplierArgs, ApplierResult } from '../../applier'
import {
  findPointByTarget,
  pointToRootCoords,
  resolveAnnotationViewport,
} from '../../primitives/annotationLayer'
import { drawDirectionalArrow } from '../../primitives/drawDifferenceArrow'

export const LAG_DIFF_ANNOTATION_CLASS = 'operation-next-line-lag-diff'

export const lagDiffApplier: OperationApplier = {
  op: OperationOp.LagDiff,

  async apply({ operation, state, instance }: ApplierArgs): Promise<ApplierResult> {
    const result = lagDiffData(state.workingData, operation)
    console.info('[operation-new] applier:lagDiff', {
      nodeId: operation.meta?.nodeId,
      deltaCount: result.length,
      workingLen: state.workingData.length,
    })
    if (result.length === 0) {
      return { result, nextState: { ...state, derivedData: result, lastResult: result } }
    }

    const layer = instance.annotationLayer
    layer.selectAll(`.${LAG_DIFF_ANNOTATION_CLASS}`).interrupt().remove()
    const viewport = resolveAnnotationViewport(instance)
    const transitions: Promise<void>[] = []
    const highlightedPoints: SVGCircleElement[] = []

    result.forEach((datum) => {
      if (!datum.prevTarget) return
      const prevPoint = findPointByTarget(instance, String(datum.prevTarget)).nodes()[0]
      const currentPoint = findPointByTarget(instance, String(datum.target)).nodes()[0]
      if (!prevPoint || !currentPoint) {
        console.error('[operation-new] simple-line lagDiff: adjacent point not found', { datum })
        return
      }
      const prev = pointToRootCoords(prevPoint, instance)
      const current = pointToRootCoords(currentPoint, instance)
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
      // Use selection of nodes directly so we can transition all highlighted
      // circles in one shot, regardless of which DOM subtree they live in.
      const sel = instance.pointMarks.filter(function () {
        return highlightedPoints.includes(this as SVGCircleElement)
      })
      transitions.push(
        sel
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
          { cssClass: LAG_DIFF_ANNOTATION_CLASS, role: 'anchor', persistent: true },
        ],
      },
    }
  },
}

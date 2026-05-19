import * as d3 from 'd3'
import { retrieveValue } from '../../../domain/operation/dataOps'
import { OperationOp } from '../../../domain/operation/types'
import { DataAttributes, SvgAttributes, SvgClassNames, SvgElements } from '../../../rendering/interfaces'
import { COLORS, DURATIONS } from '../../../rendering/common/d3Helpers'
import { formatOperationValue } from '../../../operation-next/primitives/formatValue'
import type { OperationApplier, ApplierArgs, ApplierResult } from '../../applier'
import { findPointByTarget, pointToRootCoords, resolveAnnotationViewport } from '../../primitives/annotationLayer'
import { placeOperationTextLabel } from '../../primitives/placeLabel'

const RETRIEVE_ANNOTATION_CLASS = 'operation-next-line-retrieve-value'

export const retrieveValueApplier: OperationApplier = {
  op: OperationOp.RetrieveValue,

  async apply({ operation, state, instance }: ApplierArgs): Promise<ApplierResult> {
    const result = retrieveValue(state.workingData, operation)
    console.info('[operation-new] applier:retrieveValue', {
      nodeId: operation.meta?.nodeId,
      target: operation.target,
      resultLen: result.length,
    })
    const layer = instance.annotationLayer
    layer.selectAll(`.${RETRIEVE_ANNOTATION_CLASS}`).interrupt().remove()
    if (result.length === 0) {
      return { result, nextState: { ...state, lastResult: result } }
    }
    const viewport = resolveAnnotationViewport(instance)
    const transitions: Promise<unknown>[] = []

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
      const labelY = Math.max(12, metrics.y - 10 - index * 16)
      const labelNode = layer
        .append(SvgElements.Text)
        .attr(SvgAttributes.Class, `${SvgClassNames.TextAnnotation} ${RETRIEVE_ANNOTATION_CLASS}`)
        .attr(SvgAttributes.X, metrics.x)
        .attr(SvgAttributes.Y, labelY)
        .attr(SvgAttributes.TextAnchor, 'middle')
        .attr(SvgAttributes.FontSize, 12)
        .attr(SvgAttributes.FontWeight, 700)
        .attr(SvgAttributes.Fill, COLORS.TEXT_DARK)
        .attr(DataAttributes.Target, String(datum.target))
        .style(SvgAttributes.Opacity, 0)
        .text(formatOperationValue(metrics.value))
      placeOperationTextLabel({
        svg: instance.svg,
        text: labelNode as unknown as d3.Selection<SVGTextElement, unknown, null, undefined>,
        preferred: { x: metrics.x, y: labelY },
        anchorElement: point,
        viewport,
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

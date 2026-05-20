import * as d3 from 'd3'
import { retrieveValue } from '../../../domain/operation/dataOps'
import { OperationOp } from '../../../domain/operation/types'
import { DataAttributes, SvgAttributes, SvgClassNames, SvgElements } from '../../../rendering/interfaces'
import { COLORS, DURATIONS } from '../../../rendering/common/d3Helpers'
import { formatOperationValue } from '../../../operation-next/primitives/formatValue'
import type { OperationApplier, ApplierArgs, ApplierResult } from '../../applier'
import type { SimpleBarChartInstance } from '../../../rendering-new/instances/simpleBarInstance'
import { placeOperationTextLabel } from '../../primitives/placeLabel'
import { findBarByTarget, readBarMetrics, resolveBarAnnotationViewport } from './_shared'

export const RETRIEVE_ANNOTATION_CLASS = 'operation-next-retrieve-value'

export const retrieveValueApplier: OperationApplier<SimpleBarChartInstance> = {
  op: OperationOp.RetrieveValue,

  async apply({ operation, state, instance }: ApplierArgs<SimpleBarChartInstance>): Promise<ApplierResult> {
    const result = retrieveValue(state.workingData, operation)
    console.info('[operation-new] bar applier:retrieveValue', {
      nodeId: operation.meta?.nodeId,
      target: operation.target,
      resultLen: result.length,
    })

    const layer = instance.annotationLayer
    layer.selectAll(`.${RETRIEVE_ANNOTATION_CLASS}`).interrupt().remove()
    if (result.length === 0) {
      return { result, nextState: { ...state, lastResult: result } }
    }

    const viewport = resolveBarAnnotationViewport(instance)
    const transitions: Promise<unknown>[] = []

    result.forEach((datum, index) => {
      const target = String(datum.target)
      const barSel = findBarByTarget(instance, target)
      const rect = barSel.nodes()[0]
      if (!rect) return
      const metrics = readBarMetrics(rect, instance)

      transitions.push(
        barSel
          .interrupt()
          .transition()
          .duration(DURATIONS.HIGHLIGHT)
          .attr(SvgAttributes.Fill, COLORS.ANNOTATION_RED)
          .end()
          .catch(() => {}),
      )

      const labelY = Math.max(12, metrics.topY - 10 - index * 16)
      const labelNode = layer
        .append(SvgElements.Text)
        .attr(SvgAttributes.Class, `${SvgClassNames.TextAnnotation} ${RETRIEVE_ANNOTATION_CLASS}`)
        .attr(SvgAttributes.X, metrics.centerX)
        .attr(SvgAttributes.Y, labelY)
        .attr(SvgAttributes.TextAnchor, 'middle')
        .attr(SvgAttributes.FontSize, 12)
        .attr(SvgAttributes.FontWeight, 700)
        .attr(SvgAttributes.Fill, COLORS.TEXT_DARK)
        .attr(DataAttributes.Target, target)
        .style(SvgAttributes.Opacity, 0)
        .text(formatOperationValue(metrics.value))

      placeOperationTextLabel({
        svg: instance.svg,
        text: labelNode as unknown as d3.Selection<SVGTextElement, unknown, null, undefined>,
        preferred: { x: metrics.centerX, y: labelY },
        anchorElement: rect,
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

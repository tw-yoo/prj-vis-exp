import * as d3 from 'd3'
import { findExtremum } from '../../../domain/operation/dataOps'
import { OperationOp, type OperationSpec } from '../../../domain/operation/types'
import { DataAttributes, SvgAttributes, SvgClassNames, SvgElements } from '../../../rendering/interfaces'
import { COLORS, DURATIONS } from '../../../rendering/common/d3Helpers'
import { formatOperationValue } from '../../../operation-next/primitives/formatValue'
import type { OperationApplier, ApplierArgs, ApplierResult } from '../../applier'
import type { SimpleBarChartInstance } from '../../../rendering-new/instances/simpleBarInstance'
import { applyAnnotationContextFade } from '../../primitives/contextFade'
import { placeOperationTextLabel } from '../../primitives/placeLabel'
import { FILTER_ANNOTATION_CLASS } from './filter'
import { findBarByTarget, readBarMetrics, resolveBarAnnotationViewport } from './_shared'

export const EXTREMUM_ANNOTATION_CLASS = 'operation-next-extremum'

function operationNodeId(operation: OperationSpec): string | null {
  const raw = operation as OperationSpec & { id?: string | number; key?: string | number }
  const nodeId = operation.meta?.nodeId
  if (typeof nodeId === 'string' || typeof nodeId === 'number') return String(nodeId)
  if (raw.id != null) return String(raw.id)
  if (raw.key != null) return String(raw.key)
  return null
}

export const findExtremumApplier: OperationApplier<SimpleBarChartInstance> = {
  op: OperationOp.FindExtremum,

  async apply({ operation, state, instance }: ApplierArgs<SimpleBarChartInstance>): Promise<ApplierResult> {
    console.info('[operation-new] bar applier:findExtremum', {
      nodeId: operation.meta?.nodeId,
      which: operation.which,
      hasDerivedData: state.derivedData !== null,
      workingLen: state.workingData.length,
    })

    // State-driven: prefer derivedData if a prior op set it (op-agnostic).
    const source = state.derivedData != null ? state.derivedData : state.workingData
    const result = findExtremum(source, operation)
    const target = result[0]?.target
    if (target == null) return { result, nextState: { ...state, lastResult: result } }

    const layer = instance.annotationLayer
    applyAnnotationContextFade(layer, state.annotationRecords, FILTER_ANNOTATION_CLASS)

    const nodeId = operationNodeId(operation)
    if (nodeId) {
      layer
        .selectAll<SVGElement, unknown>(
          `.${EXTREMUM_ANNOTATION_CLASS}[${DataAttributes.AnnotationNodeId}="${CSS.escape(nodeId)}"]`,
        )
        .interrupt()
        .remove()
    } else {
      layer.selectAll(`.${EXTREMUM_ANNOTATION_CLASS}`).interrupt().remove()
    }

    const barSel = findBarByTarget(instance, String(target))
    const rect = barSel.nodes()[0]
    if (!rect) return { result, nextState: { ...state, lastResult: result } }
    const metrics = readBarMetrics(rect, instance)

    barSel
      .interrupt()
      .transition()
      .duration(DURATIONS.HIGHLIGHT)
      .attr(SvgAttributes.Fill, COLORS.ANNOTATION_RED)

    const labelY = Math.max(12, metrics.topY - 10)
    const labelNode = layer
      .append(SvgElements.Text)
      .attr(SvgAttributes.Class, `${SvgClassNames.TextAnnotation} ${EXTREMUM_ANNOTATION_CLASS}`)
      .attr(SvgAttributes.X, metrics.centerX)
      .attr(SvgAttributes.Y, labelY)
      .attr(SvgAttributes.TextAnchor, 'middle')
      .attr(SvgAttributes.FontSize, 12)
      .attr(SvgAttributes.FontWeight, 700)
      .attr(SvgAttributes.Fill, COLORS.TEXT_DARK)
      .style(SvgAttributes.Opacity, 0)
      .text(formatOperationValue(metrics.value))
    if (nodeId) labelNode.attr(DataAttributes.AnnotationNodeId, nodeId)
    placeOperationTextLabel({
      svg: instance.svg,
      text: labelNode as unknown as d3.Selection<SVGTextElement, unknown, null, undefined>,
      preferred: { x: metrics.centerX, y: labelY },
      anchorElement: rect,
      viewport: resolveBarAnnotationViewport(instance),
    })
    try {
      await labelNode.transition().duration(DURATIONS.LABEL_FADE_IN).style(SvgAttributes.Opacity, 1).end()
    } catch {
      /* interrupted */
    }

    return {
      result,
      nextState: {
        ...state,
        lastResult: result,
        annotationRecords: [
          ...state.annotationRecords,
          { cssClass: EXTREMUM_ANNOTATION_CLASS, role: 'result', persistent: false },
        ],
      },
    }
  },
}

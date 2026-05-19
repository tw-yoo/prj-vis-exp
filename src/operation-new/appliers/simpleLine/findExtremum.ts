import * as d3 from 'd3'
import { findExtremum } from '../../../domain/operation/dataOps'
import { OperationOp, type OperationSpec } from '../../../domain/operation/types'
import { DataAttributes, SvgAttributes, SvgClassNames, SvgElements } from '../../../rendering/interfaces'
import { COLORS, DURATIONS, EASINGS } from '../../../rendering/common/d3Helpers'
import { formatOperationValue } from '../../../operation-next/primitives/formatValue'
import type { OperationApplier, ApplierArgs, ApplierResult } from '../../applier'
import {
  findPointByTarget,
  pointToRootCoords,
  resolveAnnotationViewport,
} from '../../primitives/annotationLayer'
import { applyAnnotationContextFade } from '../../primitives/contextFade'
import { placeOperationTextLabel } from '../../primitives/placeLabel'
import { FILTER_ANNOTATION_CLASS } from './filter'
import { LAG_DIFF_ANNOTATION_CLASS } from './lagDiff'
import type { SimpleLineChartInstance } from '../../../rendering-new/instances/simpleLineInstance'

const EXTREMUM_ANNOTATION_CLASS = 'operation-next-line-extremum'

function operationNodeId(operation: OperationSpec): string | null {
  const raw = operation as OperationSpec & { id?: string | number; key?: string | number }
  const nodeId = operation.meta?.nodeId
  if (typeof nodeId === 'string' || typeof nodeId === 'number') return String(nodeId)
  if (raw.id != null) return String(raw.id)
  if (raw.key != null) return String(raw.key)
  return null
}

async function strengthenArrowForTarget(instance: SimpleLineChartInstance, targetKey: string) {
  const arrowLines = instance.annotationLayer.selectAll<SVGLineElement, unknown>(
    `line.${LAG_DIFF_ANNOTATION_CLASS}[data-target="${CSS.escape(targetKey)}"]`,
  )
  if (arrowLines.empty()) return
  try {
    await arrowLines
      .interrupt()
      .transition()
      .duration(DURATIONS.HIGHLIGHT)
      .ease(EASINGS.SMOOTH)
      .attr(SvgAttributes.StrokeWidth, 4)
      .attr(SvgAttributes.Stroke, COLORS.ANNOTATION_STRONG_RED)
      .end()
  } catch {
    /* interrupted */
  }
}

export const findExtremumApplier: OperationApplier = {
  op: OperationOp.FindExtremum,

  async apply({ operation, state, instance }: ApplierArgs): Promise<ApplierResult> {
    console.info('[operation-new] applier:findExtremum', {
      nodeId: operation.meta?.nodeId,
      which: operation.which,
      hasDerivedData: state.derivedData !== null,
      workingLen: state.workingData.length,
    })
    // State-driven branch: if a prior op produced derivedData (e.g. lagDiff
    // deltas), the extremum is over those deltas and we strengthen the
    // matching arrow instead of drawing a new annotation. The branch is on
    // state, not on operation order — works for any op that sets derivedData.
    if (state.derivedData !== null) {
      const result = findExtremum(state.derivedData, operation)
      const targetKey = result[0]?.target
      if (targetKey != null) {
        await strengthenArrowForTarget(instance, String(targetKey))
      }
      return { result, nextState: { ...state, lastResult: result } }
    }

    const result = findExtremum(state.workingData, operation)
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

    const pointSel = findPointByTarget(instance, String(target))
    const point = pointSel.nodes()[0]
    if (!point) return { result, nextState: { ...state, lastResult: result } }
    const metrics = pointToRootCoords(point, instance)

    pointSel
      .interrupt()
      .transition()
      .duration(DURATIONS.HIGHLIGHT)
      .attr(SvgAttributes.Fill, COLORS.ANNOTATION_RED)
      .attr(SvgAttributes.R, 6)

    const labelY = Math.max(12, metrics.y - 10)
    const labelNode = layer
      .append(SvgElements.Text)
      .attr(SvgAttributes.Class, `${SvgClassNames.TextAnnotation} ${EXTREMUM_ANNOTATION_CLASS}`)
      .attr(SvgAttributes.X, metrics.x)
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
      preferred: { x: metrics.x, y: labelY },
      anchorElement: point,
      viewport: resolveAnnotationViewport(instance),
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

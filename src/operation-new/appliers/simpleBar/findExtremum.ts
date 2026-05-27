import { findExtremum } from '../../../domain/operation/dataOps'
import { OperationOp, type OperationSpec } from '../../../domain/operation/types'
import { DataAttributes, SvgAttributes, SvgClassNames, SvgElements } from '../../../rendering/interfaces'
import { COLORS, DURATIONS } from '../../../rendering/common/d3Helpers'
import { formatOperationValue } from '../../../operation-next/primitives/formatValue'
import type { OperationApplier, ApplierArgs, ApplierResult } from '../../applier'
import type { SimpleBarChartInstance } from '../../../rendering-new/instances/simpleBarInstance'
import { applyAnnotationContextFade } from '../../primitives/contextFade'
import { fadeRemoveAnnotations } from '../../primitives/fadeRemove'
import { FILTER_ANNOTATION_CLASS } from './filter'
import { findBarByTarget, readBarMetrics } from './_shared'

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

  async apply({ operation, state, instance, options }: ApplierArgs<SimpleBarChartInstance>): Promise<ApplierResult> {
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
    applyAnnotationContextFade(layer, state.annotationRecords, FILTER_ANNOTATION_CLASS, options?.referencedResultIds)

    const nodeId = operationNodeId(operation)
    if (nodeId) {
      layer
        .selectAll<SVGElement, unknown>(
          `.${EXTREMUM_ANNOTATION_CLASS}[${DataAttributes.AnnotationNodeId}="${CSS.escape(nodeId)}"]`,
        )
        .interrupt()
        .remove()
    } else {
      fadeRemoveAnnotations(layer, EXTREMUM_ANNOTATION_CLASS)
    }

    const barSel = findBarByTarget(instance, String(target))
    const rect = barSel.nodes()[0]
    if (!rect) return { result, nextState: { ...state, lastResult: result } }
    const metrics = readBarMetrics(rect, instance)

    const highlightPromise = barSel
      .interrupt()
      .transition()
      .duration(DURATIONS.HIGHLIGHT)
      .attr(SvgAttributes.Fill, COLORS.ANNOTATION_RED)
      .end()
      .catch(() => {})

    // Label above the bar top by default; flip below if that would land above
    // the chart's top margin. Matches the simpleLine findExtremum pattern —
    // no collision avoidance, SVG root has overflow:visible so the label can
    // sit anywhere relative to the anchor.
    const naturalAbove = metrics.topY - 12
    const labelMinY = instance.layout.marginTop + 12
    const labelY = naturalAbove >= labelMinY ? naturalAbove : metrics.topY + 20
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
    const labelPromise = labelNode
      .transition()
      .duration(DURATIONS.LABEL_FADE_IN)
      .style(SvgAttributes.Opacity, 1)
      .end()
      .catch(() => {})
    await Promise.all([highlightPromise, labelPromise])

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

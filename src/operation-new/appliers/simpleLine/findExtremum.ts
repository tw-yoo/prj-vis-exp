import { findExtremum } from '../../../domain/operation/dataOps'
import { OperationOp, type OperationSpec } from '../../../domain/operation/types'
import { DataAttributes, SvgAttributes, SvgClassNames, SvgElements } from '../../../rendering/interfaces'
import { COLORS, DURATIONS, EASINGS } from '../../../rendering/common/d3Helpers'
import { formatOperationValue } from '../../../operation-next/primitives/formatValue'
import type { OperationApplier, ApplierArgs, ApplierResult } from '../../applier'
import { findPointByTarget, pointToRootCoords } from '../../primitives/annotationLayer'
import { applyAnnotationContextFade } from '../../primitives/contextFade'
import { fadeRemoveAnnotations } from '../../primitives/fadeRemove'
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
      fadeRemoveAnnotations(layer, EXTREMUM_ANNOTATION_CLASS)
    }

    const pointSel = findPointByTarget(instance, String(target))
    const point = pointSel.nodes()[0]
    if (!point) return { result, nextState: { ...state, lastResult: result } }
    const metrics = pointToRootCoords(point, instance)

    const highlightPromise = pointSel
      .interrupt()
      .transition()
      .duration(DURATIONS.HIGHLIGHT)
      .attr(SvgAttributes.Fill, COLORS.ANNOTATION_RED)
      .attr(SvgAttributes.R, 6)
      .end()
      .catch(() => {})

    // Place label above the point; if that would land above the chart's top
    // margin, flip below. No collision avoidance — SVG root has
    // overflow:visible, so the label can sit anywhere relative to the point
    // and remain visible even past the plot box.
    const naturalAbove = metrics.y - 12
    const labelMinY = instance.layout.marginTop + 12
    const labelY = naturalAbove >= labelMinY ? naturalAbove : metrics.y + 20
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

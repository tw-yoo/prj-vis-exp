import { nthData } from '../../../domain/operation/dataOps'
import { OperationOp, type OperationSpec } from '../../../domain/operation/types'
import { RESULT_REF_ATTRIBUTE } from '../../../operation-next/diffEndpoint'
import { DataAttributes, SvgAttributes } from '../../../rendering/interfaces'
import { COLORS, DURATIONS } from '../../../rendering/common/d3Helpers'
import { formatOperationValue } from '../../../operation-next/primitives/formatValue'
import type { OperationApplier, ApplierArgs, ApplierResult } from '../../applier'
import { findPointByTarget, pointToRootCoords, resolveAnnotationViewport } from '../../primitives/annotationLayer'
import { placeValueLabel } from '../../primitives/placeValueLabel'
import { applyAnnotationContextFade } from '../../primitives/contextFade'
import { fadeRemoveAnnotations } from '../../primitives/fadeRemove'
import { FILTER_ANNOTATION_CLASS } from './filter'

/**
 * `nth` is semantically a sibling of `findExtremum`: both pick a single row
 * (or list of rows) from the sorted dataset. Visually we treat them
 * identically — highlight the selected point in red + value label above.
 *
 * If `n` is a list, every matching row is highlighted (mirrors nthData's
 * multi-result shape).
 */

export const NTH_ANNOTATION_CLASS = 'operation-next-line-nth'

function operationNodeId(operation: OperationSpec): string | null {
  const raw = operation as OperationSpec & { id?: string | number; key?: string | number }
  const nodeId = operation.meta?.nodeId
  if (typeof nodeId === 'string' || typeof nodeId === 'number') return String(nodeId)
  if (raw.id != null) return String(raw.id)
  if (raw.key != null) return String(raw.key)
  return null
}

export const nthApplier: OperationApplier = {
  op: OperationOp.Nth,

  async apply({ operation, state, instance }: ApplierArgs): Promise<ApplierResult> {
    const result = nthData(state.workingData, operation)
    console.info('[operation-new] applier:nth', {
      nodeId: operation.meta?.nodeId,
      n: operation.n,
      from: (operation as OperationSpec & { from?: string }).from,
      resultCount: result.length,
    })
    if (result.length === 0) {
      return { result, nextState: { ...state, lastResult: result } }
    }

    const layer = instance.annotationLayer
    applyAnnotationContextFade(layer, state.annotationRecords, FILTER_ANNOTATION_CLASS)

    const nodeId = operationNodeId(operation)
    if (nodeId) {
      layer
        .selectAll<SVGElement, unknown>(
          `.${NTH_ANNOTATION_CLASS}[${DataAttributes.AnnotationNodeId}="${CSS.escape(nodeId)}"]`,
        )
        .interrupt()
        .remove()
    } else {
      fadeRemoveAnnotations(layer, NTH_ANNOTATION_CLASS)
    }

    const highlightPromises: Promise<unknown>[] = []
    const labelPromises: Promise<unknown>[] = []

    for (const datum of result) {
      const target = datum.target
      if (target == null) continue
      const pointSel = findPointByTarget(instance, String(target))
      const point = pointSel.nodes()[0]
      if (!point) continue
      const metrics = pointToRootCoords(point, instance)

      // Tag the highlighted point with its result-ref so a downstream split
      // diff can locate this endpoint on its surface (primitives/splitDiffOverlay).
      if (nodeId) pointSel.attr(RESULT_REF_ATTRIBUTE, nodeId)

      // ALSO drop an invisible anchor line in the ANNOTATION LAYER at the
      // value position: a mid-chain chart-type swap (sort line→bar) detaches
      // the circle stamped above, and a detached node can't be located by the
      // cross-surface merge resolver. The annotation layer survives the swap.
      if (nodeId) {
        layer
          .append('line')
          .attr(SvgAttributes.Class, `${NTH_ANNOTATION_CLASS} ${NTH_ANNOTATION_CLASS}-anchor`)
          .attr(DataAttributes.AnnotationNodeId, nodeId)
          .attr(RESULT_REF_ATTRIBUTE, nodeId)
          .attr(SvgAttributes.X1, metrics.x - 12)
          .attr(SvgAttributes.X2, metrics.x + 12)
          .attr(SvgAttributes.Y1, metrics.y)
          .attr(SvgAttributes.Y2, metrics.y)
          .attr(SvgAttributes.Stroke, COLORS.ANNOTATION_RED)
          .attr(SvgAttributes.StrokeWidth, 2)
          .style(SvgAttributes.Opacity, 0)
          .style('pointer-events', 'none')
      }

      highlightPromises.push(
        pointSel
          .interrupt()
          .transition()
          .duration(DURATIONS.HIGHLIGHT)
          .attr(SvgAttributes.Fill, COLORS.ANNOTATION_RED)
          .attr(SvgAttributes.R, 6)
          .end()
          .catch(() => {}),
      )

      const labelNode = placeValueLabel({
        layer,
        svg: instance.svg,
        viewport: resolveAnnotationViewport(instance),
        preferred: { x: metrics.x, y: metrics.y - 12 },
        text: formatOperationValue(metrics.value),
        className: NTH_ANNOTATION_CLASS,
        dataAttrs: nodeId ? [[DataAttributes.AnnotationNodeId, nodeId]] : [],
      })
      labelPromises.push(
        labelNode
          .transition()
          .duration(DURATIONS.LABEL_FADE_IN)
          .style(SvgAttributes.Opacity, 1)
          .end()
          .catch(() => {}),
      )
    }

    await Promise.all([...highlightPromises, ...labelPromises])

    return {
      result,
      nextState: {
        ...state,
        lastResult: result,
        annotationRecords: [
          ...state.annotationRecords,
          { cssClass: NTH_ANNOTATION_CLASS, role: 'result', persistent: false },
        ],
      },
    }
  },
}

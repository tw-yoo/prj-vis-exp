import { findExtremum } from '../../../domain/operation/dataOps'
import { OperationOp, type OperationSpec } from '../../../domain/operation/types'
import { RESULT_REF_ATTRIBUTE } from '../../../operation-next/diffEndpoint'
import { DataAttributes, SvgAttributes } from '../../../rendering/interfaces'
import { COLORS, DURATIONS } from '../../../rendering/common/d3Helpers'
import { formatOperationValue } from '../../../operation-next/primitives/formatValue'
import type { OperationApplier, ApplierArgs, ApplierResult } from '../../applier'
import type { SimpleBarChartInstance } from '../../../rendering-new/instances/simpleBarInstance'
import { applyAnnotationContextFade } from '../../primitives/contextFade'
import { fadeRemoveAnnotations } from '../../primitives/fadeRemove'
import { placeValueLabel } from '../../primitives/placeValueLabel'
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

    // Value label above the bar top, positioned by the shared collision-aware
    // placer (avoids bars + other labels; never lands inside the bar). Tagged
    // with both the node id (same-node replacement) and the result-ref (so the
    // per-op keep-set cleanup can remove it once no later op references it —
    // case 1hlsoeyqlr1r1n41, where the extremum text lingered).
    const labelNode = placeValueLabel({
      layer,
      svg: instance.svg,
      viewport: resolveBarAnnotationViewport(instance),
      preferred: { x: metrics.centerX, y: metrics.topY - 12 },
      text: formatOperationValue(metrics.value),
      className: EXTREMUM_ANNOTATION_CLASS,
      dataAttrs: nodeId
        ? [[DataAttributes.AnnotationNodeId, nodeId], [RESULT_REF_ATTRIBUTE, nodeId]]
        : [],
    })
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

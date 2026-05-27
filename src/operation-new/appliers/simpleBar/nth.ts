import { nthData } from '../../../domain/operation/dataOps'
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

/**
 * `nth` on a simple-bar chart — picks the row at position `n` from the
 * sorted dataset and highlights the matching bar. Mirrors the visual
 * convention of `findExtremumApplier` (red fill + value label above).
 *
 * Debug output is emitted as multi-line JSON so console keeps it expanded.
 */

export const NTH_ANNOTATION_CLASS = 'operation-next-simple-bar-nth'

function debugLog(label: string, payload: Record<string, unknown>): void {
  console.info(`[operation-new] simpleBar applier:nth :: ${label}\n${JSON.stringify(payload, null, 2)}`)
}

function operationNodeId(operation: OperationSpec): string | null {
  const raw = operation as OperationSpec & { id?: string | number; key?: string | number }
  const nodeId = operation.meta?.nodeId
  if (typeof nodeId === 'string' || typeof nodeId === 'number') return String(nodeId)
  if (raw.id != null) return String(raw.id)
  if (raw.key != null) return String(raw.key)
  return null
}

export const nthApplier: OperationApplier<SimpleBarChartInstance> = {
  op: OperationOp.Nth,

  async apply({ operation, state, instance }: ApplierArgs<SimpleBarChartInstance>): Promise<ApplierResult> {
    const result = nthData(state.workingData, operation)
    debugLog('ENTRY', {
      nodeId: operation.meta?.nodeId,
      n: (operation as OperationSpec & { n?: number | number[] }).n,
      from: (operation as OperationSpec & { from?: string }).from,
      orderField: (operation as OperationSpec & { orderField?: string }).orderField,
      workingLen: state.workingData.length,
      resultCount: result.length,
      results: result.map((d) => ({ target: d.target, value: d.value })),
    })
    if (result.length === 0) {
      debugLog('EMPTY-RESULT', { reason: 'nthData returned no rows' })
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
    const drawnTargets: string[] = []

    for (const datum of result) {
      const target = datum.target
      if (target == null) continue
      const barSel = findBarByTarget(instance, String(target))
      const rect = barSel.nodes()[0]
      if (!rect) {
        debugLog('NO-MATCHING-BAR', { target: String(target) })
        continue
      }
      const metrics = readBarMetrics(rect, instance)
      drawnTargets.push(String(target))

      highlightPromises.push(
        barSel
          .interrupt()
          .transition()
          .duration(DURATIONS.HIGHLIGHT)
          .attr(SvgAttributes.Fill, COLORS.ANNOTATION_RED)
          .end()
          .catch(() => undefined),
      )

      // Label above the bar top — flip below if it would clip the top margin.
      const naturalAbove = metrics.topY - 12
      const labelMinY = instance.layout.marginTop + 12
      const labelY = naturalAbove >= labelMinY ? naturalAbove : metrics.topY + 18
      const labelNode = layer
        .append(SvgElements.Text)
        .attr(SvgAttributes.Class, `${SvgClassNames.TextAnnotation} ${NTH_ANNOTATION_CLASS}`)
        .attr(SvgAttributes.X, metrics.centerX)
        .attr(SvgAttributes.Y, labelY)
        .attr(SvgAttributes.TextAnchor, 'middle')
        .attr(SvgAttributes.FontSize, 12)
        .attr(SvgAttributes.FontWeight, 700)
        .attr(SvgAttributes.Fill, COLORS.TEXT_DARK)
        .style(SvgAttributes.Opacity, 0)
        .text(formatOperationValue(metrics.value))
      if (nodeId) labelNode.attr(DataAttributes.AnnotationNodeId, nodeId)
      labelPromises.push(
        labelNode
          .transition()
          .duration(DURATIONS.LABEL_FADE_IN)
          .style(SvgAttributes.Opacity, 1)
          .end()
          .catch(() => undefined),
      )
    }

    await Promise.all([...highlightPromises, ...labelPromises])

    debugLog('DONE', {
      drawnTargets,
      labelCount: labelPromises.length,
      highlightCount: highlightPromises.length,
    })

    return {
      result,
      nextState: {
        ...state,
        lastResult: result,
        annotationRecords: [
          ...state.annotationRecords,
          { cssClass: NTH_ANNOTATION_CLASS, role: 'result' as const, persistent: false },
        ],
      },
    }
  },
}

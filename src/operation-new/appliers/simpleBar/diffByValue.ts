import {
  diffByValueOp,
  getRuntimeResultsById,
  resolveScalarAggregateFromRows,
} from '../../../domain/operation/dataOps'
import { OperationOp, type OperationSpec } from '../../../domain/operation/types'
import { SvgAttributes, SvgClassNames, SvgElements } from '../../../rendering/interfaces'
import { COLORS, DURATIONS, EASINGS } from '../../../rendering/common/d3Helpers'
import { formatOperationValue } from '../../../operation-next/primitives/formatValue'
import { RESULT_REF_ATTRIBUTE, operationResultRef } from '../../../operation-next/diffEndpoint'
import type { OperationApplier, ApplierArgs, ApplierResult } from '../../applier'
import type { SimpleBarChartInstance } from '../../../rendering-new/instances/simpleBarInstance'
import { drawReferenceLine } from '../../primitives/drawReferenceLine'
import { fadeRemoveAnnotations } from '../../primitives/fadeRemove'
import { readBarMetrics, resolveBarAnnotationViewport, valueToRootY } from './_shared'

export const DIFF_BY_VALUE_ANNOTATION_CLASS = 'operation-next-diff-by-value'

function resolveReferenceValue(operation: OperationSpec): number | null {
  const literal = (operation as OperationSpec & { value?: unknown }).value
  if (typeof literal === 'number' && Number.isFinite(literal)) return literal
  const targetValue = (operation as OperationSpec & { targetValue?: unknown }).targetValue
  if (typeof targetValue !== 'string' || !targetValue.trim()) return null
  const refKey = (targetValue.startsWith('ref:') ? targetValue.slice('ref:'.length) : targetValue).trim()
  if (!refKey) return null
  return resolveScalarAggregateFromRows(getRuntimeResultsById(refKey))
}

function extractRefKey(operation: OperationSpec): string | null {
  const targetValue = (operation as OperationSpec & { targetValue?: unknown }).targetValue
  if (typeof targetValue !== 'string') return null
  const trimmed = targetValue.trim()
  if (!trimmed.startsWith('ref:')) return null
  const key = trimmed.slice('ref:'.length).trim()
  return key.length > 0 ? key : null
}

export const diffByValueApplier: OperationApplier<SimpleBarChartInstance> = {
  op: OperationOp.DiffByValue,

  async apply({ operation, state, instance }: ApplierArgs<SimpleBarChartInstance>): Promise<ApplierResult> {
    const result = diffByValueOp(state.workingData, operation)
    console.info('[operation-new] bar applier:diffByValue', {
      nodeId: operation.meta?.nodeId,
      resultLen: result.length,
    })

    const layer = instance.annotationLayer
    fadeRemoveAnnotations(layer, DIFF_BY_VALUE_ANNOTATION_CLASS)

    const reference = resolveReferenceValue(operation)
    if (reference == null) {
      return { result, nextState: { ...state, lastResult: result } }
    }

    const x1 = instance.layout.marginLeft
    const x2 = instance.layout.marginLeft + instance.layout.plotWidth
    const referenceY = valueToRootY(instance, reference)
    const viewport = resolveBarAnnotationViewport(instance)

    // If `targetValue: "ref:nX"` and an on-screen annotation already references
    // that scalar (typically the upstream Average label sitting at the same y),
    // suppress the redundant "Value: X" line+label per feedback `1bbe64wpvq06sknm`.
    const refKey = extractRefKey(operation)
    const reusedExistingRef = refKey != null && layer
      .selectAll<SVGElement, unknown>(`[${RESULT_REF_ATTRIBUTE}="${refKey}"]`)
      .nodes().length > 0

    if (!reusedExistingRef) {
      await drawReferenceLine({
        layer,
        cssClass: DIFF_BY_VALUE_ANNOTATION_CLASS,
        x1,
        x2,
        y: referenceY,
        label: `Value: ${formatOperationValue(reference)}`,
        svg: instance.svg,
        viewport,
        anchorValue: reference,
      })
    }

    // Per-bar delta labels + connector lines from each bar top to the reference line.
    const deltaByTarget = new Map<string, number>()
    for (const row of result) deltaByTarget.set(String(row.target), Number(row.value))

    const labelData: Array<{ x: number; y: number; delta: number; anchor: SVGRectElement }> = []
    instance.bars.each(function () {
      const rect = this as SVGRectElement
      const target = rect.getAttribute('data-target')
      if (target == null) return
      const delta = deltaByTarget.get(target)
      if (delta == null || !Number.isFinite(delta)) return
      const metrics = readBarMetrics(rect, instance)
      labelData.push({ x: metrics.centerX, y: metrics.topY, delta, anchor: rect })
    })

    // Connectors first (behind text labels in stacking order).
    const connectors = layer
      .selectAll<SVGLineElement, { x: number; y: number; delta: number }>(
        `line.${DIFF_BY_VALUE_ANNOTATION_CLASS}.bar-connector`,
      )
      .data(labelData)
      .enter()
      .append(SvgElements.Line)
      .attr(SvgAttributes.Class, `${SvgClassNames.LineAnnotation} ${DIFF_BY_VALUE_ANNOTATION_CLASS} bar-connector`)
      .attr(SvgAttributes.X1, (d) => d.x)
      .attr(SvgAttributes.X2, (d) => d.x)
      .attr(SvgAttributes.Y1, referenceY)
      .attr(SvgAttributes.Y2, referenceY)
      .attr(SvgAttributes.Stroke, COLORS.ANNOTATION_RED)
      .attr(SvgAttributes.StrokeWidth, 1.5)
      .style(SvgAttributes.Opacity, 0)

    const labelMinY = instance.layout.marginTop + 12
    const labelYFor = (y: number) => {
      const naturalAbove = y - 8
      return naturalAbove >= labelMinY ? naturalAbove : y + 18
    }
    const labels = layer
      .selectAll<SVGTextElement, { x: number; y: number; delta: number }>(
        `text.${DIFF_BY_VALUE_ANNOTATION_CLASS}.bar-delta`,
      )
      .data(labelData)
      .enter()
      .append(SvgElements.Text)
      .attr(SvgAttributes.Class, `${SvgClassNames.TextAnnotation} ${DIFF_BY_VALUE_ANNOTATION_CLASS} bar-delta`)
      .attr(SvgAttributes.X, (d) => d.x)
      .attr(SvgAttributes.Y, (d) => labelYFor(d.y))
      .attr(SvgAttributes.TextAnchor, 'middle')
      .attr(SvgAttributes.FontSize, 12)
      .attr(SvgAttributes.FontWeight, 700)
      .attr(SvgAttributes.Fill, COLORS.ANNOTATION_RED)
      .style(SvgAttributes.Opacity, 0)
      .text((d) => `${d.delta >= 0 ? '+' : ''}${formatOperationValue(d.delta)}`)

    // Animate connectors to grow from reference line to each bar top, then fade in deltas.
    await connectors
      .transition()
      .duration(DURATIONS.GUIDELINE_DRAW)
      .ease(EASINGS.SMOOTH)
      .attr(SvgAttributes.Y2, (d) => d.y)
      .style(SvgAttributes.Opacity, 0.8)
      .end()
      .catch(() => {})

    await labels
      .transition()
      .duration(DURATIONS.LABEL_FADE_IN)
      .style(SvgAttributes.Opacity, 1)
      .end()
      .catch(() => {})

    const diffByValueRef = operationResultRef(operation)
    if (diffByValueRef) {
      layer
        .selectAll<SVGElement, unknown>(`.${DIFF_BY_VALUE_ANNOTATION_CLASS}`)
        .filter(function () {
          return !this.getAttribute(RESULT_REF_ATTRIBUTE)
        })
        .attr(RESULT_REF_ATTRIBUTE, diffByValueRef)
    }

    return {
      result,
      nextState: {
        ...state,
        lastResult: result,
        annotationRecords: [
          ...state.annotationRecords,
          {
            cssClass: DIFF_BY_VALUE_ANNOTATION_CLASS,
            role: 'anchor',
            persistent: true,
            operationId: diffByValueRef == null ? undefined : String(diffByValueRef),
            resultRef: diffByValueRef == null ? undefined : String(diffByValueRef),
          },
        ],
      },
    }
  },
}

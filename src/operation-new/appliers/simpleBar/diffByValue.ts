import {
  diffByValueOp,
  getRuntimeResultsById,
  resolveScalarAggregateFromRows,
} from '../../../domain/operation/dataOps'
import { OperationOp, type OperationSpec } from '../../../domain/operation/types'
import { SvgAttributes, SvgClassNames, SvgElements } from '../../../rendering/interfaces'
import { COLORS, DURATIONS } from '../../../rendering/common/d3Helpers'
import { formatOperationValue } from '../../../operation-next/primitives/formatValue'
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

    // Per-bar delta labels.
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

    // Label above the bar top; flip below if that would clip the chart's top
    // margin. No collision avoidance — overflow:visible keeps labels visible
    // past the plot box if needed.
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

    await labels
      .transition()
      .duration(DURATIONS.LABEL_FADE_IN)
      .style(SvgAttributes.Opacity, 1)
      .end()
      .catch(() => {})

    return {
      result,
      nextState: {
        ...state,
        lastResult: result,
        annotationRecords: [
          ...state.annotationRecords,
          { cssClass: DIFF_BY_VALUE_ANNOTATION_CLASS, role: 'anchor', persistent: true },
        ],
      },
    }
  },
}

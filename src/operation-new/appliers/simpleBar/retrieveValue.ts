import { retrieveValue } from '../../../domain/operation/dataOps'
import { OperationOp } from '../../../domain/operation/types'
import { DataAttributes, SvgAttributes } from '../../../rendering/interfaces'
import { COLORS, DURATIONS } from '../../../rendering/common/d3Helpers'
import { formatOperationValue } from '../../../operation-next/primitives/formatValue'
import type { OperationApplier, ApplierArgs, ApplierResult } from '../../applier'
import type { SimpleBarChartInstance } from '../../../rendering-new/instances/simpleBarInstance'
import { fadeRemoveAnnotations } from '../../primitives/fadeRemove'
import { drawReferenceLine } from '../../primitives/drawReferenceLine'
import { placeValueLabel } from '../../primitives/placeValueLabel'
import { findBarByTarget, readBarMetrics, resolveBarAnnotationViewport, valueToRootY } from './_shared'

export const RETRIEVE_ANNOTATION_CLASS = 'operation-next-retrieve-value'

export const retrieveValueApplier: OperationApplier<SimpleBarChartInstance> = {
  op: OperationOp.RetrieveValue,

  async apply({ operation, state, instance }: ApplierArgs<SimpleBarChartInstance>): Promise<ApplierResult> {
    const result = retrieveValue(state.workingData, operation)
    const isReverse = operation.targetAxis === 'y'
    console.info('[operation-new] bar applier:retrieveValue', {
      nodeId: operation.meta?.nodeId,
      target: operation.target,
      targetAxis: operation.targetAxis ?? 'x',
      resultLen: result.length,
    })

    const layer = instance.annotationLayer
    fadeRemoveAnnotations(layer, RETRIEVE_ANNOTATION_CLASS)
    if (result.length === 0) {
      return { result, nextState: { ...state, lastResult: result } }
    }

    const transitions: Promise<unknown>[] = []

    if (isReverse) {
      // Reverse (y → x): one horizontal reference line at y=target, plus
      // highlight + category label on each bar matching that value.
      const targetValue = Number(operation.target)
      const refY = valueToRootY(instance, targetValue)
      const x1 = instance.layout.marginLeft
      const x2 = instance.layout.marginLeft + instance.layout.plotWidth
      const viewport = resolveBarAnnotationViewport(instance)

      transitions.push(
        drawReferenceLine({
          layer,
          cssClass: RETRIEVE_ANNOTATION_CLASS,
          x1,
          x2,
          y: refY,
          color: COLORS.ANNOTATION_RED,
          style: 'guideline',
          label: `${formatOperationValue(targetValue)}`,
          svg: instance.svg,
          viewport,
          anchorValue: targetValue,
        }).catch(() => undefined),
      )

      result.forEach((datum) => {
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
        // Category label at the bar top, placed by the shared collision-aware
        // placer (avoids bars + other labels).
        const labelNode = placeValueLabel({
          layer,
          svg: instance.svg,
          viewport: resolveBarAnnotationViewport(instance),
          preferred: { x: metrics.centerX, y: metrics.topY - 8 },
          text: String(datum.displayTarget ?? datum.target),
          className: RETRIEVE_ANNOTATION_CLASS,
          dataAttrs: [[DataAttributes.Target, target]],
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
    } else {
      // Forward (x → y) — original behavior.
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

        // Value label above the bar top (stack offset per index as the starting
        // preference), then de-collided by the shared placer so multiple labels
        // and any prior annotations don't overlap and none lands inside a bar.
        const labelNode = placeValueLabel({
          layer,
          svg: instance.svg,
          viewport: resolveBarAnnotationViewport(instance),
          preferred: { x: metrics.centerX, y: metrics.topY - 10 - index * 16 },
          text: formatOperationValue(metrics.value),
          className: RETRIEVE_ANNOTATION_CLASS,
          dataAttrs: [[DataAttributes.Target, target]],
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
    }

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

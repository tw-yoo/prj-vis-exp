import type * as d3 from 'd3'
import { diffData } from '../../../domain/operation/dataOps'
import { OperationOp, type TargetSelector } from '../../../domain/operation/types'
import { SvgAttributes } from '../../../rendering/interfaces'
import { COLORS, DURATIONS } from '../../../rendering/common/d3Helpers'
import { formatOperationValue } from '../../../operation-next/primitives/formatValue'
import {
  RESULT_REF_ATTRIBUTE,
  diffEndpointSelectors,
  operationResultRef,
  resolveDerivedDiffEndpoint,
} from '../../../operation-next/diffEndpoint'
import type { OperationApplier, ApplierArgs, ApplierResult } from '../../applier'
import { readNumberAttr } from '../../primitives/annotationLayer'
import { applyAnnotationContextFade } from '../../primitives/contextFade'
import { drawVerticalComparisonArrow } from '../../primitives/drawDifferenceArrow'
import { fadeRemoveAnnotations } from '../../primitives/fadeRemove'
import { inferBarYFromAxis } from '../barGroup/_shared'
import type { MultipleLineChartInstance } from '../../../rendering-new/instances/multipleLineInstance'
import { FILTER_ANNOTATION_CLASS } from './filter'
import { annotationViewport, findMultiLinePoint, pointMetrics } from './_shared'
import { placeValueLabel } from '../../primitives/placeValueLabel'

export const DIFF_ANNOTATION_CLASS = 'operation-next-multiple-line-diff'

function selectorTargetKey(selector: TargetSelector | TargetSelector[] | undefined): string | null {
  const entry = Array.isArray(selector) ? selector[0] : selector
  if (entry == null) return null
  if (typeof entry === 'string' || typeof entry === 'number') return String(entry)
  const target = entry.target ?? entry.category ?? entry.id
  return target == null ? null : String(target)
}

function selectorSeriesKey(selector: TargetSelector | TargetSelector[] | undefined): string | null {
  const entry = Array.isArray(selector) ? selector[0] : selector
  if (!entry || typeof entry !== 'object') return null
  return entry.series == null ? null : String(entry.series)
}

function existingReferenceLineY(
  layer: d3.Selection<SVGGElement, unknown, null, undefined>,
  refKey: string | null | undefined,
): number | null {
  if (!refKey) return null
  let y: number | null = null
  layer.selectAll<SVGLineElement, unknown>(`line[${RESULT_REF_ATTRIBUTE}]`).each(function () {
    if (y != null) return
    if (this.getAttribute(RESULT_REF_ATTRIBUTE) === refKey) {
      y = readNumberAttr(this, SvgAttributes.Y1)
    }
  })
  return y
}

function appendValueLabel(
  layer: d3.Selection<SVGGElement, unknown, null, undefined>,
  instance: MultipleLineChartInstance,
  className: string,
  x: number,
  y: number,
  text: string,
  color: string,
) {
  const labelNode = placeValueLabel({
    layer,
    svg: instance.svg,
    viewport: annotationViewport(instance),
    preferred: { x, y },
    text,
    className,
    fill: color,
  })
  return labelNode.transition().duration(DURATIONS.LABEL_FADE_IN).style(SvgAttributes.Opacity, 1)
}

/**
 * multiple-line diff applier.
 *
 * Mirrors simple-line's diff but uses the series-aware point finder so the
 * right line's point is selected. For derived endpoints (e.g. average of a
 * filtered subset), the y position is inferred from the y-axis tick geometry
 * rather than a cached scale — same as the multi-line filter / average
 * appliers.
 */
export const diffApplier: OperationApplier<MultipleLineChartInstance> = {
  op: OperationOp.Diff,

  async apply({
    operation,
    state,
    instance,
  }: ApplierArgs<MultipleLineChartInstance>): Promise<ApplierResult> {
    const result = diffData(state.workingData, operation)
    const opRef = operationResultRef(operation)
    console.info('[operation-new] multi-line applier:diff', {
      nodeId: operation.meta?.nodeId,
      opRef,
      resultValue: Number(result[0]?.value),
    })

    // Dedup: the visual-execution-player can emit duplicate run-op substeps
    // for cross-surface diffs in non-split layout. ChainState threads
    // annotationRecords through both, so we treat the second invocation by
    // the same operationId as a no-op.
    const alreadyDrawnBySameOp =
      opRef != null &&
      state.annotationRecords.some(
        (record) => record.cssClass === DIFF_ANNOTATION_CLASS && record.operationId === String(opRef),
      )
    if (alreadyDrawnBySameOp) {
      return { result, nextState: { ...state, lastResult: result } }
    }

    const selectors = diffEndpointSelectors(operation)
    const aggregateHint = typeof operation.aggregate === 'string' ? operation.aggregate : undefined
    const derivedA = resolveDerivedDiffEndpoint(selectors.targetA, aggregateHint)
    const derivedB = resolveDerivedDiffEndpoint(selectors.targetB, aggregateHint)
    const pointA = derivedA
      ? null
      : (() => {
          const target = selectorTargetKey(selectors.targetA)
          if (!target) return null
          return findMultiLinePoint(instance, target, selectorSeriesKey(selectors.targetA))
        })()
    const pointB = derivedB
      ? null
      : (() => {
          const target = selectorTargetKey(selectors.targetB)
          if (!target) return null
          return findMultiLinePoint(instance, target, selectorSeriesKey(selectors.targetB))
        })()

    const layer = instance.annotationLayer
    applyAnnotationContextFade(layer, state.annotationRecords, FILTER_ANNOTATION_CLASS)
    fadeRemoveAnnotations(layer, DIFF_ANNOTATION_CLASS)

    const marginLeft = instance.layout.marginLeft
    const plotWidth = instance.layout.plotWidth
    const arrowX = marginLeft + plotWidth + 18

    const markA = pointA ? pointMetrics(pointA, instance) : null
    const markB = pointB ? pointMetrics(pointB, instance) : null
    const existingA = existingReferenceLineY(layer, derivedA?.refKey)
    const existingB = existingReferenceLineY(layer, derivedB?.refKey)
    const derivedAY = derivedA
      ? existingA ?? (() => {
          const y = inferBarYFromAxis(instance.svg, derivedA.value)
          return y == null ? null : instance.layout.marginTop + y
        })()
      : null
    const derivedBY = derivedB
      ? existingB ?? (() => {
          const y = inferBarYFromAxis(instance.svg, derivedB.value)
          return y == null ? null : instance.layout.marginTop + y
        })()
      : null

    const a = derivedA && derivedAY != null
      ? { kind: 'derived' as const, value: derivedA.value, y: derivedAY, x: marginLeft + plotWidth, usesExistingReference: existingA != null }
      : markA
        ? { kind: 'mark' as const, value: markA.value, y: markA.y, x: markA.x, usesExistingReference: false }
        : null
    const b = derivedB && derivedBY != null
      ? { kind: 'derived' as const, value: derivedB.value, y: derivedBY, x: marginLeft + plotWidth, usesExistingReference: existingB != null }
      : markB
        ? { kind: 'mark' as const, value: markB.value, y: markB.y, x: markB.x, usesExistingReference: false }
        : null
    if (!a || !b) {
      console.warn('[operation-new] multi-line diff: endpoints could not be resolved', { operation })
      return { result, nextState: { ...state, lastResult: result } }
    }

    const topY = Math.min(a.y, b.y)
    const bottomY = Math.max(a.y, b.y)
    const differenceText = `Difference: ${formatOperationValue(Number(result[0]?.value))}`

    const markEndpoints = [a, b].filter((endpoint) => endpoint.kind === 'mark')
    const labelPromises = markEndpoints.map((endpoint) =>
      appendValueLabel(
        layer,
        instance,
        `${DIFF_ANNOTATION_CLASS} point-value`,
        endpoint.x,
        endpoint.y - 8,
        formatOperationValue(endpoint.value),
        COLORS.TEXT_DARK,
      )
        .end()
        .catch(() => {}),
    )

    await drawVerticalComparisonArrow({
      layer,
      cssClass: DIFF_ANNOTATION_CLASS,
      x: arrowX,
      topY,
      bottomY,
      refLines: [
        a.usesExistingReference ? null : { startX: marginLeft, y: a.y },
        b.usesExistingReference ? null : { startX: marginLeft, y: b.y },
      ].filter((line): line is { startX: number; y: number } => line != null),
      phaseOnePromises: labelPromises as unknown as Promise<void>[],
      color: COLORS.ANNOTATION_RED,
      label: differenceText,
      svg: instance.svg,
      viewport: annotationViewport(instance),
    })

    return {
      result,
      nextState: {
        ...state,
        lastResult: result,
        annotationRecords: [
          ...state.annotationRecords,
          {
            cssClass: DIFF_ANNOTATION_CLASS,
            role: 'anchor' as const,
            persistent: true,
            operationId: opRef == null ? undefined : String(opRef),
            resultRef: opRef == null ? undefined : String(opRef),
          },
        ],
      },
    }
  },
}

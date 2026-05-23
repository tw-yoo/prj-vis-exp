import * as d3 from 'd3'
import { diffData } from '../../../domain/operation/dataOps'
import { OperationOp } from '../../../domain/operation/types'
import { SvgAttributes, SvgClassNames, SvgElements } from '../../../rendering/interfaces'
import { COLORS, DURATIONS } from '../../../rendering/common/d3Helpers'
import { formatOperationValue } from '../../../operation-next/primitives/formatValue'
import {
  RESULT_REF_ATTRIBUTE,
  diffEndpointSelectors,
  operationResultRef,
  resolveDerivedDiffEndpoint,
} from '../../../operation-next/diffEndpoint'
import type { OperationApplier, ApplierArgs, ApplierResult } from '../../applier'
import type { SimpleBarChartInstance } from '../../../rendering-new/instances/simpleBarInstance'
import { readNumberAttr } from '../../primitives/annotationLayer'
import { applyAnnotationContextFade } from '../../primitives/contextFade'
import { drawVerticalComparisonArrow } from '../../primitives/drawDifferenceArrow'
import { fadeRemoveAnnotations } from '../../primitives/fadeRemove'
import { FILTER_ANNOTATION_CLASS } from './filter'
import {
  findBarByTarget,
  readBarMetrics,
  resolveBarAnnotationViewport,
  selectorTargetKey,
  valueToRootY,
} from './_shared'

export const DIFF_ANNOTATION_CLASS = 'operation-next-diff'

function findBarFor(
  instance: SimpleBarChartInstance,
  selector: ReturnType<typeof diffEndpointSelectors>['targetA'],
): SVGRectElement | null {
  const key = selectorTargetKey(selector)
  if (!key) return null
  return findBarByTarget(instance, key).nodes()[0] ?? null
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

export const diffApplier: OperationApplier<SimpleBarChartInstance> = {
  op: OperationOp.Diff,

  async apply({ operation, state, instance }: ApplierArgs<SimpleBarChartInstance>): Promise<ApplierResult> {
    const result = diffData(state.workingData, operation)
    const opRef = operationResultRef(operation)
    console.info('[operation-new] bar applier:diff', {
      nodeId: operation.meta?.nodeId,
      opRef,
      resultValue: Number(result[0]?.value),
      priorDiffRecords: state.annotationRecords
        .filter((r) => r.cssClass === DIFF_ANNOTATION_CLASS)
        .map((r) => r.operationId),
    })

    // Same dedup as simple-line diff: visual-execution-player can emit two
    // substeps for a cross-surface diff that both fall back to root in
    // non-split layout. ChainState.annotationRecords threads through, so we
    // treat the second occurrence (same operationId) as a no-op.
    const alreadyDrawnBySameOp =
      opRef != null &&
      state.annotationRecords.some(
        (record) => record.cssClass === DIFF_ANNOTATION_CLASS && record.operationId === String(opRef),
      )
    if (alreadyDrawnBySameOp) {
      console.info('[operation-new] bar applier:diff: dedup HIT — skipping duplicate substep', { opRef })
      return { result, nextState: { ...state, lastResult: result } }
    }

    const selectors = diffEndpointSelectors(operation)
    const aggregateHint = typeof operation.aggregate === 'string' ? operation.aggregate : undefined
    const derivedA = resolveDerivedDiffEndpoint(selectors.targetA, aggregateHint)
    const derivedB = resolveDerivedDiffEndpoint(selectors.targetB, aggregateHint)
    const rectA = derivedA ? null : findBarFor(instance, selectors.targetA)
    const rectB = derivedB ? null : findBarFor(instance, selectors.targetB)

    const layer = instance.annotationLayer
    applyAnnotationContextFade(layer, state.annotationRecords, FILTER_ANNOTATION_CLASS)
    fadeRemoveAnnotations(layer, DIFF_ANNOTATION_CLASS)

    const marginLeft = instance.layout.marginLeft
    const plotWidth = instance.layout.plotWidth
    const arrowX = marginLeft + plotWidth + 18

    const markA = rectA ? readBarMetrics(rectA, instance) : null
    const markB = rectB ? readBarMetrics(rectB, instance) : null
    const existingA = existingReferenceLineY(layer, derivedA?.refKey)
    const existingB = existingReferenceLineY(layer, derivedB?.refKey)
    const derivedAY = derivedA ? existingA ?? valueToRootY(instance, derivedA.value) : null
    const derivedBY = derivedB ? existingB ?? valueToRootY(instance, derivedB.value) : null

    const a =
      derivedA && derivedAY != null
        ? {
            kind: 'derived' as const,
            value: derivedA.value,
            y: derivedAY,
            x: marginLeft + plotWidth,
            usesExistingReference: existingA != null,
            anchor: null as Element | null,
          }
        : markA
          ? {
              kind: 'mark' as const,
              value: markA.value,
              y: markA.topY,
              x: markA.centerX,
              usesExistingReference: false,
              anchor: rectA as Element | null,
            }
          : null
    const b =
      derivedB && derivedBY != null
        ? {
            kind: 'derived' as const,
            value: derivedB.value,
            y: derivedBY,
            x: marginLeft + plotWidth,
            usesExistingReference: existingB != null,
            anchor: null as Element | null,
          }
        : markB
          ? {
              kind: 'mark' as const,
              value: markB.value,
              y: markB.topY,
              x: markB.centerX,
              usesExistingReference: false,
              anchor: rectB as Element | null,
            }
          : null
    if (!a || !b) {
      console.warn('[operation-new] simple-bar diff: endpoints could not be resolved', { operation })
      return { result, nextState: { ...state, lastResult: result } }
    }

    const topY = Math.min(a.y, b.y)
    const bottomY = Math.max(a.y, b.y)
    const differenceText = `Difference: ${formatOperationValue(Number(result[0]?.value))}`

    const viewport = resolveBarAnnotationViewport(instance)
    const markEndpoints = [a, b].filter((endpoint) => endpoint.kind === 'mark')
    const labelPromises = markEndpoints.map((endpoint) => {
      // Label above the endpoint; flip below if that would clip the top
      // margin. No collision avoidance — overflow:visible keeps labels
      // rendered past the plot box.
      const naturalAbove = endpoint.y - 8
      const labelMinY = instance.layout.marginTop + 12
      const labelY = naturalAbove >= labelMinY ? naturalAbove : endpoint.y + 18
      const labelNode = layer
        .append(SvgElements.Text)
        .attr(SvgAttributes.Class, `${SvgClassNames.TextAnnotation} ${DIFF_ANNOTATION_CLASS} bar-value`)
        .attr(SvgAttributes.X, endpoint.x)
        .attr(SvgAttributes.Y, labelY)
        .attr(SvgAttributes.TextAnchor, 'middle')
        .attr(SvgAttributes.FontSize, 12)
        .attr(SvgAttributes.FontWeight, 700)
        .attr(SvgAttributes.Fill, COLORS.ANNOTATION_RED)
        .style(SvgAttributes.Opacity, 0)
        .text(formatOperationValue(endpoint.value))
      return labelNode
        .transition()
        .duration(DURATIONS.LABEL_FADE_IN)
        .style(SvgAttributes.Opacity, 1)
        .end()
        .catch(() => undefined)
    })

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
      viewport,
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
            role: 'anchor',
            persistent: true,
            operationId: opRef == null ? undefined : String(opRef),
            resultRef: opRef == null ? undefined : String(opRef),
          },
        ],
      },
    }
  },
}

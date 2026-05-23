import * as d3 from 'd3'
import { diffData } from '../../../domain/operation/dataOps'
import { OperationOp, type TargetSelector } from '../../../domain/operation/types'
import { DataAttributes, SvgAttributes, SvgClassNames, SvgElements } from '../../../rendering/interfaces'
import { COLORS, DURATIONS } from '../../../rendering/common/d3Helpers'
import { formatOperationValue } from '../../../operation-next/primitives/formatValue'
import {
  RESULT_REF_ATTRIBUTE,
  diffEndpointSelectors,
  operationResultRef,
  resolveDerivedDiffEndpoint,
} from '../../../operation-next/diffEndpoint'
import type { OperationApplier, ApplierArgs, ApplierResult } from '../../applier'
import {
  findPointByTarget,
  pointToRootCoords,
  readNumberAttr,
  resolveAnnotationViewport,
} from '../../primitives/annotationLayer'
import { applyAnnotationContextFade } from '../../primitives/contextFade'
import { drawVerticalComparisonArrow } from '../../primitives/drawDifferenceArrow'
import { fadeRemoveAnnotations } from '../../primitives/fadeRemove'
import { FILTER_ANNOTATION_CLASS } from './filter'
import type { SimpleLineChartInstance } from '../../../rendering-new/instances/simpleLineInstance'

const DIFF_ANNOTATION_CLASS = 'operation-next-line-diff'

function selectorTargetKey(selector: TargetSelector | TargetSelector[] | undefined): string | null {
  const entry = Array.isArray(selector) ? selector[0] : selector
  if (entry == null) return null
  if (typeof entry === 'string' || typeof entry === 'number') return String(entry)
  const target = entry.target ?? entry.category ?? entry.id
  return target == null ? null : String(target)
}

function findPoint(instance: SimpleLineChartInstance, selector: TargetSelector | TargetSelector[] | undefined) {
  const key = selectorTargetKey(selector)
  if (!key) return null
  return findPointByTarget(instance, key).nodes()[0] ?? null
}

/** Look up an existing reference line's y coord by its resultRef attribute. */
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
  instance: SimpleLineChartInstance,
  className: string,
  x: number,
  y: number,
  text: string,
  color: string,
  _anchor: Element | null,
) {
  // Label above the anchor by default; flip below if that would clip the
  // chart's top margin. No collision avoidance — overflow:visible keeps
  // labels rendered past the plot box.
  const labelMinY = instance.layout.marginTop + 12
  const labelY = y >= labelMinY ? y : y + 28
  const labelNode = layer
    .append(SvgElements.Text)
    .attr(SvgAttributes.Class, `${SvgClassNames.TextAnnotation} ${className}`)
    .attr(SvgAttributes.X, x)
    .attr(SvgAttributes.Y, labelY)
    .attr(SvgAttributes.TextAnchor, 'middle')
    .attr(SvgAttributes.FontSize, 12)
    .attr(SvgAttributes.FontWeight, 700)
    .attr(SvgAttributes.Fill, color)
    .style(SvgAttributes.Opacity, 0)
    .text(text)
  return labelNode.transition().duration(DURATIONS.LABEL_FADE_IN).style(SvgAttributes.Opacity, 1)
}

export const diffApplier: OperationApplier = {
  op: OperationOp.Diff,

  async apply({ operation, state, instance }: ApplierArgs): Promise<ApplierResult> {
    const result = diffData(state.workingData, operation)
    const opRef = operationResultRef(operation)
    console.info('[operation-new] applier:diff', {
      nodeId: operation.meta?.nodeId,
      opRef,
      resultValue: Number(result[0]?.value),
      priorDiffRecords: state.annotationRecords
        .filter((r) => r.cssClass === DIFF_ANNOTATION_CLASS)
        .map((r) => r.operationId),
    })

    // visual-execution-player can emit two `run-op` substeps for a cross-
    // surface diff (one routed to source-chart, one to derived-chart). In
    // split layout these target different chart instances and don't conflict.
    // In non-split layout both substeps fall back to root (the same instance)
    // and would draw the diff twice. ChainState.annotationRecords is threaded
    // through both calls via the workbench continuation, so we treat the
    // second invocation of the same op (by operationId / resultRef) as a
    // no-op. Split mode keeps independent ChainState per surface, so dedup
    // never matches there.
    const alreadyDrawnBySameOp =
      opRef != null &&
      state.annotationRecords.some(
        (record) => record.cssClass === DIFF_ANNOTATION_CLASS && record.operationId === String(opRef),
      )
    if (alreadyDrawnBySameOp) {
      console.info('[operation-new] applier:diff: dedup HIT — skipping duplicate substep', { opRef })
      return { result, nextState: { ...state, lastResult: result } }
    }

    const selectors = diffEndpointSelectors(operation)
    const aggregateHint = typeof operation.aggregate === 'string' ? operation.aggregate : undefined
    const derivedA = resolveDerivedDiffEndpoint(selectors.targetA, aggregateHint)
    const derivedB = resolveDerivedDiffEndpoint(selectors.targetB, aggregateHint)
    const pointA = derivedA ? null : findPoint(instance, selectors.targetA)
    const pointB = derivedB ? null : findPoint(instance, selectors.targetB)

    const layer = instance.annotationLayer
    applyAnnotationContextFade(layer, state.annotationRecords, FILTER_ANNOTATION_CLASS)
    fadeRemoveAnnotations(layer, DIFF_ANNOTATION_CLASS)

    // Restore full opacity on the two referenced (derived) endpoints so their
    // 'Average: XX' labels remain clearly readable while the diff is shown.
    // Without this, contextFade above would leave them at 0.4 / 0.6 opacity
    // and the user can't see what values are being compared.
    const referencedRefKeys = [derivedA?.refKey, derivedB?.refKey].filter((k): k is string => !!k)
    for (const refKey of referencedRefKeys) {
      layer
        .selectAll<SVGElement, unknown>(`[${RESULT_REF_ATTRIBUTE}="${refKey}"]`)
        .interrupt()
        .transition()
        .duration(150)
        .style('opacity', 1)
    }

    const marginLeft = instance.layout.marginLeft
    const plotWidth = instance.layout.plotWidth
    const arrowX = marginLeft + plotWidth + 18

    const markA = pointA ? pointToRootCoords(pointA, instance) : null
    const markB = pointB ? pointToRootCoords(pointB, instance) : null
    const existingA = existingReferenceLineY(layer, derivedA?.refKey)
    const existingB = existingReferenceLineY(layer, derivedB?.refKey)
    const derivedAY = derivedA
      ? existingA ?? instance.layout.marginTop + instance.yScale(derivedA.value)
      : null
    const derivedBY = derivedB
      ? existingB ?? instance.layout.marginTop + instance.yScale(derivedB.value)
      : null

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
              y: markA.y,
              x: markA.x,
              usesExistingReference: false,
              anchor: pointA as Element | null,
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
              y: markB.y,
              x: markB.x,
              usesExistingReference: false,
              anchor: pointB as Element | null,
            }
          : null
    if (!a || !b) {
      console.warn('[operation-new] simple-line diff: endpoints could not be resolved', { operation })
      return { result, nextState: { ...state, lastResult: result } }
    }

    const topY = Math.min(a.y, b.y)
    const bottomY = Math.max(a.y, b.y)
    const differenceText = `Difference: ${formatOperationValue(Number(result[0]?.value))}`

    // Value labels for endpoints that are real marks (not pre-existing ref lines).
    const markEndpoints = [a, b].filter((endpoint) => endpoint.kind === 'mark')
    const labelPromises = markEndpoints.map((endpoint) =>
      appendValueLabel(
        layer,
        instance,
        `${DIFF_ANNOTATION_CLASS} bar-value`,
        endpoint.x,
        endpoint.y - 8,
        formatOperationValue(endpoint.value),
        COLORS.ANNOTATION_RED,
        endpoint.anchor,
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
      viewport: resolveAnnotationViewport(instance),
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

export { DIFF_ANNOTATION_CLASS }

// Silence unused-import linters for DataAttributes (used indirectly in similar
// files; keep here for symmetry with sibling appliers).
void DataAttributes

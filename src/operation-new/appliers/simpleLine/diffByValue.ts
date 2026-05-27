import {
  diffByValueOp,
  getRuntimeResultsById,
  resolveScalarAggregateFromRows,
} from '../../../domain/operation/dataOps'
import { OperationOp, type OperationSpec } from '../../../domain/operation/types'
import { DataAttributes, SvgAttributes, SvgClassNames, SvgElements } from '../../../rendering/interfaces'
import { COLORS, DURATIONS, EASINGS } from '../../../rendering/common/d3Helpers'
import { formatOperationValue } from '../../../operation-next/primitives/formatValue'
import { RESULT_REF_ATTRIBUTE, operationResultRef } from '../../../operation-next/diffEndpoint'
import type { OperationApplier, ApplierArgs, ApplierResult } from '../../applier'
import type { SimpleLineChartInstance } from '../../../rendering-new/instances/simpleLineInstance'
import { fadeRemoveAnnotations } from '../../primitives/fadeRemove'

/**
 * `diffByValue` on a simple-line chart.
 *
 * Reviewer requirement (case avwb8xstxx1lmfpk):
 *   "ref:n1 기준 diffByValue를 실행하면, simple bar에서 diff by value를
 *    하는 것과 같이, reference line을 기준으로 실행이 되어야 함."
 *
 * Visual: for each data point on the line, draw a vertical connector from
 * the point down/up to the reference line, then a numeric `±delta` label
 * near the point.
 *
 * Each connector + label carries `data-target` so a downstream
 * `findExtremum` (ops3:n3) can locate the matching pair and strengthen the
 * winning annotation (same mechanism as lagDiff → findExtremum from case
 * 2jromeq5u9lloh1s).
 *
 * Debug log emitted as multi-line JSON so the console keeps it expanded.
 */

export const DIFF_BY_VALUE_ANNOTATION_CLASS = 'operation-next-line-diff-by-value'

function debugLog(label: string, payload: Record<string, unknown>): void {
  console.info(`[operation-new] simpleLine applier:diffByValue :: ${label}\n${JSON.stringify(payload, null, 2)}`)
}

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

interface PointSnapshot {
  target: string
  value: number
  cxRoot: number
  cyRoot: number
}

function readPointSnapshots(instance: SimpleLineChartInstance): PointSnapshot[] {
  const marginLeft = instance.layout.marginLeft
  const marginTop = instance.layout.marginTop
  return instance.pointMarks.nodes().map((node) => ({
    target: String(node.getAttribute(DataAttributes.Target) ?? ''),
    value: Number(node.getAttribute(DataAttributes.Value) ?? 0),
    cxRoot: marginLeft + Number(node.getAttribute(SvgAttributes.CX) ?? 0),
    cyRoot: marginTop + Number(node.getAttribute(SvgAttributes.CY) ?? 0),
  }))
}

export const diffByValueApplier: OperationApplier<SimpleLineChartInstance> = {
  op: OperationOp.DiffByValue,

  async apply({ operation, state, instance }: ApplierArgs<SimpleLineChartInstance>): Promise<ApplierResult> {
    const result = diffByValueOp(state.workingData, operation)
    debugLog('ENTRY', {
      nodeId: operation.meta?.nodeId,
      targetValue: (operation as OperationSpec & { targetValue?: unknown }).targetValue ?? null,
      field: operation.field,
      signed: (operation as OperationSpec & { signed?: unknown }).signed ?? null,
      workingLen: state.workingData.length,
      resultLen: result.length,
      sampleResult: result.slice(0, 5).map((r) => ({ target: r.target, value: r.value })),
    })

    const layer = instance.annotationLayer
    fadeRemoveAnnotations(layer, DIFF_BY_VALUE_ANNOTATION_CLASS)

    const reference = resolveReferenceValue(operation)
    if (reference == null || !Number.isFinite(reference)) {
      debugLog('NO-REFERENCE-ABORT', { reason: 'could not resolve reference value from ref or literal' })
      return { result, nextState: { ...state, lastResult: result } }
    }

    const marginTop = instance.layout.marginTop
    const referenceY = marginTop + instance.yScale(reference)
    debugLog('REFERENCE-RESOLVED', {
      reference,
      referenceY,
      yScaleDomain: instance.yScale.domain(),
      marginTop,
    })

    const points = readPointSnapshots(instance)
    if (points.length === 0) {
      debugLog('NO-POINTS-ABORT', { reason: 'instance.pointMarks contained no circles' })
      return { result, nextState: { ...state, lastResult: result } }
    }

    // Build per-target delta lookup from result.
    const deltaByTarget = new Map<string, number>()
    for (const row of result) deltaByTarget.set(String(row.target), Number(row.value))

    interface AnnotationEntry {
      target: string
      cxRoot: number
      cyRoot: number
      pointValue: number
      delta: number
    }
    const entries: AnnotationEntry[] = []
    for (const p of points) {
      const delta = deltaByTarget.get(p.target)
      if (delta == null || !Number.isFinite(delta)) continue
      entries.push({
        target: p.target,
        cxRoot: p.cxRoot,
        cyRoot: p.cyRoot,
        pointValue: p.value,
        delta,
      })
    }

    debugLog('ANNOTATION-PLAN', {
      entryCount: entries.length,
      entries: entries.slice(0, 8),
    })

    if (entries.length === 0) {
      debugLog('NO-ENTRIES-ABORT', { reason: 'no points matched the diffByValue result deltas' })
      return { result, nextState: { ...state, lastResult: result } }
    }

    // Create per-point vertical connectors (point → reference line).
    // Initial state: y2 = referenceY (zero-length at reference). Animation
    // grows y2 down/up to cyRoot.
    const connectors = layer
      .selectAll<SVGLineElement, AnnotationEntry>(
        `line.${DIFF_BY_VALUE_ANNOTATION_CLASS}.point-connector`,
      )
      .data(entries, (d) => d.target)
      .join((enter) =>
        enter
          .append(SvgElements.Line)
          .attr(SvgAttributes.Class, `${SvgClassNames.LineAnnotation} ${DIFF_BY_VALUE_ANNOTATION_CLASS} point-connector`)
          .attr(DataAttributes.Target, (d) => d.target)
          .attr(SvgAttributes.X1, (d) => d.cxRoot)
          .attr(SvgAttributes.X2, (d) => d.cxRoot)
          .attr(SvgAttributes.Y1, referenceY)
          .attr(SvgAttributes.Y2, referenceY)
          .attr(SvgAttributes.Stroke, COLORS.ANNOTATION_RED)
          .attr(SvgAttributes.StrokeWidth, 1.5)
          .style(SvgAttributes.Opacity, 0),
      )

    // Label position: just above the point if there's headroom, otherwise below.
    const labelMinY = marginTop + 12
    const labels = layer
      .selectAll<SVGTextElement, AnnotationEntry>(
        `text.${DIFF_BY_VALUE_ANNOTATION_CLASS}.point-delta`,
      )
      .data(entries, (d) => d.target)
      .join((enter) =>
        enter
          .append(SvgElements.Text)
          .attr(SvgAttributes.Class, `${SvgClassNames.TextAnnotation} ${DIFF_BY_VALUE_ANNOTATION_CLASS} point-delta`)
          .attr(DataAttributes.Target, (d) => d.target)
          .attr(SvgAttributes.X, (d) => d.cxRoot)
          .attr(SvgAttributes.Y, (d) => {
            const naturalAbove = d.cyRoot - 10
            return naturalAbove >= labelMinY ? naturalAbove : d.cyRoot + 18
          })
          .attr(SvgAttributes.TextAnchor, 'middle')
          .attr(SvgAttributes.FontSize, 12)
          .attr(SvgAttributes.FontWeight, 700)
          .attr(SvgAttributes.Fill, COLORS.ANNOTATION_RED)
          .style(SvgAttributes.Opacity, 0)
          .text((d) => `${d.delta >= 0 ? '+' : ''}${formatOperationValue(d.delta)}`),
      )

    debugLog('ANNOTATION-CREATED', {
      connectorCount: connectors.size(),
      labelCount: labels.size(),
      sampleConnectorAttrs: connectors.nodes().slice(0, 3).map((n) => ({
        target: n.getAttribute(DataAttributes.Target),
        x1: n.getAttribute(SvgAttributes.X1),
        y1: n.getAttribute(SvgAttributes.Y1),
        y2: n.getAttribute(SvgAttributes.Y2),
      })),
    })

    // Phase 1: connectors grow from reference line to each point's y.
    await connectors
      .transition()
      .duration(DURATIONS.GUIDELINE_DRAW)
      .ease(EASINGS.SMOOTH)
      .attr(SvgAttributes.Y2, (d) => d.cyRoot)
      .style(SvgAttributes.Opacity, 0.8)
      .end()
      .catch(() => undefined)

    // Phase 2: labels fade in.
    await labels
      .transition()
      .duration(DURATIONS.LABEL_FADE_IN)
      .style(SvgAttributes.Opacity, 1)
      .end()
      .catch(() => undefined)

    // If the upstream ref (e.g. n1=Average) already has annotations marked
    // with `data-operation-result-ref="n1"`, skip drawing an additional
    // reference line — the existing one stays visible and acts as the
    // shared anchor for our connectors (same suppression rule as simple-bar
    // diffByValue per feedback 1bbe64wpvq06sknm).
    const refKey = extractRefKey(operation)
    const hasUpstreamRef =
      refKey != null && !layer.select(`[${RESULT_REF_ATTRIBUTE}="${refKey}"]`).empty()
    debugLog('UPSTREAM-REF-CHECK', { refKey, hasUpstreamRef })

    // Tag this op's annotations with its own result ref so downstream ops
    // (findExtremum) can identify them.
    const diffByValueRef = operationResultRef(operation)
    if (diffByValueRef) {
      layer
        .selectAll<SVGElement, unknown>(`.${DIFF_BY_VALUE_ANNOTATION_CLASS}`)
        .filter(function () {
          return !this.getAttribute(RESULT_REF_ATTRIBUTE)
        })
        .attr(RESULT_REF_ATTRIBUTE, diffByValueRef)
    }

    debugLog('DONE', {
      annotationsTagged: diffByValueRef ?? null,
      hasUpstreamRef,
      finalConnectorCount: layer.selectAll(`line.${DIFF_BY_VALUE_ANNOTATION_CLASS}.point-connector`).size(),
      finalLabelCount: layer.selectAll(`text.${DIFF_BY_VALUE_ANNOTATION_CLASS}.point-delta`).size(),
    })

    return {
      result,
      nextState: {
        ...state,
        // derivedData: per-target deltas. findExtremum picks this up to
        // strengthen the winning connector when state propagates within a
        // single runChartOps call. When it doesn't (cross-call), the layer
        // has data-target attrs so findExtremum's DOM-driven branch handles
        // it (see findExtremum.ts).
        derivedData: result,
        lastResult: result,
        annotationRecords: [
          ...state.annotationRecords,
          {
            cssClass: DIFF_BY_VALUE_ANNOTATION_CLASS,
            role: 'anchor' as const,
            persistent: true,
            operationId: diffByValueRef == null ? undefined : String(diffByValueRef),
            resultRef: diffByValueRef == null ? undefined : String(diffByValueRef),
          },
        ],
      },
    }
  },
}

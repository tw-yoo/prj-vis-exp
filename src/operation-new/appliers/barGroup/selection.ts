import * as d3 from 'd3'
import { findExtremum, nthData, countData } from '../../../domain/operation/dataOps'
import { OperationOp, type DatumValue, type OperationSpec } from '../../../domain/operation/types'
import { DataAttributes, SvgAttributes } from '../../../rendering/interfaces'
import { COLORS, DURATIONS } from '../../../rendering/common/d3Helpers'
import { formatOperationValue } from '../../../operation-next/primitives/formatValue'
import { RESULT_REF_ATTRIBUTE, operationResultRef } from '../../../operation-next/diffEndpoint'
import type { OperationApplier, ApplierArgs, ApplierResult } from '../../applier'
import { applyAnnotationContextFade } from '../../primitives/contextFade'
import { fadeRemoveAnnotations } from '../../primitives/fadeRemove'
import { drawResultBadge } from '../../primitives/drawResultBadge'
import { placeValueLabel } from '../../primitives/placeValueLabel'
import {
  barAnnotationViewport,
  barRootMetrics,
  findBarsByDatum,
  type BarGroupApplierInstance,
} from './_geometry'

function operationNodeId(operation: OperationSpec): string | null {
  const raw = operation as OperationSpec & { id?: string | number; key?: string | number }
  const nodeId = operation.meta?.nodeId
  if (typeof nodeId === 'string' || typeof nodeId === 'number') return String(nodeId)
  if (raw.id != null) return String(raw.id)
  if (raw.key != null) return String(raw.key)
  return null
}

/**
 * Shared native bar-selection applier for grouped + stacked `findExtremum` /
 * `nth`. Mirrors the legacy `annotateBarSelection` (red fill + value label) but:
 *
 *  - reads geometry via the compaction-safe `barRootMetrics`/`barAnnotationViewport`
 *    (so labels land correctly on split-right);
 *  - routes the label through the shared collision-aware `placeValueLabel`;
 *  - does NOT block the applier's return on the label-fade `.end()`; and
 *  - stamps an invisible `RESULT_REF`-tagged anchor line at the bar-top value-y,
 *    so a downstream cross-surface diff (e.g. findExtremum∥findExtremum→diff)
 *    can resolve this endpoint — the capability the legacy `annotateBarSelection`
 *    lacked (R4).
 */
export function makeBarSelectionApplier<T extends BarGroupApplierInstance>(opts: {
  op: string
  dataFn: (data: DatumValue[], operation: OperationSpec) => DatumValue[]
  cssClass: string
  filterClass: string
  /** Prefer `state.derivedData` over `workingData` (findExtremum does, nth does not). */
  preferDerived?: boolean
}): OperationApplier<T> {
  return {
    op: opts.op,

    async apply({ operation, state, instance, options }: ApplierArgs<T>): Promise<ApplierResult> {
      const source =
        opts.preferDerived && state.derivedData != null ? state.derivedData : state.workingData
      const result = opts.dataFn(source, operation)
      console.info('[operation-new] bar-group applier:selection', {
        op: opts.op,
        nodeId: operation.meta?.nodeId,
        resultLen: result.length,
      })

      const layer = instance.annotationLayer
      applyAnnotationContextFade(layer, state.annotationRecords, opts.filterClass, options?.referencedResultIds)

      const nodeId = operationNodeId(operation)
      if (nodeId) {
        layer
          .selectAll<SVGElement, unknown>(
            `.${opts.cssClass}[${DataAttributes.AnnotationNodeId}="${CSS.escape(nodeId)}"]`,
          )
          .interrupt()
          .remove()
      } else {
        fadeRemoveAnnotations(layer, opts.cssClass)
      }
      if (result.length === 0) {
        return { result, nextState: { ...state, lastResult: result } }
      }

      const resultRef = operationResultRef(operation)
      const transitions: Promise<unknown>[] = []

      result.forEach((datum, index) => {
        const rects = findBarsByDatum(instance, datum)
        if (rects.length === 0) return
        const metrics = barRootMetrics(rects[0])

        // Highlight every matching bar red.
        transitions.push(
          (d3.selectAll(rects) as d3.Selection<SVGRectElement, unknown, null, undefined>)
            .interrupt()
            .transition()
            .duration(DURATIONS.HIGHLIGHT)
            .attr(SvgAttributes.Fill, COLORS.ANNOTATION_RED)
            .end()
            .catch(() => undefined),
        )

        // Value label above the bar top (collision-aware placer).
        const labelNode = placeValueLabel({
          layer,
          svg: instance.svg,
          viewport: barAnnotationViewport(instance),
          preferred: { x: metrics.centerX, y: metrics.topY - 12 - index * 16 },
          text: formatOperationValue(metrics.value),
          className: opts.cssClass,
          dataAttrs: nodeId ? [[DataAttributes.AnnotationNodeId, nodeId]] : [],
        })
        transitions.push(
          labelNode
            .transition()
            .duration(DURATIONS.LABEL_FADE_IN)
            .style(SvgAttributes.Opacity, 1)
            .end()
            .catch(() => undefined),
        )

        // Invisible result-ref anchor at the bar-top value-y, so a cross-surface
        // diff resolves this endpoint precisely (stroke present → non-empty
        // bounding box; opacity 0 → not visible).
        if (resultRef && index === 0) {
          layer
            .append('line')
            .attr(SvgAttributes.Class, `${opts.cssClass} ${opts.cssClass}-anchor`)
            .attr(RESULT_REF_ATTRIBUTE, String(resultRef))
            .attr('x1', metrics.centerX - metrics.width / 2)
            .attr('x2', metrics.centerX + metrics.width / 2)
            .attr('y1', metrics.topY)
            .attr('y2', metrics.topY)
            .attr(SvgAttributes.Stroke, COLORS.ANNOTATION_RED)
            .attr('stroke-width', 2)
            .style(SvgAttributes.Opacity, 0)
            .style('pointer-events', 'none')
        }
      })

      await Promise.all(transitions)

      return {
        result,
        nextState: {
          ...state,
          lastResult: result,
          annotationRecords: [
            ...state.annotationRecords,
            { cssClass: opts.cssClass, role: 'result' as const, persistent: false },
          ],
        },
      }
    },
  }
}

/**
 * Shared native `count` applier for grouped + stacked bars — draws the
 * "Total N bars" badge above the chart (mirrors simpleBar/count). The scalar
 * result carries no target to highlight, so it's a separate factory.
 */
export function makeBarCountApplier<T extends BarGroupApplierInstance>(opts: {
  cssClass: string
  filterClass: string
}): OperationApplier<T> {
  return {
    op: OperationOp.Count,

    async apply({ operation, state, instance, options }: ApplierArgs<T>): Promise<ApplierResult> {
      const result = countData(state.workingData, operation)
      const value = Number(result[0]?.value)
      console.info('[operation-new] bar-group applier:count', {
        nodeId: operation.meta?.nodeId,
        value,
        workingLen: state.workingData.length,
      })
      if (!Number.isFinite(value)) {
        return { result, nextState: { ...state, lastResult: result } }
      }

      applyAnnotationContextFade(
        instance.annotationLayer,
        state.annotationRecords,
        opts.filterClass,
        options?.referencedResultIds,
      )
      await drawResultBadge({
        layer: instance.annotationLayer,
        cssClass: opts.cssClass,
        text: `Total ${value} bars`,
        layout: instance.layout,
        anchor: 'top-center-above',
        fontSize: 16,
      })

      return {
        result,
        nextState: {
          ...state,
          lastResult: result,
          annotationRecords: [
            ...state.annotationRecords,
            { cssClass: opts.cssClass, role: 'result' as const, persistent: false },
          ],
        },
      }
    },
  }
}

/** Convenience builders matching the legacy class names. */
export function makeBarFindExtremumApplier<T extends BarGroupApplierInstance>(
  cssClass: string,
  filterClass: string,
): OperationApplier<T> {
  return makeBarSelectionApplier<T>({
    op: OperationOp.FindExtremum,
    dataFn: findExtremum,
    cssClass,
    filterClass,
    preferDerived: true,
  })
}

export function makeBarNthApplier<T extends BarGroupApplierInstance>(
  cssClass: string,
  filterClass: string,
): OperationApplier<T> {
  return makeBarSelectionApplier<T>({
    op: OperationOp.Nth,
    dataFn: nthData,
    cssClass,
    filterClass,
  })
}

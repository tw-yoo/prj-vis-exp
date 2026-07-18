import * as d3 from 'd3'
import { findExtremum, nthData, countData } from '../../../domain/operation/dataOps'
import { OperationOp, type DatumValue, type OperationSpec } from '../../../domain/operation/types'
import { DataAttributes, SvgAttributes } from '../../../rendering/interfaces'
import { COLORS, DURATIONS, OPACITIES } from '../../../rendering/common/d3Helpers'
import { formatOperationValue } from '../../../operation-next/primitives/formatValue'
import { RESULT_REF_ATTRIBUTE, operationResultRef } from '../../../operation-next/diffEndpoint'
import type { OperationApplier, ApplierArgs, ApplierResult } from '../../applier'
import { applyAnnotationContextFade } from '../../primitives/contextFade'
import { fadeRemoveAnnotations } from '../../primitives/fadeRemove'
import { applyMarkSalience } from '../../primitives/markSalience'
import { drawRegionHighlight } from '../../primitives/drawRegionHighlight'
import { drawResultBadge } from '../../primitives/drawResultBadge'
import { placeValueLabel } from '../../primitives/placeValueLabel'
import { barMarkKeyFromNode } from './_shared'
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
  /**
   * Grouped-bar only: when the operation is scoped to a `group` (series), keep
   * the winning bar of that series and dim the rest of the SAME series; other
   * series are left untouched. Accumulates across substeps via the salience
   * map. (Off by default so stacked-bar selection is unaffected.)
   */
  dimGroupSiblings?: boolean
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
        // A DERIVED-row selection (pairDiff / lagDiff Δ rows) picks a whole
        // x-position (a Period / panel), not one bar segment — recoloring the
        // segments red would misread as a value selection. Paint a translucent
        // highlighter band over that region instead; the Δ arrows/labels the
        // deriving op drew stay on top and carry the value.
        const isDerivedSelection =
          typeof datum.semanticMeasure === 'string' && datum.semanticMeasure.startsWith('Δ')
        // Per-category aggregate selection (findExtremum with aggregate:'sum'):
        // the datum is a whole x-CATEGORY (e.g. a year's stack total), so
        // highlight its entire column as a region and label the total — never
        // recolour one segment red.
        const isColumnTotalSelection =
          typeof (operation as OperationSpec & { aggregate?: unknown }).aggregate === 'string' &&
          String((operation as OperationSpec & { aggregate?: unknown }).aggregate).trim().length > 0

        let rects = findBarsByDatum(instance, datum)
        if (rects.length === 0 && (isDerivedSelection || isColumnTotalSelection) && datum.target != null) {
          // Derived/aggregate rows carry target = a whole column value (a Period
          // / year). Resolve the region via the panel id or the raw target.
          const panelKey = String(datum.target)
          rects = (instance.mainBars().nodes() as SVGRectElement[]).filter(
            (node) =>
              node.getAttribute(DataAttributes.ChartId) === panelKey ||
              node.getAttribute(DataAttributes.Target) === panelKey,
          )
        }
        if (rects.length === 0) return
        const metrics = barRootMetrics(rects[0])

        if (isDerivedSelection || isColumnTotalSelection) {
          let x0 = Number.POSITIVE_INFINITY
          let x1 = Number.NEGATIVE_INFINITY
          let colTopY = Number.POSITIVE_INFINITY
          rects.forEach((rect) => {
            const m = barRootMetrics(rect)
            x0 = Math.min(x0, m.centerX - m.width / 2)
            x1 = Math.max(x1, m.centerX + m.width / 2)
            colTopY = Math.min(colTopY, m.topY)
          })
          transitions.push(
            drawRegionHighlight({
              layer,
              cssClass: opts.cssClass,
              x0,
              x1,
              y0: instance.layout.marginTop,
              y1: instance.layout.marginTop + instance.layout.plotHeight,
              nodeId,
            }),
          )
          // Label the aggregate total above the highlighted column (the Δ path
          // skips this because the deriving op already drew the value).
          if (isColumnTotalSelection) {
            const totalLabel = placeValueLabel({
              layer,
              svg: instance.svg,
              viewport: barAnnotationViewport(instance),
              preferred: { x: (x0 + x1) / 2, y: colTopY - 12 },
              text: formatOperationValue(datum.value),
              className: opts.cssClass,
              dataAttrs: nodeId ? [[DataAttributes.AnnotationNodeId, nodeId]] : [],
            })
            transitions.push(
              totalLabel
                .transition()
                .duration(DURATIONS.LABEL_FADE_IN)
                .style(SvgAttributes.Opacity, 1)
                .end()
                .catch(() => undefined),
            )
          }
        } else {
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

          // Value label above the bar top (collision-aware placer). Skipped for
          // derived selections — the deriving op's Δ label already shows the
          // value; repeating the raw bar value here confused the narrative.
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
        }

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

      // Grouped-bar findExtremum scoped to a series: keep the winning bar of
      // that series highlighted and dim the rest of the SAME series; other
      // series are left as-is. Accumulate into the salience map so sequential
      // substeps (e.g. max(Scotland) then min(England & Wales)) stack.
      let nextSalienceMap = state.salienceMap
      const group =
        typeof (operation as OperationSpec & { group?: unknown }).group === 'string'
          ? String((operation as OperationSpec & { group?: unknown }).group)
          : null
      if (opts.dimGroupSiblings && group) {
        const winners = new Set<SVGRectElement>(result.flatMap((datum) => findBarsByDatum(instance, datum)))
        const seriesOf = (node: SVGElement) =>
          node.getAttribute(DataAttributes.Series) ?? node.getAttribute(DataAttributes.GroupValue) ?? ''
        const groupBars = instance.mainBars().filter(function () {
          return seriesOf(this as SVGRectElement) === group
        })
        await applyMarkSalience({
          marks: groupBars as unknown as d3.Selection<SVGElement, unknown, d3.BaseType, unknown>,
          isInScope: (node) => winners.has(node as SVGRectElement),
          outOpacity: OPACITIES.DIM,
        })
        const merged = new Map(state.salienceMap)
        groupBars.each(function () {
          const node = this as SVGRectElement
          merged.set(barMarkKeyFromNode(node), winners.has(node) ? OPACITIES.FULL : OPACITIES.DIM)
        })
        nextSalienceMap = merged
      }

      return {
        result,
        nextState: {
          ...state,
          lastResult: result,
          salienceMap: nextSalienceMap,
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
 * "Total N bars" badge top-right (mirrors simpleBar/count; top-center-above
 * collided with Ours' top-center step-summary caption, hiding one or the
 * other). The scalar result carries no target to highlight, so it's a
 * separate factory.
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
        anchor: 'top-right',
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
  extra?: { dimGroupSiblings?: boolean },
): OperationApplier<T> {
  return makeBarSelectionApplier<T>({
    op: OperationOp.FindExtremum,
    dataFn: findExtremum,
    cssClass,
    filterClass,
    preferDerived: true,
    dimGroupSiblings: extra?.dimGroupSiblings ?? false,
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

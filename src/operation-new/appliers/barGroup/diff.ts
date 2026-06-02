import { diffData } from '../../../domain/operation/dataOps'
import { OperationOp, type DatumValue, type OperationSpec } from '../../../domain/operation/types'
import { COLORS } from '../../../rendering/common/d3Helpers'
import { formatOperationValue } from '../../../operation-next/primitives/formatValue'
import {
  RESULT_REF_ATTRIBUTE,
  diffEndpointSelectors,
  operationResultRef,
  resolveDerivedDiffEndpoint,
} from '../../../operation-next/diffEndpoint'
import { runGroupedBarDiffOperation } from '../../../operation-next/runners/barGroupShared'
import type { OperationApplier, ApplierArgs, ApplierResult } from '../../applier'
import { fadeRemoveAnnotations } from '../../primitives/fadeRemove'
import { drawVerticalComparisonArrow } from '../../primitives/drawDifferenceArrow'
import { computeSplitDiffGeometry, mountRootDiffOverlay } from '../../primitives/splitDiffOverlay'
import { barAnnotationViewport, type BarGroupApplierInstance } from './_geometry'

/** Same class the simpleBar split overlay uses — the merge arrow is drawn on the
 *  root surface and is chart-type-agnostic at that point. */
export const DIFF_ANNOTATION_CLASS = 'operation-next-diff'

/**
 * Shared native `diff` applier for grouped + stacked bars.
 *
 * - **Root merge on a split layout** (the failing path): resolve each endpoint
 *   from the two surfaces' stamped `data-operation-result-ref` average lines via
 *   the shared `computeSplitDiffGeometry`, then draw the cross-surface Δ arrow.
 *   This needs only the two stamped lines (guaranteed by the native average
 *   applier) — NOT `diffData`'s runtime materialization, which the legacy
 *   grouped diff could not resolve for derived-ref endpoints (bug 273wm22z47ptlhzz).
 * - **Non-split / intra-panel** (works today, not in the bug set): delegate to
 *   the legacy `runGroupedBarDiffOperation` to preserve existing behavior.
 */
export function makeBarGroupDiffApplier<T extends BarGroupApplierInstance>(): OperationApplier<T> {
  return {
    op: OperationOp.Diff,

    async apply({ operation, state, instance, options }: ApplierArgs<T>): Promise<ApplierResult> {
      let result: DatumValue[] = []
      try {
        result = diffData(state.workingData, operation)
      } catch {
        /* derived-ref slices may not materialize off the split surfaces; the
         * value is recomputed from the resolved endpoints below. */
      }
      const opRef = operationResultRef(operation)
      console.info('[operation-new] bar-group applier:diff', {
        nodeId: operation.meta?.nodeId,
        opRef,
        resultValue: Number(result[0]?.value),
      })

      // Dedup duplicate substeps for the same diff op (visual-execution-player
      // can emit two for a cross-surface diff). Same guard as simpleBar/diff.
      const alreadyDrawn =
        opRef != null &&
        state.annotationRecords.some(
          (r) => r.cssClass === DIFF_ANNOTATION_CLASS && r.operationId === String(opRef),
        )
      if (alreadyDrawn) {
        return { result, nextState: { ...state, lastResult: result } }
      }

      const surfaceId = instance.host
        .closest('[data-surface-id]')
        ?.getAttribute('data-surface-id')
      const onSplitChild = surfaceId === 'split-left' || surfaceId === 'split-right'
      const splitHint = options?.surfaceManager?.getLayout()?.type
      const isSplit = splitHint === 'split-horizontal' || splitHint === 'split-vertical'
      const svgNode = instance.svg.node()

      if (isSplit && !onSplitChild && svgNode) {
        const selectors = diffEndpointSelectors(operation)
        const aggHint = typeof operation.aggregate === 'string' ? operation.aggregate : undefined
        const derivedA = resolveDerivedDiffEndpoint(selectors.targetA, aggHint)
        const derivedB = resolveDerivedDiffEndpoint(selectors.targetB, aggHint)
        const refKeys = [derivedA?.refKey, derivedB?.refKey].filter((k): k is string => !!k)
        const splitGeometry = computeSplitDiffGeometry({ host: instance.host, svgNode, refKeys })
        console.info('[operation-new] bar-group applier:diff split-merge', {
          refKeys,
          resolved: !!splitGeometry,
        })
        if (splitGeometry) {
          const layer = instance.annotationLayer
          fadeRemoveAnnotations(layer, DIFF_ANNOTATION_CLASS)
          mountRootDiffOverlay(svgNode, { hideSkeleton: true })

          const signed = (operation as OperationSpec & { signed?: boolean }).signed === true
          const raw = Number(result[0]?.value)
          const fallbackRaw = (derivedA?.value ?? NaN) - (derivedB?.value ?? NaN)
          const value = Number.isFinite(raw)
            ? raw
            : signed
              ? fallbackRaw
              : Math.abs(fallbackRaw)

          await drawVerticalComparisonArrow({
            layer,
            cssClass: DIFF_ANNOTATION_CLASS,
            x: splitGeometry.arrowX,
            topY: splitGeometry.topY,
            bottomY: splitGeometry.bottomY,
            refLines: [],
            color: COLORS.ANNOTATION_RED,
            label: `Difference: ${formatOperationValue(value)}`,
            svg: instance.svg,
            viewport: barAnnotationViewport(instance),
          })

          if (opRef) {
            layer
              .selectAll<SVGElement, unknown>(`.${DIFF_ANNOTATION_CLASS}`)
              .filter(function () {
                return !this.getAttribute(RESULT_REF_ATTRIBUTE)
              })
              .attr(RESULT_REF_ATTRIBUTE, String(opRef))
          }

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
        }
      }

      // Non-split / intra-panel / unresolved split → legacy bar-to-bar diff.
      return runGroupedBarDiffOperation(instance.host, operation, state, options?.surfaceManager)
    },
  }
}

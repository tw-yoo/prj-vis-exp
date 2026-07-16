import { compareBoolOp } from '../../../domain/operation/dataOps'
import { OperationOp } from '../../../domain/operation/types'
import { COLORS } from '../../../rendering/common/d3Helpers'
import { formatOperationValue } from '../../../operation-next/primitives/formatValue'
import { diffEndpointSelectors, resolveDerivedDiffEndpoint } from '../../../operation-next/diffEndpoint'
import type { OperationApplier, ApplierArgs, ApplierResult } from '../../applier'
import { resolveAnnotationViewport } from '../../primitives/annotationLayer'
import { drawResultBadge } from '../../primitives/drawResultBadge'
import { drawVerticalComparisonArrow } from '../../primitives/drawDifferenceArrow'
import { fadeRemoveAnnotations } from '../../primitives/fadeRemove'
import { computeSplitDiffGeometry, mountRootDiffOverlay } from '../../primitives/splitDiffOverlay'

export const COMPARE_BOOL_ANNOTATION_CLASS = 'operation-next-line-compare-bool'

export const compareBoolApplier: OperationApplier = {
  op: OperationOp.CompareBool,

  async apply({ operation, state, instance, options }: ApplierArgs): Promise<ApplierResult> {
    const result = compareBoolOp(state.workingData, operation)
    const value = Number(result[0]?.value)
    console.info('[operation-new] applier:compareBool', {
      nodeId: operation.meta?.nodeId,
      bool: value === 1,
      operator: operation.operator,
    })

    if (!Number.isFinite(value)) {
      return { result, nextState: { ...state, lastResult: result } }
    }

    const layer = instance.annotationLayer
    const verdict = value === 1 ? 'Yes' : 'No'

    // ── Split-merge path ────────────────────────────────────────────────────
    // A compareBool that merges two split branches (targetA/targetB are refs to
    // per-surface results) is a diff whose SIGN we report: draw the same
    // cross-surface Δ arrow the merge `diff` draws, plus the Yes/No verdict.
    // The root SVG is hidden during the split, so without mounting the overlay
    // the badge would land on an invisible surface. Mirrors simpleLine/diff.ts.
    const svgNode = instance.svg.node()
    const surfaceId = (instance.host as HTMLElement | undefined)
      ?.closest?.('[data-surface-id]')
      ?.getAttribute('data-surface-id')
    const onSplitChildSurface = surfaceId === 'split-left' || surfaceId === 'split-right'
    const splitLayoutType = options?.surfaceManager?.getLayout()?.type
    const isSplit = splitLayoutType === 'split-horizontal' || splitLayoutType === 'split-vertical'
    if (isSplit && !onSplitChildSurface && svgNode) {
      const selectors = diffEndpointSelectors(operation)
      const derivedA = resolveDerivedDiffEndpoint(selectors.targetA, undefined)
      const derivedB = resolveDerivedDiffEndpoint(selectors.targetB, undefined)
      const refKeys = [derivedA?.refKey, derivedB?.refKey].filter((k): k is string => !!k)
      const splitGeometry = computeSplitDiffGeometry({ host: instance.host, svgNode, refKeys })
      // Always arrow-mode (hideSkeleton) here: compareBool never rebinds new
      // marks onto the root, so rebind-mode's panel-hiding would collapse the
      // split into the (stale) root chart when geometry fails to resolve.
      mountRootDiffOverlay(svgNode, { hideSkeleton: true })
      if (splitGeometry) {
        fadeRemoveAnnotations(layer, COMPARE_BOOL_ANNOTATION_CLASS)
        // Badge BEFORE arrow: drawResultBadge clears prior same-class elements,
        // which would delete an already-drawn arrow of the same class.
        await drawResultBadge({
          layer,
          cssClass: COMPARE_BOOL_ANNOTATION_CLASS,
          text: verdict,
          layout: instance.layout,
          anchor: 'top-right',
        })
        const delta = (derivedA?.value ?? NaN) - (derivedB?.value ?? NaN)
        await drawVerticalComparisonArrow({
          layer,
          cssClass: COMPARE_BOOL_ANNOTATION_CLASS,
          x: splitGeometry.arrowX,
          topY: splitGeometry.topY,
          bottomY: splitGeometry.bottomY,
          refLines: [],
          color: COLORS.ANNOTATION_RED,
          label: Number.isFinite(delta)
            ? `${verdict} (Difference: ${formatOperationValue(Math.abs(delta))})`
            : verdict,
          labelPlacement: 'above-center',
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
              { cssClass: COMPARE_BOOL_ANNOTATION_CLASS, role: 'result', persistent: false },
            ],
          },
        }
      }
      // Endpoints unresolved (unexpected for a valid merge) → the overlay is
      // mounted; fall through to the badge-only path so the verdict shows.
    }

    await drawResultBadge({
      layer,
      cssClass: COMPARE_BOOL_ANNOTATION_CLASS,
      text: verdict,
      layout: instance.layout,
      // Stack below any add/scale running-total badges (same top-left column) so
      // an arithmetic-chain → compareBool (e.g. avg(min,max) vs a value) reads as
      // one tidy result column instead of colliding with peak data-point labels.
      anchor: 'top-left',
      offsetY: 40,
    })

    return {
      result,
      nextState: {
        ...state,
        lastResult: result,
        annotationRecords: [
          ...state.annotationRecords,
          { cssClass: COMPARE_BOOL_ANNOTATION_CLASS, role: 'result', persistent: false },
        ],
      },
    }
  },
}

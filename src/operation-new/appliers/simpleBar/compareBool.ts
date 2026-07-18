import { compareBoolOp } from '../../../domain/operation/dataOps'
import { OperationOp } from '../../../domain/operation/types'
import { COLORS } from '../../../rendering/common/d3Helpers'
import { formatOperationValue } from '../../../operation-next/primitives/formatValue'
import { diffEndpointSelectors, resolveDerivedDiffEndpoint } from '../../../operation-next/diffEndpoint'
import type { OperationApplier, ApplierArgs, ApplierResult } from '../../applier'
import type { SimpleBarChartInstance } from '../../../rendering-new/instances/simpleBarInstance'
import { applyAnnotationContextFade } from '../../primitives/contextFade'
import { drawResultBadge } from '../../primitives/drawResultBadge'
import { drawVerticalComparisonArrow } from '../../primitives/drawDifferenceArrow'
import { fadeRemoveAnnotations } from '../../primitives/fadeRemove'
import { computeSplitDiffGeometry, mountRootDiffOverlay } from '../../primitives/splitDiffOverlay'
import { resolveBarAnnotationViewport } from './_shared'
import { FILTER_ANNOTATION_CLASS } from './filter'

export const COMPARE_BOOL_ANNOTATION_CLASS = 'operation-next-bar-compare-bool'

export const compareBoolApplier: OperationApplier<SimpleBarChartInstance> = {
  op: OperationOp.CompareBool,

  async apply({ operation, state, instance, options }: ApplierArgs<SimpleBarChartInstance>): Promise<ApplierResult> {
    const result = compareBoolOp(state.workingData, operation)
    const value = Number(result[0]?.value)
    console.info('[operation-new] bar applier:compareBool', {
      nodeId: operation.meta?.nodeId,
      bool: value === 1,
      operator: operation.operator,
    })

    if (!Number.isFinite(value)) {
      return { result, nextState: { ...state, lastResult: result } }
    }

    applyAnnotationContextFade(
      instance.annotationLayer,
      state.annotationRecords,
      FILTER_ANNOTATION_CLASS,
      options?.referencedResultIds,
    )

    const verdict = value === 1 ? 'Yes' : 'No'

    // ── Split-merge path ────────────────────────────────────────────────────
    // A compareBool merging two split branches is a diff whose SIGN we report:
    // draw the cross-surface Δ arrow plus the Yes/No verdict on the root
    // overlay (the root SVG is hidden during the split, so the plain badge
    // would land invisibly). Mirrors simpleBar/diff.ts's split branch.
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
        fadeRemoveAnnotations(instance.annotationLayer, COMPARE_BOOL_ANNOTATION_CLASS)
        // Badge BEFORE arrow: drawResultBadge clears prior same-class elements,
        // which would delete an already-drawn arrow of the same class.
        await drawResultBadge({
          layer: instance.annotationLayer,
          cssClass: COMPARE_BOOL_ANNOTATION_CLASS,
          text: verdict,
          layout: instance.layout,
          anchor: 'top-right',
          fontSize: 16,
        })
        const delta = (derivedA?.value ?? NaN) - (derivedB?.value ?? NaN)
        await drawVerticalComparisonArrow({
          layer: instance.annotationLayer,
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
          viewport: resolveBarAnnotationViewport(instance),
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
      // Endpoints unresolved → overlay mounted; fall through to badge-only.
    }

    await drawResultBadge({
      layer: instance.annotationLayer,
      cssClass: COMPARE_BOOL_ANNOTATION_CLASS,
      text: verdict,
      layout: instance.layout,
      anchor: 'top-left',
      fontSize: 16,
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

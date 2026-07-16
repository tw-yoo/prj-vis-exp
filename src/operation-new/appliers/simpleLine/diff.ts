import * as d3 from 'd3'
import { diffData } from '../../../domain/operation/dataOps'
import { OperationOp, type TargetSelector } from '../../../domain/operation/types'
import { DataAttributes, SvgAttributes } from '../../../rendering/interfaces'
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
import { computeSplitDiffGeometry, mountRootDiffOverlay } from '../../primitives/splitDiffOverlay'
import { placeValueLabel } from '../../primitives/placeValueLabel'
import { FILTER_ANNOTATION_CLASS } from './filter'
import { diffByValueApplier } from './diffByValue'
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
  // Collision-aware placement via the shared placer (avoids marks + other
  // labels, including the "Difference: N" readout). Caller owns the fade-in.
  void _anchor
  const labelNode = placeValueLabel({
    layer,
    svg: instance.svg,
    viewport: resolveAnnotationViewport(instance),
    preferred: { x, y },
    text,
    className,
    fill: color,
  })
  return labelNode.transition().duration(DURATIONS.LABEL_FADE_IN).style(SvgAttributes.Opacity, 1)
}

export const diffApplier: OperationApplier = {
  op: OperationOp.Diff,

  async apply(args: ApplierArgs): Promise<ApplierResult> {
    const { operation, state, instance, options } = args
    // op-consolidation Tier 1: a folded op="diff" carrying a row-vs-scalar operand
    // (value|targetValue, formerly diffByValue) is DRAWN by the diffByValue applier.
    if (
      (typeof operation.value === 'number' && Number.isFinite(operation.value)) ||
      (typeof operation.targetValue === 'string' && operation.targetValue.trim() !== '')
    ) {
      return diffByValueApplier.apply(args)
    }
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
    applyAnnotationContextFade(layer, state.annotationRecords, FILTER_ANNOTATION_CLASS, options?.referencedResultIds)
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

    // ── Split-layout path ───────────────────────────────────────────────────
    // When ops1/ops2 ran on separate split surfaces, the two endpoints we want
    // to compare live on `split-left` / `split-right`, and this `diff` runs on
    // the (hidden) root surface. Resolve each endpoint's on-screen position per
    // surface — by result-ref (works for average lines AND findExtremum / nth
    // point marks), falling back to the surface's average line — place the Δ
    // arrow in the GAP between the panels, and overlay the root SVG on top so it
    // is visible. Geometry + overlay are shared with the simple-bar diff via
    // `primitives/splitDiffOverlay`, so any endpoint-op combination renders the
    // same way across chart types. Compute geometry BEFORE mounting the overlay
    // (the root SVG may still be `display:none`, so geometry falls back to the
    // chart-host rect; the overlay then matches it at 100%×100%).
    // Only the ROOT merge diff overlays the surfaces. A diff that runs ON a
    // split child surface (an intra-panel diff) owns its own visible panel —
    // overlaying/hiding its skeleton would hide the very line it annotates, so
    // it falls through to the normal in-place path below.
    const svgNode = instance.svg.node()
    const surfaceId = (instance.host as HTMLElement | undefined)
      ?.closest?.('[data-surface-id]')
      ?.getAttribute('data-surface-id')
    const onSplitChildSurface = surfaceId === 'split-left' || surfaceId === 'split-right'
    const splitLayoutType = options?.surfaceManager?.getLayout()?.type
    const isSplit = splitLayoutType === 'split-horizontal' || splitLayoutType === 'split-vertical'
    if (isSplit && !onSplitChildSurface && svgNode) {
      const splitGeometry = computeSplitDiffGeometry({ host: instance.host, svgNode, refKeys: referencedRefKeys })
      // hideSkeleton only when the endpoints are anchored on the panels (arrow
      // mode); otherwise keep the root chart visible.
      mountRootDiffOverlay(svgNode, { hideSkeleton: !!splitGeometry })
      if (splitGeometry) {
        await drawVerticalComparisonArrow({
          layer,
          cssClass: DIFF_ANNOTATION_CLASS,
          x: splitGeometry.arrowX,
          topY: splitGeometry.topY,
          bottomY: splitGeometry.bottomY,
          refLines: [],
          phaseOnePromises: [],
          color: COLORS.ANNOTATION_RED,
          label: `Difference: ${formatOperationValue(Number(result[0]?.value))}`,
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
      }
      // Endpoints not resolvable on the surfaces (unexpected for a valid
      // convergent diff) → the overlay is mounted; fall through to the in-SVG
      // arrow below as a best-effort fallback.
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
        COLORS.TEXT_DARK,
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

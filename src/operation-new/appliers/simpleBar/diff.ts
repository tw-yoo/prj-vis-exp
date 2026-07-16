import * as d3 from 'd3'
import { diffData } from '../../../domain/operation/dataOps'
import { OperationOp } from '../../../domain/operation/types'
import { DataAttributes, SvgAttributes, SvgClassNames } from '../../../rendering/interfaces'
import { COLORS, DURATIONS } from '../../../rendering/common/d3Helpers'
import { formatOperationValue } from '../../../operation-next/primitives/formatValue'
import {
  RESULT_REF_ATTRIBUTE,
  diffEndpointSelectors,
  operationResultRef,
  resolveDerivedDiffEndpoint,
} from '../../../operation-next/diffEndpoint'
import type { OperationApplier, ApplierArgs, ApplierResult } from '../../applier'
import { diffByValueApplier } from './diffByValue'
import type { SimpleBarChartInstance } from '../../../rendering-new/instances/simpleBarInstance'
import { readNumberAttr } from '../../primitives/annotationLayer'
import { applyAnnotationContextFade } from '../../primitives/contextFade'
import { drawVerticalComparisonArrow } from '../../primitives/drawDifferenceArrow'
import { fadeRemoveAnnotations } from '../../primitives/fadeRemove'
import { computeSplitDiffGeometry, mountRootDiffOverlay } from '../../primitives/splitDiffOverlay'
import { placeValueLabel } from '../../primitives/placeValueLabel'
import { rebindDerivedBars } from '../../../operation-next/primitives/rebindDerivedBars'
import { FILTER_ANNOTATION_CLASS } from './filter'
import { RETRIEVE_ANNOTATION_CLASS } from './retrieveValue'
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

function findBarByRef(instance: SimpleBarChartInstance, refKey: string): SVGRectElement | null {
  const node = instance.svg
    .selectAll<SVGRectElement, unknown>(`rect.${SvgClassNames.MainBar}`)
    .filter(function () {
      return this.getAttribute(RESULT_REF_ATTRIBUTE) === refKey
    })
    .nodes()[0]
  return node ?? null
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

  async apply(args: ApplierArgs<SimpleBarChartInstance>): Promise<ApplierResult> {
    const { operation, state, instance, options } = args
    // op-consolidation Tier 1: folded row-vs-scalar diff (value|targetValue) → diffByValue drawing.
    if (
      (typeof operation.value === 'number' && Number.isFinite(operation.value)) ||
      (typeof operation.targetValue === 'string' && operation.targetValue.trim() !== '')
    ) {
      return diffByValueApplier.apply(args)
    }
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
    let rectA = derivedA ? null : findBarFor(instance, selectors.targetA)
    let rectB = derivedB ? null : findBarFor(instance, selectors.targetB)

    // M2 (audit simpleBar-4): a derived endpoint that resolves to a single
    // on-chart category — e.g. a findExtremum result (ref:n1) whose row targets
    // the max bar's year — DOES have a real, highlighted bar. Recover it so the
    // Δ arrow anchors to the visible bar instead of floating past the right plot
    // edge. Aggregate endpoints (average → target "__avg__", sum → "__sum__", …)
    // match no bar and correctly stay derived (their own reference line anchors).
    const recoverDerivedBar = (
      derived: typeof derivedA,
    ): SVGRectElement | null => {
      const t = derived?.rows?.[0]?.target
      if (t == null) return null
      const key = String(t)
      if (key.startsWith('__')) return null
      return findBarByTarget(instance, key).nodes()[0] ?? null
    }
    if (rectA == null && derivedA) rectA = recoverDerivedBar(derivedA)
    if (rectB == null && derivedB) rectB = recoverDerivedBar(derivedB)

    console.info('[operation-new] bar applier:diff DEBUG endpoints', {
      nodeId: operation.meta?.nodeId,
      selectors,
      derivedA,
      derivedB,
      rectAExists: !!rectA,
      rectBExists: !!rectB,
      rectADataTarget: rectA?.getAttribute(DataAttributes.Target),
      rectBDataTarget: rectB?.getAttribute(DataAttributes.Target),
      annotationRecordCount: state.annotationRecords.length,
    })

    const layer = instance.annotationLayer
    applyAnnotationContextFade(layer, state.annotationRecords, FILTER_ANNOTATION_CLASS, options?.referencedResultIds)
    fadeRemoveAnnotations(layer, DIFF_ANNOTATION_CLASS)

    let existingA = existingReferenceLineY(layer, derivedA?.refKey)
    let existingB = existingReferenceLineY(layer, derivedB?.refKey)

    // Derived-bar rebind (feedback case `0pzdf7hfbxgjghsa`): when both endpoints
    // are derived scalars without on-chart anchors (no bar found, no scalar
    // reference line in the layer), replace the chart's bars with two new bars
    // representing each derived value so the diff arrow has something tangible
    // to connect. The chart skeleton and y-scale are preserved.
    const willRebind = !!(derivedA && derivedB && existingA == null && existingB == null && rectA == null && rectB == null)
    console.info('[operation-new] bar applier:diff DEBUG existingRefLines', {
      existingA,
      existingB,
      willRebind,
    })
    if (willRebind && derivedA && derivedB) {
      const labelA = derivedA.refKey
      const labelB = derivedB.refKey
      await rebindDerivedBars({
        svg: instance.svg,
        rows: [
          { label: labelA, value: derivedA.value, ref: derivedA.refKey },
          { label: labelB, value: derivedB.value, ref: derivedB.refKey },
        ],
        xAxisTitle: `Difference between ${labelA} and ${labelB}`,
      })
      rectA = findBarByRef(instance, derivedA.refKey)
      rectB = findBarByRef(instance, derivedB.refKey)
      existingA = null
      existingB = null
      // The rebind replaced the chart's bars, so any prior per-bar value labels
      // (retrieveValue results placed on the OLD bars) now float at stale
      // positions — the "weird number position" report. Remove them; the diff
      // draws its own bar-value labels on the new bars further below.
      fadeRemoveAnnotations(layer, RETRIEVE_ANNOTATION_CLASS)
      console.info('[operation-new] bar applier:diff DEBUG post-rebind', {
        rectAAfter: !!rectA,
        rectBAfter: !!rectB,
        rectAAttrs: rectA && {
          x: rectA.getAttribute('x'),
          y: rectA.getAttribute('y'),
          width: rectA.getAttribute('width'),
          height: rectA.getAttribute('height'),
          dataValue: rectA.getAttribute(DataAttributes.Value),
        },
        rectBAttrs: rectB && {
          x: rectB.getAttribute('x'),
          y: rectB.getAttribute('y'),
          width: rectB.getAttribute('width'),
          height: rectB.getAttribute('height'),
          dataValue: rectB.getAttribute(DataAttributes.Value),
        },
      })
    }

    // Source-of-truth marginLeft from the SVG attribute. Mirrors the average
    // applier fix: when a split surface has its `instance.layout.marginLeft`
    // mutated for cross-surface alignment, `data-m-left` on the actual SVG
    // stays accurate for the SVG's own coordinate system. Annotations live
    // inside that SVG, so we honor the SVG attribute.
    const svgNode = instance.svg.node()
    const svgMarginLeftAttr = svgNode?.getAttribute(DataAttributes.MarginLeft)
    const marginLeft =
      svgMarginLeftAttr != null && Number.isFinite(Number(svgMarginLeftAttr))
        ? Number(svgMarginLeftAttr)
        : instance.layout.marginLeft
    const plotWidth = instance.layout.plotWidth

    // readBarMetrics derives centerX from `instance.layout.marginLeft`. If
    // that drifted (split surface), the bar's center would land on the wrong
    // x. Override centerX with the svg-attribute marginLeft we trust above.
    const recomputeBarCenterX = (rect: SVGRectElement): number => {
      const x = Number(rect.getAttribute('x') ?? 0)
      const width = Number(rect.getAttribute('width') ?? 0)
      return marginLeft + x + width / 2
    }
    const markA = rectA
      ? { ...readBarMetrics(rectA, instance), centerX: recomputeBarCenterX(rectA) }
      : null
    const markB = rectB
      ? { ...readBarMetrics(rectB, instance), centerX: recomputeBarCenterX(rectB) }
      : null

    console.info('[operation-new] bar applier:diff DEBUG marks', {
      svgMarginLeftAttr,
      resolvedMarginLeft: marginLeft,
      instanceMarginLeft: instance.layout.marginLeft,
      plotWidth,
      markA: markA && { centerX: markA.centerX, topY: markA.topY, value: markA.value, width: markA.width },
      markB: markB && { centerX: markB.centerX, topY: markB.topY, value: markB.value, width: markB.width },
    })
    const derivedAY = derivedA ? existingA ?? valueToRootY(instance, derivedA.value) : null
    const derivedBY = derivedB ? existingB ?? valueToRootY(instance, derivedB.value) : null

    // Prefer the mark branch when a bar exists — the visual reads more
    // naturally as a bar-to-bar comparison. Falls back to the abstract
    // derived endpoint only when no bar is present.
    const a = markA
      ? {
          kind: 'mark' as const,
          value: markA.value,
          y: markA.topY,
          x: markA.centerX,
          usesExistingReference: false,
          anchor: rectA as Element | null,
        }
      : derivedA && derivedAY != null
        ? {
            kind: 'derived' as const,
            value: derivedA.value,
            y: derivedAY,
            x: marginLeft + plotWidth,
            usesExistingReference: existingA != null,
            anchor: null as Element | null,
          }
        : null
    const b = markB
      ? {
          kind: 'mark' as const,
          value: markB.value,
          y: markB.topY,
          x: markB.centerX,
          usesExistingReference: false,
          anchor: rectB as Element | null,
        }
      : derivedB && derivedBY != null
        ? {
            kind: 'derived' as const,
            value: derivedB.value,
            y: derivedBY,
            x: marginLeft + plotWidth,
            usesExistingReference: existingB != null,
            anchor: null as Element | null,
          }
        : null
    if (!a || !b) {
      console.warn('[operation-new] simple-bar diff: endpoints could not be resolved', { operation })
      return { result, nextState: { ...state, lastResult: result } }
    }

    let topY = Math.min(a.y, b.y)
    let bottomY = Math.max(a.y, b.y)
    const differenceText = `Difference: ${formatOperationValue(Number(result[0]?.value))}`

    // Place the vertical Δ arrow BETWEEN the two bars when both endpoints
    // are real marks on the chart (reviewer's request on case
    // 0s6zi9dyw22qo4rp: "차트 중간에 difference를 보여주는 vertical line이
    // 있어야 함"). The horizontal connectors then run from each bar's center
    // to the arrow x. When at least one endpoint is derived (no anchor on
    // chart — e.g. an average reference line living in the right margin),
    // fall back to the legacy "outside the plot" position so the arrow
    // doesn't sit on top of empty space.
    const bothAreMarks = a.kind === 'mark' && b.kind === 'mark'
    // When exactly one endpoint is a real bar and the other is a derived
    // reference line (e.g. max bar vs average line, #31), anchor the Δ arrow at
    // the bar's x so it drops from the bar top to the reference line — instead
    // of floating past the right plot edge (audit simpleBar-4).
    const soleMarkX = bothAreMarks ? null : a.kind === 'mark' ? a.x : b.kind === 'mark' ? b.x : null
    let arrowX = bothAreMarks
      ? (a.x + b.x) / 2
      : soleMarkX ?? (marginLeft + plotWidth + 18)
    let refStartA = a.kind === 'mark' ? a.x : marginLeft
    let refStartB = b.kind === 'mark' ? b.x : marginLeft
    let suppressRefLines = false

    // A diff runs in one of three split contexts, each handled differently:
    //   • on a split CHILD surface (split-left/right) — an INTRA-panel diff
    //     (e.g. retrieveValue+retrieveValue+diff in one sentence). It owns its
    //     panel: render the (possibly rebound) bars + arrow in place, no overlay.
    //   • on the ROOT with both endpoints anchored on the panels (avg lines /
    //     extremum points) — a cross-surface ARROW: overlay just the arrow in
    //     the gap, hide the root skeleton, keep the panels.
    //   • on the ROOT with abstract scalar endpoints (diff-of-diffs) — a REBIND:
    //     new bars are drawn on the root skeleton; show them and hide the panels.
    // `onSplitChildSurface` picks the first; a resolved `splitGeometry` separates
    // the second (arrow) from the third (rebind). Hiding the skeleton on a child
    // surface or a root rebind was the "bars not visible" bug (case 0pzdf7hfbxgjghsa).
    const surfaceId = (instance.host as HTMLElement | undefined)
      ?.closest?.('[data-surface-id]')
      ?.getAttribute('data-surface-id')
    const onSplitChildSurface = surfaceId === 'split-left' || surfaceId === 'split-right'

    // -----------------------------------------------------------------------
    // Cross-surface endpoint override (reviewer feedback on case
    // 0s6zi9dyw22qo4rp): when both endpoints live on the split panels, place the
    // Δ arrow in the gap between them and suppress the horizontal connectors.
    // Shared with the simple-line diff via `primitives/splitDiffOverlay`. Only
    // the ROOT merge diff can resolve geometry (a child diff's endpoints are
    // local to its own panel), so skip the lookup on a child surface.
    // -----------------------------------------------------------------------
    const splitLayoutHint = options?.surfaceManager?.getLayout()?.type
    const isSplitForOverride = splitLayoutHint === 'split-horizontal' || splitLayoutHint === 'split-vertical'
    let splitGeometry: ReturnType<typeof computeSplitDiffGeometry> = null
    if (isSplitForOverride && !onSplitChildSurface && svgNode) {
      splitGeometry = computeSplitDiffGeometry({
        host: instance.host,
        svgNode,
        refKeys: [derivedA?.refKey, derivedB?.refKey].filter((k): k is string => !!k),
      })
      console.info('[operation-new] bar applier:diff DEBUG split-endpoint-override', {
        resolved: !!splitGeometry,
        splitGeometry,
      })
      if (splitGeometry) {
        topY = splitGeometry.topY
        bottomY = splitGeometry.bottomY
        arrowX = splitGeometry.arrowX
        refStartA = arrowX
        refStartB = arrowX
        suppressRefLines = true
      }
    }

    console.info('[operation-new] bar applier:diff DEBUG geometry', {
      aKind: a.kind,
      bKind: b.kind,
      aX: a.x,
      aY: a.y,
      bX: b.x,
      bY: b.y,
      aUsesExistingRef: a.usesExistingReference,
      bUsesExistingRef: b.usesExistingReference,
      bothAreMarks,
      arrowX,
      refStartA,
      refStartB,
      topY,
      bottomY,
      suppressRefLines,
      differenceText,
    })

    const viewport = resolveBarAnnotationViewport(instance)
    // Suppress per-endpoint bar-value labels ONLY in cross-surface arrow mode:
    // there the two panels already display the endpoint values (`Avg (filtered):
    // 0.67`, …), so repeating them next to the hidden root bars would duplicate.
    // For an intra-panel diff or a root rebind the bar-value labels ARE the
    // content — keep them, anchored on the (possibly rebound) bars.
    const crossSurfaceArrow = isSplitForOverride && !onSplitChildSurface && !!splitGeometry
    const markEndpoints = crossSurfaceArrow
      ? []
      : [a, b].filter((endpoint) => endpoint.kind === 'mark')
    const labelPromises = markEndpoints.map((endpoint) => {
      // Value label above the endpoint, positioned by the shared collision-aware
      // placer so it avoids the bars + the "Difference: N" label and never lands
      // inside a bar. Dark fill (placeValueLabel default) keeps it legible on the
      // red derived bars (was red-on-red).
      const labelNode = placeValueLabel({
        layer,
        svg: instance.svg,
        viewport,
        preferred: { x: endpoint.x, y: endpoint.y - 8 },
        text: formatOperationValue(endpoint.value),
        className: `${DIFF_ANNOTATION_CLASS} bar-value`,
      })
      return labelNode
        .transition()
        .duration(DURATIONS.LABEL_FADE_IN)
        .style(SvgAttributes.Opacity, 1)
        .end()
        .catch(() => undefined)
    })

    console.info('[operation-new] bar applier:diff DEBUG pre-draw', {
      arrowX,
      topY,
      bottomY,
      refLineCount: [a.usesExistingReference ? null : 'A', b.usesExistingReference ? null : 'B'].filter(Boolean).length,
      labelText: differenceText,
      layerExists: !layer.empty(),
      layerLinesBefore: layer.selectAll('line').size(),
    })

    // Split-layout overlay — only for a ROOT merge diff (a child-surface diff
    // renders in its own visible panel, no overlay). `hideSkeleton` selects the
    // mode: arrow (endpoints on panels → show only the Δ arrow, keep panels) vs
    // rebind (new bars on the root → show the root chart, hide the panels). All
    // three host topologies are handled inside the shared primitive, which the
    // simple-line diff also uses.
    if (isSplitForOverride && !onSplitChildSurface && svgNode) {
      mountRootDiffOverlay(svgNode, { hideSkeleton: !!splitGeometry })
    }

    // In split mode the two split surfaces' own average lines play the role
    // of the horizontal anchors, so we don't draw additional connectors
    // that would visually duplicate them.
    const refLines = suppressRefLines
      ? []
      : ([
          a.usesExistingReference ? null : { startX: refStartA, y: a.y },
          b.usesExistingReference ? null : { startX: refStartB, y: b.y },
        ].filter((line): line is { startX: number; y: number } => line != null))

    await drawVerticalComparisonArrow({
      layer,
      cssClass: DIFF_ANNOTATION_CLASS,
      x: arrowX,
      topY,
      bottomY,
      refLines,
      phaseOnePromises: labelPromises as unknown as Promise<void>[],
      color: COLORS.ANNOTATION_RED,
      label: differenceText,
      labelPlacement: crossSurfaceArrow ? 'above-center' : 'right',
      svg: instance.svg,
      viewport,
    })

    // Inspect the layer right after the draw to confirm the arrow lines made
    // it into the DOM. If `addedDiffLines === 0` after this, the arrow draw
    // failed silently (e.g. the layer was wiped mid-transition or the
    // primitive returned early).
    const diffLineNodes = layer.selectAll<SVGLineElement, unknown>(`line.${DIFF_ANNOTATION_CLASS}`).nodes()
    const sampleLines = diffLineNodes.slice(0, 6).map((node) => ({
      x1: node.getAttribute('x1'),
      x2: node.getAttribute('x2'),
      y1: node.getAttribute('y1'),
      y2: node.getAttribute('y2'),
      stroke: node.getAttribute('stroke'),
      classes: node.getAttribute('class'),
    }))
    console.info('[operation-new] bar applier:diff DEBUG post-draw', {
      diffLineCount: diffLineNodes.length,
      sampleLines,
      layerHTML: layer.node()?.outerHTML?.slice(0, 600),
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

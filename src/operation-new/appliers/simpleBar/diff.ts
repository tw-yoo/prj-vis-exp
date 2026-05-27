import * as d3 from 'd3'
import { diffData } from '../../../domain/operation/dataOps'
import { OperationOp } from '../../../domain/operation/types'
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
import type { SimpleBarChartInstance } from '../../../rendering-new/instances/simpleBarInstance'
import { readNumberAttr } from '../../primitives/annotationLayer'
import { applyAnnotationContextFade } from '../../primitives/contextFade'
import { drawVerticalComparisonArrow } from '../../primitives/drawDifferenceArrow'
import { fadeRemoveAnnotations } from '../../primitives/fadeRemove'
import { rebindDerivedBars } from '../../../operation-next/primitives/rebindDerivedBars'
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

  async apply({ operation, state, instance, options }: ApplierArgs<SimpleBarChartInstance>): Promise<ApplierResult> {
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

    const topY = Math.min(a.y, b.y)
    const bottomY = Math.max(a.y, b.y)
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
    const arrowX = bothAreMarks
      ? (a.x + b.x) / 2
      : marginLeft + plotWidth + 18
    const refStartA = bothAreMarks ? a.x : marginLeft
    const refStartB = bothAreMarks ? b.x : marginLeft

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
      differenceText,
    })

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

    console.info('[operation-new] bar applier:diff DEBUG pre-draw', {
      arrowX,
      topY,
      bottomY,
      refLineCount: [a.usesExistingReference ? null : 'A', b.usesExistingReference ? null : 'B'].filter(Boolean).length,
      labelText: differenceText,
      layerExists: !layer.empty(),
      layerLinesBefore: layer.selectAll('line').size(),
    })

    // Split-layout overlay handling.
    //
    // When the chart was previously split (e.g. ops1+ops2 ran on left/right
    // surfaces), surfaceManager hides the root surface's SVG via
    // `style.display = 'none'` so it doesn't take up flex space. Our diff
    // annotation (and the derived-bars rebind that precedes it) lives inside
    // that root SVG, which means the user can't see it. Per reviewer feedback
    // ("두 splited charts 가운데에 vertical line이 생겨야 함"), we restore the
    // root SVG and overlay it absolutely on top of the two split surfaces so
    // the diff arrow visually sits between them. pointer-events:none lets the
    // user still hover bars on the split surfaces.
    //
    // The overlay's positioning is driven from the split wrapper (the host
    // that carries `surface-layout--split`): we promote it to position:relative
    // so the absolute child anchors correctly without disturbing existing flex
    // sizing of split-left/split-right.
    const splitLayoutType = options?.surfaceManager?.getLayout()?.type
    const isSplit = splitLayoutType === 'split-horizontal' || splitLayoutType === 'split-vertical'
    if (isSplit) {
      const rootHost = svgNode?.parentElement as HTMLElement | null
      const splitWrapper = rootHost?.parentElement as HTMLElement | null
      // Two host topologies in the wild:
      //   (a) `rootHost` IS the split flex container itself (carries the
      //       `surface-layout--split` class and `data-surface-id="root"`,
      //       same element). The split-left / split-right divs are its
      //       children alongside the root SVG. — case 0s6zi9dyw22qo4rp.
      //   (b) `rootHost` is a SEPARATE child of the wrapper.
      //
      // For (a), we must NOT set `position: absolute` on the host: doing so
      // takes the flex container itself out of normal document flow, and
      // its children (the two split surfaces) lose their visible layout —
      // the user sees the chart "disappear". Instead, promote the host to
      // a positioning context and absolutely position the root SVG INSIDE
      // it so the diff annotations overlay the split surfaces while leaving
      // the flex layout intact.
      // For (b), the legacy path (absolute host on top of the wrapper)
      // still works.
      const rootHostIsSplitWrapper = !!rootHost?.classList.contains('surface-layout--split')
      console.info('[operation-new] bar applier:diff DEBUG split-overlay', {
        splitLayoutType,
        rootHostSurfaceId: rootHost?.dataset.surfaceId ?? null,
        rootHostIsSplitWrapper,
        splitWrapperClass: splitWrapper?.className ?? null,
        svgDisplayBefore: svgNode?.style.display ?? null,
        rootHostDisplayBefore: rootHost?.style.display ?? null,
      })
      if (rootHostIsSplitWrapper && rootHost) {
        // (a) — host is the flex container; absolutize the SVG only.
        if (!rootHost.style.position) rootHost.style.position = 'relative'
        if (svgNode) {
          svgNode.style.display = ''
          svgNode.style.position = 'absolute'
          svgNode.style.top = '0'
          svgNode.style.left = '0'
          svgNode.style.width = '100%'
          svgNode.style.height = '100%'
          svgNode.style.pointerEvents = 'none'
          svgNode.style.zIndex = '5'
        }
      } else {
        // (b) — host is a separate child; absolutize the host.
        if (svgNode) {
          svgNode.style.display = ''
          svgNode.style.pointerEvents = 'none'
        }
        if (rootHost && rootHost.dataset.surfaceId === 'root') {
          rootHost.style.display = ''
          rootHost.style.position = 'absolute'
          rootHost.style.inset = '0'
          rootHost.style.pointerEvents = 'none'
          rootHost.style.zIndex = '5'
        }
        if (splitWrapper && splitWrapper.classList.contains('surface-layout--split')) {
          // Make the split wrapper a positioning context for the overlay.
          // flex properties stay intact; we only set `position: relative`
          // if absent.
          if (!splitWrapper.style.position) splitWrapper.style.position = 'relative'
        }
      }
      // Hide every visual on the root SVG except the diff annotation layer:
      //   - chart-skeleton wraps the y-axis, x-axis (with derived ticks), and
      //     the bar-marks group (where rebound derived bars live)
      //   - the x-/y-axis title texts live as direct children of the SVG root
      //   - per-bar value labels ('0.67', '0.61') sit inside the annotation
      //     layer with class `bar-value` — split surfaces already show the
      //     same numbers via their own `Avg (filtered): N` annotations, so
      //     hide the duplicates to avoid double-rendering on overlay.
      // What remains visible: the diff arrow shaft, horizontal connectors,
      // arrowheads, and the "Difference: 0.06" label.
      if (svgNode) {
        svgNode.querySelectorAll<SVGElement>('g.chart-skeleton').forEach((g) => { g.style.opacity = '0' })
        svgNode
          .querySelectorAll<SVGElement>('text.x-axis-label, text.y-axis-label')
          .forEach((t) => { t.style.opacity = '0' })
        svgNode
          .querySelectorAll<SVGElement>(`text.${DIFF_ANNOTATION_CLASS}.bar-value`)
          .forEach((t) => { t.style.opacity = '0' })
      }
    }

    await drawVerticalComparisonArrow({
      layer,
      cssClass: DIFF_ANNOTATION_CLASS,
      x: arrowX,
      topY,
      bottomY,
      refLines: [
        a.usesExistingReference ? null : { startX: refStartA, y: a.y },
        b.usesExistingReference ? null : { startX: refStartB, y: b.y },
      ].filter((line): line is { startX: number; y: number } => line != null),
      phaseOnePromises: labelPromises as unknown as Promise<void>[],
      color: COLORS.ANNOTATION_RED,
      label: differenceText,
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

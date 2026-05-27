import * as d3 from 'd3'
import { pairDiffData } from '../../../domain/operation/dataOps'
import { OperationOp } from '../../../domain/operation/types'
import { assertPairDiffSpec } from '../../../domain/operation/types/operationValidators'
import { DataAttributes, SvgAttributes, SvgClassNames, SvgElements } from '../../../rendering/interfaces'
import { COLORS, DURATIONS, EASINGS } from '../../../rendering/common/d3Helpers'
import { formatOperationValue } from '../../../operation-next/primitives/formatValue'
import { operationResultRef } from '../../../operation-next/diffEndpoint'
import type { OperationApplier, ApplierArgs, ApplierResult } from '../../applier'
import type { StackedBarChartInstance } from '../../../rendering-new/instances/stackedBarInstance'
import { getStackedBarStoredData, type StackedSpec } from '../../../rendering/bar/stackedBarRenderer'
import { applyAnnotationContextFade } from '../../primitives/contextFade'
import { fadeRemoveAnnotations } from '../../primitives/fadeRemove'
import { FILTER_ANNOTATION_CLASS } from './filter'

export const PAIR_DIFF_ANNOTATION_CLASS = 'operation-next-stacked-bar-pair-diff'

const ARROW_HEAD_SIZE_PX = 7
const ARROW_LABEL_GAP_PX = 6

/**
 * Stacked-bar pairDiff applier.
 *
 * Three-phase visual sequence per the reviewer's request on case
 * `11e148qcs7x70t8v` (Korean):
 *   "이 차트에서 groupA, groupB만 남은 stacked Bar가 자연스럽게 만들어지고,
 *    이 stacked bar가 자연스러운 bar 이동 애니메이션을 통해 grouped bar
 *    chart로 만들어진 뒤, 각 x 데이터 pair마다 diff를 구하는 애니메이션이
 *    만들어지는 것임."
 *
 *   Phase 1 — narrow the stacked bars down to {groupA, groupB} via
 *             `transitionSeriesScope({ mode: 'recompose' })`. Surviving
 *             segments re-anchor at y=0; the y-axis rescales. Legend also
 *             updates in lockstep.
 *
 *   Phase 2 — stacked → grouped chart-type transition via
 *             `transitionToGrouped`. The legacy converter slides each
 *             stack segment to its side-by-side grouped position with a
 *             smooth animation, then re-renders the grouped chart skeleton.
 *
 *   Phase 3 — per-target Δ arrows on the resulting grouped chart. For each
 *             x category we draw a vertical arrow between the groupA bar
 *             top and the groupB bar top, plus a numeric label showing the
 *             signed (or absolute) difference.
 *
 * Falls back early if anything goes wrong; every phase logs progress so a
 * user can paste console output for follow-up diagnosis.
 */
export const pairDiffApplier: OperationApplier<StackedBarChartInstance> = {
  op: OperationOp.PairDiff,

  async apply({
    operation,
    state,
    instance,
    options,
    runtimeSpec,
  }: ApplierArgs<StackedBarChartInstance>): Promise<ApplierResult> {
    console.info('[operation-new] stacked-bar applier:pairDiff ENTRY', {
      nodeId: operation.meta?.nodeId,
      operation,
    })

    const spec = assertPairDiffSpec(operation)
    const groupA = String(spec.groupA)
    const groupB = String(spec.groupB)
    const result = pairDiffData(state.workingData, operation)

    console.info('[operation-new] stacked-bar applier:pairDiff DEBUG data', {
      groupA,
      groupB,
      seriesField: spec.seriesField,
      by: spec.by,
      field: spec.field,
      signed: spec.signed,
      absolute: spec.absolute,
      workingDataLen: state.workingData.length,
      resultLen: result.length,
      sampleResult: result.slice(0, 4).map((d) => ({ target: d.target, value: d.value })),
    })

    if (result.length === 0) {
      console.warn('[operation-new] stacked-bar applier:pairDiff: empty result, nothing to draw')
      return { result, nextState: { ...state, lastResult: result } }
    }

    if (!runtimeSpec) {
      console.warn('[operation-new] stacked-bar applier:pairDiff: runtimeSpec missing — cannot phase-2 (stacked→grouped)')
      return { result, nextState: { ...state, lastResult: result } }
    }

    const layer = instance.annotationLayer
    applyAnnotationContextFade(layer, state.annotationRecords, FILTER_ANNOTATION_CLASS, options?.referencedResultIds)
    fadeRemoveAnnotations(layer, PAIR_DIFF_ANNOTATION_CLASS)

    // -----------------------------------------------------------------------
    // Phase 1: narrow the stacked chart to {groupA, groupB}.
    // -----------------------------------------------------------------------
    const activeSeries = new Set<string>([groupA, groupB])
    const hasPersistentAnchor = state.annotationRecords.some((r) => r.persistent)
    const phase1Mode: 'recompose' | 'dim' = hasPersistentAnchor ? 'dim' : 'recompose'
    console.info('[operation-new] stacked-bar applier:pairDiff PHASE 1 start', {
      activeSeries: [...activeSeries],
      phase1Mode,
      hasPersistentAnchor,
    })
    await Promise.all([
      instance.transitionSeriesScope({
        isInScope: (_target, series) => activeSeries.has(series),
        mode: phase1Mode,
      }),
      phase1Mode === 'recompose'
        ? instance.transitionLegend({ activeSeries })
        : Promise.resolve(),
    ])
    console.info('[operation-new] stacked-bar applier:pairDiff PHASE 1 done')

    // -----------------------------------------------------------------------
    // Phase 2: stacked → grouped chart-type transition.
    //
    // Critical: feed `convertStackedToGrouped` a spec whose `data.values`
    // is already narrowed to {groupA, groupB}. The legacy converter uses
    // that data to build the final GroupedSpec — without filtering, the
    // resulting grouped chart contains every original series even though
    // the animation only highlights two of them (case 11e148qcs7x70t8v).
    //
    // The series field is read from the spec's color encoding (or the op's
    // explicit `seriesField` hint when present). We narrow `data.values`
    // and pass the new spec via `currentSpec`. The `visibleSeries` option
    // on `stackGroup` keeps the animation's "fade out unmatched" behavior
    // aligned with the data filter.
    // -----------------------------------------------------------------------
    const stackedSpec = runtimeSpec as StackedSpec
    const encodingColorField =
      (stackedSpec.encoding as { color?: { field?: string } } | undefined)?.color?.field ?? null
    const seriesFieldName = spec.seriesField ?? encodingColorField ?? null

    // Source-of-truth for the rows used by `convertStackedToGrouped`:
    //   1. Prefer the spec's inline `data.values` (workbench cases ship this).
    //   2. Fall back to `getStackedBarStoredData(host)` — the cache the
    //      stacked-bar renderer populated during the base render. This is
    //      essential for the review-tool path where `spec.data` is `url`-based
    //      and `data.values` is empty: without this fallback the filter below
    //      runs on `[]`, the produced spec has no values, and
    //      `resolveDataset` inside `convertStackedToGrouped` silently falls
    //      back to ALL stored rows — undoing our narrowing and rendering the
    //      grouped chart with every original series (case 11e148qcs7x70t8v).
    const inlineValues = ((stackedSpec.data as { values?: unknown[] } | undefined)?.values ?? []) as Array<Record<string, unknown>>
    const storedValues = inlineValues.length === 0
      ? (getStackedBarStoredData(instance.host) as unknown as Array<Record<string, unknown>>)
      : null
    const baseValues = inlineValues.length > 0 ? inlineValues : (storedValues ?? [])

    let filteredValues: Array<Record<string, unknown>> = baseValues
    if (seriesFieldName) {
      filteredValues = baseValues.filter((row) => {
        const s = String(row[seriesFieldName])
        return s === groupA || s === groupB
      })
    } else {
      console.warn('[operation-new] stacked-bar applier:pairDiff PHASE 2: no seriesField — cannot narrow data, falling back to full spec')
    }
    console.info('[operation-new] stacked-bar applier:pairDiff PHASE 2 spec-filter', {
      seriesFieldName,
      inlineValuesLen: inlineValues.length,
      storedValuesLen: storedValues?.length ?? null,
      baseValuesSource: inlineValues.length > 0 ? 'inline' : 'stored-fallback',
      baseValuesLen: baseValues.length,
      filteredValuesLen: filteredValues.length,
      sampleFiltered: filteredValues.slice(0, 4),
    })

    if (filteredValues.length === 0) {
      console.warn('[operation-new] stacked-bar applier:pairDiff PHASE 2: filtered values empty — aborting (would yield empty grouped chart)')
      return buildResultState(result, state, operation)
    }

    const filteredStackedSpec: StackedSpec = {
      ...stackedSpec,
      data: { values: filteredValues },
    }

    console.info('[operation-new] stacked-bar applier:pairDiff PHASE 2 start')
    const transformResult = await instance.transitionToGrouped({
      currentSpec: filteredStackedSpec,
      stackGroup: {
        visibleSeries: [groupA, groupB],
        colorField: seriesFieldName ?? undefined,
      },
    })
    console.info('[operation-new] stacked-bar applier:pairDiff PHASE 2 done', {
      newChartType: transformResult?.chartType ?? null,
      transformedSpecHasData: !!transformResult?.spec,
    })

    // -----------------------------------------------------------------------
    // Phase 3: per-target Δ arrows on the grouped chart.
    //
    // The host now contains the grouped SVG. We address it directly (the
    // stacked instance's cached d3 selection points at the old, removed SVG).
    // For each target (x category) we find the two bars matching {groupA,
    // groupB}, then draw a vertical Δ arrow between their tops.
    // -----------------------------------------------------------------------
    const host = instance.host
    const groupedSvgNode = host.querySelector<SVGSVGElement>('svg')
    if (!groupedSvgNode) {
      console.warn('[operation-new] stacked-bar applier:pairDiff PHASE 3: no grouped SVG found in host')
      return buildResultState(result, state, operation)
    }
    const groupedSvg = d3.select(groupedSvgNode)

    // Ensure (or fetch) the annotation layer on the new grouped SVG.
    let groupedLayer = groupedSvg.select<SVGGElement>('g.operation-next-annotation-layer')
    if (groupedLayer.empty()) {
      groupedLayer = groupedSvg
        .append(SvgElements.Group)
        .attr(
          SvgAttributes.Class,
          `${SvgClassNames.AnnotationLayer} operation-next-annotation-layer`,
        )
    }

    const marginLeft = Number(groupedSvgNode.getAttribute(DataAttributes.MarginLeft) ?? 0)
    const marginTop = Number(groupedSvgNode.getAttribute(DataAttributes.MarginTop) ?? 0)

    // Discover every bar by (target, series). The grouped renderer stamps
    // `data-target` and `data-series` plus the new `data-mark-key` from
    // 방안 4. We pair them up here.
    interface PairedBars {
      target: string
      barA: SVGRectElement
      barB: SVGRectElement
    }
    const pairedByTarget = new Map<string, Partial<PairedBars>>()
    groupedSvg
      .selectAll<SVGRectElement, unknown>(`rect.${SvgClassNames.MainBar}`)
      .nodes()
      .forEach((node) => {
        const target = node.getAttribute(DataAttributes.Target) ?? ''
        const series =
          node.getAttribute(DataAttributes.Series) ??
          node.getAttribute(DataAttributes.GroupValue) ??
          ''
        if (!target) return
        const slot = pairedByTarget.get(target) ?? { target }
        if (series === groupA) slot.barA = node
        else if (series === groupB) slot.barB = node
        pairedByTarget.set(target, slot)
      })

    const pairs: PairedBars[] = []
    pairedByTarget.forEach((slot) => {
      if (slot.target && slot.barA && slot.barB) pairs.push(slot as PairedBars)
    })

    console.info('[operation-new] stacked-bar applier:pairDiff PHASE 3 paired bars', {
      pairedCount: pairs.length,
      totalTargets: pairedByTarget.size,
      sample: pairs.slice(0, 3).map((p) => ({
        target: p.target,
        barAValue: p.barA.getAttribute(DataAttributes.Value),
        barBValue: p.barB.getAttribute(DataAttributes.Value),
      })),
    })

    if (pairs.length === 0) {
      console.warn('[operation-new] stacked-bar applier:pairDiff PHASE 3: no matching (groupA,groupB) pairs found in grouped chart')
      return buildResultState(result, state, operation)
    }

    // Build a lookup from result rows so we can label each arrow with the
    // pre-computed signed/absolute diff value.
    const diffByTarget = new Map<string, number>()
    result.forEach((row) => {
      const t = String(row.target)
      const v = Number(row.value)
      if (Number.isFinite(v)) diffByTarget.set(t, v)
    })

    // Draw one Δ arrow per pair. All arrows in the same parent transition so
    // they animate together.
    const drawPromises: Promise<unknown>[] = []
    pairs.forEach((pair) => {
      const aTop = barTopRootY(pair.barA, marginTop)
      const bTop = barTopRootY(pair.barB, marginTop)
      const aMidX = barCenterRootX(pair.barA, marginLeft)
      const bMidX = barCenterRootX(pair.barB, marginLeft)
      const arrowX = (aMidX + bMidX) / 2
      const topY = Math.min(aTop, bTop)
      const bottomY = Math.max(aTop, bTop)
      const diffValue = diffByTarget.get(pair.target) ?? 0

      console.info('[operation-new] stacked-bar applier:pairDiff PHASE 3 draw', {
        target: pair.target,
        aMidX,
        bMidX,
        aTop,
        bTop,
        arrowX,
        topY,
        bottomY,
        diffValue,
      })

      // Horizontal connectors from each bar top to the arrow x.
      drawPromises.push(
        groupedLayer
          .append(SvgElements.Line)
          .attr(SvgAttributes.Class, `${SvgClassNames.LineAnnotation} ${PAIR_DIFF_ANNOTATION_CLASS}`)
          .attr(SvgAttributes.X1, aMidX)
          .attr(SvgAttributes.X2, aMidX)
          .attr(SvgAttributes.Y1, aTop)
          .attr(SvgAttributes.Y2, aTop)
          .attr(SvgAttributes.Stroke, COLORS.ANNOTATION_RED)
          .attr(SvgAttributes.StrokeWidth, 2)
          .transition()
          .duration(DURATIONS.GUIDELINE_DRAW)
          .ease(EASINGS.SMOOTH)
          .attr(SvgAttributes.X2, arrowX)
          .end()
          .catch(() => undefined),
      )
      drawPromises.push(
        groupedLayer
          .append(SvgElements.Line)
          .attr(SvgAttributes.Class, `${SvgClassNames.LineAnnotation} ${PAIR_DIFF_ANNOTATION_CLASS}`)
          .attr(SvgAttributes.X1, bMidX)
          .attr(SvgAttributes.X2, bMidX)
          .attr(SvgAttributes.Y1, bTop)
          .attr(SvgAttributes.Y2, bTop)
          .attr(SvgAttributes.Stroke, COLORS.ANNOTATION_RED)
          .attr(SvgAttributes.StrokeWidth, 2)
          .transition()
          .duration(DURATIONS.GUIDELINE_DRAW)
          .ease(EASINGS.SMOOTH)
          .attr(SvgAttributes.X2, arrowX)
          .end()
          .catch(() => undefined),
      )

      // Vertical shaft (grows from midpoint).
      drawPromises.push(
        groupedLayer
          .append(SvgElements.Line)
          .attr(SvgAttributes.Class, `${SvgClassNames.LineAnnotation} ${PAIR_DIFF_ANNOTATION_CLASS}`)
          .attr(SvgAttributes.X1, arrowX)
          .attr(SvgAttributes.X2, arrowX)
          .attr(SvgAttributes.Y1, (topY + bottomY) / 2)
          .attr(SvgAttributes.Y2, (topY + bottomY) / 2)
          .attr(SvgAttributes.Stroke, COLORS.ANNOTATION_RED)
          .attr(SvgAttributes.StrokeWidth, 2)
          .transition()
          .delay(DURATIONS.GUIDELINE_DRAW)
          .duration(DURATIONS.HIGHLIGHT)
          .ease(EASINGS.SMOOTH)
          .attr(SvgAttributes.Y1, topY)
          .attr(SvgAttributes.Y2, bottomY)
          .end()
          .catch(() => undefined),
      )

      // Arrowheads at both ends (no transition — appear with the shaft's end).
      const heads = [
        { x1: arrowX, y1: topY, x2: arrowX - ARROW_HEAD_SIZE_PX, y2: topY + ARROW_HEAD_SIZE_PX },
        { x1: arrowX, y1: topY, x2: arrowX + ARROW_HEAD_SIZE_PX, y2: topY + ARROW_HEAD_SIZE_PX },
        { x1: arrowX, y1: bottomY, x2: arrowX - ARROW_HEAD_SIZE_PX, y2: bottomY - ARROW_HEAD_SIZE_PX },
        { x1: arrowX, y1: bottomY, x2: arrowX + ARROW_HEAD_SIZE_PX, y2: bottomY - ARROW_HEAD_SIZE_PX },
      ]
      heads.forEach((head) => {
        groupedLayer
          .append(SvgElements.Line)
          .attr(SvgAttributes.Class, `${SvgClassNames.LineAnnotation} ${PAIR_DIFF_ANNOTATION_CLASS} arrow-head`)
          .attr(SvgAttributes.X1, head.x1)
          .attr(SvgAttributes.Y1, head.y1)
          .attr(SvgAttributes.X2, head.x2)
          .attr(SvgAttributes.Y2, head.y2)
          .attr(SvgAttributes.Stroke, COLORS.ANNOTATION_RED)
          .attr(SvgAttributes.StrokeWidth, 2)
          .style(SvgAttributes.Opacity, 0)
          .transition()
          .delay(DURATIONS.GUIDELINE_DRAW + DURATIONS.HIGHLIGHT)
          .duration(DURATIONS.FADE)
          .style(SvgAttributes.Opacity, 1)
      })

      // Label (signed or absolute, based on spec).
      const labelText = formatOperationValue(diffValue)
      drawPromises.push(
        groupedLayer
          .append(SvgElements.Text)
          .attr(SvgAttributes.Class, `${SvgClassNames.TextAnnotation} ${PAIR_DIFF_ANNOTATION_CLASS}`)
          .attr(SvgAttributes.X, arrowX + ARROW_LABEL_GAP_PX + 6)
          .attr(SvgAttributes.Y, (topY + bottomY) / 2)
          .attr(SvgAttributes.DominantBaseline, 'middle')
          .attr(SvgAttributes.FontSize, 11)
          .attr(SvgAttributes.FontWeight, 700)
          .attr(SvgAttributes.Fill, COLORS.ANNOTATION_RED)
          .style(SvgAttributes.Opacity, 0)
          .text(labelText)
          .transition()
          .delay(DURATIONS.GUIDELINE_DRAW + DURATIONS.HIGHLIGHT)
          .duration(DURATIONS.LABEL_FADE_IN)
          .style(SvgAttributes.Opacity, 1)
          .end()
          .catch(() => undefined),
      )
    })

    await Promise.all(drawPromises)
    console.info('[operation-new] stacked-bar applier:pairDiff PHASE 3 done', {
      arrowsDrawn: pairs.length,
      annotationLineCount: groupedLayer.selectAll(`line.${PAIR_DIFF_ANNOTATION_CLASS}`).size(),
    })

    return buildResultState(result, state, operation)
  },
}

function barTopRootY(rect: SVGRectElement, marginTop: number): number {
  const y = Number(rect.getAttribute('y') ?? 0)
  return marginTop + y
}

function barCenterRootX(rect: SVGRectElement, marginLeft: number): number {
  const x = Number(rect.getAttribute('x') ?? 0)
  const width = Number(rect.getAttribute('width') ?? 0)
  return marginLeft + x + width / 2
}

function buildResultState(
  result: ReturnType<typeof pairDiffData>,
  state: ApplierArgs<StackedBarChartInstance>['state'],
  operation: ApplierArgs<StackedBarChartInstance>['operation'],
): ApplierResult {
  const opRef = operationResultRef(operation)
  return {
    result,
    nextState: {
      ...state,
      derivedData: result,
      lastResult: result,
      annotationRecords: [
        ...state.annotationRecords,
        {
          cssClass: PAIR_DIFF_ANNOTATION_CLASS,
          role: 'result' as const,
          persistent: true,
          operationId: opRef == null ? undefined : String(opRef),
          resultRef: opRef == null ? undefined : String(opRef),
        },
      ],
    },
  }
}

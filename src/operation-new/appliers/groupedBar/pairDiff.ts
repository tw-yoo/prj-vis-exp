import { pairDiffData } from '../../../domain/operation/dataOps'
import { OperationOp } from '../../../domain/operation/types'
import { assertPairDiffSpec } from '../../../domain/operation/types/operationValidators'
import { DataAttributes, SvgAttributes, SvgClassNames, SvgElements } from '../../../rendering/interfaces'
import { COLORS, DURATIONS, EASINGS } from '../../../rendering/common/d3Helpers'
import { formatOperationValue } from '../../../operation-next/primitives/formatValue'
import { operationResultRef } from '../../../operation-next/diffEndpoint'
import type { ParentTransition } from '../../primitives/sharedTransition'
import type { OperationApplier, ApplierArgs, ApplierResult } from '../../applier'
import type { GroupedBarChartInstance } from '../../../rendering-new/instances/groupedBarInstance'
import { applyAnnotationContextFade } from '../../primitives/contextFade'
import { fadeRemoveAnnotations } from '../../primitives/fadeRemove'
import { FILTER_ANNOTATION_CLASS } from './filter'
import { barRootMetrics } from '../barGroup/_geometry'

export const PAIR_DIFF_ANNOTATION_CLASS = 'operation-next-grouped-bar-pair-diff'

const ARROW_HEAD_SIZE_PX = 7
const ARROW_LABEL_GAP_PX = 6

/**
 * Grouped-bar pairDiff applier.
 *
 * The chart is ALREADY grouped (unlike stacked pairDiff, which first converts
 * stacked→grouped), so there is NO chart-type-conversion phase:
 *   Phase 1 — narrow to {groupA, groupB} via `transitionSeriesScope` on the live
 *             grouped bars, under one shared phase parent (validation lockstep).
 *             A no-op when the chart already has exactly the two compared series
 *             (e.g. cities × {2010,2025}); dims the others otherwise.
 *   Phase 2 — per-(panel,target) Δ vertical arrow between the groupA and groupB
 *             bars, grown-in, with the signed/absolute difference label.
 *
 * CRUCIAL: nextState.derivedData = the per-target pairDiff rows, so a following
 * findExtremum(preferDerived) selects the max/min DIFFERENCE bar. Previously
 * grouped pairDiff had NO handler (new or legacy), so it drew nothing and the
 * downstream findExtremum highlighted an arbitrary original bar (audit
 * groupedBar-pairDiff-missing-1 / findExtremum-derived-mismatch-25).
 *
 * Coordinates use the panel-safe `barRootMetrics` (accumulated transform chain)
 * because grouped charts may be faceted into per-panel groups — the stacked
 * applier's naive `marginTop + rect.y` would land arrows in the wrong panel.
 */
export const pairDiffApplier: OperationApplier<GroupedBarChartInstance> = {
  op: OperationOp.PairDiff,

  async apply({
    operation,
    state,
    instance,
    options,
  }: ApplierArgs<GroupedBarChartInstance>): Promise<ApplierResult> {
    const spec = assertPairDiffSpec(operation)
    const groupA = String(spec.groupA)
    const groupB = String(spec.groupB)
    const result = pairDiffData(state.workingData, operation)

    console.info('[operation-new] grouped-bar applier:pairDiff', {
      nodeId: operation.meta?.nodeId,
      groupA,
      groupB,
      resultLen: result.length,
    })

    if (result.length === 0) {
      return { result, nextState: { ...state, lastResult: result } }
    }

    const layer = instance.annotationLayer

    // ---- Phase 1: narrow to {groupA, groupB} (shared parent / lockstep) ----
    const activeSeries = new Set<string>([groupA, groupB])
    const hasPersistentAnchor = state.annotationRecords.some((r) => r.persistent)
    const phase1Mode: 'recompose' | 'dim' = hasPersistentAnchor ? 'dim' : 'recompose'
    const phase1Duration = phase1Mode === 'dim' ? DURATIONS.DIM : DURATIONS.AXIS_RESCALE
    const phase1Parent = instance.createPhaseTransition(phase1Duration, EASINGS.SMOOTH)

    applyAnnotationContextFade(
      layer,
      state.annotationRecords,
      FILTER_ANNOTATION_CLASS,
      options?.referencedResultIds,
      phase1Parent,
    )
    fadeRemoveAnnotations(layer, PAIR_DIFF_ANNOTATION_CLASS, undefined, phase1Parent)

    await instance.transitionSeriesScope({
      isInScope: (_panel, _target, series) => activeSeries.has(series),
      mode: phase1Mode,
      parent: phase1Parent,
    })
    try {
      await phase1Parent.end()
    } catch {
      /* interrupted */
    }

    // ---- Phase 2: per-(panel,target) Δ arrows on the live grouped chart ----
    interface PairedBars {
      target: string
      barA: SVGRectElement
      barB: SVGRectElement
    }
    const pairedByKey = new Map<string, { target: string; barA?: SVGRectElement; barB?: SVGRectElement }>()
    ;(instance.mainBars().nodes() as SVGRectElement[]).forEach((node) => {
      const panel = node.getAttribute(DataAttributes.ChartId) ?? 'root'
      const target = node.getAttribute(DataAttributes.Target) ?? ''
      const series =
        node.getAttribute(DataAttributes.Series) ?? node.getAttribute(DataAttributes.GroupValue) ?? ''
      if (!target) return
      const key = `${panel}|${target}`
      const slot = pairedByKey.get(key) ?? { target }
      if (series === groupA) slot.barA = node
      else if (series === groupB) slot.barB = node
      pairedByKey.set(key, slot)
    })
    const pairs: PairedBars[] = []
    pairedByKey.forEach((slot) => {
      if (slot.target && slot.barA && slot.barB) pairs.push(slot as PairedBars)
    })

    if (pairs.length === 0) {
      console.warn('[operation-new] grouped-bar applier:pairDiff: no (groupA,groupB) pairs found')
      return buildResultState(result, state, operation)
    }

    const diffByTarget = new Map<string, number>()
    result.forEach((row) => {
      const v = Number(row.value)
      if (Number.isFinite(v)) diffByTarget.set(String(row.target), v)
    })

    const PHASE2_TAIL = DURATIONS.GUIDELINE_DRAW + DURATIONS.HIGHLIGHT
    const phase2Duration = PHASE2_TAIL + Math.max(DURATIONS.FADE, DURATIONS.LABEL_FADE_IN)
    const phase2Parent = (instance.svg
      .transition()
      .duration(phase2Duration)
      .ease(EASINGS.SMOOTH) as unknown) as ParentTransition
    const inheritPhase2 = phase2Parent as never

    pairs.forEach((pair) => {
      const a = barRootMetrics(pair.barA)
      const b = barRootMetrics(pair.barB)
      const arrowX = (a.centerX + b.centerX) / 2
      const topY = Math.min(a.topY, b.topY)
      const bottomY = Math.max(a.topY, b.topY)
      const diffValue = diffByTarget.get(pair.target) ?? 0

      // Horizontal connectors from each bar top to the arrow x (grow-in).
      layer
        .append(SvgElements.Line)
        .attr(SvgAttributes.Class, `${SvgClassNames.LineAnnotation} ${PAIR_DIFF_ANNOTATION_CLASS}`)
        .attr(DataAttributes.Target, pair.target)
        .attr(SvgAttributes.X1, a.centerX)
        .attr(SvgAttributes.X2, a.centerX)
        .attr(SvgAttributes.Y1, a.topY)
        .attr(SvgAttributes.Y2, a.topY)
        .attr(SvgAttributes.Stroke, COLORS.ANNOTATION_RED)
        .attr(SvgAttributes.StrokeWidth, 2)
        .transition(inheritPhase2)
        .duration(DURATIONS.GUIDELINE_DRAW)
        .attr(SvgAttributes.X2, arrowX)
      layer
        .append(SvgElements.Line)
        .attr(SvgAttributes.Class, `${SvgClassNames.LineAnnotation} ${PAIR_DIFF_ANNOTATION_CLASS}`)
        .attr(DataAttributes.Target, pair.target)
        .attr(SvgAttributes.X1, b.centerX)
        .attr(SvgAttributes.X2, b.centerX)
        .attr(SvgAttributes.Y1, b.topY)
        .attr(SvgAttributes.Y2, b.topY)
        .attr(SvgAttributes.Stroke, COLORS.ANNOTATION_RED)
        .attr(SvgAttributes.StrokeWidth, 2)
        .transition(inheritPhase2)
        .duration(DURATIONS.GUIDELINE_DRAW)
        .attr(SvgAttributes.X2, arrowX)

      // Vertical shaft (grows from midpoint).
      layer
        .append(SvgElements.Line)
        .attr(SvgAttributes.Class, `${SvgClassNames.LineAnnotation} ${PAIR_DIFF_ANNOTATION_CLASS}`)
        .attr(DataAttributes.Target, pair.target)
        .attr(SvgAttributes.X1, arrowX)
        .attr(SvgAttributes.X2, arrowX)
        .attr(SvgAttributes.Y1, (topY + bottomY) / 2)
        .attr(SvgAttributes.Y2, (topY + bottomY) / 2)
        .attr(SvgAttributes.Stroke, COLORS.ANNOTATION_RED)
        .attr(SvgAttributes.StrokeWidth, 2)
        .transition(inheritPhase2)
        .delay(DURATIONS.GUIDELINE_DRAW)
        .duration(DURATIONS.HIGHLIGHT)
        .attr(SvgAttributes.Y1, topY)
        .attr(SvgAttributes.Y2, bottomY)

      // Arrowheads (fade in after the shaft extends).
      const heads = [
        { x1: arrowX, y1: topY, x2: arrowX - ARROW_HEAD_SIZE_PX, y2: topY + ARROW_HEAD_SIZE_PX },
        { x1: arrowX, y1: topY, x2: arrowX + ARROW_HEAD_SIZE_PX, y2: topY + ARROW_HEAD_SIZE_PX },
        { x1: arrowX, y1: bottomY, x2: arrowX - ARROW_HEAD_SIZE_PX, y2: bottomY - ARROW_HEAD_SIZE_PX },
        { x1: arrowX, y1: bottomY, x2: arrowX + ARROW_HEAD_SIZE_PX, y2: bottomY - ARROW_HEAD_SIZE_PX },
      ]
      heads.forEach((head) => {
        layer
          .append(SvgElements.Line)
          .attr(
            SvgAttributes.Class,
            `${SvgClassNames.LineAnnotation} ${PAIR_DIFF_ANNOTATION_CLASS} arrow-head`,
          )
          .attr(DataAttributes.Target, pair.target)
          .attr(SvgAttributes.X1, head.x1)
          .attr(SvgAttributes.Y1, head.y1)
          .attr(SvgAttributes.X2, head.x2)
          .attr(SvgAttributes.Y2, head.y2)
          .attr(SvgAttributes.Stroke, COLORS.ANNOTATION_RED)
          .attr(SvgAttributes.StrokeWidth, 2)
          .style(SvgAttributes.Opacity, 0)
          .transition(inheritPhase2)
          .delay(PHASE2_TAIL)
          .duration(DURATIONS.FADE)
          .style(SvgAttributes.Opacity, 1)
      })

      // Difference label (signed or absolute per spec).
      layer
        .append(SvgElements.Text)
        .attr(SvgAttributes.Class, `${SvgClassNames.TextAnnotation} ${PAIR_DIFF_ANNOTATION_CLASS}`)
        .attr(DataAttributes.Target, pair.target)
        .attr(SvgAttributes.X, arrowX + ARROW_LABEL_GAP_PX + 6)
        .attr(SvgAttributes.Y, (topY + bottomY) / 2)
        .attr(SvgAttributes.DominantBaseline, 'middle')
        .attr(SvgAttributes.FontSize, 11)
        .attr(SvgAttributes.FontWeight, 700)
        .attr(SvgAttributes.Fill, COLORS.ANNOTATION_RED)
        .style(SvgAttributes.Opacity, 0)
        .text(formatOperationValue(diffValue))
        .transition(inheritPhase2)
        .delay(PHASE2_TAIL)
        .duration(DURATIONS.LABEL_FADE_IN)
        .style(SvgAttributes.Opacity, 1)
    })

    try {
      await phase2Parent.end()
    } catch {
      /* interrupted */
    }

    return buildResultState(result, state, operation)
  },
}

function buildResultState(
  result: ReturnType<typeof pairDiffData>,
  state: ApplierArgs<GroupedBarChartInstance>['state'],
  operation: ApplierArgs<GroupedBarChartInstance>['operation'],
): ApplierResult {
  const opRef = operationResultRef(operation)
  return {
    result,
    nextState: {
      ...state,
      // CRUCIAL: downstream findExtremum(preferDerived) reads derivedData to
      // pick the max/min DIFFERENCE key instead of an original bar.
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

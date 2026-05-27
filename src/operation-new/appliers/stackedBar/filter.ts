import * as d3 from 'd3'
import { filterData } from '../../../domain/operation/dataOps'
import { OperationOp, type DatumValue } from '../../../domain/operation/types'
import { DataAttributes } from '../../../rendering/interfaces'
import { DURATIONS, EASINGS, OPACITIES } from '../../../rendering/common/d3Helpers'
import type { OperationApplier, ApplierArgs, ApplierResult } from '../../applier'
import type { StackedBarChartInstance } from '../../../rendering-new/instances/stackedBarInstance'
import { applyAnnotationContextFade } from '../../primitives/contextFade'
import { drawReferenceLine } from '../../primitives/drawReferenceLine'
import { fadeRemoveAnnotations } from '../../primitives/fadeRemove'
import { PAIR_DIFF_ANNOTATION_CLASS } from './pairDiff'
import {
  barMarkKeyFromDatum,
  barMarkKeyFromNode,
  inferBarYFromAxis,
  resolveBarThreshold,
} from '../barGroup/_shared'

export const FILTER_ANNOTATION_CLASS = 'operation-next-stacked-bar-filter'

function buildScopeKeys(result: DatumValue[]): Set<string> {
  return new Set(result.map(barMarkKeyFromDatum))
}

/**
 * Detect rows produced by a pairDiff operation. PairDiff stamps every result
 * row with a `Δpair(...)` semanticMeasure (buildSemanticMeasure in
 * domain/operation/semanticLabels.ts), and uses a synthetic compound
 * `group: "${groupA}-${groupB}"` that does not match any DOM `data-series`
 * value. When such rows feed into a subsequent filter (e.g., `value > 0`),
 * the per-cell `(target, series)` scope predicate would reject every bar.
 * Treat the result as a target-level scope instead.
 */
function isPairDiffResultInput(rows: DatumValue[]): boolean {
  if (rows.length === 0) return false
  return rows.every(
    (r) => typeof r.semanticMeasure === 'string' && r.semanticMeasure.startsWith('Δpair('),
  )
}

/**
 * Build a `(target, series) → in-scope` predicate from the filtered datum
 * result. Keys are constructed as `${target}|${series}` to match the DOM
 * `data-target` + `data-series` attributes set by the base stacked-bar
 * renderer.
 *
 * Falls back gracefully when a row lacks a `series` field (e.g. a single-
 * series stacked chart): treats empty-string series as a sentinel that
 * always matches.
 *
 * Special case: when rows come from pairDiff (compound group "A-B"), fall
 * back to matching the whole stack at each surviving target, since the
 * pair-level diff does not pick a single series.
 */
function buildCellInScopePredicate(result: DatumValue[]): (target: string, series: string) => boolean {
  if (isPairDiffResultInput(result)) {
    const targets = new Set<string>(result.map((r) => String(r.target)))
    return (target) => targets.has(target)
  }
  const set = new Set<string>()
  for (const row of result) {
    const target = String(row.target)
    const series = String(row.group ?? row.series ?? '')
    set.add(`${target}|${series}`)
  }
  return (target, series) => {
    if (set.has(`${target}|${series}`)) return true
    // Single-series chart: result rows may not carry a series key at all,
    // while the DOM rects have empty `data-series`. Allow matching on target
    // alone in that case.
    if (series === '' && set.has(`${target}|`)) return true
    return false
  }
}

/**
 * stacked-bar filter applier.
 *
 * Recompose visual: out-of-scope stack segments collapse to zero height at
 * their current cumulative top and fade out under a single parent transition;
 * surviving segments smoothly slide down to re-anchor the stack at y=0; the
 * y-axis rescales to match the new max in lockstep. The legacy opacity-only
 * dim is preserved as a fallback when persistent annotations on the chart
 * make a y-axis rescale unsafe (their anchor positions would no longer match
 * the new yScale).
 */
export const filterApplier: OperationApplier<StackedBarChartInstance> = {
  op: OperationOp.Filter,

  async apply({
    operation,
    state,
    instance,
  }: ApplierArgs<StackedBarChartInstance>): Promise<ApplierResult> {
    const result = filterData(state.workingData, operation)
    console.info('[operation-new] stacked-bar applier:filter', {
      nodeId: operation.meta?.nodeId,
      operator: operation.operator,
      workingBefore: state.workingData.length,
      workingAfter: result.length,
    })

    const layer = instance.annotationLayer
    applyAnnotationContextFade(layer, state.annotationRecords, FILTER_ANNOTATION_CLASS)
    fadeRemoveAnnotations(layer, FILTER_ANNOTATION_CLASS)

    const pairDiffInput = isPairDiffResultInput(result)
    const activeKeys = buildScopeKeys(result)
    const isCellInScope = buildCellInScopePredicate(result)

    // PairDiff input always uses 'dim' mode: the prior pairDiff Δ-arrow
    // annotations are anchored to the CURRENT bar positions and y-scale, so
    // recomposing (which collapses out-of-scope bars to height 0 and
    // rescales the y-axis) would orphan them. Forcing dim mode also matches
    // the user's intent — out-of-scope items should be dimmed, not vanish.
    // Otherwise mirror the simple-bar guard: stay in dim mode when any
    // persistent annotation is on the layer.
    const hasPersistentAnchor = state.annotationRecords.some((r) => r.persistent)
    const mode: 'recompose' | 'dim' = pairDiffInput || hasPersistentAnchor ? 'dim' : 'recompose'

    // Active series for legend transition: series that contain at least one
    // in-scope (target, series) cell in the filtered result. When the input
    // is a pairDiff result we keep the whole stack at each surviving target,
    // so the legend should stay untouched (skip the narrowing transition).
    const activeSeriesValues = pairDiffInput
      ? new Set<string>()
      : new Set<string>(
          result.map((d) => String(d.group ?? d.series ?? '')).filter((s) => s.length > 0),
        )

    // When the filter input is a pairDiff result, dim the per-target
    // Δ-arrow annotations (line connectors + arrow shaft + arrow heads +
    // numeric label) drawn by the pairDiff applier. Each pairDiff
    // annotation element carries a `data-target` matching the Period
    // (stamped in pairDiff applier Phase 3), so we can scope the dim to
    // only the targets that fall outside the filter result — surviving
    // targets stay at FULL opacity to highlight the selection.
    const fadePairDiffAnnotations = async () => {
      if (!pairDiffInput) return
      const survivingTargets = new Set<string>(result.map((r) => String(r.target)))
      const svgNode = instance.host.querySelector('svg')
      if (!svgNode) return
      const nodes = Array.from(
        svgNode.querySelectorAll<SVGElement>(`.${PAIR_DIFF_ANNOTATION_CLASS}[${DataAttributes.Target}]`),
      )
      if (nodes.length === 0) return
      await Promise.all(
        nodes.map((node) => {
          const target = node.getAttribute(DataAttributes.Target) ?? ''
          const next = survivingTargets.has(target) ? OPACITIES.FULL : OPACITIES.DIM
          return d3
            .select(node)
            .transition()
            .duration(DURATIONS.HIGHLIGHT)
            .ease(EASINGS.SMOOTH)
            .style('opacity', next)
            .end()
            .catch(() => undefined)
        }),
      )
    }

    // Bars + legend transition in lockstep — both ride the same duration so
    // the chart's visual state stays coherent every frame.
    await Promise.all([
      instance.transitionSeriesScope({
        isInScope: isCellInScope,
        mode,
        outOfScopeOpacity: OPACITIES.DIM,
      }),
      mode === 'recompose' && activeSeriesValues.size > 0
        ? instance.transitionLegend({ activeSeries: activeSeriesValues })
        : Promise.resolve(),
      fadePairDiffAnnotations(),
    ])

    // Threshold reference line for numeric filters. Skip when the input is
    // a pairDiff result — the diff is computed pairwise per Period (already
    // drawn as Δ-arrows by the pairDiff applier), so a baseline at the
    // threshold value (e.g., y=0) does not correspond to any bar height and
    // would just visually clutter the chart.
    const threshold = pairDiffInput ? null : resolveBarThreshold(operation, state.workingData)
    if (threshold != null) {
      const thresholdY = inferBarYFromAxis(instance.svg, threshold)
      if (thresholdY != null) {
        const marginLeft = instance.layout.marginLeft
        const plotWidth = instance.layout.plotWidth
        await drawReferenceLine({
          layer,
          cssClass: FILTER_ANNOTATION_CLASS,
          x1: marginLeft,
          x2: marginLeft + plotWidth,
          y: instance.layout.marginTop + thresholdY,
          label: String(threshold),
          svg: instance.svg,
          viewport: {
            x: marginLeft,
            y: instance.layout.marginTop,
            width: plotWidth + 96,
            height: instance.layout.plotHeight,
          },
        })
      }
    }

    const nextSalienceMap = new Map<string, number>()
    const targetsInScope = pairDiffInput
      ? new Set<string>(result.map((r) => String(r.target)))
      : null
    instance.mainBars().each(function () {
      const node = this as SVGElement
      const key = barMarkKeyFromNode(node)
      const inScope = targetsInScope
        ? targetsInScope.has(node.getAttribute('data-target') ?? '')
        : activeKeys.has(key)
      nextSalienceMap.set(key, inScope ? OPACITIES.FULL : OPACITIES.DIM)
    })

    return {
      result,
      nextState: {
        ...state,
        workingData: result,
        derivedData: null,
        salienceMap: nextSalienceMap,
        lastResult: result,
        annotationRecords: [
          ...state.annotationRecords,
          { cssClass: FILTER_ANNOTATION_CLASS, role: 'anchor' as const, persistent: true },
        ],
      },
    }
  },
}

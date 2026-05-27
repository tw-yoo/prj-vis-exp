import * as d3 from 'd3'
import { filterData } from '../../../domain/operation/dataOps'
import { OperationOp, type DatumValue } from '../../../domain/operation/types'
import { DataAttributes } from '../../../rendering/interfaces'
import { DURATIONS, EASINGS, OPACITIES } from '../../../rendering/common/d3Helpers'
import type { OperationApplier, ApplierArgs, ApplierResult } from '../../applier'
import type { GroupedBarChartInstance } from '../../../rendering-new/instances/groupedBarInstance'
import { applyAnnotationContextFade } from '../../primitives/contextFade'
import { drawReferenceLine } from '../../primitives/drawReferenceLine'
import { fadeRemoveAnnotations } from '../../primitives/fadeRemove'
import { PAIR_DIFF_ANNOTATION_CLASS } from '../stackedBar/pairDiff'
import {
  barMarkKeyFromDatum,
  barMarkKeyFromNode,
  inferBarYFromAxis,
  resolveBarThreshold,
} from '../barGroup/_shared'

export const FILTER_ANNOTATION_CLASS = 'operation-next-grouped-bar-filter'

function buildScopeKeys(result: DatumValue[]): Set<string> {
  return new Set(result.map(barMarkKeyFromDatum))
}

/**
 * Detect rows produced by a pairDiff operation. PairDiff stamps every result
 * row with a `Δpair(...)` semanticMeasure (buildSemanticMeasure in
 * domain/operation/semanticLabels.ts), and uses a synthetic compound
 * `group: "${groupA}-${groupB}"` that does not match any DOM `data-series`
 * value. When such rows feed into a subsequent filter (e.g., `value > 0`),
 * the per-cell `(panel, target, series)` scope predicate would reject every
 * bar — and the same compound key would also wipe the legend. Treat the
 * result as a target-level scope instead and leave the legend untouched
 * (it was already narrowed to {groupA, groupB} by pairDiff phase 3).
 */
function isPairDiffResultInput(rows: DatumValue[]): boolean {
  if (rows.length === 0) return false
  return rows.every(
    (r) => typeof r.semanticMeasure === 'string' && r.semanticMeasure.startsWith('Δpair('),
  )
}

/**
 * Build a `(panel, target, series) → in-scope` predicate keyed by
 * `${panel}|${target}|${series}` to match the DOM `data-chart-id` +
 * `data-target` + `data-series` attributes set by the grouped-bar renderer.
 *
 * Grouped-bar charts may be faceted (`data-chart-id` per panel) or single-
 * panel (`data-chart-id` absent → fallback 'root'). The predicate accepts
 * either form transparently.
 *
 * Special case: when rows come from pairDiff (compound group "A-B"), fall
 * back to matching every bar at each surviving target. The pair-level diff
 * does not pick a single series, so a strict (panel, target, series) match
 * would reject every DOM bar.
 */
function buildCellInScopePredicate(result: DatumValue[]): (panel: string, target: string, series: string) => boolean {
  if (isPairDiffResultInput(result)) {
    const targets = new Set<string>(result.map((r) => String(r.target)))
    return (_panel, target) => targets.has(target)
  }
  const set = new Set<string>()
  for (const row of result) {
    const panel = (row.panel as string | undefined) ?? 'root'
    const target = String(row.target)
    const series = String(row.group ?? row.series ?? '')
    set.add(`${panel}|${target}|${series}`)
  }
  return (panel, target, series) => {
    if (set.has(`${panel}|${target}|${series}`)) return true
    // Series may be missing on either side. Try a target-only match when the
    // series is empty (single-series grouped chart, very rare but possible).
    if (series === '' && set.has(`${panel}|${target}|`)) return true
    return false
  }
}

/**
 * grouped-bar filter applier.
 *
 * Recompose visual: surviving bars within each (panel, target) group spread
 * across the original group span — widening to fill the gap left by removed
 * series — while out-of-scope bars hold position and fade to opacity 0,
 * under a single shared parent transition.
 *
 * Falls back to legacy opacity-only dim when prior persistent annotations
 * make positional recomposition unsafe (their anchors would no longer match
 * the bars' new x positions).
 */
export const filterApplier: OperationApplier<GroupedBarChartInstance> = {
  op: OperationOp.Filter,

  async apply({
    operation,
    state,
    instance,
  }: ApplierArgs<GroupedBarChartInstance>): Promise<ApplierResult> {
    const result = filterData(state.workingData, operation)
    console.info('[operation-new] grouped-bar applier:filter', {
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
    // recomposing the chart (which collapses out-of-scope bars to height 0
    // and rescales the y-axis) would orphan them. Forcing dim mode also
    // matches the user's intent — out-of-scope items should be dimmed, not
    // disappear. Otherwise mirror the simple-bar guard: stay in dim mode
    // when any persistent annotation is on the layer.
    const hasPersistentAnchor = state.annotationRecords.some((r) => r.persistent)
    const mode: 'recompose' | 'dim' = pairDiffInput || hasPersistentAnchor ? 'dim' : 'recompose'

    // Active series for legend transition. When the input is a pairDiff
    // result the compound `"groupA-groupB"` group does not match any DOM
    // legend row; passing it through would set every legend item to
    // opacity 0. Skip the legend narrowing entirely for that case — the
    // pairDiff applier already collapsed the legend down to {groupA,
    // groupB} when phase 3 ran on the freshly-rendered grouped SVG.
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

    // SalienceMap tracks per-bar in/out-of-scope opacity for downstream ops.
    // For pairDiff input, the activeKeys set keyed by compound group would
    // mark every bar as out-of-scope; switch to target-level matching so
    // every bar at a surviving target stays at FULL opacity.
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

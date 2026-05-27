import { filterData } from '../../../domain/operation/dataOps'
import { OperationOp, type DatumValue } from '../../../domain/operation/types'
import { OPACITIES } from '../../../rendering/common/d3Helpers'
import type { OperationApplier, ApplierArgs, ApplierResult } from '../../applier'
import type { GroupedBarChartInstance } from '../../../rendering-new/instances/groupedBarInstance'
import { applyAnnotationContextFade } from '../../primitives/contextFade'
import { drawReferenceLine } from '../../primitives/drawReferenceLine'
import { fadeRemoveAnnotations } from '../../primitives/fadeRemove'
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
 * Build a `(panel, target, series) → in-scope` predicate keyed by
 * `${panel}|${target}|${series}` to match the DOM `data-chart-id` +
 * `data-target` + `data-series` attributes set by the grouped-bar renderer.
 *
 * Grouped-bar charts may be faceted (`data-chart-id` per panel) or single-
 * panel (`data-chart-id` absent → fallback 'root'). The predicate accepts
 * either form transparently.
 */
function buildCellInScopePredicate(result: DatumValue[]): (panel: string, target: string, series: string) => boolean {
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

    const activeKeys = buildScopeKeys(result)
    const isCellInScope = buildCellInScopePredicate(result)

    const hasPersistentAnchor = state.annotationRecords.some((r) => r.persistent)
    const mode: 'recompose' | 'dim' = hasPersistentAnchor ? 'dim' : 'recompose'

    // Active series for legend transition.
    const activeSeriesValues = new Set<string>(
      result.map((d) => String(d.group ?? d.series ?? '')).filter((s) => s.length > 0),
    )

    await Promise.all([
      instance.transitionSeriesScope({
        isInScope: isCellInScope,
        mode,
        outOfScopeOpacity: OPACITIES.DIM,
      }),
      mode === 'recompose' && activeSeriesValues.size > 0
        ? instance.transitionLegend({ activeSeries: activeSeriesValues })
        : Promise.resolve(),
    ])

    // Threshold reference line for numeric filters.
    const threshold = resolveBarThreshold(operation, state.workingData)
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
    const nextSalienceMap = new Map<string, number>()
    instance.mainBars().each(function () {
      const key = barMarkKeyFromNode(this as SVGElement)
      nextSalienceMap.set(key, activeKeys.has(key) ? OPACITIES.FULL : OPACITIES.DIM)
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

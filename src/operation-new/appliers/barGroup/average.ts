import * as d3 from 'd3'
import { averageData } from '../../../domain/operation/dataOps'
import { OperationOp } from '../../../domain/operation/types'
import { ChartType } from '../../../domain/chart'
import { DataAttributes, SvgClassNames } from '../../../rendering/interfaces'
import { DURATIONS, EASINGS, OPACITIES } from '../../../rendering/common/d3Helpers'
import { formatOperationValue } from '../../../operation-next/primitives/formatValue'
import {
  RESULT_REF_ATTRIBUTE,
  OPERATION_ROLE_ATTRIBUTE,
  isOperationResultReferenced,
  operationResultRef,
} from '../../../operation-next/diffEndpoint'
import { getRuntimeChartState } from '../../../rendering/utils/runtimeChartState'
import { ensureAnnotationLayer } from '../../../operation-next/primitives/annotationLayer'
import type { OperationApplier, ApplierArgs, ApplierResult } from '../../applier'
import { applyAnnotationContextFade } from '../../primitives/contextFade'
import { drawReferenceLine } from '../../primitives/drawReferenceLine'
import { fadeRemoveAnnotations } from '../../primitives/fadeRemove'
import {
  barAnnotationViewport,
  resolveBarPlotBounds,
  valueToRootYForBars,
  type BarGroupApplierInstance,
  type BarGroupGeometryInstance,
} from './_geometry'
import { convertGroupToSimpleBarSurface } from './groupConversion'
import { barMarkKeyFromNode, inferBarYFromAxis } from './_shared'

/** Shared with simpleBar + the split-diff fallback selector
 *  (`line.operation-next-average`), so a grouped/stacked average can anchor a
 *  cross-surface diff. */
export const AVERAGE_ANNOTATION_CLASS = 'operation-next-average'

/**
 * Draw the horizontal average reference line + label on a grouped/stacked (or
 * converted simple-bar) surface, then stamp the `average-reference` role and the
 * result-ref so a later cross-surface diff can resolve this endpoint. The line
 * is appended synchronously inside `drawReferenceLine` BEFORE its label-fade
 * transition, so the stamp lands even if the fade is interrupted (no
 * salience-await on the critical path — fixes R3).
 */
async function drawBarGroupAverageLine(args: {
  geo: BarGroupGeometryInstance
  layer: d3.Selection<SVGGElement, unknown, null, undefined>
  average: number
  label: string
  resultRef: string | null
}): Promise<void> {
  const { geo, layer, average, label, resultRef } = args
  // Resolve the line's y from the rendered y-axis ticks (the ground truth) —
  // the same axis-based resolver the filter applier uses for its threshold
  // line (`stackedBar/filter.ts`). `inferBarYFromAxis` returns a plot-local y,
  // so add the plot group's marginTop for root-SVG coords. This is immune to
  // collapsed/out-of-scope bars: a recompose-filter parks them at height 0 on
  // the baseline, which a `valueToRootYForBars` two-sample fit would otherwise
  // anchor to, flattening the line to value 0. Fall back to the bar fit only
  // when the axis has <2 numeric ticks.
  const axisLocalY = inferBarYFromAxis(geo.svg, average)
  const y = axisLocalY != null ? geo.layout.marginTop + axisLocalY : valueToRootYForBars(geo, average)
  const { x1, x2 } = resolveBarPlotBounds(geo)

  // `drawReferenceLine` appends the <line> synchronously before its first await
  // (the draw-out + label-fade transitions). Kick it off WITHOUT awaiting yet,
  // then stamp the line immediately — so the `average-reference` role + the
  // result-ref land even if the fade hangs (hidden-tab rAF freeze). The
  // cross-surface diff resolver needs the stamp, not the completed fade.
  const drawPromise = drawReferenceLine({
    layer,
    cssClass: AVERAGE_ANNOTATION_CLASS,
    x1,
    x2,
    y,
    label,
    svg: geo.svg,
    viewport: barAnnotationViewport(geo),
    anchorValue: average,
  })
  layer
    .selectAll<SVGElement, unknown>(`.${AVERAGE_ANNOTATION_CLASS}`)
    .filter(function () {
      return this.getAttribute(OPERATION_ROLE_ATTRIBUTE) == null
    })
    .attr(OPERATION_ROLE_ATTRIBUTE, 'average-reference')
  if (resultRef) {
    // Stamp the ref on the LINE only, not the value label <text> — the
    // cross-surface diff resolver anchors the Δ arrow on the first element
    // carrying the ref, and a label box sits offset from the actual reference
    // line (endpointRectOnSurface also prefers lines, belt and braces).
    layer
      .selectAll<SVGElement, unknown>(`line.${AVERAGE_ANNOTATION_CLASS}`)
      .filter(function () {
        return this.getAttribute(RESULT_REF_ATTRIBUTE) == null
      })
      .attr(RESULT_REF_ATTRIBUTE, resultRef)
  }
  await drawPromise
}

/**
 * Shared native `average` applier for grouped + stacked bars (the logic is
 * identical; they differ only in their filter-annotation class). Replaces the
 * legacy `runGroupedBarAverageOperation` delegation.
 *
 * - Group-scoped (`operation.group` set): convert the chart to a simple bar of
 *   that group via `storeDerivedChartState` (so the swap survives the next op —
 *   fixes R1), then draw + stamp the average line on the simple bar.
 * - Otherwise: draw a global average reference line across the plot, stamped so
 *   it can anchor a cross-surface diff. Bar dimming is the filter applier's job
 *   (matching simpleBar/average), so there is no mark-salience await here.
 */
export function makeBarGroupAverageApplier<T extends BarGroupApplierInstance>(opts: {
  filterClass: string
}): OperationApplier<T> {
  return {
    op: OperationOp.Average,

    async apply({ operation, state, instance, options }: ApplierArgs<T>): Promise<ApplierResult> {
      const result = averageData(state.workingData, operation)
      const average = Number(result[0]?.value)
      console.info('[operation-new] bar-group applier:average', {
        nodeId: operation.meta?.nodeId,
        group: operation.group,
        workingLen: state.workingData.length,
        average,
      })
      if (!Number.isFinite(average)) {
        return { result, nextState: { ...state, lastResult: result } }
      }

      const referencedResultIds = options?.referencedResultIds
      const persistent = isOperationResultReferenced(operation, referencedResultIds)
      const resultRef = operationResultRef(operation)
      const group = String(operation.group ?? '').trim()

      // Group-scoped average → convert grouped/stacked to a simple bar of that
      // group and draw the average on the simple bar.
      if (group) {
        const rt = getRuntimeChartState(instance.host)
        const source =
          rt && (rt.chartType === ChartType.GROUPED_BAR || rt.chartType === ChartType.STACKED_BAR)
            ? { type: rt.chartType, spec: rt.spec }
            : null
        if (source) {
          const simpleSpec = await convertGroupToSimpleBarSurface(
            instance.host,
            source,
            group,
            state.workingData,
          )
          if (simpleSpec) {
            const newSvgNode = instance.host.querySelector('svg') as SVGSVGElement | null
            if (newSvgNode) {
              const svg = d3.select(newSvgNode) as d3.Selection<SVGSVGElement, unknown, null, undefined>
              const geo: BarGroupGeometryInstance = {
                host: instance.host,
                svg,
                layout: {
                  marginLeft: Number(newSvgNode.getAttribute('data-m-left') ?? 0),
                  marginTop: Number(newSvgNode.getAttribute('data-m-top') ?? 0),
                  plotWidth: Number(newSvgNode.getAttribute('data-plot-w') ?? 0),
                  plotHeight: Number(newSvgNode.getAttribute('data-plot-h') ?? 0),
                },
                mainBars: () => svg.selectAll<SVGRectElement, unknown>(`rect.${SvgClassNames.MainBar}`),
              }
              await drawBarGroupAverageLine({
                geo,
                layer: ensureAnnotationLayer(svg),
                average,
                label: `Avg (${group}): ${formatOperationValue(average)}`,
                resultRef,
              })
            }
            return {
              result,
              nextState: {
                ...state,
                derivedData: null,
                lastResult: result,
                // The converted simple-bar shows only the in-scope group — no dim
                // marks remain, so reset the salience map.
                salienceMap: new Map(),
                annotationRecords: [
                  ...state.annotationRecords,
                  {
                    cssClass: AVERAGE_ANNOTATION_CLASS,
                    role: persistent ? ('anchor' as const) : ('result' as const),
                    persistent,
                    operationId: resultRef == null ? undefined : String(resultRef),
                    resultRef: resultRef == null ? undefined : String(resultRef),
                  },
                ],
              },
            }
          }
        }
      }

      // Non-group-scoped (or conversion declined): global average line across
      // the grouped/stacked plot.
      const layer = instance.annotationLayer
      applyAnnotationContextFade(layer, state.annotationRecords, opts.filterClass, referencedResultIds)
      if (!persistent) {
        fadeRemoveAnnotations(layer, AVERAGE_ANNOTATION_CLASS)
      } else {
        const refs = new Set((referencedResultIds ?? []).map((id) => String(id).replace(/^ref:/, '')))
        layer
          .selectAll<SVGElement, unknown>(`.${AVERAGE_ANNOTATION_CLASS}`)
          .filter(function () {
            const ref = this.getAttribute(RESULT_REF_ATTRIBUTE)
            return !ref || !refs.has(ref)
          })
          .interrupt()
          .remove()
      }

      // Group-scoped average drawn on the (un-converted) grouped/stacked chart
      // — a faceted chart can't collapse to a simple bar, so highlight the
      // average's group by dimming every out-of-group bar (mirrors a filter to
      // that group). Persist via the salience map so a re-render keeps it.
      let nextSalienceMap = state.salienceMap
      if (group) {
        const salience = new Map<string, number>()
        instance.mainBars().each(function (this: SVGRectElement) {
          const series =
            this.getAttribute(DataAttributes.Series) ?? this.getAttribute(DataAttributes.GroupValue) ?? ''
          const next = series === group ? OPACITIES.FULL : OPACITIES.DIM
          d3.select(this)
            .interrupt()
            .transition()
            .duration(DURATIONS.DIM)
            .ease(EASINGS.SMOOTH)
            .style('opacity', next)
          salience.set(barMarkKeyFromNode(this), next)
        })
        nextSalienceMap = salience
      }

      const isFiltered = state.filterContext != null || state.salienceMap.size > 0
      const label = isFiltered
        ? `Avg (filtered): ${formatOperationValue(average)}`
        : `Average: ${formatOperationValue(average)}`
      await drawBarGroupAverageLine({ geo: instance, layer, average, label, resultRef })

      return {
        result,
        nextState: {
          ...state,
          derivedData: null,
          lastResult: result,
          salienceMap: nextSalienceMap,
          annotationRecords: [
            ...state.annotationRecords,
            {
              cssClass: AVERAGE_ANNOTATION_CLASS,
              role: persistent ? ('anchor' as const) : ('result' as const),
              persistent,
              operationId: resultRef == null ? undefined : String(resultRef),
              resultRef: resultRef == null ? undefined : String(resultRef),
            },
          ],
        },
      }
    },
  }
}

import * as d3 from 'd3'
import { sumData } from '../../../domain/operation/dataOps'
import { OperationOp } from '../../../domain/operation/types'
import { DataAttributes, SvgAttributes, SvgClassNames, SvgElements } from '../../../rendering/interfaces'
import { DURATIONS, EASINGS } from '../../../rendering/common/d3Helpers'
import { formatOperationValue } from '../../../operation-next/primitives/formatValue'
import { RESULT_REF_ATTRIBUTE } from '../../../operation-next/diffEndpoint'
import { drawResultBadge } from '../../primitives/drawResultBadge'
import type { OperationApplier, ApplierArgs, ApplierResult } from '../../applier'
import { addApplier } from './add'
import type { SimpleLineChartInstance } from '../../../rendering-new/instances/simpleLineInstance'

/**
 * `sum` on a simple-line chart — Phase 2 line→bar→stack visual.
 *
 * sum totals N points (e.g. the rows kept by a prior filter). The visual makes
 * that totalling literal: the summed points rise into bars (one per point, at
 * the point's original x), then those bars slide together into a single column
 * and STACK — each bar sitting on the running total of the ones below it — so
 * the column's height IS the sum. The y-axis rescales from 0 to the total in the
 * same motion (the stacked total usually exceeds the line's range). A label on
 * top of the column shows the numeric total.
 *
 * This mirrors `sort.ts`'s line→bar mechanics (bars rise in a `g` inside the
 * skeleton, line + circles fade out) but does NOT swap the chart type: sum is
 * typically a mid-chain branch (e.g. filter→sum→…→diff) and sibling branches
 * still need the line, so the conversion stays local to this step's surface.
 *
 * Degenerate fallback (no point marks on the instance): the old corner
 * "Total: X" badge, so a sum that can't find circles still gives feedback.
 */

export const SUM_ANNOTATION_CLASS = 'operation-next-line-sum'
const SUM_STACK_GROUP_CLASS = 'sum-stack-marks'
const STACK_FILL = '#69b3a2'

function debugLog(label: string, payload: Record<string, unknown>): void {
  console.info(`[operation-new] simpleLine applier:sum :: ${label}\n${JSON.stringify(payload, null, 2)}`)
}

interface SummedPoint {
  target: string
  value: number
  cx: number
  cy: number
}

/** Snapshot the circle marks for the targets being summed (the working slice). */
function readSummedPoints(instance: SimpleLineChartInstance, summedTargets: Set<string>): SummedPoint[] {
  const out: SummedPoint[] = []
  instance.pointMarks.nodes().forEach((node) => {
    const target = String(node.getAttribute(DataAttributes.Target) ?? '')
    if (summedTargets.size > 0 && !summedTargets.has(target)) return
    out.push({
      target,
      value: Number(node.getAttribute(DataAttributes.Value) ?? 0),
      cx: Number(node.getAttribute(SvgAttributes.CX) ?? 0),
      cy: Number(node.getAttribute(SvgAttributes.CY) ?? 0),
    })
  })
  return out
}

function resolveBarWidth(points: SummedPoint[], plotWidth: number): number {
  if (points.length < 2) return Math.max(20, plotWidth * 0.12)
  const xs = points.map((p) => p.cx).sort((a, b) => a - b)
  let minGap = Infinity
  for (let i = 1; i < xs.length; i += 1) {
    const gap = xs[i] - xs[i - 1]
    if (gap > 0 && gap < minGap) minGap = gap
  }
  if (!Number.isFinite(minGap)) return Math.max(20, plotWidth * 0.12)
  return Math.max(8, minGap * 0.6)
}

export const sumApplier: OperationApplier<SimpleLineChartInstance> = {
  op: OperationOp.Sum,

  async apply(args: ApplierArgs<SimpleLineChartInstance>): Promise<ApplierResult> {
    const { operation, state, instance } = args
    // op-consolidation Tier 1: a folded op="sum" with two named scalars (targetA+targetB,
    // formerly add) is DRAWN by the add applier (result badge); N-value totals stay here.
    if (operation.targetA != null && operation.targetB != null) {
      return addApplier.apply(args)
    }
    const result = sumData(state.workingData, operation)
    const total = Number(result[0]?.value)
    const summedTargets = new Set(state.workingData.map((d) => String(d.target)))
    debugLog('ENTRY', {
      nodeId: operation.meta?.nodeId,
      total,
      workingLen: state.workingData.length,
      summedTargets: Array.from(summedTargets),
    })

    if (!Number.isFinite(total)) {
      return { result, nextState: { ...state, lastResult: result } }
    }

    const points = readSummedPoints(instance, summedTargets)

    // Degenerate fallback: no circles to convert → corner badge (legacy behavior).
    if (points.length === 0 || total <= 0) {
      debugLog('FALLBACK-BADGE', { reason: points.length === 0 ? 'no point marks' : 'non-positive total', total })
      await drawResultBadge({
        layer: instance.annotationLayer,
        cssClass: SUM_ANNOTATION_CLASS,
        text: `Total: ${formatOperationValue(total)}`,
        layout: instance.layout,
        anchor: 'top-right',
      })
      return {
        result,
        nextState: {
          ...state,
          lastResult: result,
          annotationRecords: [
            ...state.annotationRecords,
            { cssClass: SUM_ANNOTATION_CLASS, role: 'result', persistent: false },
          ],
        },
      }
    }

    const skeleton = instance.skeleton
    const plotH = instance.layout.plotHeight
    const plotW = instance.layout.plotWidth
    const barWidth = resolveBarWidth(points, plotW)
    const columnX = points.reduce((acc, p) => acc + p.cx, 0) / points.length

    // -----------------------------------------------------------------------
    // Phase A: bars rise from the baseline at each summed point's x while the
    // line + circles fade out (mirrors sort.ts — the line dissolves INTO bars).
    // Bars start in the line's current y-scale (height = plotH - cy).
    // -----------------------------------------------------------------------
    let stackGroup = skeleton.select<SVGGElement>(`g.${SUM_STACK_GROUP_CLASS}`)
    if (stackGroup.empty()) {
      stackGroup = skeleton.append<SVGGElement>(SvgElements.Group).attr(SvgAttributes.Class, SUM_STACK_GROUP_CLASS) as d3.Selection<SVGGElement, unknown, null, undefined>
    }

    const bars = stackGroup
      .selectAll<SVGRectElement, SummedPoint>(`rect.${SvgClassNames.MainBar}`)
      .data(points, (d) => d.target)
      .join((enter) =>
        enter
          .append(SvgElements.Rect)
          .attr(SvgAttributes.Class, SvgClassNames.MainBar)
          .attr(SvgAttributes.X, (d) => d.cx - barWidth / 2)
          .attr(SvgAttributes.Width, barWidth)
          .attr(SvgAttributes.Y, plotH)
          .attr(SvgAttributes.Height, 0)
          .attr(SvgAttributes.Fill, STACK_FILL)
          .attr(SvgAttributes.Stroke, '#ffffff')
          .attr('stroke-width', 1)
          .attr(SvgAttributes.Opacity, 0)
          .attr(DataAttributes.Target, (d) => d.target)
          .attr(DataAttributes.Value, (d) => String(d.value)),
      )

    const riseDuration = DURATIONS.HIGHLIGHT
    const fadeDuration = DURATIONS.FADE
    const risePromise = bars
      .transition()
      .duration(riseDuration)
      .ease(EASINGS.SMOOTH)
      .attr(SvgAttributes.Y, (d) => d.cy)
      .attr(SvgAttributes.Height, (d) => Math.max(0, plotH - d.cy))
      .style(SvgAttributes.Opacity, 0.92)
      .end()
      .catch(() => undefined)

    const fadePromises: Array<Promise<unknown>> = [risePromise]
    const linePathSel = instance.linePath
    const pointMarksSel = instance.pointMarks
    if (linePathSel && !linePathSel.empty()) {
      fadePromises.push(linePathSel.transition().duration(fadeDuration).ease(EASINGS.SMOOTH).style(SvgAttributes.Opacity, 0).end().catch(() => undefined))
    }
    if (pointMarksSel && !pointMarksSel.empty()) {
      fadePromises.push(pointMarksSel.transition().duration(fadeDuration).ease(EASINGS.SMOOTH).style(SvgAttributes.Opacity, 0).end().catch(() => undefined))
    }
    await Promise.all(fadePromises)
    if (linePathSel && !linePathSel.empty()) linePathSel.remove()
    if (pointMarksSel && !pointMarksSel.empty()) pointMarksSel.remove()

    debugLog('PHASE-A-DONE', { barCount: bars.size(), columnX, barWidth })

    // -----------------------------------------------------------------------
    // Phase B: rescale y from 0 → total and STACK the bars into one column.
    // Each bar moves to columnX and sits on the cumulative total of those below
    // it; the y-axis follows in the same shared transition (no flicker).
    // -----------------------------------------------------------------------
    const newYScale = d3.scaleLinear().domain([0, total]).range([plotH, 0])
    let cumulative = 0
    const segByTarget = new Map<string, { y: number; height: number }>()
    points.forEach((p) => {
      const bottomVal = cumulative
      const topVal = cumulative + p.value
      cumulative = topVal
      const y = newYScale(topVal)
      const height = Math.max(0, newYScale(bottomVal) - newYScale(topVal))
      segByTarget.set(p.target, { y, height })
    })

    const parentT = instance.svg
      .transition()
      .duration(DURATIONS.REPOSITION)
      .ease(EASINGS.SMOOTH) as unknown as d3.Transition<d3.BaseType, unknown, d3.BaseType, unknown>
    const inheritT = parentT as never

    bars
      .transition(inheritT)
      .attr(SvgAttributes.X, columnX - barWidth / 2)
      .attr(SvgAttributes.Y, function () {
        const target = (this as SVGRectElement).getAttribute(DataAttributes.Target) ?? ''
        return segByTarget.get(target)?.y ?? plotH
      })
      .attr(SvgAttributes.Height, function () {
        const target = (this as SVGRectElement).getAttribute(DataAttributes.Target) ?? ''
        return segByTarget.get(target)?.height ?? 0
      })
      .style(SvgAttributes.Opacity, 0.92)

    // Y-axis ticks rescale to [0, total] in lockstep with the bars.
    instance.yAxisGroup.transition(inheritT).call(d3.axisLeft(newYScale) as never)

    try {
      await parentT.end()
    } catch {
      /* interrupted */
    }
    instance.yScale = newYScale

    // Total label centered above the stacked column. Tag it with the sum's
    // nodeId via RESULT_REF_ATTRIBUTE so a downstream `diff` can locate this
    // total as an endpoint (op-agnostic resolution in splitDiffOverlay /
    // existingReferenceLineY), exactly like an average reference line.
    const resultRef = operation.meta?.nodeId != null ? String(operation.meta.nodeId) : null
    const labelTopY = newYScale(total)
    const totalLabel = stackGroup
      .selectAll<SVGTextElement, number>('text.sum-total-label')
      .data([total])
      .join((enter) => enter.append(SvgElements.Text).attr(SvgAttributes.Class, 'sum-total-label'))
      .attr(SvgAttributes.X, columnX)
      .attr(SvgAttributes.Y, labelTopY - 8)
      .attr(SvgAttributes.TextAnchor, 'middle')
      .attr(SvgAttributes.Fill, '#1f2937')
      .attr('font-weight', '600')
      .text(`Total: ${formatOperationValue(total)}`)
    if (resultRef) totalLabel.attr(RESULT_REF_ATTRIBUTE, resultRef)
    totalLabel.style(SvgAttributes.Opacity, 0).transition().duration(DURATIONS.LABEL_FADE_IN).style(SvgAttributes.Opacity, 1)

    debugLog('PHASE-B-DONE', { total, stackedColumnX: columnX, yDomain: [0, total], resultRef })

    return {
      result,
      nextState: {
        ...state,
        lastResult: result,
        annotationRecords: [
          ...state.annotationRecords,
          {
            cssClass: SUM_STACK_GROUP_CLASS,
            role: 'result',
            persistent: true,
            operationId: resultRef ?? undefined,
            resultRef: resultRef ?? undefined,
          },
        ],
      },
    }
  },
}

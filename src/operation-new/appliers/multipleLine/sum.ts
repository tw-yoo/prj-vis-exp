import * as d3 from 'd3'
import { sumData } from '../../../domain/operation/dataOps'
import { OperationOp } from '../../../domain/operation/types'
import { DataAttributes, SvgAttributes, SvgClassNames, SvgElements, SvgSelectors } from '../../../rendering/interfaces'
import { DURATIONS, EASINGS } from '../../../rendering/common/d3Helpers'
import { formatOperationValue } from '../../../operation-next/primitives/formatValue'
import { RESULT_REF_ATTRIBUTE } from '../../../operation-next/diffEndpoint'
import { drawResultBadge } from '../../primitives/drawResultBadge'
import type { OperationApplier, ApplierArgs, ApplierResult } from '../../applier'
import type { MultipleLineChartInstance } from '../../../rendering-new/instances/multipleLineInstance'

/**
 * `sum` on a multiple-line chart — Phase 2 line→bar→stack visual (the
 * multi-series sibling of `simpleLine/sum.ts`).
 *
 * sum totals N values into one scalar. The visual makes that literal: the
 * summed marks (matched by x AND series, since a multi-line has several points
 * per x) rise into bars at their original x, then slide into one column and
 * STACK — each bar on the running total of those below — so the column's height
 * IS the sum, with the y-axis rescaling 0→total in the same motion. A label on
 * top shows the numeric total.
 *
 * The MultipleLineChartInstance is a thin wrapper (no skeleton/yScale/yAxisGroup
 * fields, transitionChartScale is a no-op), so this applier reads what it needs
 * straight off the SVG: the plot group is the summed circles' parent (shared
 * coordinate space), the y-axis is `.y-axis`, and a fresh from-0 yScale drives
 * both the bars and the rescaled axis.
 *
 * Degenerate fallback (no matching circles — e.g. summing a derived row-list
 * with no on-screen marks): the corner "Total: X" badge.
 */

export const SUM_ANNOTATION_CLASS = 'operation-next-mline-sum'
const SUM_STACK_GROUP_CLASS = 'sum-stack-marks'
const STACK_FILL = '#69b3a2'

function debugLog(label: string, payload: Record<string, unknown>): void {
  console.info(`[operation-new] multipleLine applier:sum :: ${label}\n${JSON.stringify(payload, null, 2)}`)
}

interface SummedPoint {
  key: string
  target: string
  group: string
  value: number
  cx: number
  cy: number
}

function markKey(target: string, group: string): string {
  return `${target}|${group}`
}

/** Snapshot the circle marks for the (x, series) pairs being summed. */
function readSummedPoints(instance: MultipleLineChartInstance, summedKeys: Set<string>): SummedPoint[] {
  const out: SummedPoint[] = []
  instance.pointMarks().nodes().forEach((node) => {
    const el = node as SVGCircleElement
    const target = String(el.getAttribute(DataAttributes.Target) ?? '')
    const group = String(el.getAttribute(DataAttributes.GroupValue) ?? el.getAttribute(DataAttributes.Series) ?? '')
    const key = markKey(target, group)
    if (summedKeys.size > 0 && !summedKeys.has(key)) return
    out.push({
      key,
      target,
      group,
      value: Number(el.getAttribute(DataAttributes.Value) ?? 0),
      cx: Number(el.getAttribute(SvgAttributes.CX) ?? 0),
      cy: Number(el.getAttribute(SvgAttributes.CY) ?? 0),
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

export const sumApplier: OperationApplier<MultipleLineChartInstance> = {
  op: OperationOp.Sum,

  async apply({ operation, state, instance }: ApplierArgs<MultipleLineChartInstance>): Promise<ApplierResult> {
    const result = sumData(state.workingData, operation)
    const total = Number(result[0]?.value)
    const summedKeys = new Set(state.workingData.map((d) => markKey(String(d.target), String(d.group ?? ''))))
    debugLog('ENTRY', {
      nodeId: operation.meta?.nodeId,
      total,
      workingLen: state.workingData.length,
      summedKeys: Array.from(summedKeys),
    })

    if (!Number.isFinite(total)) {
      return { result, nextState: { ...state, lastResult: result } }
    }

    const points = readSummedPoints(instance, summedKeys)

    // Degenerate fallback: no circles to convert → corner badge.
    if (points.length === 0 || total <= 0) {
      debugLog('FALLBACK-BADGE', { reason: points.length === 0 ? 'no matching marks' : 'non-positive total', total })
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

    const plotH = instance.layout.plotHeight
    const plotW = instance.layout.plotWidth
    const barWidth = resolveBarWidth(points, plotW)
    const columnX = points.reduce((acc, p) => acc + p.cx, 0) / points.length

    // Plot group = the summed circles' parent, so bars share their coordinate
    // space (and the same vertical origin as the `.y-axis`).
    const firstCircle = instance.pointMarks().nodes()[0] as SVGCircleElement | undefined
    const plotGroup = d3.select((firstCircle?.parentNode ?? instance.svg.node()) as SVGGElement)

    // -----------------------------------------------------------------------
    // Phase A: bars rise from the baseline at each summed point's x while the
    // lines + circles fade out (mirrors simpleLine/sum.ts).
    // -----------------------------------------------------------------------
    let stackGroup = plotGroup.select<SVGGElement>(`g.${SUM_STACK_GROUP_CLASS}`)
    if (stackGroup.empty()) {
      stackGroup = plotGroup.append<SVGGElement>(SvgElements.Group).attr(SvgAttributes.Class, SUM_STACK_GROUP_CLASS) as d3.Selection<SVGGElement, unknown, null, undefined>
    }

    const bars = stackGroup
      .selectAll<SVGRectElement, SummedPoint>(`rect.${SvgClassNames.MainBar}`)
      .data(points, (d) => d.key)
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
          .attr(SvgAttributes.StrokeWidth, 1)
          .attr(SvgAttributes.Opacity, 0)
          .attr(DataAttributes.Target, (d) => d.target)
          .attr(DataAttributes.GroupValue, (d) => d.group)
          .attr(DataAttributes.Value, (d) => String(d.value)),
      )

    const risePromise = bars
      .transition()
      .duration(DURATIONS.HIGHLIGHT)
      .ease(EASINGS.SMOOTH)
      .attr(SvgAttributes.Y, (d) => d.cy)
      .attr(SvgAttributes.Height, (d) => Math.max(0, plotH - d.cy))
      .style(SvgAttributes.Opacity, 0.92)
      .end()
      .catch(() => undefined)

    const fadePromises: Array<Promise<unknown>> = [risePromise]
    const linePaths = instance.mainLinePaths()
    const circles = instance.pointMarks()
    if (linePaths && !linePaths.empty()) {
      fadePromises.push(linePaths.transition().duration(DURATIONS.FADE).ease(EASINGS.SMOOTH).style(SvgAttributes.Opacity, 0).end().catch(() => undefined))
    }
    if (circles && !circles.empty()) {
      fadePromises.push(circles.transition().duration(DURATIONS.FADE).ease(EASINGS.SMOOTH).style(SvgAttributes.Opacity, 0).end().catch(() => undefined))
    }
    await Promise.all(fadePromises)
    if (linePaths && !linePaths.empty()) linePaths.remove()
    if (circles && !circles.empty()) circles.remove()

    debugLog('PHASE-A-DONE', { barCount: bars.size(), columnX, barWidth })

    // -----------------------------------------------------------------------
    // Phase B: rescale y from 0 → total and STACK the bars into one column.
    // -----------------------------------------------------------------------
    const newYScale = d3.scaleLinear().domain([0, total]).range([plotH, 0])
    let cumulative = 0
    const segByKey = new Map<string, { y: number; height: number }>()
    points.forEach((p) => {
      const bottomVal = cumulative
      const topVal = cumulative + p.value
      cumulative = topVal
      segByKey.set(p.key, { y: newYScale(topVal), height: Math.max(0, newYScale(bottomVal) - newYScale(topVal)) })
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
        const key = markKey(
          (this as SVGRectElement).getAttribute(DataAttributes.Target) ?? '',
          (this as SVGRectElement).getAttribute(DataAttributes.GroupValue) ?? '',
        )
        return segByKey.get(key)?.y ?? plotH
      })
      .attr(SvgAttributes.Height, function () {
        const key = markKey(
          (this as SVGRectElement).getAttribute(DataAttributes.Target) ?? '',
          (this as SVGRectElement).getAttribute(DataAttributes.GroupValue) ?? '',
        )
        return segByKey.get(key)?.height ?? 0
      })
      .style(SvgAttributes.Opacity, 0.92)

    // Y-axis ticks rescale to [0, total] in lockstep with the bars.
    const yAxisGroup = instance.svg.select<SVGGElement>(SvgSelectors.YAxisGroup)
    if (!yAxisGroup.empty()) {
      yAxisGroup.transition(inheritT).call(d3.axisLeft(newYScale) as never)
    }

    try {
      await parentT.end()
    } catch {
      /* interrupted */
    }

    // Total label centered above the stacked column. Tag it with the sum's
    // nodeId via RESULT_REF_ATTRIBUTE so a downstream `diff` can locate this
    // total as an endpoint (op-agnostic resolution in splitDiffOverlay).
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

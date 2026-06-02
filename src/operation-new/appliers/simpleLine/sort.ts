import * as d3 from 'd3'
import { sortData } from '../../../domain/operation/dataOps'
import { OperationOp } from '../../../domain/operation/types'
import { ChartType } from '../../../domain/chart'
import { DataAttributes, SvgAttributes, SvgClassNames, SvgElements } from '../../../rendering/interfaces'
import { DURATIONS, EASINGS } from '../../../rendering/common/d3Helpers'
import { composeSimpleMarkKey } from '../../../rendering/common/markKey'
import { storeRuntimeChartState } from '../../../rendering/utils/runtimeChartState'
import { storeDerivedChartState } from '../../../rendering/utils/derivedChartState'
import { setSimpleBarStoredData, type SimpleBarSpec } from '../../../rendering/bar/simpleBarRenderer'
import { detachInstance } from '../../../rendering-new/chartInstance'
import type { OperationApplier, ApplierArgs, ApplierResult } from '../../applier'
import type { SimpleLineChartInstance } from '../../../rendering-new/instances/simpleLineInstance'

/**
 * `sort` on a simple-line chart.
 *
 * Reviewer requirement (case 2o3fyauxv32p571i):
 *   "ops:n1에서 sort를 실행하면, line chart가 자연스럽게 bar chart로 바뀌어야 함.
 *    line과 circle은 자연스레 사라지고, bar가 올라오는 느낌으로 애니메이션이 생성
 *    되어서 bar chart가 만들어진 후, 실제 simple bar sort를 호출하여 sorting이 되어야 함."
 *
 * Three-phase visual:
 *   Phase A — line path + circle marks fade out, then are removed from the DOM.
 *             Bars rise from the baseline (y = plotH, height = 0) up to the
 *             corresponding point's cy/value. Bar x positions match the
 *             original point cx (so the bar appears "under" each former
 *             circle). One shared transition for the rise.
 *   Phase B — bars animate to their sorted x positions, x-axis ticks
 *             follow in lockstep (mirrors simpleBar.sortApplier).
 *   Phase C — chart-type swap to SIMPLE_BAR so downstream ops (e.g. ops2:n2
 *             nth) route through simple-bar runner: storeRuntimeChartState +
 *             setSimpleBarStoredData + detachInstance. The next runChartOps
 *             call attaches a SimpleBarChartInstance which rehydrates the
 *             SVG we just built (no flicker; bars stay put).
 *
 * Debug output is dumped as multi-line JSON so console renders without
 * truncation — caller asked for non-collapsing logs.
 */
function debugLog(label: string, payload: Record<string, unknown>): void {
  console.info(`[operation-new] simpleLine applier:sort :: ${label}\n${JSON.stringify(payload, null, 2)}`)
}

interface CircleSnapshot {
  target: string
  value: number
  cx: number
  cy: number
}

function readCircleSnapshots(instance: SimpleLineChartInstance): CircleSnapshot[] {
  return instance.pointMarks.nodes().map((node) => ({
    target: String(node.getAttribute(DataAttributes.Target) ?? ''),
    value: Number(node.getAttribute(DataAttributes.Value) ?? 0),
    cx: Number(node.getAttribute(SvgAttributes.CX) ?? 0),
    cy: Number(node.getAttribute(SvgAttributes.CY) ?? 0),
  }))
}

function resolveBarWidth(snapshots: CircleSnapshot[], plotWidth: number): number {
  if (snapshots.length < 2) return Math.max(20, plotWidth * 0.15)
  const xs = snapshots.map((s) => s.cx).sort((a, b) => a - b)
  let minGap = Infinity
  for (let i = 1; i < xs.length; i += 1) {
    const gap = xs[i] - xs[i - 1]
    if (gap > 0 && gap < minGap) minGap = gap
  }
  if (!Number.isFinite(minGap)) return Math.max(20, plotWidth * 0.15)
  return Math.max(8, minGap * 0.6)
}

export const sortApplier: OperationApplier<SimpleLineChartInstance> = {
  op: OperationOp.Sort,

  async apply({ operation, state, instance }: ApplierArgs<SimpleLineChartInstance>): Promise<ApplierResult> {
    const result = sortData(state.workingData, operation)
    debugLog('ENTRY', {
      nodeId: operation.meta?.nodeId,
      field: operation.field,
      order: operation.order,
      workingLen: state.workingData.length,
      workingSample: state.workingData.slice(0, 3).map((d) => ({ target: d.target, value: d.value })),
      resultLen: result.length,
      sortedTargets: result.map((d) => String(d.target)),
    })

    if (result.length === 0) {
      debugLog('EMPTY-RESULT-ABORT', { reason: 'sortData returned no rows' })
      return { result, nextState: { ...state, workingData: result, lastResult: result } }
    }

    const snapshots = readCircleSnapshots(instance)
    if (snapshots.length === 0) {
      debugLog('NO-CIRCLES-ABORT', { reason: 'instance.pointMarks contained no circles' })
      return { result, nextState: { ...state, workingData: result, lastResult: result } }
    }

    const skeleton = instance.skeleton
    const plotW = instance.layout.plotWidth
    const plotH = instance.layout.plotHeight
    const barWidth = resolveBarWidth(snapshots, plotW)

    debugLog('PHASE-A-PREP', {
      circleCount: snapshots.length,
      circles: snapshots,
      plotW,
      plotH,
      barWidth,
    })

    // -----------------------------------------------------------------------
    // Phase A: bars rise from the baseline WHILE the line + circles fade out
    // in the same window — the bars come up and the line dissolves INTO them,
    // not the line vanishing first onto an empty plot (reviewer requirement on
    // case 04xwv56n37ybj8zr: "bar가 생기고 line이 사라져야 함"). The rise and
    // fade run concurrently; the line is gone a touch before the bars settle.
    // -----------------------------------------------------------------------
    const fadeDuration = 400
    const riseDuration = DURATIONS.HIGHLIGHT // 600ms
    const linePathSel = instance.linePath
    const pointMarksSel = instance.pointMarks

    // Append the bar-marks group inside the same skeleton so it shares the
    // skeleton's `translate(marginLeft, marginTop)` transform. Bar x/y attrs
    // are then in plot-local coordinates, matching the simple-bar renderer.
    let barsGroup = skeleton.select<SVGGElement>('g.bar-marks')
    if (barsGroup.empty()) {
      barsGroup = skeleton.append<SVGGElement>(SvgElements.Group).attr(SvgAttributes.Class, 'bar-marks') as d3.Selection<SVGGElement, unknown, null, undefined>
    }

    const initialBars = barsGroup
      .selectAll<SVGRectElement, CircleSnapshot>(`rect.${SvgClassNames.MainBar}`)
      .data(snapshots, (d) => d.target)
      .join((enter) =>
        enter
          .append(SvgElements.Rect)
          .attr(SvgAttributes.Class, SvgClassNames.MainBar)
          .attr(SvgAttributes.X, (d) => d.cx - barWidth / 2)
          .attr(SvgAttributes.Width, barWidth)
          .attr(SvgAttributes.Y, plotH)
          .attr(SvgAttributes.Height, 0)
          .attr(SvgAttributes.Fill, '#69b3a2')
          .attr(SvgAttributes.Opacity, 0)
          .attr(DataAttributes.Id, (d) => d.target)
          .attr(DataAttributes.Target, (d) => d.target)
          .attr(DataAttributes.Value, (d) => d.value)
          .attr(DataAttributes.XValue, (d) => d.target)
          .attr(DataAttributes.YValue, (d) => String(d.value))
          .attr(DataAttributes.MarkKey, (d) => composeSimpleMarkKey(d.target)),
      )

    debugLog('PHASE-A-BARS-CREATED', { barCount: initialBars.size() })

    // Bars rise from the baseline: y=plotH → y=cy, height=0 → height=plotH-cy,
    // opacity 0 → 1. Launched first so the growth has already begun as the
    // line/circles start dissolving.
    const risePromise = initialBars
      .transition()
      .duration(riseDuration)
      .ease(EASINGS.SMOOTH)
      .attr(SvgAttributes.Y, (d) => d.cy)
      .attr(SvgAttributes.Height, (d) => Math.max(0, plotH - d.cy))
      .style(SvgAttributes.Opacity, 1)
      .end()
      .catch(() => undefined)

    // Line + circles fade out concurrently (shorter duration → gone before the
    // bars finish settling).
    const fadePromises: Array<Promise<unknown>> = [risePromise]
    if (linePathSel && !linePathSel.empty()) {
      fadePromises.push(
        linePathSel
          .transition()
          .duration(fadeDuration)
          .ease(EASINGS.SMOOTH)
          .style(SvgAttributes.Opacity, 0)
          .end()
          .catch(() => undefined),
      )
    }
    if (pointMarksSel && !pointMarksSel.empty()) {
      fadePromises.push(
        pointMarksSel
          .transition()
          .duration(fadeDuration)
          .ease(EASINGS.SMOOTH)
          .style(SvgAttributes.Opacity, 0)
          .end()
          .catch(() => undefined),
      )
    }
    await Promise.all(fadePromises)

    if (linePathSel && !linePathSel.empty()) linePathSel.remove()
    if (pointMarksSel && !pointMarksSel.empty()) pointMarksSel.remove()

    debugLog('PHASE-A-DONE', {
      fadeDurationMs: fadeDuration,
      riseDurationMs: riseDuration,
      barAttrSample: initialBars.nodes().slice(0, 3).map((node) => ({
        target: node.getAttribute(DataAttributes.Target),
        x: node.getAttribute(SvgAttributes.X),
        y: node.getAttribute(SvgAttributes.Y),
        width: node.getAttribute(SvgAttributes.Width),
        height: node.getAttribute(SvgAttributes.Height),
      })),
    })

    // -----------------------------------------------------------------------
    // Phase B: bars + x-axis ticks animate to sorted x positions
    // -----------------------------------------------------------------------
    // The sorted result's order maps onto the sorted-ascending list of
    // original cx values (smallest x slot gets the row whose value sorts
    // smallest; mirrors simpleBar.sortApplier's slot-assignment math).
    const sortedXs = snapshots.map((s) => s.cx).slice().sort((a, b) => a - b)
    const targetToNewX = new Map<string, number>()
    result.forEach((datum, index) => {
      const nextX = sortedXs[index]
      if (nextX == null) return
      targetToNewX.set(String(datum.target), nextX)
    })

    debugLog('PHASE-B-PLAN', {
      sortedXs,
      targetAssignments: Array.from(targetToNewX.entries()),
    })

    const parentT = instance.svg
      .transition()
      .duration(DURATIONS.REPOSITION)
      .ease(EASINGS.SMOOTH) as unknown as d3.Transition<d3.BaseType, unknown, d3.BaseType, unknown>
    const inheritT = parentT as never

    initialBars
      .transition(inheritT)
      .attr(SvgAttributes.X, function () {
        const target = (this as SVGRectElement).getAttribute(DataAttributes.Target) ?? ''
        const nextX = targetToNewX.get(target)
        return nextX != null ? nextX - barWidth / 2 : Number((this as SVGRectElement).getAttribute(SvgAttributes.X) ?? 0)
      })

    // X-axis ticks: move each tick to the new center matching its bar.
    const xAxisGroup = instance.xAxisGroup
    const ticks = xAxisGroup.selectAll<SVGGElement, unknown>('.tick')
    ticks.each(function () {
      const tick = d3.select(this)
      const label = tick.select(SvgElements.Text).text().trim()
      const nextX = targetToNewX.get(label)
      if (nextX == null) return
      tick.transition(inheritT).attr(SvgAttributes.Transform, `translate(${nextX},0)`)
    })

    try {
      await parentT.end()
    } catch {
      /* interrupted */
    }

    debugLog('PHASE-B-SETTLED', {
      finalBarPositions: initialBars.nodes().map((node) => ({
        target: node.getAttribute(DataAttributes.Target),
        x: node.getAttribute(SvgAttributes.X),
      })),
    })

    // -----------------------------------------------------------------------
    // Phase C: chart-type swap so ops2 (nth) routes through simple-bar runner.
    // -----------------------------------------------------------------------
    const resolved = instance.resolvedEncoding
    const xField = resolved?.xField ?? 'target'
    const yField = resolved?.yField ?? 'value'

    // Build a SimpleBarSpec from the sorted data. The new spec drives the
    // next runChartOps call: dispatcher reads runtimeChartState → SIMPLE_BAR,
    // ensures a SimpleBarChartInstance on the host, base renderer reads the
    // sorted data values → grouped chart already matches what's drawn (so the
    // rehydrate path stays a no-op on visual state).
    const sortedRows = result.map((d) => ({ [xField]: d.target, [yField]: d.value }))
    const simpleBarSpec: SimpleBarSpec = {
      ...(instance.svg.node()
        ? {
            $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
            width: plotW,
            height: plotH,
          }
        : {}),
      data: { values: sortedRows },
      mark: 'bar',
      encoding: {
        x: { field: xField, type: 'nominal', sort: sortedRows.map((r) => r[xField]) as Array<string | number> },
        y: { field: yField, type: 'quantitative' },
      },
    } as unknown as SimpleBarSpec

    setSimpleBarStoredData(instance.host, sortedRows)
    storeRuntimeChartState(instance.host, {
      chartType: ChartType.SIMPLE_BAR,
      spec: simpleBarSpec,
      renderer: 'd3',
    })
    // Signal the chart-type transition through the SAME channel every
    // orchestrator consumes (`consumeDerivedChartState`): ReviewPage
    // (ReviewPage.tsx), the workbench, and the eval `oursRenderer` all read
    // `consumeDerivedChartState(host)` after a group's run and, when set,
    // re-dispatch the NEXT group through the derived chart-type's runner.
    //
    // The new dispatcher (`runChartOps` → `prepareChartRuntimeSpec(spec)`)
    // derives chartType from the SPEC ALONE and never consults
    // `runtimeChartState`, so the `storeRuntimeChartState` call above is inert
    // for routing. Without this line the orchestrator keeps the original LINE
    // spec, ops2 (e.g. nth) re-dispatches through the simple-line runner, and
    // the chart rebuilds as a line — the regression reported on case
    // 04xwv56n37ybj8zr. This mirrors the legacy `simpleLineOps` transition and
    // the other chart-type transforms (`toSimpleTransforms`,
    // `stackGroupTransforms`, `multiLineToBarTransforms`).
    storeDerivedChartState(instance.host, ChartType.SIMPLE_BAR, simpleBarSpec)
    detachInstance(instance.host)

    debugLog('PHASE-C-CHART-TYPE-SWAP', {
      newChartType: ChartType.SIMPLE_BAR,
      sortedRowsCount: sortedRows.length,
      sortedRowsSample: sortedRows.slice(0, 3),
      xField,
      yField,
      storedDataCount: sortedRows.length,
    })

    return {
      result,
      nextState: {
        ...state,
        workingData: result,
        lastResult: result,
      },
    }
  },
}

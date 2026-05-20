import * as d3 from 'd3'
import { sortData } from '../../../domain/operation/dataOps'
import { OperationOp } from '../../../domain/operation/types'
import { DataAttributes, SvgAttributes, SvgClassNames, SvgElements } from '../../../rendering/interfaces'
import { DURATIONS, EASINGS } from '../../../rendering/common/d3Helpers'
import type { OperationApplier, ApplierArgs, ApplierResult } from '../../applier'
import type { SimpleBarChartInstance } from '../../../rendering-new/instances/simpleBarInstance'
import { readNumberAttr } from '../../primitives/annotationLayer'

/**
 * Sort applier — reorders bars and matching x-axis ticks in place. The
 * underlying `xScale.domain()` is NOT changed (axis ticks keep their original
 * label order — only their visual positions move). This mirrors the legacy
 * `annotateSort` behaviour: bar visuals swap to sorted positions, but the
 * x-axis label text stays where the previous filter left it.
 *
 * One shared `svg.transition()` parent rides both bar `x` and tick
 * `transform` updates so the visual swap stays aligned every frame.
 */
export const sortApplier: OperationApplier<SimpleBarChartInstance> = {
  op: OperationOp.Sort,

  async apply({ operation, state, instance }: ApplierArgs<SimpleBarChartInstance>): Promise<ApplierResult> {
    const result = sortData(state.workingData, operation)
    console.info('[operation-new] bar applier:sort', {
      nodeId: operation.meta?.nodeId,
      field: operation.field,
      order: operation.order,
      orderTargets: result.map((d) => String(d.target)),
    })

    if (result.length === 0) {
      return { result, nextState: { ...state, workingData: result, lastResult: result } }
    }

    // Visible bars (in-scope) — the sort applies to these. Capture their
    // current x positions (sorted ascending) so we can reassign in result
    // order.
    const visibleBars = instance.bars.filter(function () {
      const node = this as SVGRectElement
      const computedOpacity = Number(window.getComputedStyle(node).opacity)
      return Number.isFinite(computedOpacity) && computedOpacity > 0.001
    })
    const entries = visibleBars.nodes().map((node) => ({
      node,
      target: node.getAttribute(DataAttributes.Target) ?? '',
      x: readNumberAttr(node, SvgAttributes.X) ?? 0,
      width: readNumberAttr(node, SvgAttributes.Width) ?? 0,
    }))
    const xPositions = entries.slice().sort((a, b) => a.x - b.x).map((entry) => entry.x)
    const targetToX = new Map<string, number>()
    result.forEach((datum, index) => {
      const nextX = xPositions[index]
      if (nextX == null) return
      targetToX.set(String(datum.target), nextX)
    })
    const firstWidth = entries[0]?.width ?? 0

    const transition = instance.svg.transition().duration(DURATIONS.REPOSITION).ease(EASINGS.SMOOTH) as unknown as d3.Transition<
      d3.BaseType,
      unknown,
      d3.BaseType,
      unknown
    >
    const inheritT = transition as never

    // Bars: animate x to the new position.
    visibleBars
      .transition(inheritT)
      .attr(SvgAttributes.X, function () {
        const target = (this as SVGRectElement).getAttribute(DataAttributes.Target) ?? ''
        return targetToX.get(target) ?? readNumberAttr(this as SVGRectElement, SvgAttributes.X) ?? 0
      })

    // X-axis ticks: each tick's transform moves to match the bar's new center.
    const ticks = instance.xAxisGroup.selectAll<SVGGElement, unknown>(`.${SvgClassNames.Tick}`)
    ticks.each(function () {
      const tick = d3.select(this)
      const label = tick.select(SvgElements.Text).text().trim()
      const nextX = targetToX.get(label)
      if (nextX == null) return
      tick.transition(inheritT).attr(SvgAttributes.Transform, `translate(${nextX + firstWidth / 2},0)`)
    })

    try {
      await transition.end()
    } catch {
      /* interrupted */
    }

    return {
      result,
      nextState: { ...state, workingData: result, lastResult: result },
    }
  },
}

import { retrieveValue } from '../../../domain/operation/dataOps'
import { OperationOp } from '../../../domain/operation/types'
import { DataAttributes, SvgAttributes } from '../../../rendering/interfaces'
import { COLORS, DURATIONS } from '../../../rendering/common/d3Helpers'
import { formatOperationValue } from '../../../operation-next/primitives/formatValue'
import type { OperationApplier, ApplierArgs, ApplierResult } from '../../applier'
import type { GroupedBarChartInstance } from '../../../rendering-new/instances/groupedBarInstance'
import { fadeRemoveAnnotations } from '../../primitives/fadeRemove'
import { drawReferenceLine } from '../../primitives/drawReferenceLine'
import { readNumberAttr, type AnnotationViewport } from '../../primitives/annotationLayer'
import { placeValueLabel } from '../../primitives/placeValueLabel'

export const RETRIEVE_ANNOTATION_CLASS = 'operation-new-grouped-bar-retrieve-value'

/** Annotation viewport for a grouped-bar instance (mirrors simple-bar helper). */
function viewport(instance: GroupedBarChartInstance, extraRight = 96): AnnotationViewport {
  const svgNode = instance.svg.node()
  const { marginLeft, marginTop, plotWidth, plotHeight } = instance.layout
  const desired = { x: marginLeft, y: marginTop, width: plotWidth + extraRight, height: plotHeight }
  const viewBox = svgNode?.viewBox?.baseVal
  if (!viewBox || viewBox.width <= 0 || viewBox.height <= 0) return desired
  const x = Math.max(desired.x, viewBox.x)
  const y = Math.max(desired.y, viewBox.y)
  const right = Math.min(desired.x + desired.width, viewBox.x + viewBox.width)
  const bottom = Math.min(desired.y + desired.height, viewBox.y + viewBox.height)
  return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) }
}

/** Compute rect top in SVG-root coords; for negative bars, the value-side top is y+height. */
function rectTopRootY(rect: SVGRectElement, instance: GroupedBarChartInstance): number {
  const y = readNumberAttr(rect, SvgAttributes.Y) ?? 0
  const height = readNumberAttr(rect, SvgAttributes.Height) ?? 0
  const value = Number(rect.getAttribute(DataAttributes.Value))
  const localTop = value >= 0 ? y : y + height
  return instance.layout.marginTop + localTop
}

function rectCenterRootX(rect: SVGRectElement, instance: GroupedBarChartInstance): number {
  // Walk up to find any g[data-panel-plot-x] panel offset (grouped bar uses
  // per-panel groups). Without a panel transform, the rect.x is already
  // skeleton-local; we add marginLeft directly.
  const x = readNumberAttr(rect, SvgAttributes.X) ?? 0
  const w = readNumberAttr(rect, SvgAttributes.Width) ?? 0
  let panelOffset = 0
  let node: Element | null = rect.parentElement
  while (node && node !== instance.svg.node()) {
    const panelX = node.getAttribute(DataAttributes.PanelPlotX)
    if (panelX != null) {
      const v = Number(panelX)
      if (Number.isFinite(v)) panelOffset += v
    }
    node = node.parentElement
  }
  return instance.layout.marginLeft + panelOffset + x + w / 2
}

/**
 * Resolve the y pixel for a given numeric value. Grouped-bar instances don't
 * expose a yScale field directly; we read it off any panel's axis tick or
 * fall back by linearly interpolating from a known bar's (value, top) pair.
 */
function valueToRootYFallback(instance: GroupedBarChartInstance, value: number): number {
  // Try to derive from existing bars: find any bar whose `data-value` is
  // finite and use its `top` + height to project.
  const bars = instance.mainBars().nodes() as SVGRectElement[]
  if (bars.length < 2) {
    return instance.layout.marginTop + instance.layout.plotHeight / 2
  }
  // Collect (value, top) pairs and fit a simple linear y = a*v + b using two
  // extremal samples (rough but adequate for ref-line placement).
  let minV = Number.POSITIVE_INFINITY
  let maxV = Number.NEGATIVE_INFINITY
  let yAtMin = 0
  let yAtMax = 0
  for (const rect of bars) {
    const v = Number(rect.getAttribute(DataAttributes.Value))
    if (!Number.isFinite(v)) continue
    const top = rectTopRootY(rect, instance)
    if (v < minV) {
      minV = v
      yAtMin = top
    }
    if (v > maxV) {
      maxV = v
      yAtMax = top
    }
  }
  if (!Number.isFinite(minV) || !Number.isFinite(maxV) || minV === maxV) {
    return instance.layout.marginTop + instance.layout.plotHeight / 2
  }
  const t = (value - minV) / (maxV - minV)
  return yAtMin + (yAtMax - yAtMin) * t
}

/**
 * grouped-bar retrieveValue applier.
 *
 * Forward (`targetAxis: 'x'`): highlight bars whose `data-target === target`
 *   (across all series) and label them with their value above the bar top.
 * Reverse (`targetAxis: 'y'`): draw a horizontal reference line at y=target
 *   across the plot, highlight all bars whose `data-value === target`, and
 *   label each with its category.
 */
export const retrieveValueApplier: OperationApplier<GroupedBarChartInstance> = {
  op: OperationOp.RetrieveValue,

  async apply({ operation, state, instance }: ApplierArgs<GroupedBarChartInstance>): Promise<ApplierResult> {
    const result = retrieveValue(state.workingData, operation)
    const isReverse = operation.targetAxis === 'y'
    console.info('[operation-new] grouped-bar applier:retrieveValue', {
      nodeId: operation.meta?.nodeId,
      target: operation.target,
      targetAxis: operation.targetAxis ?? 'x',
      resultLen: result.length,
    })
    const layer = instance.annotationLayer
    fadeRemoveAnnotations(layer, RETRIEVE_ANNOTATION_CLASS)
    if (result.length === 0) {
      return { result, nextState: { ...state, lastResult: result } }
    }

    const transitions: Promise<unknown>[] = []
    const allBars = instance.mainBars().nodes() as SVGRectElement[]

    if (isReverse) {
      const targetValue = Number(operation.target)
      const refY = valueToRootYFallback(instance, targetValue)
      const x1 = instance.layout.marginLeft
      const x2 = instance.layout.marginLeft + instance.layout.plotWidth
      transitions.push(
        drawReferenceLine({
          layer,
          cssClass: RETRIEVE_ANNOTATION_CLASS,
          x1,
          x2,
          y: refY,
          color: COLORS.ANNOTATION_RED,
          style: 'guideline',
          label: formatOperationValue(targetValue),
          svg: instance.svg,
          viewport: viewport(instance),
          anchorValue: targetValue,
        }).catch(() => undefined),
      )
      // Highlight every bar whose data-value matches target (across all
      // series and panels). Then label each with its category at the bar top.
      result.forEach((datum) => {
        const target = String(datum.target)
        const series = datum.group != null ? String(datum.group) : null
        allBars.forEach((rect) => {
          const rectTarget = rect.getAttribute(DataAttributes.Target)
          const rectSeries = rect.getAttribute(DataAttributes.Series)
          if (rectTarget !== target) return
          if (series != null && rectSeries !== series) return
          const cx = rectCenterRootX(rect, instance)
          const top = rectTopRootY(rect, instance)
          const labelNode = placeValueLabel({
            layer,
            svg: instance.svg,
            viewport: viewport(instance),
            preferred: { x: cx, y: top - 8 },
            text: String(datum.displayTarget ?? datum.target),
            className: RETRIEVE_ANNOTATION_CLASS,
            dataAttrs: [[DataAttributes.Target, target]],
          })
          transitions.push(
            labelNode
              .transition()
              .duration(DURATIONS.LABEL_FADE_IN)
              .style(SvgAttributes.Opacity, 1)
              .end()
              .catch(() => {}),
          )
        })
      })
    } else {
      // Forward: for each matched row find the matching bar by (target, series)
      // and label its value above.
      result.forEach((datum, index) => {
        const target = String(datum.target)
        const series = datum.group != null ? String(datum.group) : null
        allBars.forEach((rect) => {
          const rectTarget = rect.getAttribute(DataAttributes.Target)
          const rectSeries = rect.getAttribute(DataAttributes.Series)
          if (rectTarget !== target) return
          if (series != null && rectSeries !== series) return
          const cx = rectCenterRootX(rect, instance)
          const top = rectTopRootY(rect, instance)
          const value = Number(rect.getAttribute(DataAttributes.Value))
          const labelNode = placeValueLabel({
            layer,
            svg: instance.svg,
            viewport: viewport(instance),
            preferred: { x: cx, y: top - 10 - index * 16 },
            text: formatOperationValue(value),
            className: RETRIEVE_ANNOTATION_CLASS,
            dataAttrs: [[DataAttributes.Target, target]],
          })
          transitions.push(
            labelNode
              .transition()
              .duration(DURATIONS.LABEL_FADE_IN)
              .style(SvgAttributes.Opacity, 1)
              .end()
              .catch(() => {}),
          )
        })
      })
    }

    await Promise.all(transitions)

    return {
      result,
      nextState: {
        ...state,
        lastResult: result,
        annotationRecords: [
          ...state.annotationRecords,
          { cssClass: RETRIEVE_ANNOTATION_CLASS, role: 'result', persistent: false },
        ],
      },
    }
  },
}

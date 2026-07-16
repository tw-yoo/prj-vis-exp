import { retrieveValue } from '../../../domain/operation/dataOps'
import { OperationOp } from '../../../domain/operation/types'
import { DataAttributes, SvgAttributes } from '../../../rendering/interfaces'
import { COLORS, DURATIONS, EASINGS } from '../../../rendering/common/d3Helpers'
import { formatOperationValue } from '../../../operation-next/primitives/formatValue'
import type { OperationApplier, ApplierArgs, ApplierResult } from '../../applier'
import type { StackedBarChartInstance } from '../../../rendering-new/instances/stackedBarInstance'
import { fadeRemoveAnnotations } from '../../primitives/fadeRemove'
import { drawReferenceLine } from '../../primitives/drawReferenceLine'
import { drawRegionHighlight } from '../../primitives/drawRegionHighlight'
import { readNumberAttr, type AnnotationViewport } from '../../primitives/annotationLayer'
import { placeValueLabel } from '../../primitives/placeValueLabel'

export const RETRIEVE_ANNOTATION_CLASS = 'operation-new-stacked-bar-retrieve-value'

function viewport(instance: StackedBarChartInstance, extraRight = 96): AnnotationViewport {
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

function rectTopRootY(rect: SVGRectElement, instance: StackedBarChartInstance): number {
  // For stacked bars each segment is positioned by its own `y` already
  // (relative to the panel). Negative-value segments extend downward from the
  // baseline; their *value-side top* is y + height.
  const y = readNumberAttr(rect, SvgAttributes.Y) ?? 0
  const height = readNumberAttr(rect, SvgAttributes.Height) ?? 0
  const value = Number(rect.getAttribute(DataAttributes.Value))
  const localTop = value >= 0 ? y : y + height
  return instance.layout.marginTop + localTop
}

function rectCenterRootX(rect: SVGRectElement, instance: StackedBarChartInstance): number {
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

/** Linear-fit fallback to derive a y pixel from a numeric value using
 *  observed (value, top) pairs from the rendered bars. Adequate for ref-line
 *  placement when the instance doesn't expose a yScale directly. */
function valueToRootYFallback(instance: StackedBarChartInstance, value: number): number {
  const bars = instance.mainBars().nodes() as SVGRectElement[]
  if (bars.length < 2) {
    return instance.layout.marginTop + instance.layout.plotHeight / 2
  }
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
 * stacked-bar retrieveValue applier.
 *
 * Forward: highlight the matching segment (by target + series if specified),
 *   value label above the segment top.
 * Reverse: horizontal ref line at y=target; matching segments highlighted
 *   with their category label.
 *
 * Note: for stacked bars, the y coordinate of a segment encodes its
 * **cumulative** stack position, not its raw value. The reverse-lookup label
 * still matches on segment value (which is the raw, not cumulative, datum
 * value); the ref line uses a linear fit across the visible y range, so it
 * sits near the value-line. Users targeting "what segment equals 50" should
 * read this as "segments whose own contribution is 50."
 */
export const retrieveValueApplier: OperationApplier<StackedBarChartInstance> = {
  op: OperationOp.RetrieveValue,

  async apply({ operation, state, instance }: ApplierArgs<StackedBarChartInstance>): Promise<ApplierResult> {
    const result = retrieveValue(state.workingData, operation)
    const isReverse = operation.targetAxis === 'y'
    console.info('[operation-new] stacked-bar applier:retrieveValue', {
      nodeId: operation.meta?.nodeId,
      target: operation.target,
      targetAxis: operation.targetAxis ?? 'x',
      resultLen: result.length,
    })
    const layer = instance.annotationLayer

    // Shared parent transition for per-bar label fade-ins + the stale
    // annotation fade-out. All labels appear on the same frame so the
    // selection feels like one coherent reveal (validation-page lockstep
    // idiom). drawReferenceLine has its own internal sequence (line draws
    // then label fades in over GUIDELINE_DRAW + LABEL_FADE_IN) — it runs
    // independently and is awaited alongside the parent via Promise.all.
    const labelParent = instance.createPhaseTransition(DURATIONS.LABEL_FADE_IN, EASINGS.SMOOTH)
    fadeRemoveAnnotations(layer, RETRIEVE_ANNOTATION_CLASS, undefined, labelParent)
    if (result.length === 0) {
      try { await labelParent.end() } catch { /* interrupted */ }
      return { result, nextState: { ...state, lastResult: result } }
    }

    const standaloneTransitions: Promise<unknown>[] = []
    const allBars = instance.mainBars().nodes() as SVGRectElement[]

    if (isReverse) {
      const targetValue = Number(operation.target)
      const refY = valueToRootYFallback(instance, targetValue)
      const x1 = instance.layout.marginLeft
      const x2 = instance.layout.marginLeft + instance.layout.plotWidth
      standaloneTransitions.push(
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
          placeValueLabel({
            layer,
            svg: instance.svg,
            viewport: viewport(instance),
            preferred: { x: cx, y: top - 8 },
            text: String(datum.displayTarget ?? datum.target),
            className: RETRIEVE_ANNOTATION_CLASS,
            dataAttrs: [[DataAttributes.Target, target]],
          })
            .transition(labelParent as never)
            .style(SvgAttributes.Opacity, 1)
        })
      })
    } else {
      // Highlight the retrieved column as a REGION band (spanning the plot
      // height) rather than recoloring the bar — a "which year" answer reads as
      // "this whole column is it". One band per target column (deduped).
      const highlightedTargets = new Set<string>()
      const { marginTop, plotHeight } = instance.layout
      result.forEach((datum, index) => {
        const target = String(datum.target)
        const series = datum.group != null ? String(datum.group) : null
        allBars.forEach((rect) => {
          const rectTarget = rect.getAttribute(DataAttributes.Target)
          const rectSeries = rect.getAttribute(DataAttributes.Series)
          if (rectTarget !== target) return
          if (series != null && rectSeries !== series) return
          const cx = rectCenterRootX(rect, instance)
          const w = readNumberAttr(rect, SvgAttributes.Width) ?? 0
          const top = rectTopRootY(rect, instance)
          if (!highlightedTargets.has(target)) {
            highlightedTargets.add(target)
            standaloneTransitions.push(
              drawRegionHighlight({
                layer,
                cssClass: RETRIEVE_ANNOTATION_CLASS,
                x0: cx - w / 2,
                x1: cx + w / 2,
                y0: marginTop,
                y1: marginTop + plotHeight,
                nodeId: operation.meta?.nodeId != null ? String(operation.meta.nodeId) : null,
              }).catch(() => undefined),
            )
          }
          const value = Number(rect.getAttribute(DataAttributes.Value))
          placeValueLabel({
            layer,
            svg: instance.svg,
            viewport: viewport(instance),
            preferred: { x: cx, y: top - 10 - index * 16 },
            text: formatOperationValue(value),
            className: RETRIEVE_ANNOTATION_CLASS,
            dataAttrs: [[DataAttributes.Target, target]],
          })
            .transition(labelParent as never)
            .style(SvgAttributes.Opacity, 1)
        })
      })
    }

    await Promise.all([
      labelParent.end().catch(() => undefined),
      ...standaloneTransitions,
    ])

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

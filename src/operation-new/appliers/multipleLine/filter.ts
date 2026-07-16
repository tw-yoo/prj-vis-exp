import * as d3 from 'd3'
import { filterData } from '../../../domain/operation/dataOps'
import { OperationOp, type DatumValue, type OperationSpec } from '../../../domain/operation/types'
import { DataAttributes, SvgAttributes, SvgClassNames, SvgElements } from '../../../rendering/interfaces'
import { COLORS, DURATIONS, EASINGS, OPACITIES } from '../../../rendering/common/d3Helpers'
import type { OperationApplier, ApplierArgs, ApplierResult } from '../../applier'
import {
  type MultipleLineChartInstance,
  multiLinePointKey,
} from '../../../rendering-new/instances/multipleLineInstance'
import { applyAnnotationContextFade } from '../../primitives/contextFade'
import { drawReferenceLine } from '../../primitives/drawReferenceLine'
import { drawRegionHighlight } from '../../primitives/drawRegionHighlight'
import { fadeRemoveAnnotations } from '../../primitives/fadeRemove'

export const FILTER_ANNOTATION_CLASS = 'operation-next-multiple-line-filter'
const FILTER_LINE_LAYER_CLASS = 'operation-next-multiple-line-filter-segments'

function normalizedDateTarget(value: string): string | null {
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString().slice(0, 10)
}

/**
 * Build a key-set covering every identity flavour the renderer's circles
 * might carry — target, id, and normalized-date target — combined with the
 * datum's series. Matches legacy `resultPointKeys`.
 */
function resultPointKeys(result: DatumValue[]): Set<string> {
  const keys = new Set<string>()
  result.forEach((datum) => {
    const series = String(datum.group ?? '')
    keys.add(multiLinePointKey(String(datum.target), series))
    if (datum.id != null) keys.add(multiLinePointKey(String(datum.id), series))
    const normalized = normalizedDateTarget(String(datum.target))
    if (normalized) keys.add(multiLinePointKey(normalized, series))
  })
  return keys
}

function resolveNumericThreshold(operation: OperationSpec, workingData: DatumValue[]): number | null {
  const rawValue = operation.value
  const numeric = Number(rawValue)
  if (Number.isFinite(numeric)) return numeric
  if (typeof rawValue === 'string' || typeof rawValue === 'number') {
    const match = workingData.find(
      (d) => String(d.target) === String(rawValue) || String(d.id) === String(rawValue),
    )
    if (match && Number.isFinite(Number(match.value))) return Number(match.value)
  }
  return null
}

/**
 * Infer the y-pixel position for a numeric value by reading the existing
 * y-axis tick positions from the DOM. Mirrors legacy `inferYForValue`. We
 * read tick text + transform instead of caching a yScale because the legacy
 * renderer doesn't expose its scale objects.
 */
function inferYForValue(svg: d3.Selection<SVGSVGElement, unknown, null, undefined>, value: number): number | null {
  const ticks = svg.select<SVGGElement>(`.${SvgClassNames.YAxis}`).selectAll<SVGGElement, unknown>('.tick').nodes()
  const samples: Array<{ value: number; y: number }> = []
  ticks.forEach((tick) => {
    const text = tick.querySelector('text')?.textContent
    const numericValue = Number(text?.replace(/[, ]/g, ''))
    if (!Number.isFinite(numericValue)) return
    const transform = tick.getAttribute('transform') ?? ''
    const match = transform.match(/translate\(\s*[^,]*,\s*([^)]+)\)/)
    const y = match ? Number(match[1]) : NaN
    if (!Number.isFinite(y)) return
    samples.push({ value: numericValue, y })
  })
  if (samples.length < 2) return null
  const a = samples[0]
  const b = samples.find((s) => s.value !== a.value)
  if (!b) return null
  const pixelsPerValue = (b.y - a.y) / (b.value - a.value)
  if (!Number.isFinite(pixelsPerValue)) return null
  return a.y + (value - a.value) * pixelsPerValue
}

interface SegmentLine {
  x1: number
  y1: number
  x2: number
  y2: number
}

interface LineSegmentsForSeries {
  parent: SVGGElement
  stroke: string
  strokeWidth: number
  segments: SegmentLine[]
}

/**
 * Compute the out-of-scope line segments per series so we can draw an overlay
 * that "ghosts" the parts of each line that are filtered out, without touching
 * the original `<path>` element. Mirrors legacy `drawFilterLineSegments`'s
 * geometry computation, but split into a pure function (compute) + a render
 * step (draw) so the draw step can share a parent transition with the point
 * salience fade.
 */
function computeFilterLineSegments(
  instance: MultipleLineChartInstance,
  remainingKeys: Set<string>,
): LineSegmentsForSeries[] {
  const out: LineSegmentsForSeries[] = []
  instance.mainLinePaths().each(function () {
    const linePath = this as SVGPathElement
    const parent = linePath.parentElement as SVGGElement | null
    if (!parent) return
    const series = linePath.getAttribute(DataAttributes.Series) ?? ''
    const points = d3
      .select(parent)
      .selectAll<SVGCircleElement, unknown>(
        `${SvgElements.Circle}[${DataAttributes.Target}], ${SvgElements.Circle}[${DataAttributes.Id}]`,
      )
      .filter(function () {
        return (this as SVGCircleElement).getAttribute(DataAttributes.Series) === series
      })
      .nodes()
      .map((point) => ({
        x: Number(point.getAttribute(SvgAttributes.CX)),
        y: Number(point.getAttribute(SvgAttributes.CY)),
        target: point.getAttribute(DataAttributes.Target) ?? point.getAttribute(DataAttributes.Id) ?? '',
        id: point.getAttribute(DataAttributes.Id) ?? '',
        series: point.getAttribute(DataAttributes.Series) ?? '',
      }))
      .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
    if (points.length < 2) return

    const segments: SegmentLine[] = []
    for (let i = 1; i < points.length; i += 1) {
      const prev = points[i - 1]
      const cur = points[i]
      const prevIn = remainingKeys.has(multiLinePointKey(prev.target, prev.series))
        || remainingKeys.has(multiLinePointKey(prev.id, prev.series))
      const curIn = remainingKeys.has(multiLinePointKey(cur.target, cur.series))
        || remainingKeys.has(multiLinePointKey(cur.id, cur.series))
      if (prevIn && curIn) continue
      segments.push({ x1: prev.x, y1: prev.y, x2: cur.x, y2: cur.y })
    }
    if (segments.length === 0) return

    const stroke = linePath.getAttribute(SvgAttributes.Stroke) || '#4f46e5'
    const strokeWidthAttr = Number(linePath.getAttribute(SvgAttributes.StrokeWidth))
    const strokeWidth = Number.isFinite(strokeWidthAttr) ? strokeWidthAttr : 2
    out.push({ parent, stroke, strokeWidth, segments })
  })
  return out
}

/**
 * Draws the out-of-scope segment overlay and rides the shared parent
 * transition so the fade-in is in lockstep with the point salience fade-out.
 * The "cover" line uses the chart background color to mask the underlying
 * (unmodified) main path; the "segment" line then ghosts the original color.
 */
function drawFilterSegmentOverlay(
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
  layers: LineSegmentsForSeries[],
  parentTransition: d3.Transition<d3.BaseType, unknown, d3.BaseType, unknown>,
): void {
  // Clear prior overlays before drawing the new one. Use interrupt() to
  // cancel any in-flight transitions on stale overlay elements.
  fadeRemoveAnnotations(svg as unknown as Parameters<typeof fadeRemoveAnnotations>[0], FILTER_LINE_LAYER_CLASS)

  for (const layer of layers) {
    // Find the first direct-child <circle> to insert before. We need a DIRECT
    // child because insertBefore throws if the reference node isn't a child.
    // Falls back to appendChild semantics (null reference) when none found —
    // happens e.g. after pairDiff focus restructures the line group.
    let beforeNode: ChildNode | null = null
    for (const child of Array.from(layer.parent.children)) {
      if (child.tagName.toLowerCase() === 'circle') {
        beforeNode = child
        break
      }
    }
    const newGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    layer.parent.insertBefore(newGroup, beforeNode)
    const segmentLayer = d3
      .select(newGroup)
      .attr(SvgAttributes.Class, FILTER_LINE_LAYER_CLASS)

    // Cover line (white-ish background) — fades in to mask the original path.
    segmentLayer
      .selectAll<SVGLineElement, SegmentLine>('line.filter-line-cover')
      .data(layer.segments)
      .enter()
      .append(SvgElements.Line)
      .attr(SvgAttributes.Class, 'filter-line-cover')
      .attr(SvgAttributes.X1, (s) => s.x1)
      .attr(SvgAttributes.Y1, (s) => s.y1)
      .attr(SvgAttributes.X2, (s) => s.x2)
      .attr(SvgAttributes.Y2, (s) => s.y2)
      .attr(SvgAttributes.Stroke, COLORS.LABEL_STROKE ?? '#ffffff')
      .attr(SvgAttributes.StrokeWidth, layer.strokeWidth + 2)
      .style(SvgAttributes.Opacity, 0)
      .transition(parentTransition as never)
      .style(SvgAttributes.Opacity, 1)

    // Ghost line (original color, low opacity) — final visible state for the
    // out-of-scope segments.
    segmentLayer
      .selectAll<SVGLineElement, SegmentLine>('line.filter-line-segment')
      .data(layer.segments)
      .enter()
      .append(SvgElements.Line)
      .attr(SvgAttributes.Class, 'filter-line-segment')
      .attr(SvgAttributes.X1, (s) => s.x1)
      .attr(SvgAttributes.Y1, (s) => s.y1)
      .attr(SvgAttributes.X2, (s) => s.x2)
      .attr(SvgAttributes.Y2, (s) => s.y2)
      .attr(SvgAttributes.Stroke, layer.stroke)
      .attr(SvgAttributes.StrokeWidth, layer.strokeWidth)
      .style(SvgAttributes.Opacity, 0)
      .transition(parentTransition as never)
      .style(SvgAttributes.Opacity, 0.25)
  }
}

export const filterApplier: OperationApplier<MultipleLineChartInstance> = {
  op: OperationOp.Filter,

  async apply({
    operation,
    state,
    instance,
  }: ApplierArgs<MultipleLineChartInstance>): Promise<ApplierResult> {
    const result = filterData(state.workingData, operation)
    console.info('[operation-new] multi-line applier:filter', {
      nodeId: operation.meta?.nodeId,
      operator: operation.operator,
      workingBefore: state.workingData.length,
      workingAfter: result.length,
    })

    const layer = instance.annotationLayer
    applyAnnotationContextFade(layer, state.annotationRecords, FILTER_ANNOTATION_CLASS)
    // nodeId-scoped cleanup: a re-run of the SAME filter node replaces its own
    // annotations, but another filter node's threshold line stays — chained
    // filters AND-compose (workingData flows through), so every prior bound is
    // still a live constraint. Legacy specs without nodeIds keep the
    // whole-class removal.
    const filterNodeId = typeof operation.meta?.nodeId === 'string' ? operation.meta.nodeId : null
    fadeRemoveAnnotations(
      layer,
      filterNodeId
        ? `${FILTER_ANNOTATION_CLASS}[${DataAttributes.AnnotationNodeId}="${filterNodeId}"]`
        : FILTER_ANNOTATION_CLASS,
    )

    const remainingKeys = resultPointKeys(result)

    // After pairDiff focus, the chart's line groups get restructured (focus
    // transform). Drawing the segment overlay assumes the original
    // group-per-series layout and breaks on the restructured DOM. Detect
    // post-pairDiff state and skip the overlay — salience-only is correct
    // for the diff-focused view.
    const isPostDerivedDiff =
      (state.derivedData !== null && state.derivedData.length > 0) ||
      state.workingData.some((d) => {
        const sm = (d as { semanticMeasure?: unknown }).semanticMeasure
        return typeof sm === 'string' && sm.startsWith('Δ')
      })

    // X-range filter (e.g. Year > 2014): the x axis RECOMPOSES to the
    // surviving targets (phase 2 below) — filtered years leave the axis and
    // the remaining points spread across the plot, mirroring simple-line's
    // filter rescale. The ghost-segment overlay is skipped for these: its
    // absolute-pixel segments would be orphaned by the recompose, and the
    // removed points leave the plot entirely anyway.
    const xFieldAttr = instance.svg.attr(DataAttributes.XField)
    const isXRangeFilter =
      typeof operation.field === 'string' && xFieldAttr != null && operation.field === xFieldAttr
    const layers =
      isPostDerivedDiff || isXRangeFilter ? [] : computeFilterLineSegments(instance, remainingKeys)

    // Post-pairDiff: pairDiff stamps result.group = "A-B" (combined series), but
    // the chart's DOM circles still carry the original data-series ("A" or "B").
    // Series-aware multiLinePointKey() will therefore miss every circle and dim
    // them all. Build a target-only scope (target + id) so the opacity callback
    // can match by axis position instead of series identity.
    const remainingTargets = isPostDerivedDiff
      ? new Set(
          result.flatMap((d) => {
            const out: string[] = [String(d.target)]
            if (d.id != null) out.push(String(d.id))
            const normalized = normalizedDateTarget(String(d.target))
            if (normalized) out.push(normalized)
            return out
          }),
        )
      : null

    // ----- Single shared transition: points fade + overlay fade together ---
    // We open the parent transition here, then route both the point opacity
    // fade (via the instance helper) and the segment overlay fade-in onto it.
    // Phase parity with the legacy "Phase 1a + Phase 1b" sequence, but now
    // riding one scheduler so they tick in lockstep.
    const parent = instance.svg
      .transition()
      .duration(DURATIONS.DIM)
      .ease(EASINGS.SMOOTH) as unknown as d3.Transition<d3.BaseType, unknown, d3.BaseType, unknown>

    // Apply point salience under the parent.
    const points = instance.pointMarks()
    if (!points.empty()) {
      points
        .interrupt('filter-scope')
        .transition(parent as never)
        .style(SvgAttributes.Opacity, function () {
          const node = this as SVGCircleElement
          const target = node.getAttribute(DataAttributes.Target) ?? ''
          const id = node.getAttribute(DataAttributes.Id) ?? ''
          if (remainingTargets) {
            const inScope = remainingTargets.has(target) || remainingTargets.has(id)
            return inScope ? OPACITIES.FULL : OPACITIES.DIM
          }
          const series = node.getAttribute(DataAttributes.Series) ?? ''
          const inScope = remainingKeys.has(multiLinePointKey(target, series))
            || remainingKeys.has(multiLinePointKey(id, series))
          return inScope ? OPACITIES.FULL : OPACITIES.DIM
        })
    }

    // Draw / fade-in the segment overlay under the same parent.
    drawFilterSegmentOverlay(instance.svg, layers, parent)

    // activeTargets propagates the in-scope set to downstream ops (and to
    // rehydrate on checkpoint restore). Use the target-only set in the
    // post-pairDiff branch so consumers don't have to know about the synthetic
    // "A-B" series key.
    instance.activeTargets = remainingTargets
      ? (remainingTargets.size > 0 ? new Set(remainingTargets) : null)
      : (remainingKeys.size > 0 ? new Set([...remainingKeys]) : null)
    instance.outOfScopeOpacity = OPACITIES.DIM

    try {
      await parent.end()
    } catch {
      /* interrupted */
    }

    // Region bands over the in-scope (qualifying) x-columns, IN ADDITION to the
    // point/line salience — the counted years read as highlighted regions, not
    // just recolored points. Skipped for x-range filters (their axis recomposes
    // below, so a band would land on stale coordinates).
    if (!isXRangeFilter || isPostDerivedDiff) {
      const inScopeCircle = (node: SVGCircleElement): boolean => {
        const target = node.getAttribute(DataAttributes.Target) ?? ''
        const id = node.getAttribute(DataAttributes.Id) ?? ''
        if (remainingTargets) return remainingTargets.has(target) || remainingTargets.has(id)
        const series = node.getAttribute(DataAttributes.Series) ?? ''
        return (
          remainingKeys.has(multiLinePointKey(target, series)) ||
          remainingKeys.has(multiLinePointKey(id, series))
        )
      }
      const circles = points.nodes() as SVGCircleElement[]
      const allCx = circles
        .map((n) => Number(n.getAttribute(SvgAttributes.CX)))
        .filter(Number.isFinite)
        .sort((a, b) => a - b)
      let minGap = Infinity
      for (let i = 1; i < allCx.length; i += 1) {
        const g = allCx[i] - allCx[i - 1]
        if (g > 0.5 && g < minGap) minGap = g
      }
      const halfBand = Number.isFinite(minGap) ? minGap * 0.42 : 16
      const { marginLeft, marginTop, plotHeight } = instance.layout
      const drawnX = new Set<number>()
      const bandPromises: Array<Promise<unknown>> = []
      circles.forEach((c) => {
        if (!inScopeCircle(c)) return
        const cx = Number(c.getAttribute(SvgAttributes.CX))
        if (!Number.isFinite(cx)) return
        const key = Math.round(cx)
        if (drawnX.has(key)) return
        drawnX.add(key)
        bandPromises.push(
          drawRegionHighlight({
            layer,
            cssClass: FILTER_ANNOTATION_CLASS,
            x0: marginLeft + cx - halfBand,
            x1: marginLeft + cx + halfBand,
            y0: marginTop,
            y1: marginTop + plotHeight,
            nodeId: filterNodeId,
            padX: 0,
          }).catch(() => undefined),
        )
      })
      await Promise.all(bandPromises)
    }

    // ----- Phase 2 (x-range filters): axis recompose --------------------
    // After the dim phase, narrow the x domain to the surviving targets:
    // filtered ticks leave the axis, in-scope points/lines slide to the new
    // slots, and the y axis rescales to the surviving values — one shared
    // transition inside transitionChartScale (no flicker). This also keeps
    // downstream ops honest: no dimmed off-scale points linger to stretch a
    // later recomputed y domain.
    if (isXRangeFilter && !isPostDerivedDiff) {
      const xScopeTargets = new Set(
        result.flatMap((d) => {
          const out: string[] = [String(d.target)]
          if (d.id != null) out.push(String(d.id))
          const normalized = normalizedDateTarget(String(d.target))
          if (normalized) out.push(normalized)
          return out
        }),
      )
      await instance.transitionChartScale({
        activeTargets: xScopeTargets,
        outOfScopeOpacity: OPACITIES.HIDDEN,
        duration: DURATIONS.AXIS_RESCALE,
      })
      instance.activeTargets = xScopeTargets.size > 0 ? xScopeTargets : null
    }

    // ----- Phase 2: threshold reference line (y-measure filters only) -----
    // Skip for x-range filters (e.g. Year>=2010, #10/#50): their value is an x
    // label, so inferYForValue would extrapolate it against the y-axis and draw
    // a spurious horizontal line + stray "2010"/"2015" label off the measure
    // scale (audit multiLine-10-xfilter-refline). Point dimming already conveys
    // scope. Only a filter targeting the y-measure field gets a threshold line.
    const yField = instance.svg.attr(DataAttributes.YField)
    const filterField = typeof operation.field === 'string' ? operation.field : null
    const isYMeasureFilter = filterField != null && yField != null && filterField === yField
    const threshold = isYMeasureFilter ? resolveNumericThreshold(operation, state.workingData) : null
    if (threshold != null) {
      const thresholdY = inferYForValue(instance.svg, threshold)
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
        // Stamp this node's id on the just-drawn line+label (the primitive has
        // no attr slot) so the nodeId-scoped cleanup above pairs them on re-run.
        if (filterNodeId) {
          layer
            .selectAll<SVGElement, unknown>(`.${FILTER_ANNOTATION_CLASS}`)
            .filter(function () {
              return this.getAttribute(DataAttributes.AnnotationNodeId) == null
            })
            .attr(DataAttributes.AnnotationNodeId, filterNodeId)
        }
      }
    }

    const nextSalienceMap = new Map<string, number>(
      result.map((d): [string, number] => [
        multiLinePointKey(String(d.target), String(d.group ?? '')),
        OPACITIES.FULL,
      ]),
    )

    return {
      result,
      nextState: {
        ...state,
        workingData: result,
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

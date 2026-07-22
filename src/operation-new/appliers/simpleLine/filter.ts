import { filterData } from '../../../domain/operation/dataOps'
import { OperationOp, type DatumValue, type OperationSpec } from '../../../domain/operation/types'
import { COLORS, DURATIONS, OPACITIES } from '../../../rendering/common/d3Helpers'
import { DataAttributes, SvgAttributes, SvgClassNames, SvgElements } from '../../../rendering/interfaces'
import type { OperationApplier, ApplierArgs, ApplierResult } from '../../applier'
import type { SimpleLineChartInstance } from '../../../rendering-new/instances/simpleLineInstance'
import { resolveAnnotationViewport } from '../../primitives/annotationLayer'
import { applyAnnotationContextFade } from '../../primitives/contextFade'
import {
  drawReferenceLine,
  transitionPersistentRefLines,
  REF_LINE_ANCHOR_VALUE_ATTR,
} from '../../primitives/drawReferenceLine'
import { fadeRemoveAnnotations } from '../../primitives/fadeRemove'

export const FILTER_ANNOTATION_CLASS = 'operation-next-line-filter'
const FILTER_HIGHLIGHT_R = 6

/**
 * Detect "value-based" filter — a filter that compares each datum's measure to
 * a threshold (e.g. `value < ref:n1`, `Index >= 100`, `Value != 0`). For these,
 * shrinking the line / rescaling axes would look like a brand-new chart, which
 * isn't what the viewer is looking at. We instead keep the chart layout intact
 * and highlight the matching points in red.
 *
 * Heuristic:
 *  - explicit `operator` (any comparator) → value-based.
 *  - filter `field` matches the y-measure field → value-based.
 *  - otherwise (categorical x include / exclude) → keep existing dim+rescale.
 */
function isValueBasedFilter(operation: OperationSpec, instance: SimpleLineChartInstance): boolean {
  const op = operation as OperationSpec & { operator?: unknown }
  const xField = instance.resolvedEncoding?.xField
  const yField = instance.resolvedEncoding?.yField
  // An operator on the X dimension is an x-range filter (e.g. Year <= 2008), NOT
  // a measure threshold — route it to the dim+rescale path so the x-axis zooms
  // to the range instead of staying full-width (audit simpleLine-9-2).
  if (typeof operation.field === 'string' && xField && operation.field === xField) return false
  if (typeof op.operator === 'string' && op.operator.trim().length > 0) return true
  if (yField && typeof operation.field === 'string' && operation.field === yField) return true
  return false
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

function computeYDomain(rows: DatumValue[]): [number, number] | null {
  if (rows.length === 0) return null
  const values = rows.map((d) => Number(d.value)).filter(Number.isFinite)
  if (values.length === 0) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  if (min === max) return [min, max + 1]
  return [min, max]
}

/**
 * Continuous X domain for the filtered subset. Ordinal/nominal returns null;
 * for those, `computeXLabelDomain` provides the in-scope label list instead.
 *
 * Reads xValue directly from the instance's pre-parsed RenderPoint to avoid
 * re-parsing the DatumValue.target string (instance already normalized it
 * during build).
 */
function computeXDomain(
  instance: SimpleLineChartInstance,
  rows: DatumValue[],
): [number, number] | [Date, Date] | null {
  const xType = instance.resolvedEncoding?.xType
  if (xType !== 'temporal' && xType !== 'quantitative') return null
  if (rows.length === 0) return null
  const targetSet = new Set(rows.map((d) => String(d.target)))
  const inScope = instance.points.filter((p) => targetSet.has(p.target))
  if (inScope.length === 0) return null
  if (xType === 'temporal') {
    const times = inScope
      .map((p) => (p.xValue instanceof Date ? p.xValue.getTime() : NaN))
      .filter(Number.isFinite)
    if (times.length === 0) return null
    return [new Date(Math.min(...times)), new Date(Math.max(...times))]
  }
  const nums = inScope.map((p) => Number(p.xValue)).filter(Number.isFinite)
  if (nums.length === 0) return null
  const min = Math.min(...nums)
  const max = Math.max(...nums)
  return [min, max === min ? max + 1 : max]
}

/**
 * In-scope ordinal/nominal x label domain. Returns the list of remaining
 * point labels (preserving their original sort order) so the x-axis can
 * narrow to just those — paired with `transitionChartScale`'s per-point cx
 * interpolation, this gives a smooth single motion where Y and X narrow
 * together.
 */
function computeXLabelDomain(
  instance: SimpleLineChartInstance,
  rows: DatumValue[],
): string[] | null {
  const xType = instance.resolvedEncoding?.xType
  if (xType === 'temporal' || xType === 'quantitative') return null
  if (rows.length === 0) return null
  const targetSet = new Set(rows.map((d) => String(d.target)))
  const inScopeLabels = instance.points
    .filter((p) => targetSet.has(p.target))
    .map((p) => p.xLabel)
  return inScopeLabels.length > 0 ? inScopeLabels : null
}

export const filterApplier: OperationApplier = {
  op: OperationOp.Filter,

  async apply({ operation, state, instance }: ApplierArgs): Promise<ApplierResult> {
    const result = filterData(state.workingData, operation)
    console.info('[operation-new] applier:filter', {
      nodeId: operation.meta?.nodeId,
      value: operation.value,
      operator: operation.operator,
      workingBefore: state.workingData.length,
      workingAfter: result.length,
    })
    const layer = instance.annotationLayer
    applyAnnotationContextFade(layer, state.annotationRecords, FILTER_ANNOTATION_CLASS)
    // nodeId-scoped cleanup: a re-run of the SAME filter node replaces its own
    // annotations, but another filter node's threshold line stays — chained
    // filters AND-compose (workingData flows through), so every prior bound is
    // still a live constraint (e.g. `>20` then `<=30` must show BOTH lines).
    // Legacy specs without nodeIds keep the whole-class removal.
    const filterNodeId = typeof operation.meta?.nodeId === 'string' ? operation.meta.nodeId : null
    fadeRemoveAnnotations(
      layer,
      filterNodeId
        ? `${FILTER_ANNOTATION_CLASS}[${DataAttributes.AnnotationNodeId}="${filterNodeId}"]`
        : FILTER_ANNOTATION_CLASS,
    )

    const remainingTargets = new Set(result.map((d) => String(d.target)))

    // -----------------------------------------------------------------------
    // 3-phase visual sequence so the viewer can read the steps separately:
    //   Phase 0 (optional): threshold ref line for value-based filter, drawn
    //     on the *original* scale so the user sees the cutoff before any
    //     marks move.
    //   Phase 1 (DIM): non-matching points fade to DIM opacity. No scale
    //     change yet — axes hold still while the excluded set is highlighted.
    //   Phase 2 (RESCALE+VANISH): the actual rescale of axes + line + points,
    //     with out-of-scope points sliding out to opacity 0 in the same
    //     shared transition so they don't leave a dim residue.
    // The threshold reference line is also slid to its new y in the same
    // rescale transition (see persistent ref-line tracking below).
    // -----------------------------------------------------------------------
    const originalYDomain = instance.yScale.domain() as [number, number]
    const yDomain = computeYDomain(result)
    const xDomain = computeXDomain(instance, result)
    const xLabelDomain = computeXLabelDomain(instance, result)
    const viewport = resolveAnnotationViewport(instance)
    const x1 = instance.layout.marginLeft
    const x2 = instance.layout.marginLeft + instance.layout.plotWidth

    // Phase 0: threshold reference line. Only meaningful for a Y-measure
    // threshold — a horizontal guide sits at yScale(threshold). An x-dimension
    // filter (e.g. `Year <= 2008`) has no y threshold: feeding the x value
    // 2008 through the y-scale yields a garbage off-plot coordinate (the
    // "weird values" bug). The x-axis rescale in Phase 2 already conveys the
    // range, so skip the guide entirely for x-dimension filters.
    const xField = instance.resolvedEncoding?.xField
    const isXDimFilter =
      typeof operation.field === 'string' && xField != null && operation.field === xField
    const threshold = isXDimFilter ? null : resolveNumericThreshold(operation, state.workingData)
    const valueBased = isValueBasedFilter(operation, instance)
    if (threshold != null && Number.isFinite(instance.yScale(threshold))) {
      const thresholdY = instance.layout.marginTop + instance.yScale(threshold)
      if (valueBased) {
        // Option A (reviewer: "필요한 숫자 텍스트 들만 보여야 함 / 텍스트 위치가
        // 잘못된 것으로 보임"): a value-based filter draws ONLY a faint dashed
        // guide at the cutoff — no numeric label. The y-axis ticks already
        // encode the cutoff; stacking threshold numbers (5.8 / 6.2 / 4.8 …) at
        // the plot's right edge beside the real answer (extremum / diff) reads
        // as competing, mispositioned "weird numbers".
        //
        // Drawn at full width with NO X2 draw-transition (a following op's
        // `interrupt()` used to freeze the animated line collapsed at x2=x1)
        // and with no deferred label (the label used to be appended only AFTER
        // the un-awaited line transition, so a subsequent filter's fadeRemove
        // ran before it existed and left an orphan — exactly the duplicated
        // 5.8 / 6.2 labels in the report). `anchorValue` keeps the faint guide
        // sliding with the axes on a later rescale.
        layer
          .append(SvgElements.Line)
          .attr(SvgAttributes.Class, `${SvgClassNames.LineAnnotation} ${FILTER_ANNOTATION_CLASS}`)
          .attr(DataAttributes.AnnotationNodeId, filterNodeId)
          .attr(SvgAttributes.X1, x1)
          .attr(SvgAttributes.X2, x2)
          .attr(SvgAttributes.Y1, thresholdY)
          .attr(SvgAttributes.Y2, thresholdY)
          .attr(SvgAttributes.Stroke, COLORS.ANNOTATION_RED)
          .attr(SvgAttributes.StrokeWidth, 2)
          .attr(SvgAttributes.StrokeDasharray, '4 4')
          .attr(REF_LINE_ANCHOR_VALUE_ATTR, String(threshold))
          .style(SvgAttributes.Opacity, 0)
          .transition()
          .duration(DURATIONS.LABEL_FADE_IN)
          .style(SvgAttributes.Opacity, OPACITIES.DIM)
      } else {
        // Categorical / non-value-based filter keeps the labelled guide and the
        // legacy ordering (await so the label settles before the marks move).
        await drawReferenceLine({
          layer,
          cssClass: FILTER_ANNOTATION_CLASS,
          x1,
          x2,
          y: thresholdY,
          label: String(threshold),
          svg: instance.svg,
          viewport,
          anchorValue: threshold,
        })
        // Stamp this node's id on the just-drawn line+label (the primitive has
        // no attr slot) so the nodeId-scoped cleanup above can pair them.
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

    // -----------------------------------------------------------------------
    // Value-based filter (e.g. `value < ref:n1`): the chart's axes / line
    // layout aren't supposed to change — what the viewer wants to read is
    // "which points satisfy the condition". Highlight the matching points
    // in red on top of the unchanged line; leave the rest at their original
    // styling. Skip the rescale path entirely.
    // -----------------------------------------------------------------------
    if (valueBased) {
      console.info('[operation-new] applier:filter value-based highlight branch', {
        matched: result.length,
        threshold,
      })
      if (!instance.pointMarks.empty()) {
        // Use direct attr/style assignment (not a d3 transition) — the value-
        // based highlight is a discrete state change (a point either matched
        // the condition or didn't), so an instant red flag reads more clearly
        // than a 600ms color tween, and it's robust against scheduler
        // interruptions when a follow-up op enters immediately.
        instance.pointMarks
          .interrupt('filter-value-highlight')
          .attr(SvgAttributes.Fill, function (d) {
            const el = this as SVGCircleElement
            // Remember the pre-highlight styling ONCE, then restore from it for
            // out-of-scope points. Without this, a point reddened by an earlier
            // chained filter that fails THIS filter kept its red fill — the
            // final frame showed more "matched" points than the count reports.
            if (!el.hasAttribute('data-base-fill')) {
              el.setAttribute('data-base-fill', el.getAttribute(SvgAttributes.Fill) ?? '')
            }
            const inScope = remainingTargets.has(String((d as { target?: unknown }).target ?? ''))
            return inScope ? COLORS.ANNOTATION_RED : el.getAttribute('data-base-fill') ?? ''
          })
          .attr(SvgAttributes.R, function (d) {
            const el = this as SVGCircleElement
            if (!el.hasAttribute('data-base-r')) {
              el.setAttribute('data-base-r', el.getAttribute(SvgAttributes.R) ?? '4')
            }
            const inScope = remainingTargets.has(String((d as { target?: unknown }).target ?? ''))
            return inScope ? FILTER_HIGHLIGHT_R : Number(el.getAttribute('data-base-r') ?? 4)
          })
          .style(SvgAttributes.Opacity, function (d) {
            const inScope = remainingTargets.has(String((d as { target?: unknown }).target ?? ''))
            return inScope ? OPACITIES.FULL : 0.85
          })
      }

      const nextSalienceMap = new Map<string, number>(
        result.map((d): [string, number] => [String(d.target), OPACITIES.FULL]),
      )
      const nextRecords = [
        ...state.annotationRecords,
        { cssClass: FILTER_ANNOTATION_CLASS, role: 'anchor' as const, persistent: true },
      ]
      return {
        result,
        nextState: {
          ...state,
          workingData: result,
          salienceMap: nextSalienceMap,
          lastResult: result,
          // No scaleState change — axes are untouched for value-based filter.
          annotationRecords: nextRecords,
        },
      }
    }

    // Phase 1: DIM only.
    await instance.transitionChartScale({
      activeTargets: remainingTargets,
      outOfScopeOpacity: OPACITIES.DIM,
      duration: DURATIONS.DIM,
    })

    // Phase 2: rescale + vanish. Out-of-scope points fade to 0 while in-scope
    // marks slide to the new domain. Persistent ref lines (incl. the threshold
    // drawn in Phase 0 + any prior average lines from earlier ops) are
    // shifted to their new y in lockstep via the same AXIS_RESCALE duration.
    //
    // Order matters: `transitionChartScale` mutates the yScale synchronously
    // (before its first await), so calling it *first* and then computing the
    // ref-line transitions ensures the new y values are derived from the new
    // scale — all transitions still launch in the same animation frame.
    const rescaleDuration = DURATIONS.AXIS_RESCALE
    const chartRescalePromise = instance.transitionChartScale({
      yDomain: yDomain ?? undefined,
      xDomain: xDomain ?? undefined,
      xLabelDomain: xLabelDomain ?? undefined,
      outOfScopeOpacity: OPACITIES.HIDDEN,
      duration: rescaleDuration,
    })
    const persistentRefTransitions = transitionPersistentRefLines({
      layer,
      yScale: instance.yScale,
      marginTop: instance.layout.marginTop,
      duration: rescaleDuration,
    })
    await Promise.all([chartRescalePromise, ...persistentRefTransitions])

    // Record the scale change for downstream ops that need to consult the
    // current vs. original domain (e.g. context annotations).
    let nextScaleState = state.scaleState
    if (yDomain) {
      const currentDomain = instance.yScale.domain() as [number, number]
      nextScaleState = {
        originalDomain: state.scaleState?.originalDomain ?? originalYDomain,
        currentDomain,
        rescaledBy: 'filter',
      }
    }

    const nextSalienceMap = new Map<string, number>(
      [...result.map((d): [string, number] => [String(d.target), OPACITIES.FULL])],
    )
    const nextRecords = [
      ...state.annotationRecords,
      { cssClass: FILTER_ANNOTATION_CLASS, role: 'anchor' as const, persistent: true },
    ]

    return {
      result,
      nextState: {
        ...state,
        workingData: result,
        salienceMap: nextSalienceMap,
        lastResult: result,
        scaleState: nextScaleState,
        annotationRecords: nextRecords,
      },
    }
  },
}

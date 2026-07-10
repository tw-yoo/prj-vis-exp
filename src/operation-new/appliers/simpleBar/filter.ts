import { filterData } from '../../../domain/operation/dataOps'
import { OperationOp, type DatumValue, type OperationSpec } from '../../../domain/operation/types'
import { RESULT_REF_ATTRIBUTE, operationResultRef } from '../../../operation-next/diffEndpoint'
import { DataAttributes } from '../../../rendering/interfaces'
import { DURATIONS, OPACITIES } from '../../../rendering/common/d3Helpers'
import type { OperationApplier, ApplierArgs, ApplierResult } from '../../applier'
import type { SimpleBarChartInstance } from '../../../rendering-new/instances/simpleBarInstance'
import { applyAnnotationContextFade } from '../../primitives/contextFade'
import { drawReferenceLine, transitionPersistentRefLines } from '../../primitives/drawReferenceLine'
import { fadeRemoveAnnotations } from '../../primitives/fadeRemove'
import {
  resolveFilterVisualDecision,
  type FilterVisualDecision,
} from '../../../operation-next/filterSaliencePolicy'
import type { FilterContext } from '../../../operation-next/chainState'
import { resolveBarAnnotationViewport } from './_shared'

export const FILTER_ANNOTATION_CLASS = 'operation-next-filter'

function uniqueTargets(rows: DatumValue[]) {
  const out: string[] = []
  const seen = new Set<string>()
  rows.forEach((row) => {
    const key = String(row.target)
    if (seen.has(key)) return
    seen.add(key)
    out.push(key)
  })
  return out
}

function buildFilterContext(
  decision: FilterVisualDecision,
  originalData: DatumValue[],
  filteredData: DatumValue[],
): FilterContext {
  const retainedTargets = uniqueTargets(filteredData)
  const retainedSet = new Set(retainedTargets)
  const removedTargets = uniqueTargets(originalData).filter((t) => !retainedSet.has(t))
  return {
    mode: decision.mode,
    reason: decision.reason,
    xKind: decision.xKind,
    isContiguous: decision.isContiguous,
    yDomainMode: decision.yDomainMode,
    retainedTargets,
    removedTargets,
  }
}

function hasPersistentAnnotations(state: { annotationRecords: Array<{ persistent: boolean }> }) {
  return state.annotationRecords.some((record) => record.persistent)
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
  let min = Math.min(...values)
  let max = Math.max(...values)
  // Bars always include zero so the baseline remains visually anchored.
  min = Math.min(min, 0)
  max = Math.max(max, 0)
  if (min === max) max = min + 1
  return [min, max]
}

/**
 * In-scope ordinal X label domain. Preserves the original sort order so x-axis
 * narrowing matches the visual bar ordering after the transition.
 */
function computeXLabelDomain(instance: SimpleBarChartInstance, rows: DatumValue[]): string[] | null {
  if (rows.length === 0) return null
  const targetSet = new Set(rows.map((d) => String(d.target)))
  const inScopeLabels = instance.barData.filter((b) => targetSet.has(b.target)).map((b) => b.target)
  return inScopeLabels.length > 0 ? inScopeLabels : null
}

export const filterApplier: OperationApplier<SimpleBarChartInstance> = {
  op: OperationOp.Filter,

  async apply({
    operation,
    state,
    instance,
    options,
    groupOps,
    groupOperationIndex,
    nextGroupHeadOp,
    runtimeSpec,
    chartType,
  }: ApplierArgs<SimpleBarChartInstance>): Promise<ApplierResult> {
    const result = filterData(state.workingData, operation)
    console.info('[operation-new] bar applier:filter', {
      nodeId: operation.meta?.nodeId,
      value: operation.value,
      operator: operation.operator,
      workingBefore: state.workingData.length,
      workingAfter: result.length,
    })

    // ----- Filter visual decision (dim vs remove) -----
    // Falls back to safe defaults if the dispatcher didn't pass group context.
    let decision: FilterVisualDecision = {
      mode: 'dim',
      reason: 'no group context — defaulting to dim',
      xKind: 'unknown',
      isContiguous: true,
      yDomainMode: 'preserve',
    }
    if (runtimeSpec && chartType && groupOps && groupOperationIndex != null) {
      // Cross-group lookahead: if this filter is the last op in its group and
      // a following group exists, append that group's head op so the policy's
      // nextOperation() sees it. Handles user-authored splits like
      // group1=[filter] / group2=[findExtremum] — without this, filter would
      // be classified as `leaf → dim` even though findExtremum is the real
      // next op.
      const isTail = groupOperationIndex === groupOps.length - 1
      const effectiveGroupOps = isTail && nextGroupHeadOp
        ? [...groupOps, nextGroupHeadOp]
        : groupOps
      const policyDecision = resolveFilterVisualDecision({
        spec: runtimeSpec,
        chartType,
        operation,
        filteredData: result,
        originalData: state.originalData,
        groupOps: effectiveGroupOps,
        operationIndex: groupOperationIndex,
        policy: options?.tensionPolicy,
      })
      // Mirror the legacy guard: if persistent annotations are already on the
      // layer, the chart can't safely remove bars without losing their
      // anchors, so stay in dim mode.
      decision = policyDecision.mode === 'remove' && hasPersistentAnnotations(state)
        ? { ...policyDecision, mode: 'dim', reason: `prior persistent annotation context; ${policyDecision.reason}` }
        : policyDecision
    }

    const layer = instance.annotationLayer
    applyAnnotationContextFade(layer, state.annotationRecords, FILTER_ANNOTATION_CLASS, options?.referencedResultIds)
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

    const remainingTargets = new Set(result.map((d) => String(d.target)))

    // -----------------------------------------------------------------------
    // 3-phase visual sequence — same for both 'dim' and 'remove' policy modes
    // so the viewer can read each step:
    //   Phase 0 (optional): threshold ref line for value-based filter, drawn
    //     on the *original* scale so the user sees the cutoff first.
    //   Phase 1 (DIM): non-matching bars fade to DIM opacity. No scale change.
    //   Phase 2 (RESCALE+VANISH): axes + in-scope bars rescale; out-of-scope
    //     bars fade to opacity 0 inside the same shared transition. Persistent
    //     ref lines from this op and prior ops slide to their new y in
    //     lockstep with the axis rescale.
    // The policy `decision.mode` is preserved in `filterContext` for downstream
    // ops that consult it; the visual outcome ends with the excluded bars
    // hidden either way (per repeated user feedback that lingering dim bars
    // are visually confusing once the chart has rescaled).
    // -----------------------------------------------------------------------
    // Split-aware y-axis lock: when the chart is mid-split (left/right
    // surfaces compared against the same parent scale), suppress this
    // surface's per-side y-rescale so both panels stay on the same y.
    // Honors the user's split-view rule (Korean):
    //   "splited view에서 filter를 하더라도 y축 re-scale은 하면 안됨."
    //
    // The x-axis is NOT covered by that rule — each surface should narrow
    // its own x-domain to the bars actually visible on it (otherwise the
    // out-of-scope bars hide but their x-axis ticks linger, which the
    // reviewer flagged on case 0s6zi9dyw22qo4rp). Compute xLabelDomain
    // unconditionally so the surface's x-axis tracks its in-scope bars.
    const splitLayoutType = options?.surfaceManager?.getLayout()?.type
    const lockYScale = splitLayoutType === 'split-horizontal' || splitLayoutType === 'split-vertical'
    const originalYDomain = instance.yScale.domain() as [number, number]
    const yDomain = lockYScale ? null : computeYDomain(result)
    const xLabelDomain = computeXLabelDomain(instance, result)
    const viewport = resolveBarAnnotationViewport(instance)
    const x1 = instance.layout.marginLeft
    const x2 = instance.layout.marginLeft + instance.layout.plotWidth
    console.info('[operation-new] bar applier:filter decision', {
      mode: decision.mode,
      reason: decision.reason,
    })

    // Phase 0: threshold ref line — ONLY for a filter on the Y MEASURE. An
    // x-axis-field filter (e.g. Year < 2000) compares a category/x value, so a
    // horizontal y-threshold is meaningless: `yScale(2000)` is finite but wildly
    // off-plot, which used to draw a stray "2000" label at the plot edge with a
    // nonsensical anchor-y (case 0w88bu7qm4ilsqmh). Such filters only narrow the
    // x-axis; no threshold line/label.
    const yField = instance.resolvedEncoding?.yField
    const isMeasureFilter = !operation.field || operation.field === yField
    const threshold = isMeasureFilter ? resolveNumericThreshold(operation, state.workingData) : null
    if (threshold != null && Number.isFinite(instance.yScale(threshold))) {
      const thresholdY = instance.layout.marginTop + instance.yScale(threshold)
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

    // Phase 1: DIM only (axes hold still).
    await instance.transitionChartScale({
      activeTargets: remainingTargets,
      outOfScopeOpacity: OPACITIES.DIM,
      duration: DURATIONS.DIM,
    })

    // Phase 2: rescale + vanish. `transitionChartScale` mutates the yScale
    // synchronously (pre-await), so calling it first then computing the
    // ref-line transitions ensures the new y values use the new scale —
    // every transition still launches in the same animation frame.
    const rescaleDuration = DURATIONS.AXIS_RESCALE
    const chartRescalePromise = instance.transitionChartScale({
      yDomain: yDomain ?? undefined,
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

    let nextScaleState = state.scaleState
    if (yDomain) {
      const currentDomain = instance.yScale.domain() as [number, number]
      nextScaleState = {
        originalDomain: state.scaleState?.originalDomain ?? originalYDomain,
        currentDomain,
        rescaledBy: 'filter',
      }
    }

    // Salience map: dim mode tracks per-target opacity (FULL for in-scope);
    // remove mode has no dim marks so the map stays empty.
    const nextSalienceMap = decision.mode === 'dim'
      ? new Map<string, number>(
          result.map((d): [string, number] => [String(d.target), OPACITIES.FULL]),
        )
      : new Map<string, number>()
    const filterResultRef = operationResultRef(operation)
    if (filterResultRef) {
      instance.annotationLayer
        .selectAll<SVGElement, unknown>(`.${FILTER_ANNOTATION_CLASS}`)
        .filter(function () {
          return !this.getAttribute(RESULT_REF_ATTRIBUTE)
        })
        .attr(RESULT_REF_ATTRIBUTE, filterResultRef)
    }
    const nextRecords = [
      ...state.annotationRecords,
      {
        cssClass: FILTER_ANNOTATION_CLASS,
        role: 'anchor' as const,
        persistent: true,
        operationId: filterResultRef == null ? undefined : String(filterResultRef),
        resultRef: filterResultRef == null ? undefined : String(filterResultRef),
      },
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
        filterContext: buildFilterContext(decision, state.originalData, result),
      },
    }
  },
}

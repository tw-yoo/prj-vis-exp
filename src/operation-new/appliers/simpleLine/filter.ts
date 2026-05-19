import * as d3 from 'd3'
import { filterData } from '../../../domain/operation/dataOps'
import { OperationOp, type DatumValue, type OperationSpec } from '../../../domain/operation/types'
import { SvgAttributes, SvgClassNames, SvgElements } from '../../../rendering/interfaces'
import { COLORS, DURATIONS, EASINGS, OPACITIES } from '../../../rendering/common/d3Helpers'
import type { OperationApplier, ApplierArgs, ApplierResult } from '../../applier'
import type { SimpleLineChartInstance } from '../../../rendering-new/instances/simpleLineInstance'
import { resolveAnnotationViewport } from '../../primitives/annotationLayer'
import { applyAnnotationContextFade } from '../../primitives/contextFade'
import { drawReferenceLine } from '../../primitives/drawReferenceLine'
import { placeOperationTextLabel } from '../../primitives/placeLabel'

export const FILTER_ANNOTATION_CLASS = 'operation-next-line-filter'

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

function formatScopeLabel(operation: OperationSpec, result: DatumValue[]) {
  if (operation.group != null && String(operation.group).trim() !== '') {
    return `Filtered: ${String(operation.group)}`
  }
  if (Array.isArray(operation.value) && operation.value.length > 0) {
    return `Filtered: ${operation.value.map(String).join(', ')}`
  }
  if (Array.isArray(operation.include) && operation.include.length > 0) {
    return `Filtered: ${operation.include.map(String).join(', ')}`
  }
  if (Array.isArray(operation.exclude) && operation.exclude.length > 0) {
    return `Excluded: ${operation.exclude.map(String).join(', ')}`
  }
  return `Filtered: ${result.length} values`
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
    layer.selectAll(`.${FILTER_ANNOTATION_CLASS}`).interrupt().remove()

    const remainingTargets = new Set(result.map((d) => String(d.target)))

    // -----------------------------------------------------------------------
    // Single shared-transition rescale (the d3 idiom from the reference
    // example). transitionChartScale opens one parent transition and rides
    // it for: axis ticks (X + Y), line `d`, in-scope point cx/cy + full
    // opacity, and out-of-scope point dim opacity. Every visual element
    // shares the same scheduler, so axis and marks stay perfectly aligned
    // through every animation frame — no Phase-1/Phase-2 split needed.
    // -----------------------------------------------------------------------
    const originalYDomain = instance.yScale.domain() as [number, number]
    const yDomain = computeYDomain(result)
    const xDomain = computeXDomain(instance, result)
    const xLabelDomain = computeXLabelDomain(instance, result)
    await instance.transitionChartScale({
      yDomain: yDomain ?? undefined,
      xDomain: xDomain ?? undefined,
      xLabelDomain: xLabelDomain ?? undefined,
      activeTargets: remainingTargets,
    })

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

    // ----- Phase 3: threshold ref line or scope label (drawn on the new scale) -----
    const threshold = resolveNumericThreshold(operation, state.workingData)
    const viewport = resolveAnnotationViewport(instance)
    const x1 = instance.layout.marginLeft
    const x2 = instance.layout.marginLeft + instance.layout.plotWidth

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
      })
    } else {
      const labelText = formatScopeLabel(operation, result)
      const preferred = { x: viewport.x + viewport.width - 4, y: Math.max(12, viewport.y + 16) }
      const labelNode = layer
        .append(SvgElements.Text)
        .attr(SvgAttributes.Class, `${SvgClassNames.TextAnnotation} ${FILTER_ANNOTATION_CLASS} scope-label`)
        .attr(SvgAttributes.X, preferred.x)
        .attr(SvgAttributes.Y, preferred.y)
        .attr(SvgAttributes.TextAnchor, 'end')
        .attr(SvgAttributes.FontSize, 12)
        .attr(SvgAttributes.FontWeight, 700)
        .attr(SvgAttributes.Fill, COLORS.TEXT_DARK)
        .style(SvgAttributes.Opacity, 0)
        .text(labelText)
      placeOperationTextLabel({
        svg: instance.svg,
        text: labelNode as unknown as d3.Selection<SVGTextElement, unknown, null, undefined>,
        preferred,
        viewport,
      })
      try {
        await labelNode
          .transition()
          .duration(DURATIONS.LABEL_FADE_IN)
          .ease(EASINGS.SMOOTH)
          .style(SvgAttributes.Opacity, 1)
          .end()
      } catch {
        /* interrupted */
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

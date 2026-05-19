import * as d3 from 'd3'
import { filterData } from '../../../domain/operation/dataOps'
import { OperationOp, type DatumValue, type OperationSpec } from '../../../domain/operation/types'
import { DataAttributes, SvgAttributes, SvgClassNames, SvgElements } from '../../../rendering/interfaces'
import { COLORS, DURATIONS, EASINGS, OPACITIES } from '../../../rendering/common/d3Helpers'
import type { OperationApplier, ApplierArgs, ApplierResult } from '../../applier'
import type { SimpleLineChartInstance } from '../../../rendering-new/instances/simpleLineInstance'
import { resolveAnnotationViewport } from '../../primitives/annotationLayer'
import { applyMarkSalience } from '../../primitives/markSalience'
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
 * Continuous X domain for the filtered subset. Ordinal/nominal x-axes return
 * null so the X axis stays put — categorical filters narrow scope via
 * activeTargets + line.defined() gaps, not by rescaling.
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
    const markSelection = instance.pointMarks as unknown as d3.Selection<SVGElement, unknown, d3.BaseType, unknown>
    const salienceP = applyMarkSalience({
      marks: markSelection,
      isInScope: (node) => {
        const target = node.getAttribute(DataAttributes.Target)
        return target != null && remainingTargets.has(target)
      },
    })

    // ----- Unified scale + visual-scope transition -----
    // Single op-agnostic call that synchronizes (a) Y rescale, (b) continuous
    // X rescale when applicable, and (c) the line.defined() activeTargets so
    // the line cleanly skips out-of-scope segments. All three changes share
    // one transition group → in-scope points smoothly slide to their new
    // positions while out-of-scope ones stay dimmed at the plot edge (clipped
    // by the plot-clip path).
    const originalYDomain = instance.yScale.domain() as [number, number]
    const yDomain = computeYDomain(result)
    const xDomain = computeXDomain(instance, result)
    // Always go through transitionChartScale, even when only activeTargets
    // changes — that way the line attrTween fires and the defined() gap
    // appears as part of the same coordinated motion.
    const transitionP = instance.transitionChartScale({
      yDomain: yDomain ?? undefined,
      xDomain: xDomain ?? undefined,
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

    // ----- Threshold ref line or scope label -----
    const threshold = resolveNumericThreshold(operation, state.workingData)
    const viewport = resolveAnnotationViewport(instance)
    const x1 = instance.layout.marginLeft
    const x2 = instance.layout.marginLeft + instance.layout.plotWidth
    let lineP: Promise<void> | null = null

    if (threshold != null && Number.isFinite(instance.yScale(threshold))) {
      // Position is computed from the NEW yScale domain (set synchronously
      // inside rescaleY before its transitions run), so the line is drawn at
      // the correct future position while rescale animates in parallel.
      const thresholdY = instance.layout.marginTop + instance.yScale(threshold)
      lineP = drawReferenceLine({
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
      lineP = labelNode
        .transition()
        .duration(DURATIONS.LABEL_FADE_IN)
        .ease(EASINGS.SMOOTH)
        .style(SvgAttributes.Opacity, 1)
        .end()
        .catch(() => {})
    }

    await Promise.all([salienceP, transitionP, lineP].filter(Boolean))

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

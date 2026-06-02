import * as d3 from 'd3'
import { findExtremum } from '../../../domain/operation/dataOps'
import { OperationOp, type OperationSpec, type DatumValue } from '../../../domain/operation/types'
import { DataAttributes, SvgAttributes, SvgClassNames, SvgElements } from '../../../rendering/interfaces'
import { COLORS, DURATIONS, EASINGS } from '../../../rendering/common/d3Helpers'
import { formatOperationValue } from '../../../operation-next/primitives/formatValue'
import type { OperationApplier, ApplierArgs, ApplierResult } from '../../applier'
import { readNumberAttr } from '../../primitives/annotationLayer'
import { applyAnnotationContextFade } from '../../primitives/contextFade'
import { fadeRemoveAnnotations } from '../../primitives/fadeRemove'
import type { MultipleLineChartInstance } from '../../../rendering-new/instances/multipleLineInstance'
import { FILTER_ANNOTATION_CLASS } from './filter'
import { LAG_DIFF_ANNOTATION_CLASS } from './lagDiff'
import { annotationViewport, findMultiLinePoint, pointMetrics } from './_shared'
import { placeValueLabel } from '../../primitives/placeValueLabel'

// PairDiff arrows use a distinct class set by the legacy pairDiff runner.
const PAIR_DIFF_ANNOTATION_CLASS = 'operation-next-multiple-line-pair-diff'

/**
 * Detect when findExtremum should operate over derived deltas (post lagDiff
 * or pairDiff) rather than raw working data. Mirrors legacy
 * `derivedDiffSource` — checks `derivedData` first, then falls back to
 * inspecting `workingData` for a Δ semantic-measure tag, which is the
 * pattern `stateWithOperationDependencies` produces when findExtremum
 * declares lagDiff/pairDiff as its input.
 */
function resolveDerivedDiffSource(state: {
  derivedData: DatumValue[] | null
  workingData: DatumValue[]
}): DatumValue[] | null {
  if (state.derivedData !== null && state.derivedData.length > 0) return state.derivedData
  const workingDataIsDerivedDiff = state.workingData.some((datum) => {
    const semanticMeasure = (datum as { semanticMeasure?: unknown }).semanticMeasure
    return typeof semanticMeasure === 'string' && semanticMeasure.startsWith('Δ')
  })
  return workingDataIsDerivedDiff ? state.workingData : null
}

export const EXTREMUM_ANNOTATION_CLASS = 'operation-next-multiple-line-extremum'

function operationNodeId(operation: OperationSpec): string | null {
  const raw = operation as OperationSpec & { id?: string | number; key?: string | number }
  const nodeId = operation.meta?.nodeId
  if (typeof nodeId === 'string' || typeof nodeId === 'number') return String(nodeId)
  if (raw.id != null) return String(raw.id)
  if (raw.key != null) return String(raw.key)
  return null
}

/**
 * Draw a "Max diff: N" / "Min diff: N" label anchored to the strengthened
 * lag-diff or pair-diff arrow for the extremum target. Mirrors the legacy
 * `annotateDerivedExtremumResult` so the chained derivedData → findExtremum
 * case has a visible value label, not only a thickened arrow.
 */
async function drawDerivedExtremumLabel(
  instance: MultipleLineChartInstance,
  datum: DatumValue,
  operation: OperationSpec,
  state: { annotationRecords: { cssClass: string; persistent?: boolean }[] },
) {
  const targetKey = String(datum.target)
  const value = Number(datum.value)
  if (!Number.isFinite(value)) return
  const layer = instance.annotationLayer
  applyAnnotationContextFade(layer, state.annotationRecords as never, FILTER_ANNOTATION_CLASS)
  fadeRemoveAnnotations(layer, EXTREMUM_ANNOTATION_CLASS)

  // Anchor the label to the strengthened arrow segment (pairDiff or lagDiff).
  const anchorLine = layer
    .selectAll<SVGLineElement, unknown>(
      `line.${PAIR_DIFF_ANNOTATION_CLASS}[data-target="${CSS.escape(targetKey)}"]:not(.arrow-head), line.${LAG_DIFF_ANNOTATION_CLASS}[data-target="${CSS.escape(targetKey)}"]:not(.arrow-head)`,
    )
    .nodes()[0]

  const viewport = annotationViewport(instance)
  let preferredX = viewport.x + viewport.width - 4
  let preferredY = Math.max(viewport.y + 16, instance.layout.marginTop + 16)
  let textAnchor: 'middle' | 'end' = 'end'
  if (anchorLine) {
    const x1 = readNumberAttr(anchorLine, SvgAttributes.X1)
    const y1 = readNumberAttr(anchorLine, SvgAttributes.Y1)
    const x2 = readNumberAttr(anchorLine, SvgAttributes.X2)
    const y2 = readNumberAttr(anchorLine, SvgAttributes.Y2)
    if (x1 != null && y1 != null && x2 != null && y2 != null) {
      preferredX = (x1 + x2) / 2
      preferredY = Math.max(instance.layout.marginTop + 12, Math.min(y1, y2) - 14)
      textAnchor = 'middle'
    }
  }

  const labelPrefix = operation.which === 'min' ? 'Min diff' : 'Max diff'
  const labelNode = layer
    .append(SvgElements.Text)
    .attr(SvgAttributes.Class, `${SvgClassNames.TextAnnotation} ${EXTREMUM_ANNOTATION_CLASS} derived-extremum-label`)
    .attr('data-target', targetKey)
    .attr(SvgAttributes.X, preferredX)
    .attr(SvgAttributes.Y, preferredY)
    .attr(SvgAttributes.TextAnchor, textAnchor)
    .attr(SvgAttributes.FontSize, 16)
    .attr(SvgAttributes.FontWeight, 800)
    .attr(SvgAttributes.Fill, COLORS.ANNOTATION_STRONG_RED)
    .style(SvgAttributes.Opacity, 0)
    .text(`${labelPrefix}: ${formatOperationValue(value)}`)

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

/**
 * Strengthen the lag-diff arrow segment for the extremum target so a chained
 * `lagDiff → findExtremum` produces a single emphasized arrow rather than
 * two separate annotations.
 */
async function strengthenArrowForTarget(
  instance: MultipleLineChartInstance,
  targetKey: string,
) {
  // Cover both arrow flavours — lagDiff (per-adjacent-pair) and pairDiff
  // (cross-series for a given x). Whichever the previous op drew, the same
  // target gets emphasized.
  const escaped = CSS.escape(targetKey)
  const arrowLines = instance.annotationLayer.selectAll<SVGLineElement, unknown>(
    `line.${LAG_DIFF_ANNOTATION_CLASS}[data-target="${escaped}"], line.${PAIR_DIFF_ANNOTATION_CLASS}[data-target="${escaped}"]`,
  )
  if (arrowLines.empty()) return
  try {
    await arrowLines
      .interrupt()
      .transition()
      .duration(DURATIONS.HIGHLIGHT)
      .ease(EASINGS.SMOOTH)
      .attr(SvgAttributes.StrokeWidth, 4)
      .attr(SvgAttributes.Stroke, COLORS.ANNOTATION_STRONG_RED)
      .end()
  } catch {
    /* interrupted */
  }
}

/**
 * multiple-line findExtremum applier.
 *
 * Visual: highlights the matching point (across all series) with a larger
 * red circle and a value label. Mirrors simple-line's pattern but uses the
 * multi-line point finder so the right series's circle is targeted.
 *
 * State branch: if a prior op produced `derivedData` (e.g. lagDiff), the
 * extremum is computed over those deltas and the matching lag-diff arrow
 * is strengthened instead of drawing a fresh annotation.
 */
export const findExtremumApplier: OperationApplier<MultipleLineChartInstance> = {
  op: OperationOp.FindExtremum,

  async apply({
    operation,
    state,
    instance,
  }: ApplierArgs<MultipleLineChartInstance>): Promise<ApplierResult> {
    console.info('[operation-new] multi-line applier:findExtremum', {
      nodeId: operation.meta?.nodeId,
      which: operation.which,
      hasDerivedData: state.derivedData !== null,
      workingLen: state.workingData.length,
    })

    const derivedSource = resolveDerivedDiffSource(state)
    if (derivedSource !== null) {
      const result = findExtremum(derivedSource, operation)
      const datum = result[0]
      if (datum != null) {
        await strengthenArrowForTarget(instance, String(datum.target))
        await drawDerivedExtremumLabel(instance, datum, operation, state)
      }
      return {
        result,
        nextState: {
          ...state,
          lastResult: result,
          annotationRecords: [
            ...state.annotationRecords,
            { cssClass: EXTREMUM_ANNOTATION_CLASS, role: 'result' as const, persistent: false },
          ],
        },
      }
    }

    const result = findExtremum(state.workingData, operation)
    const head = result[0]
    if (head == null) return { result, nextState: { ...state, lastResult: result } }
    const target = String(head.target)
    const series = head.group != null ? String(head.group) : ''

    const layer = instance.annotationLayer
    applyAnnotationContextFade(layer, state.annotationRecords, FILTER_ANNOTATION_CLASS)

    const nodeId = operationNodeId(operation)
    if (nodeId) {
      // Per-nodeId selective remove — same chained-extremum case as
      // simpleLine: a new extremum for this nodeId overrides the prior one,
      // but extremum annotations from sibling nodeIds (in a chained run)
      // stay put.
      layer
        .selectAll<SVGElement, unknown>(
          `.${EXTREMUM_ANNOTATION_CLASS}[${DataAttributes.AnnotationNodeId}="${CSS.escape(nodeId)}"]`,
        )
        .interrupt()
        .remove()
    } else {
      fadeRemoveAnnotations(layer, EXTREMUM_ANNOTATION_CLASS)
    }

    const point = findMultiLinePoint(instance, target, series)
    if (!point) return { result, nextState: { ...state, lastResult: result } }
    const metrics = pointMetrics(point, instance)

    const pointSel = d3.select(point) as unknown as d3.Selection<SVGCircleElement, unknown, null, undefined>
    const highlightPromise = pointSel
      .interrupt()
      .transition()
      .duration(DURATIONS.HIGHLIGHT)
      .attr(SvgAttributes.Fill, COLORS.ANNOTATION_RED)
      .attr(SvgAttributes.R, 6)
      .end()
      .catch(() => {})

    // Value label above the point, positioned by the shared collision-aware
    // placer (avoids other labels; stays near the point).
    const labelNode = placeValueLabel({
      layer,
      svg: instance.svg,
      viewport: annotationViewport(instance),
      preferred: { x: metrics.x, y: metrics.y - 12 },
      text: formatOperationValue(metrics.value),
      className: EXTREMUM_ANNOTATION_CLASS,
      dataAttrs: nodeId ? [[DataAttributes.AnnotationNodeId, nodeId]] : [],
    })
    const labelPromise = labelNode
      .transition()
      .duration(DURATIONS.LABEL_FADE_IN)
      .style(SvgAttributes.Opacity, 1)
      .end()
      .catch(() => {})

    await Promise.all([highlightPromise, labelPromise])

    return {
      result,
      nextState: {
        ...state,
        lastResult: result,
        annotationRecords: [
          ...state.annotationRecords,
          { cssClass: EXTREMUM_ANNOTATION_CLASS, role: 'result', persistent: false },
        ],
      },
    }
  },
}

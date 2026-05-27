import { findExtremum } from '../../../domain/operation/dataOps'
import { OperationOp, type OperationSpec } from '../../../domain/operation/types'
import { DataAttributes, SvgAttributes, SvgClassNames, SvgElements } from '../../../rendering/interfaces'
import { COLORS, DURATIONS, EASINGS } from '../../../rendering/common/d3Helpers'
import { formatOperationValue } from '../../../operation-next/primitives/formatValue'
import type { OperationApplier, ApplierArgs, ApplierResult } from '../../applier'
import { findPointByTarget, pointToRootCoords } from '../../primitives/annotationLayer'
import { applyAnnotationContextFade } from '../../primitives/contextFade'
import { fadeRemoveAnnotations } from '../../primitives/fadeRemove'
import { FILTER_ANNOTATION_CLASS } from './filter'
import { LAG_DIFF_ANNOTATION_CLASS } from './lagDiff'
import { DIFF_BY_VALUE_ANNOTATION_CLASS } from './diffByValue'
import type { SimpleLineChartInstance } from '../../../rendering-new/instances/simpleLineInstance'

const EXTREMUM_ANNOTATION_CLASS = 'operation-next-line-extremum'

function operationNodeId(operation: OperationSpec): string | null {
  const raw = operation as OperationSpec & { id?: string | number; key?: string | number }
  const nodeId = operation.meta?.nodeId
  if (typeof nodeId === 'string' || typeof nodeId === 'number') return String(nodeId)
  if (raw.id != null) return String(raw.id)
  if (raw.key != null) return String(raw.key)
  return null
}

/**
 * Strengthens the matching `data-target` annotation on whichever derived-shape
 * class the prior op drew (lagDiff arrows, diffByValue connectors). Dims all
 * other targets' annotations of the same class so the winner reads clearly.
 *
 * Source-of-truth for "which annotation class are we strengthening" is the
 * DOM: we try lagDiff first, then diffByValue. Whichever has non-empty
 * `[data-target]` lines is the active layer. If a chart has both (rare),
 * we union them — the winner gets emphasized across whatever was drawn.
 */
async function strengthenArrowForTarget(instance: SimpleLineChartInstance, targetKey: string) {
  const safeTarget = CSS.escape(targetKey)
  // Try both annotation classes simultaneously (lagDiff arrows + diffByValue
  // connectors). The winning target's matching elements get bolded; everyone
  // else with the same class gets dimmed.
  const classes = [LAG_DIFF_ANNOTATION_CLASS, DIFF_BY_VALUE_ANNOTATION_CLASS]
  const winnerSelector = classes.map((c) => `.${c}[data-target="${safeTarget}"]`).join(',')
  const allSelector = classes.map((c) => `.${c}[data-target]`).join(',')

  const winnerLines = instance.annotationLayer.selectAll<SVGLineElement, unknown>(`line${winnerSelector ? '' : ''}`).filter(function () {
    if (this.tagName.toLowerCase() !== 'line') return false
    const t = this.getAttribute('data-target')
    if (t !== targetKey) return false
    const cls = this.getAttribute('class') ?? ''
    return classes.some((c) => cls.includes(c))
  })
  const winnerTexts = instance.annotationLayer.selectAll<SVGTextElement, unknown>(`text`).filter(function () {
    if (this.tagName.toLowerCase() !== 'text') return false
    const t = this.getAttribute('data-target')
    if (t !== targetKey) return false
    const cls = this.getAttribute('class') ?? ''
    return classes.some((c) => cls.includes(c))
  })
  const dimLines = instance.annotationLayer.selectAll<SVGLineElement, unknown>(`line[data-target]`).filter(function () {
    if (this.tagName.toLowerCase() !== 'line') return false
    const t = this.getAttribute('data-target')
    if (t === targetKey) return false
    const cls = this.getAttribute('class') ?? ''
    return classes.some((c) => cls.includes(c))
  })
  const dimTexts = instance.annotationLayer.selectAll<SVGTextElement, unknown>(`text[data-target]`).filter(function () {
    if (this.tagName.toLowerCase() !== 'text') return false
    const t = this.getAttribute('data-target')
    if (t === targetKey) return false
    const cls = this.getAttribute('class') ?? ''
    return classes.some((c) => cls.includes(c))
  })

  console.info(
    `[operation-new] simpleLine findExtremum :: strengthenArrowForTarget\n${JSON.stringify(
      {
        targetKey,
        allSelector,
        matchedWinnerLines: winnerLines.size(),
        matchedWinnerTexts: winnerTexts.size(),
        dimLines: dimLines.size(),
        dimTexts: dimTexts.size(),
      },
      null,
      2,
    )}`,
  )

  if (winnerLines.empty() && winnerTexts.empty()) return
  try {
    await Promise.all([
      winnerLines
        .interrupt()
        .transition()
        .duration(DURATIONS.HIGHLIGHT)
        .ease(EASINGS.SMOOTH)
        .attr(SvgAttributes.StrokeWidth, 4)
        .attr(SvgAttributes.Stroke, COLORS.ANNOTATION_STRONG_RED)
        .style('opacity', 1)
        .end()
        .catch(() => undefined),
      winnerTexts
        .interrupt()
        .transition()
        .duration(DURATIONS.HIGHLIGHT)
        .ease(EASINGS.SMOOTH)
        .style('opacity', 1)
        .attr(SvgAttributes.Fill, COLORS.ANNOTATION_STRONG_RED)
        .attr(SvgAttributes.FontSize, 14)
        .end()
        .catch(() => undefined),
      dimLines
        .interrupt()
        .transition()
        .duration(DURATIONS.HIGHLIGHT)
        .ease(EASINGS.SMOOTH)
        .style('opacity', 0.3)
        .end()
        .catch(() => undefined),
      dimTexts
        .interrupt()
        .transition()
        .duration(DURATIONS.HIGHLIGHT)
        .ease(EASINGS.SMOOTH)
        .style('opacity', 0.3)
        .end()
        .catch(() => undefined),
    ])
  } catch {
    /* interrupted */
  }
}

export const findExtremumApplier: OperationApplier = {
  op: OperationOp.FindExtremum,

  async apply({ operation, state, instance }: ApplierArgs): Promise<ApplierResult> {
    // Inspect the annotation layer for prior lagDiff arrows. When the
    // findExtremum op runs in a *separate* `runChartOps` call from the
    // upstream lagDiff (review-tool/workbench split sentences across calls),
    // `stateWithOperationDependencies` populates `workingData` from the
    // referenced node's runtime result but RESETS `derivedData` to null
    // (executionState.ts:257). The state-only branch below misses that case
    // and falls through to "highlight max point on the line chart", which
    // is the bug reported on case 2jromeq5u9lloh1s.
    //
    // The DOM is the source-of-truth for "has this chart been transformed
    // by an upstream lagDiff?" — if there are lagDiff arrows on the layer,
    // the working data IS the lagDiff deltas (per the ref:n1 retrieval),
    // and findExtremum should strengthen the matching arrow.
    const hasLagDiffArrows = !instance.annotationLayer
      .select(`line.${LAG_DIFF_ANNOTATION_CLASS}[data-target]`)
      .empty()
    const hasDiffByValueAnnotations = !instance.annotationLayer
      .select(`line.${DIFF_BY_VALUE_ANNOTATION_CLASS}[data-target]`)
      .empty()
    console.info(
      `[operation-new] simpleLine findExtremum :: ENTRY\n${JSON.stringify(
        {
          nodeId: operation.meta?.nodeId,
          which: operation.which,
          hasDerivedData: state.derivedData !== null,
          hasLagDiffArrows,
          hasDiffByValueAnnotations,
          workingLen: state.workingData.length,
          workingSample: state.workingData.slice(0, 3).map((d) => ({ target: d.target, value: d.value })),
        },
        null,
        2,
      )}`,
    )
    // State-driven OR DOM-driven branch: prior lagDiff / diffByValue (or any
    // op that drew per-target derived annotations with `data-target`) is what
    // we should be ranking over.
    //
    // Source for the extremum data: prefer state.derivedData (single
    // runChartOps call, prior applier set it); fall back to state.workingData
    // (cross-call: stateWithOperationDependencies populated it from the
    // ref:nX runtime result but reset derivedData — see findExtremum.ts
    // history and case avwb8xstxx1lmfpk).
    if (state.derivedData !== null || hasLagDiffArrows || hasDiffByValueAnnotations) {
      const source = state.derivedData ?? state.workingData
      const result = findExtremum(source, operation)
      const targetKey = result[0]?.target
      console.info(
        `[operation-new] simpleLine findExtremum :: derived-shape branch\n${JSON.stringify(
          {
            sourceFrom: state.derivedData !== null ? 'state.derivedData' : 'state.workingData',
            sourceLen: source.length,
            winnerTarget: targetKey,
            winnerValue: result[0]?.value,
            triggeredBy: state.derivedData !== null
              ? 'derivedData'
              : hasLagDiffArrows
                ? 'lagDiff-DOM'
                : 'diffByValue-DOM',
          },
          null,
          2,
        )}`,
      )
      if (targetKey != null) {
        await strengthenArrowForTarget(instance, String(targetKey))
      }
      return { result, nextState: { ...state, lastResult: result } }
    }

    const result = findExtremum(state.workingData, operation)
    const target = result[0]?.target
    if (target == null) return { result, nextState: { ...state, lastResult: result } }

    const layer = instance.annotationLayer
    applyAnnotationContextFade(layer, state.annotationRecords, FILTER_ANNOTATION_CLASS)

    const nodeId = operationNodeId(operation)
    if (nodeId) {
      layer
        .selectAll<SVGElement, unknown>(
          `.${EXTREMUM_ANNOTATION_CLASS}[${DataAttributes.AnnotationNodeId}="${CSS.escape(nodeId)}"]`,
        )
        .interrupt()
        .remove()
    } else {
      fadeRemoveAnnotations(layer, EXTREMUM_ANNOTATION_CLASS)
    }

    const pointSel = findPointByTarget(instance, String(target))
    const point = pointSel.nodes()[0]
    if (!point) return { result, nextState: { ...state, lastResult: result } }
    const metrics = pointToRootCoords(point, instance)

    const highlightPromise = pointSel
      .interrupt()
      .transition()
      .duration(DURATIONS.HIGHLIGHT)
      .attr(SvgAttributes.Fill, COLORS.ANNOTATION_RED)
      .attr(SvgAttributes.R, 6)
      .end()
      .catch(() => {})

    // Place label above the point; if that would land above the chart's top
    // margin, flip below. No collision avoidance — SVG root has
    // overflow:visible, so the label can sit anywhere relative to the point
    // and remain visible even past the plot box.
    const naturalAbove = metrics.y - 12
    const labelMinY = instance.layout.marginTop + 12
    const labelY = naturalAbove >= labelMinY ? naturalAbove : metrics.y + 20
    const labelNode = layer
      .append(SvgElements.Text)
      .attr(SvgAttributes.Class, `${SvgClassNames.TextAnnotation} ${EXTREMUM_ANNOTATION_CLASS}`)
      .attr(SvgAttributes.X, metrics.x)
      .attr(SvgAttributes.Y, labelY)
      .attr(SvgAttributes.TextAnchor, 'middle')
      .attr(SvgAttributes.FontSize, 12)
      .attr(SvgAttributes.FontWeight, 700)
      .attr(SvgAttributes.Fill, COLORS.TEXT_DARK)
      .style(SvgAttributes.Opacity, 0)
      .text(formatOperationValue(metrics.value))
    if (nodeId) labelNode.attr(DataAttributes.AnnotationNodeId, nodeId)
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

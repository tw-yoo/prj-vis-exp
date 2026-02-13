import type { AutoDrawPlanContext } from '../../../../ops/common/executeDataOp.ts'
import type { DatumValue, TargetSelector } from '../../../../../types'
import type { DrawLineSpec, DrawOp } from '../../../../draw/types'
import { DrawComparisonOperators, DrawLineModes, DrawMark } from '../../../../draw/types'
import type { OpDiffSpec } from '../../../../../types/operationSpecs.ts'
import { drawOps } from '../../../../draw/drawOps'

const DEFAULT_HIGHLIGHT_COLOR = '#0f172a'
const DEFAULT_LINE_COLOR = '#0ea5e9'
const DEFAULT_LINE_OPACITY = 0.85
const DEFAULT_LINE_WIDTH = 2
const DEFAULT_SEGMENT_FILL = '#ef4444'
const DEFAULT_SEGMENT_STROKE = '#ef4444'
const DEFAULT_SEGMENT_OPACITY = 0.8
const DEFAULT_SEGMENT_STROKE_WIDTH = 1.5

function selectorToString(selector: TargetSelector | undefined): string | null {
  if (selector === undefined || selector === null) return null
  if (typeof selector === 'string' || typeof selector === 'number') return String(selector)
  if (typeof selector === 'object') {
    if (selector.target !== undefined && selector.target !== null) return String(selector.target)
    if (selector.id !== undefined && selector.id !== null) return String(selector.id)
    if (selector.category !== undefined && selector.category !== null) return String(selector.category)
  }
  return null
}

function toTargetList(selector: TargetSelector | TargetSelector[] | undefined): string[] {
  if (selector === undefined) return []
  const list = Array.isArray(selector) ? selector : [selector]
  return list
    .map((entry) => selectorToString(entry))
    .filter((value): value is string => value !== null)
}

function findDatumByTarget(
  data: DatumValue[],
  selectors: Array<string | number>,
  fallback?: (datum: DatumValue) => boolean,
): DatumValue | null {
  for (const selector of selectors) {
    const normalized = String(selector)
    for (const datum of data) {
      if (String(datum.target) === normalized) return datum
    }
  }
  if (fallback) {
    for (const datum of data) {
      if (fallback(datum)) return datum
    }
  }
  return null
}

export function buildSimpleBarDiffDrawPlan(
  _result: DatumValue[],
  op: OpDiffSpec,
  context?: AutoDrawPlanContext,
): DrawOp[] | null {
  if (!context || !context.prevWorking.length) return null
  const selectorsA = toTargetList(op.targetA)
  const selectorsB = toTargetList(op.targetB)
  if (!selectorsA.length || !selectorsB.length) return null
  const datumA = findDatumByTarget(context.prevWorking, selectorsA)
  const datumB = findDatumByTarget(context.prevWorking, selectorsB)
  if (!datumA || !datumB) return null
  const valueA = datumA.value
  const valueB = datumB.value
  if (!Number.isFinite(valueA) || !Number.isFinite(valueB)) return null
  const highlightColor = DEFAULT_HIGHLIGHT_COLOR
  const lineColor = DEFAULT_LINE_COLOR
  const lineOpacity = DEFAULT_LINE_OPACITY
  const lineStrokeWidth = DEFAULT_LINE_WIDTH
  const segmentFill = DEFAULT_SEGMENT_FILL
  const segmentStroke = DEFAULT_SEGMENT_STROKE
  const segmentOpacity = DEFAULT_SEGMENT_OPACITY
  const segmentStrokeWidth = DEFAULT_SEGMENT_STROKE_WIDTH
  const smallerDatum = valueA <= valueB ? datumA : datumB
  const largerDatum = valueA > valueB ? datumA : datumB
  const horizontalLineValue = Math.min(valueA, valueB)
  const plan: DrawOp[] = []

  const smallerTarget = String(smallerDatum.target)
  const largerTarget = String(largerDatum.target)
  const lineSpec: DrawLineSpec = {
    mode: DrawLineModes.HorizontalFromY,
    hline: { y: horizontalLineValue },
    style: {
      stroke: lineColor,
      strokeWidth: lineStrokeWidth,
      opacity: lineOpacity,
    },
  }

  plan.push(
    drawOps.highlight({
      chartId: op.chartId,
      select: { keys: [smallerTarget, largerTarget], mark: DrawMark.Rect },
      style: { color: highlightColor },
    }),
  )

  plan.push(
    drawOps.line({
      chartId: op.chartId,
      line: lineSpec,
    }),
  )

  const difference = Math.abs(valueA - valueB)
  if (difference > 0) {
    plan.push(
      drawOps.barSegment({
        chartId: op.chartId,
        select: { keys: [largerTarget], mark: DrawMark.Rect },
        segment: {
          threshold: horizontalLineValue,
          when: DrawComparisonOperators.Greater,
          style: {
            fill: segmentFill,
            stroke: segmentStroke,
            strokeWidth: segmentStrokeWidth,
            opacity: segmentOpacity,
          },
        },
      }),
    )
  }

  return plan
}

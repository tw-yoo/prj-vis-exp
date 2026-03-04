import { draw, ops } from '../../../../operation/build/authoring'
import { DrawMark, type DrawLineSpec, type DrawRectSpec, type DrawOp } from '../../types'
import { ChartType, type ChartTypeValue } from '../../../chartRenderer'
import type { BarSegmentCommit, DrawInteractionHit } from '../types'
import { formatDrawNumber } from '../../../ops/visual/helpers'

type SegmentStyleInput = {
  fill: string
  opacity: number
  stroke: string
  strokeWidth: number
}

export const createHighlightOp = (hit: DrawInteractionHit, color: string): DrawOp =>
  ops.draw.highlight(
    hit.chartId,
    draw.select.markKeys(
      hit.mark === 'rect' ? DrawMark.Rect : hit.mark === 'path' ? DrawMark.Path : DrawMark.Circle,
      hit.key,
    ),
    color,
  )

export const createDimOp = (hit: DrawInteractionHit, opacity: number): DrawOp =>
  ops.draw.dim(
    hit.chartId,
    draw.select.markKeys(
      hit.mark === 'rect' ? DrawMark.Rect : hit.mark === 'path' ? DrawMark.Path : DrawMark.Circle,
      hit.key,
    ),
    undefined,
    opacity,
  )

export const createLineTraceOp = (chartId: string | undefined, startKey: string, endKey: string): DrawOp =>
  ops.draw.lineTrace(chartId, draw.select.keys(startKey, endKey))

export const createFilterOp = (
  chartId: string | undefined,
  includeValues: Array<string | number>,
  excludeValues: Array<string | number>,
): DrawOp => {
  if (includeValues.length > 0) return ops.draw.filter(chartId, draw.filterSpec.xInclude(...includeValues))
  if (excludeValues.length > 0) return ops.draw.filter(chartId, draw.filterSpec.xExclude(...excludeValues))
  return ops.draw.filter(chartId, draw.filterSpec.xInclude())
}

export const createSplitOp = (
  groupAId: string,
  groupAValues: Array<string | number>,
  groupBId: string,
  orientation: 'vertical' | 'horizontal',
): DrawOp => ops.draw.split(undefined, draw.splitSpec.oneAndRest(groupAId, groupAValues, groupBId, orientation))

export const createUnsplitOp = (): DrawOp => ops.draw.unsplit()

export const createRectOp = (rectSpec: DrawRectSpec): DrawOp => ops.draw.rect(undefined, rectSpec)

export const createLineOp = (lineSpec: DrawLineSpec): DrawOp => ops.draw.line(undefined, lineSpec)

export const createTextOp = (
  value: string,
  x: number,
  y: number,
  color: string,
  fontSize: number,
): DrawOp => {
  const style = draw.style.text(color, fontSize, 700)
  return ops.draw.text(undefined, undefined, draw.textSpec.normalized(value, x, y, style))
}

export const createBarSegmentOp = (segment: BarSegmentCommit, style: SegmentStyleInput): DrawOp =>
  ops.draw.barSegment(
    segment.chartId,
    segment.keys,
    draw.segmentSpec.threshold(
      segment.threshold,
      segment.when,
      draw.style.segment(style.fill, style.stroke, style.strokeWidth, style.opacity),
    ),
  )

export const createClearOp = () => ops.draw.clear()

export type SeriesFilterMode = 'include' | 'exclude' | 'reset'

export const createSeriesFilterOp = (
  chartType: ChartTypeValue | null,
  chartId: string | undefined,
  series: Array<string | number>,
  mode: SeriesFilterMode,
): DrawOp | null => {
  if (chartType === ChartType.STACKED_BAR) {
    return ops.draw.stackedFilterGroups(chartId, series, mode)
  }
  if (chartType === ChartType.GROUPED_BAR) {
    return ops.draw.groupedFilterGroups(chartId, series, mode)
  }
  return null
}

export const createGroupedToStackedOp = (chartId?: string): DrawOp => ops.draw.groupedToStacked(chartId)

export const createStackedToGroupedOp = (chartId?: string): DrawOp => ops.draw.stackedToGrouped(chartId)

export const createMultiLineToStackedOp = (chartId?: string): DrawOp => ops.draw.multiLineToStacked(chartId)

export const createMultiLineToGroupedOp = (chartId?: string): DrawOp => ops.draw.multiLineToGrouped(chartId)

export const createStackedToSimpleOp = (series: string | number, chartId?: string): DrawOp =>
  ops.draw.stackedToSimple(chartId, series)

export const createGroupedToSimpleOp = (series: string | number, chartId?: string): DrawOp =>
  ops.draw.groupedToSimple(chartId, series)

export type GroupedCompareMacroArgs = {
  chartId?: string
  leftSeries: string
  rightSeries: string
  leftAverage: number
  rightAverage: number
}

export const createGroupedCompareMacroOps = (args: GroupedCompareMacroArgs): DrawOp[] => {
  const lineStyleA = draw.style.line('#dc2626', 2, 1)
  const lineStyleB = draw.style.line('#2563eb', 2, 1)
  const textStyle = draw.style.text('#111827', 12, 700)
  const diff = args.leftAverage - args.rightAverage
  const summary = `${args.leftSeries} avg=${formatDrawNumber(args.leftAverage)}, ${args.rightSeries} avg=${formatDrawNumber(args.rightAverage)}, diff=${formatDrawNumber(diff)}`
  return [
    createSeriesFilterOp(ChartType.GROUPED_BAR, args.chartId, [args.leftSeries, args.rightSeries], 'include') as DrawOp,
    ops.draw.line(args.chartId, draw.lineSpec.horizontalFromY(args.leftAverage, lineStyleA)),
    ops.draw.line(args.chartId, draw.lineSpec.horizontalFromY(args.rightAverage, lineStyleB)),
    ops.draw.text(args.chartId, undefined, draw.textSpec.normalized(summary, 0.03, 0.06, textStyle)),
  ]
}

export type StackedCompositionLabel = {
  id: string
  series: string
  percentage: number
}

export const createStackedCompositionLabelOps = (
  chartId: string | undefined,
  labels: StackedCompositionLabel[],
): DrawOp[] => {
  const textStyle = draw.style.text('#111827', 11, 700)
  return labels.map((label) =>
    ops.draw.text(
      chartId,
      draw.select.keys(label.id),
      draw.textSpec.anchor(`${label.series} ${formatDrawNumber(label.percentage, 1)}%`, textStyle, 0, -6),
    ),
  )
}

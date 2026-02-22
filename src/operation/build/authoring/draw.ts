import { drawOps } from '../../../rendering/draw/drawOps'
import {
  DrawComparisonOperators,
  DrawLineModes,
  DrawRectModes,
  DrawTextModes,
  type DrawArrowSpec,
  type DrawBarSegmentSpec,
  type DrawComparisonToken,
  type DrawFilterSpec,
  type DrawGroupFilterSpec,
  type DrawLineSpec,
  type DrawMark,
  type DrawOp,
  type DrawRectSpec,
  type DrawSelect,
  type DrawSortSpec,
  type DrawSplitSpec,
  type DrawStackGroupSpec,
  type DrawSumSpec,
  type DrawTextSpec,
} from '../../../rendering/draw/types'

export type LineStyleArgs = NonNullable<DrawLineSpec['style']>
export type SegmentStyleArgs = NonNullable<DrawBarSegmentSpec['style']>
export type RectStyleArgs = NonNullable<DrawRectSpec['style']>
export type TextStyleArgs = NonNullable<DrawTextSpec['style']>
export type ArrowStyleArgs = NonNullable<DrawArrowSpec['style']>
export type SelectBuilder = DrawSelect
export type GroupFilterMode = 'include' | 'exclude' | 'reset'

function optionalStyle(color?: string, opacity?: number) {
  if (color == null && opacity == null) return undefined
  return { color, opacity }
}

function buildGroupFilter(groups: Array<string | number>, mode: GroupFilterMode): DrawGroupFilterSpec {
  if (mode === 'reset') return { reset: true }
  if (mode === 'exclude') return { exclude: [...groups] }
  return { groups: [...groups] }
}

export const draw = {
  select: {
    keys(...keys: Array<string | number>): DrawSelect {
      return { keys: [...keys] }
    },
    markKeys(mark: DrawMark, ...keys: Array<string | number>): DrawSelect {
      return { mark, keys: [...keys] }
    },
  },

  style: {
    line(stroke: string, strokeWidth?: number, opacity?: number): LineStyleArgs {
      return { stroke, strokeWidth, opacity }
    },
    segment(fill: string, stroke?: string, strokeWidth?: number, opacity?: number): SegmentStyleArgs {
      return { fill, stroke, strokeWidth, opacity }
    },
    rect(fill: string, opacity?: number, stroke?: string, strokeWidth?: number): RectStyleArgs {
      return { fill, opacity, stroke, strokeWidth }
    },
    text(
      color: string,
      fontSize?: number,
      fontWeight?: string | number,
      fontFamily?: string,
      opacity?: number,
    ): TextStyleArgs {
      return { color, fontSize, fontWeight, fontFamily, opacity }
    },
    arrow(stroke?: string, fill?: string, strokeWidth?: number, opacity?: number): ArrowStyleArgs {
      return { stroke, fill, strokeWidth, opacity }
    },
  },

  arrow: {
    both(length?: number, width?: number, style?: ArrowStyleArgs): DrawArrowSpec {
      return { start: true, end: true, length, width, style }
    },
    startOnly(length?: number, width?: number, style?: ArrowStyleArgs): DrawArrowSpec {
      return { start: true, end: false, length, width, style }
    },
    endOnly(length?: number, width?: number, style?: ArrowStyleArgs): DrawArrowSpec {
      return { start: false, end: true, length, width, style }
    },
  },

  lineSpec: {
    normalized(
      startX: number,
      startY: number,
      endX: number,
      endY: number,
      style?: LineStyleArgs,
      arrow?: DrawArrowSpec,
    ): DrawLineSpec {
      return {
        position: {
          start: { x: startX, y: startY },
          end: { x: endX, y: endY },
        },
        style,
        arrow,
      }
    },
    horizontalFromY(y: number, style?: LineStyleArgs, arrow?: DrawArrowSpec): DrawLineSpec {
      return {
        mode: DrawLineModes.HorizontalFromY,
        hline: { y },
        style,
        arrow,
      }
    },
    connect(
      startX: string | number,
      endX: string | number,
      style?: LineStyleArgs,
      arrow?: DrawArrowSpec,
    ): DrawLineSpec {
      return {
        mode: DrawLineModes.Connect,
        pair: { x: [String(startX), String(endX)] },
        style,
        arrow,
      }
    },
    angle(
      axisX: string | number,
      axisY: number,
      angleDeg: number,
      length: number,
      style?: LineStyleArgs,
      arrow?: DrawArrowSpec,
    ): DrawLineSpec {
      return {
        mode: DrawLineModes.Angle,
        axis: { x: String(axisX), y: axisY },
        angle: angleDeg,
        length,
        style,
        arrow,
      }
    },
  },

  rectSpec: {
    normalized(
      centerX: number,
      centerY: number,
      width: number,
      height: number,
      style?: RectStyleArgs,
    ): DrawRectSpec {
      return {
        mode: DrawRectModes.Normalized,
        position: { x: centerX, y: centerY },
        size: { width, height },
        style,
      }
    },
    axisX(xLabel: string | number, style?: RectStyleArgs): DrawRectSpec {
      return {
        mode: DrawRectModes.Axis,
        axis: { x: String(xLabel) },
        style,
      }
    },
    axisY(y: number, style?: RectStyleArgs): DrawRectSpec {
      return {
        mode: DrawRectModes.Axis,
        axis: { y },
        style,
      }
    },
    dataPoint(xLabel: string | number, width: number, height: number, style?: RectStyleArgs): DrawRectSpec {
      return {
        mode: DrawRectModes.DataPoint,
        point: { x: String(xLabel) },
        size: { width, height },
        style,
      }
    },
  },

  textSpec: {
    anchor(
      value: string | Record<string, string>,
      textStyle?: TextStyleArgs,
      offsetX?: number,
      offsetY?: number,
    ): DrawTextSpec {
      return {
        value,
        mode: DrawTextModes.Anchor,
        offset: offsetX == null && offsetY == null ? undefined : { x: offsetX, y: offsetY },
        style: textStyle,
      }
    },
    normalized(
      value: string | Record<string, string>,
      x: number,
      y: number,
      textStyle?: TextStyleArgs,
      offsetX?: number,
      offsetY?: number,
    ): DrawTextSpec {
      return {
        value,
        mode: DrawTextModes.Normalized,
        position: { x, y },
        offset: offsetX == null && offsetY == null ? undefined : { x: offsetX, y: offsetY },
        style: textStyle,
      }
    },
  },

  segmentSpec: {
    threshold(
      threshold: number,
      when: DrawComparisonToken = DrawComparisonOperators.GreaterEqual,
      style?: SegmentStyleArgs,
    ): DrawBarSegmentSpec {
      return { threshold, when, style }
    },
  },

  filterSpec: {
    xInclude(...labels: Array<string | number>): DrawFilterSpec {
      return { x: { include: [...labels] } }
    },
    xExclude(...labels: Array<string | number>): DrawFilterSpec {
      return { x: { exclude: [...labels] } }
    },
    y(op: DrawComparisonToken, value: number): DrawFilterSpec {
      return { y: { op, value } }
    },
  },

  splitSpec: {
    two(
      groupAId: string,
      groupAKeys: Array<string | number>,
      groupBId: string,
      groupBKeys: Array<string | number>,
      orientation: DrawSplitSpec['orientation'] = 'vertical',
    ): DrawSplitSpec {
      return {
        by: 'x',
        groups: {
          [groupAId]: [...groupAKeys],
          [groupBId]: [...groupBKeys],
        },
        orientation,
      }
    },
    oneAndRest(
      groupAId: string,
      groupAKeys: Array<string | number>,
      restId: string,
      orientation: DrawSplitSpec['orientation'] = 'vertical',
    ): DrawSplitSpec {
      return {
        by: 'x',
        groups: {
          [groupAId]: [...groupAKeys],
        },
        restTo: restId,
        orientation,
      }
    },
  },

  sumSpec: {
    value(value: number, label?: string): DrawSumSpec {
      return { value, label }
    },
  },

  stackGroupSpec: {
    build(swapAxes?: boolean, xField?: string, colorField?: string): DrawStackGroupSpec {
      return { swapAxes, xField, colorField }
    },
  },
}

export const drawActions = {
  highlight(chartId?: string, select?: SelectBuilder, color?: string, opacity?: number): DrawOp {
    return drawOps.highlight({ chartId, select, style: optionalStyle(color, opacity) })
  },

  dim(chartId?: string, select?: SelectBuilder, color?: string, opacity?: number): DrawOp {
    return drawOps.dim({ chartId, select, style: optionalStyle(color, opacity) })
  },

  clear(chartId?: string): DrawOp {
    return drawOps.clear(chartId)
  },

  sleep(seconds: number, chartId?: string): DrawOp {
    return drawOps.sleep({ seconds, chartId })
  },

  line(chartId: string | undefined, lineSpec: DrawLineSpec): DrawOp {
    return drawOps.line({ chartId, line: lineSpec })
  },

  rect(chartId: string | undefined, rectSpec: DrawRectSpec): DrawOp {
    return drawOps.rect({ chartId, rect: rectSpec })
  },

  text(chartId: string | undefined, select: SelectBuilder | undefined, textSpec: DrawTextSpec): DrawOp {
    return drawOps.text({ chartId, select, text: textSpec })
  },

  barSegment(
    chartId: string | undefined,
    selectKeys: Array<string | number>,
    segmentSpec: DrawBarSegmentSpec,
  ): DrawOp {
    return drawOps.barSegment({ chartId, selectKeys, segment: segmentSpec })
  },

  filter(chartId: string | undefined, filterSpec: DrawFilterSpec): DrawOp {
    return drawOps.filter({ chartId, filter: filterSpec })
  },

  sort(
    chartId: string | undefined,
    by: DrawSortSpec['by'] = 'y',
    order: DrawSortSpec['order'] = 'asc',
  ): DrawOp {
    return drawOps.sort({ chartId, sort: { by, order } })
  },

  split(chartId: string | undefined, splitSpec: DrawSplitSpec): DrawOp {
    return drawOps.split({ chartId, split: splitSpec })
  },

  unsplit(chartId?: string): DrawOp {
    return drawOps.unsplit({ chartId })
  },

  lineTrace(chartId?: string, select?: SelectBuilder): DrawOp {
    return drawOps.lineTrace({ chartId, select })
  },

  lineToBar(chartId?: string): DrawOp {
    return drawOps.lineToBar({ chartId })
  },

  sum(chartId: string | undefined, sumSpec: DrawSumSpec): DrawOp {
    return drawOps.sum({ chartId, sum: sumSpec })
  },

  stackedToGrouped(chartId: string | undefined, stackGroupSpec?: DrawStackGroupSpec): DrawOp {
    return drawOps.stackedToGrouped({ chartId, stackGroup: stackGroupSpec ?? {} })
  },

  groupedToStacked(chartId: string | undefined, stackGroupSpec?: DrawStackGroupSpec): DrawOp {
    return drawOps.groupedToStacked({ chartId, stackGroup: stackGroupSpec ?? {} })
  },

  stackedFilterGroups(chartId: string | undefined, groups: Array<string | number>, mode: GroupFilterMode): DrawOp {
    return drawOps.stackedFilterGroups({
      chartId,
      groupFilter: buildGroupFilter(groups, mode),
    })
  },

  groupedFilterGroups(chartId: string | undefined, groups: Array<string | number>, mode: GroupFilterMode): DrawOp {
    return drawOps.groupedFilterGroups({
      chartId,
      groupFilter: buildGroupFilter(groups, mode),
    })
  },
}

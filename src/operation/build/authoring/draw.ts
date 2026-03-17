import { drawOps } from '../../../rendering/draw/drawOps'
import {
  DrawComparisonOperators,
  DrawLineModes,
  DrawRectModes,
  DrawTextModes,
  type DrawBandSpec,
  type DrawArrowSpec,
  type DrawBarSegmentSpec,
  type DrawComparisonToken,
  type DrawFilterSpec,
  type DrawGroupFilterSpec,
  type DrawLineSpec,
  type DrawMark,
  type DrawOp,
  type DrawRectSpec,
  type DrawScalarPanelSpec,
  type DrawSelect,
  type DrawSortSpec,
  type DrawSplitSpec,
  type DrawStackGroupSpec,
  type DrawSumSpec,
  type DrawTextSpec,
} from '../../../rendering/draw/types'
import type {
  DrawFilterSpecXExclude,
  DrawFilterSpecXInclude,
  DrawFilterSpecY,
  DrawLineSpecAngle,
  DrawLineSpecConnect,
  DrawLineSpecDiffBracket,
  DrawLineSpecHorizontalFromY,
  DrawLineSpecNormalized,
  DrawRectSpecAxisX,
  DrawRectSpecAxisY,
  DrawRectSpecDataPoint,
  DrawRectSpecNormalized,
  DrawSegmentSpecThreshold,
  DrawSelectKeys,
  DrawSelectMarkKeys,
  DrawSplitSpecOneAndRest,
  DrawSplitSpecTwo,
  DrawStackGroupSpecBuild,
  DrawSumSpecLabel,
  DrawSumSpecValue,
  DrawTextSpecAnchor,
  DrawTextSpecNormalized,
} from './drawAuthoringTypes'

export type {
  Brand,
  DrawFilterSpecXExclude,
  DrawFilterSpecXInclude,
  DrawFilterSpecY,
  DrawLineSpecAngle,
  DrawLineSpecConnect,
  DrawLineSpecDiffBracket,
  DrawLineSpecHorizontalFromY,
  DrawLineSpecNormalized,
  DrawRectSpecAxisX,
  DrawRectSpecAxisY,
  DrawRectSpecDataPoint,
  DrawRectSpecNormalized,
  DrawSegmentSpecThreshold,
  DrawSelectKeys,
  DrawSelectMarkKeys,
  DrawSplitSpecOneAndRest,
  DrawSplitSpecTwo,
  DrawStackGroupSpecBuild,
  DrawSumSpecLabel,
  DrawSumSpecValue,
  DrawTextSpecAnchor,
  DrawTextSpecNormalized,
} from './drawAuthoringTypes'

export type LineStyleArgs = NonNullable<DrawLineSpec['style']>
export type SegmentStyleArgs = NonNullable<DrawBarSegmentSpec['style']>
export type RectStyleArgs = NonNullable<DrawRectSpec['style']>
export type TextStyleArgs = NonNullable<DrawTextSpec['style']>
export type ArrowStyleArgs = NonNullable<DrawArrowSpec['style']>

/** @deprecated Prefer `DrawSelectKeys`/`DrawSelectMarkKeys` from `draw.select.*`. */
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
    keys(...keys: Array<string | number>): DrawSelectKeys {
      return { keys: [...keys] } as DrawSelectKeys
    },
    fieldKeys(field: string, ...keys: Array<string | number>): DrawSelectKeys {
      return { field, keys: [...keys] } as DrawSelectKeys
    },
    markKeys(mark: DrawMark, ...keys: Array<string | number>): DrawSelectMarkKeys {
      return { mark, keys: [...keys] } as DrawSelectMarkKeys
    },
    markFieldKeys(mark: DrawMark, field: string, ...keys: Array<string | number>): DrawSelectMarkKeys {
      return { mark, field, keys: [...keys] } as DrawSelectMarkKeys
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
    ): DrawLineSpecNormalized {
      return {
        position: {
          start: { x: startX, y: startY },
          end: { x: endX, y: endY },
        },
        style,
        arrow,
      } as DrawLineSpecNormalized
    },
    horizontalFromY(y: number, style?: LineStyleArgs, arrow?: DrawArrowSpec): DrawLineSpecHorizontalFromY {
      return {
        mode: DrawLineModes.HorizontalFromY,
        hline: { y },
        style,
        arrow,
      } as DrawLineSpecHorizontalFromY
    },
    connect(
      startX: string | number,
      endX: string | number,
      style?: LineStyleArgs,
      arrow?: DrawArrowSpec,
    ): DrawLineSpecConnect {
      return {
        mode: DrawLineModes.Connect,
        pair: { x: [String(startX), String(endX)] },
        style,
        arrow,
      } as DrawLineSpecConnect
    },
    connectBy(
      startTarget: string | number,
      endTarget: string | number,
      startSeries?: string | number,
      endSeries?: string | number,
      style?: LineStyleArgs,
      arrow?: DrawArrowSpec,
    ): DrawLineSpec {
      return {
        mode: DrawLineModes.Connect,
        connectBy: {
          start: { target: String(startTarget), series: startSeries },
          end: { target: String(endTarget), series: endSeries },
        },
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
    ): DrawLineSpecAngle {
      return {
        mode: DrawLineModes.Angle,
        axis: { x: String(axisX), y: axisY },
        angle: angleDeg,
        length,
        style,
        arrow,
      } as DrawLineSpecAngle
    },
    /**
     * Draws a vertical bracket at the right edge of the chart showing the difference between
     * two Y values (e.g. diff between two bars). Renders as:
     *   - a vertical line at normalizedX with arrowheads at both ends
     * Pair with `draw.lineSpec.normalized()` leader lines for a full bracket annotation.
     */
    diffBracket(
      startY: number,
      endY: number,
      style?: LineStyleArgs,
      arrow?: DrawArrowSpec,
      normalizedX?: number,
    ): DrawLineSpecDiffBracket {
      return {
        mode: DrawLineModes.DiffBracket,
        bracket: { startY, endY, normalizedX },
        style,
        arrow,
      } as DrawLineSpecDiffBracket
    },
  },

  rectSpec: {
    normalized(
      centerX: number,
      centerY: number,
      width: number,
      height: number,
      style?: RectStyleArgs,
    ): DrawRectSpecNormalized {
      return {
        mode: DrawRectModes.Normalized,
        position: { x: centerX, y: centerY },
        size: { width, height },
        style,
      } as DrawRectSpecNormalized
    },
    axisX(xLabel: string | number, style?: RectStyleArgs): DrawRectSpecAxisX {
      return {
        mode: DrawRectModes.Axis,
        axis: { x: String(xLabel) },
        style,
      } as DrawRectSpecAxisX
    },
    axisY(y: number, style?: RectStyleArgs): DrawRectSpecAxisY {
      return {
        mode: DrawRectModes.Axis,
        axis: { y },
        style,
      } as DrawRectSpecAxisY
    },
    dataPoint(xLabel: string | number, width: number, height: number, style?: RectStyleArgs): DrawRectSpecDataPoint {
      return {
        mode: DrawRectModes.DataPoint,
        point: { x: String(xLabel) },
        size: { width, height },
        style,
      } as DrawRectSpecDataPoint
    },
  },

  textSpec: {
    anchor(
      value: string | Record<string, string>,
      textStyle?: TextStyleArgs,
      offsetX?: number,
      offsetY?: number,
    ): DrawTextSpecAnchor {
      return {
        value,
        mode: DrawTextModes.Anchor,
        offset: offsetX == null && offsetY == null ? undefined : { x: offsetX, y: offsetY },
        style: textStyle,
      } as DrawTextSpecAnchor
    },
    normalized(
      value: string | Record<string, string>,
      x: number,
      y: number,
      textStyle?: TextStyleArgs,
      offsetX?: number,
      offsetY?: number,
    ): DrawTextSpecNormalized {
      return {
        value,
        mode: DrawTextModes.Normalized,
        position: { x, y },
        offset: offsetX == null && offsetY == null ? undefined : { x: offsetX, y: offsetY },
        style: textStyle,
      } as DrawTextSpecNormalized
    },
  },

  segmentSpec: {
    threshold(
      threshold: number,
      when: DrawComparisonToken = DrawComparisonOperators.GreaterEqual,
      style?: SegmentStyleArgs,
    ): DrawSegmentSpecThreshold {
      return { threshold, when, style } as DrawSegmentSpecThreshold
    },
  },

  filterSpec: {
    xInclude(...labels: Array<string | number>): DrawFilterSpecXInclude {
      return { x: { include: [...labels] } } as DrawFilterSpecXInclude
    },
    xExclude(...labels: Array<string | number>): DrawFilterSpecXExclude {
      return { x: { exclude: [...labels] } } as DrawFilterSpecXExclude
    },
    y(op: DrawComparisonToken, value: number): DrawFilterSpecY {
      return { y: { op, value } } as DrawFilterSpecY
    },
  },

  splitSpec: {
    two(
      groupAId: string,
      groupAKeys: Array<string | number>,
      groupBId: string,
      groupBKeys: Array<string | number>,
      orientation: NonNullable<DrawSplitSpec['orientation']> = 'vertical',
    ): DrawSplitSpecTwo {
      return {
        by: 'x',
        groups: {
          [groupAId]: [...groupAKeys],
          [groupBId]: [...groupBKeys],
        },
        orientation,
      } as DrawSplitSpecTwo
    },
    oneAndRest(
      groupAId: string,
      groupAKeys: Array<string | number>,
      restId: string,
      orientation: NonNullable<DrawSplitSpec['orientation']> = 'vertical',
    ): DrawSplitSpecOneAndRest {
      return {
        by: 'x',
        groups: {
          [groupAId]: [...groupAKeys],
        },
        restTo: restId,
        orientation,
      } as DrawSplitSpecOneAndRest
    },
  },

  sumSpec: {
    value(value: number, label?: string): DrawSumSpecValue {
      return { value, label } as DrawSumSpecValue
    },
    label(label?: string): DrawSumSpecLabel {
      return { label } as DrawSumSpecLabel
    },
  },

  scalarPanelSpec: {
    base(
      leftLabel: string,
      leftValue: number,
      rightLabel: string,
      rightValue: number,
      position?: DrawScalarPanelSpec['position'],
      style?: DrawScalarPanelSpec['style'],
    ): DrawScalarPanelSpec {
      return {
        mode: 'base',
        layout: 'inset',
        absolute: true,
        left: { label: leftLabel, value: leftValue },
        right: { label: rightLabel, value: rightValue },
        position,
        style,
      }
    },
    diff(
      leftLabel: string,
      leftValue: number,
      rightLabel: string,
      rightValue: number,
      deltaValue: number,
      deltaLabel = 'Δ',
      position?: DrawScalarPanelSpec['position'],
      style?: DrawScalarPanelSpec['style'],
    ): DrawScalarPanelSpec {
      return {
        mode: 'diff',
        layout: 'inset',
        absolute: true,
        left: { label: leftLabel, value: leftValue },
        right: { label: rightLabel, value: rightValue },
        delta: { label: deltaLabel, value: deltaValue },
        position,
        style,
      }
    },
    fullReplaceBase(
      leftLabel: string,
      leftValue: number,
      rightLabel: string,
      rightValue: number,
      style?: DrawScalarPanelSpec['style'],
    ): DrawScalarPanelSpec {
      return {
        mode: 'base',
        layout: 'full-replace',
        absolute: true,
        left: { label: leftLabel, value: leftValue },
        right: { label: rightLabel, value: rightValue },
        style,
      }
    },
    fullReplaceDiff(
      leftLabel: string,
      leftValue: number,
      rightLabel: string,
      rightValue: number,
      deltaValue: number,
      deltaLabel = 'Δ',
      style?: DrawScalarPanelSpec['style'],
    ): DrawScalarPanelSpec {
      return {
        mode: 'diff',
        layout: 'full-replace',
        absolute: true,
        left: { label: leftLabel, value: leftValue },
        right: { label: rightLabel, value: rightValue },
        delta: { label: deltaLabel, value: deltaValue },
        style,
      }
    },
  },

  stackGroupSpec: {
    build(swapAxes?: boolean, xField?: string, colorField?: string): DrawStackGroupSpecBuild {
      return { swapAxes, xField, colorField } as DrawStackGroupSpecBuild
    },
  },
} as const

function drawHighlight(
  chartId?: string,
  select?: DrawSelectKeys | DrawSelectMarkKeys,
  color?: string,
  opacity?: number,
): DrawOp
/** @deprecated Accepts raw DrawSelect. Prefer `draw.select.*` builders. */
function drawHighlight(chartId?: string, select?: DrawSelect, color?: string, opacity?: number): DrawOp
function drawHighlight(chartId?: string, select?: DrawSelect, color?: string, opacity?: number): DrawOp {
  return drawOps.highlight({ chartId, select, style: optionalStyle(color, opacity) })
}

function drawDim(
  chartId?: string,
  select?: DrawSelectKeys | DrawSelectMarkKeys,
  color?: string,
  opacity?: number,
): DrawOp
/** @deprecated Accepts raw DrawSelect. Prefer `draw.select.*` builders. */
function drawDim(chartId?: string, select?: DrawSelect, color?: string, opacity?: number): DrawOp
function drawDim(chartId?: string, select?: DrawSelect, color?: string, opacity?: number): DrawOp {
  return drawOps.dim({ chartId, select, style: optionalStyle(color, opacity) })
}

function drawClear(chartId?: string): DrawOp {
  return drawOps.clear(chartId)
}

/** @deprecated Legacy helper. New plans should rely on draw transition duration instead of sleep ops. */
function drawSleep(seconds: number, chartId?: string): DrawOp {
  return drawOps.sleep({ seconds, chartId })
}

function drawLine(
  chartId: string | undefined,
  lineSpec:
    | DrawLineSpecHorizontalFromY
    | DrawLineSpecConnect
    | DrawLineSpecAngle
    | DrawLineSpecNormalized
    | DrawLineSpecDiffBracket,
): DrawOp
/** @deprecated Accepts raw DrawLineSpec. Prefer `draw.lineSpec.*` builders. */
function drawLine(chartId: string | undefined, lineSpec: DrawLineSpec): DrawOp
function drawLine(chartId: string | undefined, lineSpec: DrawLineSpec): DrawOp {
  return drawOps.line({ chartId, line: lineSpec })
}

function drawRect(
  chartId: string | undefined,
  rectSpec: DrawRectSpecNormalized | DrawRectSpecAxisX | DrawRectSpecAxisY | DrawRectSpecDataPoint,
): DrawOp
/** @deprecated Accepts raw DrawRectSpec. Prefer `draw.rectSpec.*` builders. */
function drawRect(chartId: string | undefined, rectSpec: DrawRectSpec): DrawOp
function drawRect(chartId: string | undefined, rectSpec: DrawRectSpec): DrawOp {
  return drawOps.rect({ chartId, rect: rectSpec })
}

function drawText(
  chartId: string | undefined,
  select: DrawSelectKeys | DrawSelectMarkKeys | undefined,
  textSpec: DrawTextSpecAnchor | DrawTextSpecNormalized,
): DrawOp
/** @deprecated Accepts raw DrawSelect/DrawTextSpec. Prefer `draw.select.*` and `draw.textSpec.*` builders. */
function drawText(chartId: string | undefined, select: DrawSelect | undefined, textSpec: DrawTextSpec): DrawOp
function drawText(chartId: string | undefined, select: DrawSelect | undefined, textSpec: DrawTextSpec): DrawOp {
  return drawOps.text({ chartId, select, text: textSpec })
}

function drawBarSegment(
  chartId: string | undefined,
  selectKeys: Array<string | number>,
  segmentSpec: DrawSegmentSpecThreshold,
): DrawOp
/** @deprecated Accepts raw DrawBarSegmentSpec. Prefer `draw.segmentSpec.threshold(...)`. */
function drawBarSegment(chartId: string | undefined, selectKeys: Array<string | number>, segmentSpec: DrawBarSegmentSpec): DrawOp
function drawBarSegment(
  chartId: string | undefined,
  selectKeys: Array<string | number>,
  segmentSpec: DrawBarSegmentSpec,
): DrawOp {
  return drawOps.barSegment({ chartId, selectKeys, segment: segmentSpec })
}

function drawFilter(
  chartId: string | undefined,
  filterSpec: DrawFilterSpecY | DrawFilterSpecXInclude | DrawFilterSpecXExclude,
): DrawOp
/** @deprecated Accepts raw DrawFilterSpec. Prefer `draw.filterSpec.*` builders. */
function drawFilter(chartId: string | undefined, filterSpec: DrawFilterSpec): DrawOp
function drawFilter(chartId: string | undefined, filterSpec: DrawFilterSpec): DrawOp {
  return drawOps.filter({ chartId, filter: filterSpec })
}

function drawSort(
  chartId: string | undefined,
  by: DrawSortSpec['by'] = 'y',
  order: DrawSortSpec['order'] = 'asc',
): DrawOp {
  return drawOps.sort({ chartId, sort: { by, order } })
}

function drawSplit(chartId: string | undefined, splitSpec: DrawSplitSpecTwo | DrawSplitSpecOneAndRest): DrawOp
/** @deprecated Accepts raw DrawSplitSpec. Prefer `draw.splitSpec.*` builders. */
function drawSplit(chartId: string | undefined, splitSpec: DrawSplitSpec): DrawOp
function drawSplit(chartId: string | undefined, splitSpec: DrawSplitSpec): DrawOp {
  return drawOps.split({ chartId, split: splitSpec })
}

function drawUnsplit(chartId?: string): DrawOp {
  return drawOps.unsplit({ chartId })
}

function drawLineTrace(chartId?: string, select?: DrawSelectKeys | DrawSelectMarkKeys): DrawOp
/** @deprecated Accepts raw DrawSelect. Prefer `draw.select.*` builders. */
function drawLineTrace(chartId?: string, select?: DrawSelect): DrawOp
function drawLineTrace(chartId?: string, select?: DrawSelect): DrawOp {
  return drawOps.lineTrace({ chartId, select })
}

	function drawLineToBar(chartId?: string): DrawOp {
	  return drawOps.lineToBar({ chartId })
	}

	function drawMultiLineToStacked(chartId?: string): DrawOp {
	  return drawOps.multiLineToStacked({ chartId })
	}

	function drawMultiLineToGrouped(chartId?: string): DrawOp {
	  return drawOps.multiLineToGrouped({ chartId })
	}

	function drawSum(chartId: string | undefined, sumSpec: DrawSumSpecValue): DrawOp
	/** @deprecated Accepts raw DrawSumSpec. Prefer `draw.sumSpec.value(...)`. */
	function drawSum(chartId: string | undefined, sumSpec: DrawSumSpec): DrawOp
	function drawSum(chartId: string | undefined, sumSpec: DrawSumSpec): DrawOp {
  return drawOps.sum({ chartId, sum: sumSpec })
}

function drawStackedToGrouped(chartId: string | undefined, stackGroupSpec?: DrawStackGroupSpecBuild): DrawOp
/** @deprecated Accepts raw DrawStackGroupSpec. Prefer `draw.stackGroupSpec.build(...)`. */
function drawStackedToGrouped(chartId: string | undefined, stackGroupSpec?: DrawStackGroupSpec): DrawOp
function drawStackedToGrouped(chartId: string | undefined, stackGroupSpec?: DrawStackGroupSpec): DrawOp {
  return drawOps.stackedToGrouped({ chartId, stackGroup: stackGroupSpec ?? {} })
}

function drawGroupedToStacked(chartId: string | undefined, stackGroupSpec?: DrawStackGroupSpecBuild): DrawOp
/** @deprecated Accepts raw DrawStackGroupSpec. Prefer `draw.stackGroupSpec.build(...)`. */
function drawGroupedToStacked(chartId: string | undefined, stackGroupSpec?: DrawStackGroupSpec): DrawOp
function drawGroupedToStacked(chartId: string | undefined, stackGroupSpec?: DrawStackGroupSpec): DrawOp {
  return drawOps.groupedToStacked({ chartId, stackGroup: stackGroupSpec ?? {} })
}

function drawStackedToSimple(chartId: string | undefined, series: string | number): DrawOp {
  return drawOps.stackedToSimple({ chartId, toSimple: { series } })
}

function drawGroupedToSimple(chartId: string | undefined, series: string | number): DrawOp {
  return drawOps.groupedToSimple({ chartId, toSimple: { series } })
}

function drawStackedFilterGroups(chartId: string | undefined, groups: Array<string | number>, mode: GroupFilterMode): DrawOp {
  return drawOps.stackedFilterGroups({
    chartId,
    groupFilter: buildGroupFilter(groups, mode),
  })
}

function drawGroupedFilterGroups(chartId: string | undefined, groups: Array<string | number>, mode: GroupFilterMode): DrawOp {
  return drawOps.groupedFilterGroups({
    chartId,
    groupFilter: buildGroupFilter(groups, mode),
  })
}

function drawBand(
  chartId: string | undefined,
  axis: 'x' | 'y',
  range: [string | number, string | number],
  label?: string,
  style?: NonNullable<DrawBandSpec['style']>,
): DrawOp {
  return drawOps.band({ chartId, band: { axis, range, label, style } })
}

function drawScalarPanel(chartId: string | undefined, scalarPanelSpec: DrawScalarPanelSpec): DrawOp {
  return drawOps.scalarPanel({ chartId, scalarPanel: scalarPanelSpec })
}

export const drawActions = {
  highlight: drawHighlight,
  dim: drawDim,
  clear: drawClear,
  sleep: drawSleep,
  line: drawLine,
  rect: drawRect,
  text: drawText,
  barSegment: drawBarSegment,
  filter: drawFilter,
  sort: drawSort,
  split: drawSplit,
  unsplit: drawUnsplit,
  lineTrace: drawLineTrace,
  lineToBar: drawLineToBar,
  multiLineToStacked: drawMultiLineToStacked,
  multiLineToGrouped: drawMultiLineToGrouped,
  sum: drawSum,
  stackedToGrouped: drawStackedToGrouped,
  groupedToStacked: drawGroupedToStacked,
  stackedToSimple: drawStackedToSimple,
  groupedToSimple: drawGroupedToSimple,
  stackedFilterGroups: drawStackedFilterGroups,
  groupedFilterGroups: drawGroupedFilterGroups,
  band: drawBand,
  scalarPanel: drawScalarPanel,
} as const

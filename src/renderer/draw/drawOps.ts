import { OperationOp } from '../../types'
import {
  DrawAction,
  type DrawBarSegmentSpec,
  type DrawComparisonOperator,
  type DrawFilterSpec,
  type DrawGroupFilterSpec,
  type DrawLineSpec,
  type DrawOp,
  type DrawRectSpec,
  type DrawSelect,
  type DrawSortSpec,
  type DrawSplitSpec,
  type DrawStackGroupSpec,
  type DrawSumSpec,
  type DrawTextSpec,
} from './types'

type BaseDrawArgs = {
  chartId?: string
  select?: DrawSelect
  selectKeys?: Array<string | number>
}

type StyleArgs = {
  color?: string
  opacity?: number
}

const buildSelect = (args: BaseDrawArgs): DrawSelect | undefined => {
  if (args.select) return args.select
  if (args.selectKeys && args.selectKeys.length > 0) return { keys: args.selectKeys }
  return undefined
}

const buildDrawBase = (action: DrawAction, args: BaseDrawArgs = {}): DrawOp => ({
  op: OperationOp.Draw,
  action,
  chartId: args.chartId,
  select: buildSelect(args),
})

export type DrawHighlightArgs = BaseDrawArgs & { style?: StyleArgs }
export type DrawDimArgs = BaseDrawArgs & { style?: StyleArgs }
export type DrawTextArgs = BaseDrawArgs & { text: DrawTextSpec }
export type DrawRectArgs = BaseDrawArgs & { rect: DrawRectSpec }
export type DrawLineArgs = BaseDrawArgs & { line: DrawLineSpec }
export type DrawBarSegmentArgs = BaseDrawArgs & { segment: DrawBarSegmentSpec }
export type DrawFilterArgs = BaseDrawArgs & { filter: DrawFilterSpec }
export type DrawSortArgs = BaseDrawArgs & { sort: DrawSortSpec }
export type DrawSplitArgs = BaseDrawArgs & { split: DrawSplitSpec }
export type DrawSumArgs = BaseDrawArgs & { sum: DrawSumSpec }
export type DrawStackGroupArgs = BaseDrawArgs & { stackGroup: DrawStackGroupSpec }
export type DrawGroupFilterArgs = BaseDrawArgs & { groupFilter: DrawGroupFilterSpec }
export type DrawSleepArgs = BaseDrawArgs & { seconds?: number; duration?: number }

export const drawOps = {
  highlight(args: DrawHighlightArgs): DrawOp {
    const op = buildDrawBase(DrawAction.Highlight, args)
    if (args.style) op.style = args.style
    return op
  },

  dim(args: DrawDimArgs): DrawOp {
    const op = buildDrawBase(DrawAction.Dim, args)
    if (args.style) op.style = args.style
    return op
  },

  clear(chartId?: string): DrawOp {
    return buildDrawBase(DrawAction.Clear, { chartId })
  },

  text(args: DrawTextArgs): DrawOp {
    return { ...buildDrawBase(DrawAction.Text, args), text: args.text }
  },

  rect(args: DrawRectArgs): DrawOp {
    return { ...buildDrawBase(DrawAction.Rect, args), rect: args.rect }
  },

  line(args: DrawLineArgs): DrawOp {
    return { ...buildDrawBase(DrawAction.Line, args), line: args.line }
  },

  lineTrace(args: BaseDrawArgs = {}): DrawOp {
    return buildDrawBase(DrawAction.LineTrace, args)
  },

  barSegment(args: DrawBarSegmentArgs): DrawOp {
    return { ...buildDrawBase(DrawAction.BarSegment, args), segment: args.segment }
  },

  split(args: DrawSplitArgs): DrawOp {
    return { ...buildDrawBase(DrawAction.Split, args), split: args.split }
  },

  unsplit(args: BaseDrawArgs = {}): DrawOp {
    return buildDrawBase(DrawAction.Unsplit, args)
  },

  sort(args: DrawSortArgs): DrawOp {
    return { ...buildDrawBase(DrawAction.Sort, args), sort: args.sort }
  },

  filter(args: DrawFilterArgs): DrawOp {
    return { ...buildDrawBase(DrawAction.Filter, args), filter: args.filter }
  },

  sum(args: DrawSumArgs): DrawOp {
    return { ...buildDrawBase(DrawAction.Sum, args), sum: args.sum }
  },

  lineToBar(args: BaseDrawArgs = {}): DrawOp {
    return buildDrawBase(DrawAction.LineToBar, args)
  },

  stackedToGrouped(args: DrawStackGroupArgs): DrawOp {
    return { ...buildDrawBase(DrawAction.StackedToGrouped, args), stackGroup: args.stackGroup }
  },

  groupedToStacked(args: DrawStackGroupArgs): DrawOp {
    return { ...buildDrawBase(DrawAction.GroupedToStacked, args), stackGroup: args.stackGroup }
  },

  stackedFilterGroups(args: DrawGroupFilterArgs): DrawOp {
    return { ...buildDrawBase(DrawAction.StackedFilterGroups, args), groupFilter: args.groupFilter }
  },

  groupedFilterGroups(args: DrawGroupFilterArgs): DrawOp {
    return { ...buildDrawBase(DrawAction.GroupedFilterGroups, args), groupFilter: args.groupFilter }
  },

  sleep(args: DrawSleepArgs): DrawOp {
    const op = buildDrawBase(DrawAction.Sleep, args)
    if (args.seconds != null) op.seconds = args.seconds
    if (args.duration != null) op.duration = args.duration
    return op
  },

  fromAction(action: DrawAction, args: Record<string, unknown> = {}): DrawOp {
    switch (action) {
      case DrawAction.Highlight:
        return drawOps.highlight(args as DrawHighlightArgs)
      case DrawAction.Dim:
        return drawOps.dim(args as DrawDimArgs)
      case DrawAction.Clear:
        return drawOps.clear((args as BaseDrawArgs).chartId)
      case DrawAction.Text:
        return drawOps.text(args as DrawTextArgs)
      case DrawAction.Rect:
        return drawOps.rect(args as DrawRectArgs)
      case DrawAction.Line:
        return drawOps.line(args as DrawLineArgs)
      case DrawAction.LineTrace:
        return drawOps.lineTrace(args as BaseDrawArgs)
      case DrawAction.BarSegment:
        return drawOps.barSegment(args as DrawBarSegmentArgs)
      case DrawAction.Split:
        return drawOps.split(args as DrawSplitArgs)
      case DrawAction.Unsplit:
        return drawOps.unsplit(args as BaseDrawArgs)
      case DrawAction.Sort:
        return drawOps.sort(args as DrawSortArgs)
      case DrawAction.Filter:
        return drawOps.filter(args as DrawFilterArgs)
      case DrawAction.Sum:
        return drawOps.sum(args as DrawSumArgs)
      case DrawAction.LineToBar:
        return drawOps.lineToBar(args as BaseDrawArgs)
      case DrawAction.StackedToGrouped:
        return drawOps.stackedToGrouped(args as DrawStackGroupArgs)
      case DrawAction.GroupedToStacked:
        return drawOps.groupedToStacked(args as DrawStackGroupArgs)
      case DrawAction.StackedFilterGroups:
        return drawOps.stackedFilterGroups(args as DrawGroupFilterArgs)
      case DrawAction.GroupedFilterGroups:
        return drawOps.groupedFilterGroups(args as DrawGroupFilterArgs)
      case DrawAction.Sleep:
        return drawOps.sleep(args as DrawSleepArgs)
      default:
        return buildDrawBase(action, args as BaseDrawArgs)
    }
  },
} as const

export type DrawOpsFactory = typeof drawOps
export type DrawOpsComparisonOperator = DrawComparisonOperator

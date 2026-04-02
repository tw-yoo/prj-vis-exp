import { DrawAction, type DrawAction as DrawActionValue } from '../../rendering/draw/types'

export const STRUCTURAL_DRAW_ACTIONS = new Set<DrawActionValue>([
  DrawAction.Clear,
  DrawAction.Filter,
  DrawAction.Sort,
  DrawAction.Split,
  DrawAction.Unsplit,
  DrawAction.Sum,
  DrawAction.LineToBar,
  DrawAction.MultiLineToStacked,
  DrawAction.MultiLineToGrouped,
  DrawAction.StackedToGrouped,
  DrawAction.GroupedToStacked,
  DrawAction.StackedToSimple,
  DrawAction.GroupedToSimple,
  DrawAction.StackedToDiverging,
  DrawAction.StackedFilterGroups,
  DrawAction.GroupedFilterGroups,
])

export const REMOUNT_ALLOWED_DRAW_ACTIONS = new Set<DrawActionValue>([
  DrawAction.Split,
  DrawAction.Unsplit,
  DrawAction.LineToBar,
  DrawAction.MultiLineToStacked,
  DrawAction.MultiLineToGrouped,
  DrawAction.StackedToGrouped,
  DrawAction.GroupedToStacked,
  DrawAction.StackedToSimple,
  DrawAction.GroupedToSimple,
  DrawAction.StackedToDiverging,
])

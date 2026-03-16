import { DrawAction, type DrawAction as DrawActionValue } from '../../rendering/draw/types'

// Split/unsplit remains available for legacy/manual paths, but is not part of the active NLP linear flow.
export const LEGACY_SPLIT_DRAW_ACTIONS = new Set<DrawActionValue>([
  DrawAction.Split,
  DrawAction.Unsplit,
])

export const STRUCTURAL_DRAW_ACTIONS = new Set<DrawActionValue>([
  DrawAction.Clear,
  DrawAction.Filter,
  DrawAction.Sort,
  ...LEGACY_SPLIT_DRAW_ACTIONS,
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
  ...LEGACY_SPLIT_DRAW_ACTIONS,
  DrawAction.LineToBar,
  DrawAction.MultiLineToStacked,
  DrawAction.MultiLineToGrouped,
  DrawAction.StackedToGrouped,
  DrawAction.GroupedToStacked,
  DrawAction.StackedToSimple,
  DrawAction.GroupedToSimple,
  DrawAction.StackedToDiverging,
])

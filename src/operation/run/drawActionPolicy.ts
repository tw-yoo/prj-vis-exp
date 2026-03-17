import { DrawAction, type DrawAction as DrawActionValue } from '../../rendering/draw/types'

// Split/unsplit remains available behind an explicit legacy flag and is not part of the active NLP linear flow.
export const SPLIT_VIEW_ENABLED = false

const ACTIVE_SPLIT_DRAW_ACTIONS = SPLIT_VIEW_ENABLED
  ? ([DrawAction.Split, DrawAction.Unsplit] satisfies DrawActionValue[])
  : ([] satisfies DrawActionValue[])

export const LEGACY_SPLIT_DRAW_ACTIONS = new Set<DrawActionValue>(ACTIVE_SPLIT_DRAW_ACTIONS)

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

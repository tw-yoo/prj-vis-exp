import type { OperationSpec } from '../../types'
import {
  DrawLineModes,
  DrawRectModes,
  DrawTextModes,
  type DrawLineMode,
  type DrawRectMode,
  type DrawTextMode,
} from '../interfaces'

export const DrawAction = {
  Highlight: 'highlight',
  Dim: 'dim',
  Clear: 'clear',
  Text: 'text',
  Rect: 'rect',
  Line: 'line',
  LineTrace: 'line-trace',
  BarSegment: 'bar-segment',
  Split: 'split',
  Unsplit: 'unsplit',
  Sort: 'sort',
  Filter: 'filter',
  Sum: 'sum',
  LineToBar: 'line-to-bar',
  StackedToGrouped: 'stacked-to-grouped',
  GroupedToStacked: 'grouped-to-stacked',
  Sleep: 'sleep',
  StackedFilterGroups: 'stacked-filter-groups',
  GroupedFilterGroups: 'grouped-filter-groups',
} as const
export type DrawAction = (typeof DrawAction)[keyof typeof DrawAction]

export const DrawMark = {
  Rect: 'rect',
  Path: 'path',
  Circle: 'circle',
} as const
export type DrawMark = (typeof DrawMark)[keyof typeof DrawMark]

export type DrawSelect = {
  mark?: DrawMark
  keys?: Array<string | number>
}

export { DrawLineModes, DrawRectModes, DrawTextModes }
export type { DrawLineMode, DrawRectMode, DrawTextMode }

export type DrawTextSpec = {
  value: string | Record<string, string>
  mode?: DrawTextMode
  position?: { x: number; y: number }
  offset?: { x?: number; y?: number }
  style?: {
    color?: string
    fontSize?: number
    fontWeight?: string | number
    fontFamily?: string
    opacity?: number
  }
}

export type DrawRectSpec = {
  mode?: DrawRectMode
  position?: { x: number; y: number }
  axis?: { x?: string | string[]; y?: number | number[] }
  /** Used when mode = "data-point". Finds the mark by x label and uses its (x,y) data point as the center. */
  point?: { x: string | number }
  /** required for normalized mode; ignored for axis mode */
  size?: { width: number; height: number }
  style?: {
    fill?: string
    opacity?: number
    stroke?: string
    strokeWidth?: number
  }
}

export type DrawLineSpec = {
  mode?: DrawLineMode
  axis?: { x: string; y: number }
  pair?: { x: [string, string] }
  hline?: { x?: string; y?: number }
  angle?: number
  length?: number
  style?: {
    stroke?: string
    strokeWidth?: number
    opacity?: number
  }
  arrow?: DrawArrowSpec
}

export type DrawArrowSpec = {
  /** Draw an arrowhead at the start of the line (points along the line direction). */
  start?: boolean
  /** Draw an arrowhead at the end of the line (points along the line direction). */
  end?: boolean
  /** Length of the arrowward triangle in view-box units. */
  length?: number
  /** Width of the arrow base. */
  width?: number
  style?: {
    stroke?: string
    fill?: string
    strokeWidth?: number
    opacity?: number
  }
}

export type DrawSortSpec = {
  by?: 'x' | 'y'
  order?: 'asc' | 'desc'
}

export type DrawFilterSpec = {
  x?: { include?: Array<string | number>; exclude?: Array<string | number> }
  y?: { op: '>' | '<' | '>=' | '<=' | 'gt' | 'lt' | 'gte' | 'lte'; value: number }
}

export type DrawGroupFilterSpec = {
  /** Keep only this list of color series (matches the stacked chart color encoding). */
  groups?: Array<string | number>
  include?: Array<string | number>
  keep?: Array<string | number>
  /** Exclude a list of color series instead of keeping specific ones. */
  exclude?: Array<string | number>
  /** Re-render the original stacked dataset (remove any prior filtering). */
  reset?: boolean
}

export type DrawBarSegmentSpec = {
  threshold: number
  /**
   * Condition that defines the highlighted segment relative to `threshold`.
   * Example: `gte` highlights the portion of the bar where value >= threshold.
   */
  when?: '>' | '<' | '>=' | '<=' | 'gt' | 'lt' | 'gte' | 'lte'
  style?: { fill?: string; opacity?: number; stroke?: string; strokeWidth?: number }
}

export type DrawSplitSpec = {
  by?: 'x'
  /** User-defined group ids mapped to x labels. Provide 2 groups, or 1 group + restTo. */
  groups: Record<string, Array<string | number>>
  /** If only one group is provided, remaining labels go to this group id. */
  restTo?: string
  /** Layout direction of the two charts. */
  orientation?: 'vertical' | 'horizontal'
}

export type DrawSumSpec = {
  value: number
  label?: string
}

export type DrawStackGroupSpec = {
  swapAxes?: boolean
  xField?: string
  colorField?: string
}

export type DrawOp = OperationSpec & {
  action: DrawAction
  /** When the chart is split, targets a specific sub-chart group id. */
  chartId?: string
  select?: DrawSelect
  style?: { color?: string; opacity?: number }
  text?: DrawTextSpec
  rect?: DrawRectSpec
  line?: DrawLineSpec
  sum?: DrawSumSpec
  segment?: DrawBarSegmentSpec
  split?: DrawSplitSpec
  sort?: DrawSortSpec
  filter?: DrawFilterSpec
  stackGroup?: DrawStackGroupSpec
  groupFilter?: DrawGroupFilterSpec
  sleep?: { seconds?: number; duration?: number }
}

export type DrawSleepSpec = { seconds?: number; duration?: number }

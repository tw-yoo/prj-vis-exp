import type { OperationSpec } from '../../types'

export const DrawAction = {
  Highlight: 'highlight',
  Dim: 'dim',
  Clear: 'clear',
  Text: 'text',
  Rect: 'rect',
  Line: 'line',
  Sort: 'sort',
  Filter: 'filter',
} as const
export type DrawAction = (typeof DrawAction)[keyof typeof DrawAction]

export const DrawMark = {
  Rect: 'rect',
  Path: 'path',
} as const
export type DrawMark = (typeof DrawMark)[keyof typeof DrawMark]

export type DrawSelect = {
  mark?: DrawMark
  keys?: Array<string | number>
}

export type DrawTextMode = 'anchor' | 'normalized'

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

export type DrawRectMode = 'normalized' | 'axis'

export type DrawRectSpec = {
  mode?: DrawRectMode
  position?: { x: number; y: number }
  axis?: { x?: string; y?: number }
  size: { width: number; height: number }
  style?: {
    fill?: string
    opacity?: number
    stroke?: string
    strokeWidth?: number
  }
}

export type DrawLineSpec = {
  mode?: 'angle' | 'connect' | 'hline-x' | 'hline-y'
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
}

export type DrawSortSpec = {
  by?: 'x' | 'y'
  order?: 'asc' | 'desc'
}

export type DrawFilterSpec = {
  x?: { include?: Array<string | number>; exclude?: Array<string | number> }
  y?: { op: '>' | '<' | '>=' | '<=' | 'gt' | 'lt' | 'gte' | 'lte'; value: number }
}

export type DrawOp = OperationSpec & {
  action: DrawAction
  select?: DrawSelect
  style?: { color?: string; opacity?: number }
  text?: DrawTextSpec
  rect?: DrawRectSpec
  line?: DrawLineSpec
  sort?: DrawSortSpec
  filter?: DrawFilterSpec
}

import type { OperationSpec } from '../../types'

export const DrawAction = {
  Highlight: 'highlight',
  Dim: 'dim',
  Clear: 'clear',
} as const
export type DrawAction = (typeof DrawAction)[keyof typeof DrawAction]

export const DrawMark = {
  Rect: 'rect',
  Path: 'path',
} as const
export type DrawMark = (typeof DrawMark)[keyof typeof DrawMark]

export type DrawSelect = {
  mark?: DrawMark
  keys?: string[]
}

export type DrawOp = OperationSpec & {
  action: DrawAction
  select?: DrawSelect
  style?: { color?: string; opacity?: number }
}

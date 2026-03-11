export const DrawTextModes = {
  Anchor: 'anchor',
  Normalized: 'normalized',
} as const

export type DrawTextMode = (typeof DrawTextModes)[keyof typeof DrawTextModes]

export const DrawRectModes = {
  Normalized: 'normalized',
  Axis: 'axis',
  DataPoint: 'data-point',
} as const

export type DrawRectMode = (typeof DrawRectModes)[keyof typeof DrawRectModes]

export const DrawLineModes = {
  Angle: 'angle',
  Connect: 'connect',
  ConnectPanelScalar: 'connect-panel-scalar',
  HorizontalFromX: 'hline-x',
  HorizontalFromY: 'hline-y',
} as const

export type DrawLineMode = (typeof DrawLineModes)[keyof typeof DrawLineModes]

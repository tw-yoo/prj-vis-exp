import type { DrawMark } from '../types'

export const DrawInteractionTools = {
  None: 'none',
  Highlight: 'highlight',
  Dim: 'dim',
  Text: 'text',
  Rect: 'rect',
  Line: 'line',
  LineTrace: 'line-trace',
  Filter: 'filter',
  Split: 'split',
  SeriesFilter: 'series-filter',
  Convert: 'convert',
  BarSegment: 'bar-segment',
} as const

export type DrawInteractionTool = (typeof DrawInteractionTools)[keyof typeof DrawInteractionTools]

export type NormalizedPoint = {
  x: number
  y: number
}

export type PointerClientPoint = {
  x: number
  y: number
}

export type DrawInteractionHit = {
  element: SVGElement
  key: string
  targetKey: string
  seriesKey?: string
  mark: DrawMark
  chartId?: string
}

export type DrawInteractionControllerState = {
  enabled: boolean
  tool: DrawInteractionTool
  highlightColor: string
  dimOpacity: number
  rectStyle: {
    fill: string
    stroke: string
    strokeWidth: number
    opacity: number
  }
  lineStyle: {
    stroke: string
    strokeWidth: number
    opacity: number
  }
  lineArrow: {
    start: boolean
    end: boolean
  }
  segmentStyle: {
    fill: string
    opacity: number
    stroke: string
    strokeWidth: number
  }
}

export type BarSegmentCommit = {
  threshold: number
  when: 'gte' | 'lte'
  keys: string[]
  chartId?: string
}

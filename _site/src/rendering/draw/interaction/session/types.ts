import type { OperationSpec } from '../../../../types'
import type { DrawOp } from '../../types'
import type { ChartTypeValue } from '../../../chartRenderer'
import type { DrawInteractionTool } from '../types'

export const TimelineStepKind = {
  Draw: 'draw',
  Sleep: 'sleep',
  Group: 'group',
} as const

export type TimelineStepKind = (typeof TimelineStepKind)[keyof typeof TimelineStepKind]

type TimelineStepBase = {
  id: string
  kind: TimelineStepKind
  enabled: boolean
  label?: string
}

export type DrawTimelineStep = TimelineStepBase & {
  kind: typeof TimelineStepKind.Draw
  op: DrawOp
}

export type SleepTimelineStep = TimelineStepBase & {
  kind: typeof TimelineStepKind.Sleep
  durationMs: number
}

export type GroupTimelineStep = TimelineStepBase & {
  kind: typeof TimelineStepKind.Group
  children: TimelineStep[]
}

export type TimelineStep = DrawTimelineStep | SleepTimelineStep | GroupTimelineStep

export type InteractionRecordedOp = {
  id: string
  op: DrawOp
  createdAt: number
  sourceTool: DrawInteractionTool
  chartType: ChartTypeValue | null
  chartId?: string
}

export type InteractionSession = {
  id: string
  createdAt: number
  steps: TimelineStep[]
}

export type TimelineRunResult = {
  total: number
  executed: number
  skipped: number
  failed: Array<{ stepId: string; error: string }>
}

export type SerializedTimelineOps = {
  ops: OperationSpec[]
}

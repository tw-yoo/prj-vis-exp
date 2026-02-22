import { ops } from '../../../../operation/build/authoring'
import type { OperationSpec } from '../../../../types'
import { DrawAction, type DrawOp } from '../../types'
import { getEnabledTimelineSteps } from './reducer'
import { TimelineStepKind, type InteractionSession, type SerializedTimelineOps } from './types'

const cloneOp = (op: DrawOp): DrawOp => {
  try {
    return structuredClone(op)
  } catch {
    return JSON.parse(JSON.stringify(op)) as DrawOp
  }
}

export function serializeSessionToOperationSpec(session: InteractionSession): SerializedTimelineOps {
  const out: OperationSpec[] = []
  const steps = getEnabledTimelineSteps(session)
  steps.forEach((step) => {
    if (step.kind === TimelineStepKind.Draw) {
      out.push(cloneOp(step.op))
      return
    }
    if (step.kind === TimelineStepKind.Sleep) {
      const seconds = Math.max(0, Number(step.durationMs) || 0) / 1000
      out.push(ops.draw.sleep(seconds))
    }
  })
  return { ops: out }
}

export const hasSerializableTimelineSteps = (session: InteractionSession) =>
  getEnabledTimelineSteps(session).some((step) => step.kind === TimelineStepKind.Draw || step.kind === TimelineStepKind.Sleep)

export const getDrawActionLabel = (op: DrawOp) => {
  switch (op.action) {
    case DrawAction.Highlight:
      return 'highlight'
    case DrawAction.Dim:
      return 'dim'
    case DrawAction.Text:
      return 'text'
    case DrawAction.Rect:
      return 'rect'
    case DrawAction.Line:
      return 'line'
    case DrawAction.LineTrace:
      return 'line-trace'
    case DrawAction.Filter:
      return 'filter'
    case DrawAction.Split:
      return 'split'
    case DrawAction.Unsplit:
      return 'unsplit'
    case DrawAction.BarSegment:
      return 'bar-segment'
    case DrawAction.Clear:
      return 'clear'
    case DrawAction.Sort:
      return 'sort'
    case DrawAction.Sum:
      return 'sum'
    default:
      return op.action
  }
}

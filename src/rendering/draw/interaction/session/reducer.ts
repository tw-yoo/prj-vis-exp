import type { DrawOp } from '../../types'
import type { ChartTypeValue } from '../../../chartRenderer'
import type { DrawInteractionTool } from '../types'
import {
  type DrawTimelineStep,
  type InteractionSession,
  type TimelineStep,
  TimelineStepKind,
} from './types'

const createId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

export const createEmptyInteractionSession = (): InteractionSession => ({
  id: createId('session'),
  createdAt: Date.now(),
  steps: [],
})

const cloneDrawOp = (op: DrawOp): DrawOp => {
  try {
    return structuredClone(op)
  } catch {
    return JSON.parse(JSON.stringify(op)) as DrawOp
  }
}

const flattenEnabledSteps = (steps: TimelineStep[]): TimelineStep[] => {
  const out: TimelineStep[] = []
  steps.forEach((step) => {
    if (!step.enabled) return
    if (step.kind === TimelineStepKind.Group) {
      out.push(...flattenEnabledSteps(step.children))
      return
    }
    out.push(step)
  })
  return out
}

export const getEnabledTimelineSteps = (session: InteractionSession) => flattenEnabledSteps(session.steps)

export type InteractionSessionAction =
  | {
      type: 'appendDraw'
      op: DrawOp
      sourceTool: DrawInteractionTool
      chartType: ChartTypeValue | null
      label?: string
    }
  | {
      type: 'appendSleep'
      durationMs: number
      label?: string
    }
  | { type: 'removeStep'; id: string }
  | { type: 'toggleStep'; id: string }
  | { type: 'moveStep'; id: string; direction: -1 | 1 }
  | { type: 'replace'; session: InteractionSession }
  | { type: 'clear' }

const moveItem = <T,>(items: T[], from: number, to: number) => {
  const next = items.slice()
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

export function interactionSessionReducer(
  state: InteractionSession,
  action: InteractionSessionAction,
): InteractionSession {
  switch (action.type) {
    case 'appendDraw': {
      const step: DrawTimelineStep = {
        id: createId('step'),
        kind: TimelineStepKind.Draw,
        enabled: true,
        label: action.label,
        op: cloneDrawOp(action.op),
      }
      return { ...state, steps: [...state.steps, step] }
    }
    case 'appendSleep': {
      const durationMs = Number.isFinite(action.durationMs) ? Math.max(0, action.durationMs) : 0
      return {
        ...state,
        steps: [
          ...state.steps,
          {
            id: createId('step'),
            kind: TimelineStepKind.Sleep,
            enabled: true,
            durationMs,
            label: action.label,
          },
        ],
      }
    }
    case 'removeStep':
      return { ...state, steps: state.steps.filter((step) => step.id !== action.id) }
    case 'toggleStep':
      return {
        ...state,
        steps: state.steps.map((step) => (step.id === action.id ? { ...step, enabled: !step.enabled } : step)),
      }
    case 'moveStep': {
      const from = state.steps.findIndex((step) => step.id === action.id)
      if (from < 0) return state
      const to = from + action.direction
      if (to < 0 || to >= state.steps.length) return state
      return { ...state, steps: moveItem(state.steps, from, to) }
    }
    case 'replace':
      return action.session
    case 'clear':
      return createEmptyInteractionSession()
    default:
      return state
  }
}

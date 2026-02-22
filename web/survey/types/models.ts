import type { JsonObject, JsonValue, OperationSpec, VegaLiteSpec } from '../../../src/api/legacy'

/** Canonical page keys used by survey flows. */
export type SurveyPageKey =
  | 'consent'
  | 'pre-registration'
  | 'main-survey'
  | 'tutorial-task'
  | 'main-task'
  | 'completion'
  | string

/** Descriptor for lazy-loaded page fragments (html/json). */
export interface PageDescriptor {
  key: SurveyPageKey
  path: string
  title?: string
  required?: boolean
}

/** Survey question schema shared by main/tutorial questionnaires. */
export interface SurveyQuestion {
  id: string
  type: 'likert' | 'ranking' | 'open-ended' | 'chart' | string
  prompt: string
  required?: boolean
  options?: string[]
  labels?: string[]
  placeholder?: string
  metadata?: JsonObject
}

/** Assignment map for participant -> chart sheet or condition. */
export interface ParticipantAssignment {
  participantCode: string
  sheetId?: string
  condition?: string
  tutorialIds?: string[]
  mainIds?: string[]
  metadata?: JsonObject
}

/** Mapping entry from chart id to source specs used by collection flow. */
export interface ChartSheetMapEntry {
  chartId: string
  questionKey?: string
  vlSpecPath: string
  opsSpecPath?: string
  chartType?: string
  tags?: string[]
}

/** Checklist option for ops labeling tasks. */
export interface OpsOption {
  key: string
  label: string
  description?: string
  category?: string
}

/** Snapshot payload persisted while user is filling survey/data collection. */
export interface SurveyDraftSnapshot {
  sessionId: string
  participantCode?: string
  pageKey: SurveyPageKey
  responses: Record<string, JsonValue>
  updatedAt: string
}

/** Aggregated response payload for submission endpoints / Firestore writes. */
export interface SurveySubmission {
  participantCode: string
  responses: Record<string, JsonValue>
  timing?: Record<string, number>
  metadata?: JsonObject
}

/** Runtime chart task payload used by new React survey pages. */
export interface SurveyChartTask {
  id: string
  title?: string
  vlSpec: VegaLiteSpec
  opsSpec?: OperationSpec[] | { ops: OperationSpec[] } | JsonObject
}

export type SystemId = 'system1' | 'system2' | 'system3'

export interface MainSessionResponseItem {
  chartId: string
  phase: 'tutorial' | 'main'
  answerCorrect: 'yes' | 'no' | ''
  confidenceQ1: number | null
  explanationHelpQ3: number | null
  reasonQ4: string
}

export interface PostSessionResponse {
  matrix: Record<
    SystemId,
    {
      clarity: number | null
      complexConfidence: number | null
      evidence: number | null
    }
  >
  ranking: {
    trustMost: SystemId[]
    easiestExplanation: SystemId[]
    realWorldUse: SystemId[]
  }
  keyDifferences: string
}

export interface PostSessionExample {
  systemId: SystemId
  systemLabel: string
  examples: Array<{
    title: string
    chartId?: string
    question: string
    answer: string
    explanation: string
  }>
}

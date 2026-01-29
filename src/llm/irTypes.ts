import type { JsonObject, JsonValue, OperationSpec } from '../types'
import type { DrawAction, DrawBarSegmentSpec, DrawFilterSpec, DrawSplitSpec, DrawSumSpec } from '../renderer/draw/types'

export type IRDim = 'x' | 'series' | 'stack'

export interface IRMeta {
  chartType: string
  knownFields?: { x?: string; y?: string; series?: string; stack?: string }
  assumptions: string[]
  warnings: string[]
}

export interface IRQuestion {
  type: string
  target?: { dimension?: IRDim; items?: string[] }
  value?: { op?: '>' | '>=' | '<' | '<=' | '==' | 'between' | 'in'; rhs?: JsonValue }
}

export interface IRStepBase {
  id: string
  type: IRStepType
  scope?: { chartId?: string }
  dependsOn: string[]
  params: JsonObject
}

export interface IRResult {
  possible: boolean
  answerType: 'number' | 'text' | 'items' | 'intervals' | 'table' | 'unknown'
  answer: JsonValue
  reason: string
}

export interface IR {
  meta: IRMeta
  question: IRQuestion
  steps: IRStep[]
  result: IRResult
}

// Constrained step types: keep these close to OperationSpec/DrawAction to reduce translation errors.
export type IRStepType =
  | 'sleep'
  | 'filter'
  | 'average'
  | 'sum'
  | 'count'
  | 'findExtremum'
  | 'diff'
  | 'nth'
  | 'draw'

export type IRSleepStep = IRStepBase & {
  type: 'sleep'
  params: { seconds: number } & JsonObject
}

export type IRFilterStep = IRStepBase & {
  type: 'filter'
  params: { field: string; operator: OperationSpec['operator']; value: JsonValue } & JsonObject
}

export type IRAverageStep = IRStepBase & {
  type: 'average'
  params: { field: string; outVar?: string } & JsonObject
}

export type IRSumStep = IRStepBase & {
  type: 'sum'
  params: { field?: string; outVar?: string } & JsonObject
}

export type IRCountStep = IRStepBase & {
  type: 'count'
  params: { outVar?: string } & JsonObject
}

export type IRFindExtremumStep = IRStepBase & {
  type: 'findExtremum'
  params: { field: string; which: 'min' | 'max'; outVar?: string } & JsonObject
}

export type IRDiffStep = IRStepBase & {
  type: 'diff'
  params: {
    field?: string
    targetA: OperationSpec['targetA']
    targetB: OperationSpec['targetB']
    mode?: OperationSpec['mode']
    outVar?: string
  } & JsonObject
}

export type IRNthStep = IRStepBase & {
  type: 'nth'
  params: { n: number; from?: 'left' | 'right'; outVar?: string } & JsonObject
}

export type IRDrawStep = IRStepBase & {
  type: 'draw'
  params: IRDrawParams & JsonObject
}

export type IRDrawParams =
  | { action: 'split'; split: DrawSplitSpec }
  | { action: 'filter'; filter: DrawFilterSpec }
  | { action: 'bar-segment'; segment: DrawBarSegmentSpec }
  | { action: 'sum'; sum: DrawSumSpec }
  // For all other draw actions, we keep a permissive payload; the compiler/validator should narrow further.
  | { action: Exclude<DrawAction, 'split' | 'filter' | 'bar-segment' | 'sum'>; [k: string]: JsonValue }

export type IRStep =
  | IRSleepStep
  | IRFilterStep
  | IRAverageStep
  | IRSumStep
  | IRCountStep
  | IRFindExtremumStep
  | IRDiffStep
  | IRNthStep
  | IRDrawStep

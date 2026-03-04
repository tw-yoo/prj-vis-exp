import { ChartType, type ChartTypeValue } from '../chartRenderer'
import { DrawAction, type DrawAction as DrawActionValue } from './types'

export type DrawSupportStatus = 'supported' | 'partial' | 'unsupported'
export type DrawSupportReasonCode =
  | 'ACTION_NOT_SUPPORTED_FOR_CHART'
  | 'GROUPED_FILTER_PARTIAL_DOMAIN_COLLISION'
  | 'GROUPED_SORT_PARTIAL_DOMAIN_COLLISION'

type DrawSupportByChart = Record<ChartTypeValue, DrawSupportStatus>
type DrawSupportReasonByChart = Partial<Record<ChartTypeValue, DrawSupportReasonCode>>

export type DrawSupportMatrix = Record<DrawActionValue, DrawSupportByChart>
export type DrawSupportReasonMatrix = Partial<Record<DrawActionValue, DrawSupportReasonByChart>>
export type DrawSupportDecision = {
  status: DrawSupportStatus
  reasonCode?: DrawSupportReasonCode
}

export const DRAW_SUPPORT_CHART_ORDER: ChartTypeValue[] = [
  ChartType.SIMPLE_BAR,
  ChartType.STACKED_BAR,
  ChartType.GROUPED_BAR,
  ChartType.SIMPLE_LINE,
  ChartType.MULTI_LINE,
]

const unsupportedByDefault = (): DrawSupportByChart => ({
  [ChartType.SIMPLE_BAR]: 'unsupported',
  [ChartType.STACKED_BAR]: 'unsupported',
  [ChartType.GROUPED_BAR]: 'unsupported',
  [ChartType.SIMPLE_LINE]: 'unsupported',
  [ChartType.MULTI_LINE]: 'unsupported',
})

const withSupported = (overrides: Partial<DrawSupportByChart>): DrawSupportByChart => ({
  ...unsupportedByDefault(),
  ...overrides,
})

export const RUNTIME_DRAW_SUPPORT_MATRIX: DrawSupportMatrix = {
  [DrawAction.Highlight]: withSupported({
    [ChartType.SIMPLE_BAR]: 'supported',
    [ChartType.STACKED_BAR]: 'supported',
    [ChartType.GROUPED_BAR]: 'supported',
    [ChartType.SIMPLE_LINE]: 'supported',
    [ChartType.MULTI_LINE]: 'supported',
  }),
  [DrawAction.Dim]: withSupported({
    [ChartType.SIMPLE_BAR]: 'supported',
    [ChartType.STACKED_BAR]: 'supported',
    [ChartType.GROUPED_BAR]: 'supported',
    [ChartType.SIMPLE_LINE]: 'supported',
    [ChartType.MULTI_LINE]: 'supported',
  }),
  [DrawAction.Clear]: withSupported({
    [ChartType.SIMPLE_BAR]: 'supported',
    [ChartType.STACKED_BAR]: 'supported',
    [ChartType.GROUPED_BAR]: 'supported',
    [ChartType.SIMPLE_LINE]: 'supported',
    [ChartType.MULTI_LINE]: 'supported',
  }),
  [DrawAction.Text]: withSupported({
    [ChartType.SIMPLE_BAR]: 'supported',
    [ChartType.STACKED_BAR]: 'supported',
    [ChartType.GROUPED_BAR]: 'supported',
    [ChartType.SIMPLE_LINE]: 'supported',
    [ChartType.MULTI_LINE]: 'supported',
  }),
  [DrawAction.Rect]: withSupported({
    [ChartType.SIMPLE_BAR]: 'supported',
    [ChartType.STACKED_BAR]: 'supported',
    [ChartType.GROUPED_BAR]: 'supported',
    [ChartType.SIMPLE_LINE]: 'supported',
    [ChartType.MULTI_LINE]: 'supported',
  }),
  [DrawAction.Line]: withSupported({
    [ChartType.SIMPLE_BAR]: 'supported',
    [ChartType.STACKED_BAR]: 'supported',
    [ChartType.GROUPED_BAR]: 'supported',
    [ChartType.SIMPLE_LINE]: 'supported',
    [ChartType.MULTI_LINE]: 'supported',
  }),
  [DrawAction.LineTrace]: withSupported({
    [ChartType.SIMPLE_LINE]: 'supported',
  }),
  [DrawAction.Filter]: withSupported({
    [ChartType.SIMPLE_BAR]: 'supported',
    [ChartType.STACKED_BAR]: 'supported',
    [ChartType.GROUPED_BAR]: 'supported',
    [ChartType.SIMPLE_LINE]: 'supported',
  }),
  [DrawAction.Sort]: withSupported({
    [ChartType.SIMPLE_BAR]: 'supported',
    [ChartType.STACKED_BAR]: 'supported',
    [ChartType.GROUPED_BAR]: 'supported',
  }),
  [DrawAction.Split]: withSupported({
    [ChartType.SIMPLE_BAR]: 'supported',
    [ChartType.STACKED_BAR]: 'supported',
    [ChartType.GROUPED_BAR]: 'supported',
    [ChartType.SIMPLE_LINE]: 'supported',
    [ChartType.MULTI_LINE]: 'supported',
  }),
  [DrawAction.Unsplit]: withSupported({
    [ChartType.SIMPLE_BAR]: 'supported',
    [ChartType.STACKED_BAR]: 'supported',
    [ChartType.GROUPED_BAR]: 'supported',
    [ChartType.SIMPLE_LINE]: 'supported',
    [ChartType.MULTI_LINE]: 'supported',
  }),
  [DrawAction.Sum]: withSupported({
    [ChartType.SIMPLE_BAR]: 'supported',
    [ChartType.STACKED_BAR]: 'supported',
    [ChartType.GROUPED_BAR]: 'supported',
  }),
  [DrawAction.BarSegment]: withSupported({
    [ChartType.SIMPLE_BAR]: 'supported',
    [ChartType.STACKED_BAR]: 'supported',
    [ChartType.GROUPED_BAR]: 'supported',
  }),
  [DrawAction.LineToBar]: withSupported({
    [ChartType.SIMPLE_LINE]: 'supported',
  }),
  [DrawAction.MultiLineToStacked]: withSupported({
    [ChartType.MULTI_LINE]: 'supported',
  }),
  [DrawAction.MultiLineToGrouped]: withSupported({
    [ChartType.MULTI_LINE]: 'supported',
  }),
  [DrawAction.StackedToGrouped]: withSupported({
    [ChartType.STACKED_BAR]: 'supported',
  }),
  [DrawAction.GroupedToStacked]: withSupported({
    [ChartType.GROUPED_BAR]: 'supported',
  }),
  [DrawAction.StackedToSimple]: withSupported({
    [ChartType.STACKED_BAR]: 'supported',
  }),
  [DrawAction.StackedToDiverging]: withSupported({
    [ChartType.STACKED_BAR]: 'supported',
  }),
  [DrawAction.GroupedToSimple]: withSupported({
    [ChartType.GROUPED_BAR]: 'supported',
  }),
  [DrawAction.StackedFilterGroups]: withSupported({
    [ChartType.STACKED_BAR]: 'supported',
  }),
  [DrawAction.GroupedFilterGroups]: withSupported({
    [ChartType.GROUPED_BAR]: 'supported',
  }),
  [DrawAction.Band]: withSupported({
    [ChartType.SIMPLE_BAR]: 'supported',
    [ChartType.STACKED_BAR]: 'supported',
    [ChartType.GROUPED_BAR]: 'supported',
    [ChartType.SIMPLE_LINE]: 'supported',
    [ChartType.MULTI_LINE]: 'supported',
  }),
  [DrawAction.ScalarPanel]: withSupported({
    [ChartType.SIMPLE_BAR]: 'supported',
    [ChartType.STACKED_BAR]: 'supported',
    [ChartType.GROUPED_BAR]: 'supported',
    [ChartType.SIMPLE_LINE]: 'supported',
    [ChartType.MULTI_LINE]: 'supported',
  }),
  [DrawAction.Sleep]: withSupported({
    [ChartType.SIMPLE_BAR]: 'unsupported',
    [ChartType.STACKED_BAR]: 'unsupported',
    [ChartType.GROUPED_BAR]: 'unsupported',
    [ChartType.SIMPLE_LINE]: 'unsupported',
    [ChartType.MULTI_LINE]: 'unsupported',
  }),
}

export const RUNTIME_DRAW_SUPPORT_REASONS: DrawSupportReasonMatrix = {}

export type DrawUiSupportStatus = 'visible' | 'hidden'

type DrawUiSupportByChart = Record<ChartTypeValue, DrawUiSupportStatus>

export type DrawUiSupportMatrix = Record<DrawActionValue, DrawUiSupportByChart>

export type DrawActionSchemaLike = {
  value: string
  allowedCharts?: ChartTypeValue[]
}

export function createUiDrawSupportMatrix(actions: DrawActionSchemaLike[]): DrawUiSupportMatrix {
  const actionMap = new Map(actions.map((entry) => [entry.value, entry]))
  const result = {} as DrawUiSupportMatrix
  ;(Object.values(DrawAction) as DrawActionValue[]).forEach((action) => {
    const schema = actionMap.get(action)
    const row = {} as DrawUiSupportByChart
    DRAW_SUPPORT_CHART_ORDER.forEach((chartType) => {
      const visible =
        !!schema &&
        (!schema.allowedCharts || schema.allowedCharts.length === 0 || schema.allowedCharts.includes(chartType))
      row[chartType] = visible ? 'visible' : 'hidden'
    })
    result[action] = row
  })
  return result
}

export function getRuntimeDrawSupportStatus(action: DrawActionValue, chartType: ChartTypeValue): DrawSupportStatus {
  return RUNTIME_DRAW_SUPPORT_MATRIX[action][chartType]
}

export function getRuntimeDrawSupportDecision(action: DrawActionValue, chartType: ChartTypeValue): DrawSupportDecision {
  const status = RUNTIME_DRAW_SUPPORT_MATRIX[action][chartType]
  const configuredReason = RUNTIME_DRAW_SUPPORT_REASONS[action]?.[chartType]
  if (status === 'unsupported') {
    return { status, reasonCode: configuredReason ?? 'ACTION_NOT_SUPPORTED_FOR_CHART' }
  }
  if (status === 'partial') {
    return { status, reasonCode: configuredReason }
  }
  return { status }
}

export function isRuntimeDrawActionSupported(
  action: DrawActionValue,
  chartType: ChartTypeValue,
  options?: { includePartial?: boolean },
) {
  const decision = getRuntimeDrawSupportDecision(action, chartType)
  if (decision.status === 'supported') return true
  if (decision.status === 'partial') return options?.includePartial ?? true
  return false
}

export function getRuntimeDrawSupportedCharts(
  action: DrawActionValue,
  options?: { includePartial?: boolean },
): ChartTypeValue[] {
  const includePartial = options?.includePartial ?? true
  return DRAW_SUPPORT_CHART_ORDER.filter((chartType) => {
    const status = RUNTIME_DRAW_SUPPORT_MATRIX[action][chartType]
    if (status === 'supported') return true
    if (status === 'partial') return includePartial
    return false
  })
}

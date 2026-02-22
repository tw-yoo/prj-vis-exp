import type { OperationSpec } from '../../types'
import type { ChartTypeValue } from '../chartRenderer'
import { normalizeOpsList, type OpsSpecInput } from '../ops/common/opsSpec'
import { isDrawOp } from '../ops/operationPipeline'
import { DrawAction, type DrawAction as DrawActionValue, type DrawOp } from './types'
import { getRuntimeDrawSupportDecision, type DrawSupportDecision } from './supportMatrix'

export type DrawCapabilityGuardResult = {
  allowed: boolean
  severity: 'error' | 'warn'
  reasonCode: string
}

export type DrawCapabilityIssue = {
  index: number
  action: string
  result: DrawCapabilityGuardResult
}

export type DrawCapabilityReport = {
  errors: DrawCapabilityIssue[]
  warnings: DrawCapabilityIssue[]
}

function isKnownDrawAction(action: string): action is DrawActionValue {
  return (Object.values(DrawAction) as string[]).includes(action)
}

function toGuardResult(decision: DrawSupportDecision): DrawCapabilityGuardResult {
  if (decision.status === 'unsupported') {
    return {
      allowed: false,
      severity: 'error',
      reasonCode: decision.reasonCode ?? 'ACTION_NOT_SUPPORTED_FOR_CHART',
    }
  }
  if (decision.status === 'partial') {
    return {
      allowed: true,
      severity: 'warn',
      reasonCode: decision.reasonCode ?? 'PARTIAL_SUPPORT',
    }
  }
  return {
    allowed: true,
    severity: 'warn',
    reasonCode: 'SUPPORTED',
  }
}

function normalizeDrawOps(opsSpec: OpsSpecInput): DrawOp[] {
  return normalizeOpsList(opsSpec).filter((op): op is DrawOp => isDrawOp(op))
}

function resolveAction(operation: DrawOp): string | null {
  const action = operation.action
  if (typeof action !== 'string' || action.trim().length === 0) {
    return null
  }
  return action
}

export function inspectDrawCapabilities(chartType: ChartTypeValue | null, opsSpec: OpsSpecInput): DrawCapabilityReport {
  if (!chartType) return { errors: [], warnings: [] }
  const drawOps = normalizeDrawOps(opsSpec)
  const errors: DrawCapabilityIssue[] = []
  const warnings: DrawCapabilityIssue[] = []

  drawOps.forEach((operation, index) => {
    const action = resolveAction(operation)
    if (!action) {
      errors.push({
        index,
        action: '(missing)',
        result: {
          allowed: false,
          severity: 'error',
          reasonCode: 'DRAW_ACTION_REQUIRED',
        },
      })
      return
    }
    if (!isKnownDrawAction(action)) {
      errors.push({
        index,
        action,
        result: {
          allowed: false,
          severity: 'error',
          reasonCode: 'UNKNOWN_DRAW_ACTION',
        },
      })
      return
    }

    const decision = getRuntimeDrawSupportDecision(action, chartType)
    const result = toGuardResult(decision)
    if (decision.status === 'unsupported') {
      errors.push({ index, action, result })
    } else if (decision.status === 'partial') {
      warnings.push({ index, action, result })
    }
  })

  return { errors, warnings }
}

export function assertDrawCapabilities(chartType: ChartTypeValue | null, opsSpec: OpsSpecInput) {
  const report = inspectDrawCapabilities(chartType, opsSpec)
  report.warnings.forEach((warning) => {
    console.warn(
      `[draw-capability:warn] op#${warning.index} action="${warning.action}" reason=${warning.result.reasonCode}`,
    )
  })

  if (!report.errors.length) return report

  const message = report.errors
    .map((error) => `op#${error.index} action="${error.action}" reason=${error.result.reasonCode}`)
    .join(', ')
  throw new Error(`Draw capability check failed: ${message}`)
}

export function assertDrawCapabilityForOp(chartType: ChartTypeValue | null, operation: OperationSpec) {
  if (!chartType) return { errors: [], warnings: [] } as DrawCapabilityReport
  return assertDrawCapabilities(chartType, [operation])
}

import { ChartType, type ChartTypeValue } from '../../domain/chart'
import { OperationOp } from '../../domain/operation/types'
import { DrawAction, type DrawAction as DrawActionValue } from '../../rendering/draw/types'
import { RUNTIME_DRAW_SUPPORT_MATRIX } from '../../rendering/draw/supportMatrix'
import { STANDARD_DATA_OP_HANDLERS } from '../../rendering/ops/common/dataHandlers'
import type {
  OperationNextRunResult,
  ParsedOperationRun,
  SupportedOperationSummary,
} from '../types'

const ALL_DRAW_ACTIONS = Object.values(DrawAction)

function operationName(operation: { op?: unknown; action?: unknown }) {
  if (operation.op === OperationOp.Draw && typeof operation.action === 'string') {
    return `draw:${operation.action}`
  }
  return typeof operation.op === 'string' ? operation.op : '(unknown)'
}

function summarizeGroups(run: ParsedOperationRun): OperationNextRunResult['groups'] {
  return run.groups.map((group) => ({
    name: group.name,
    operationCount: group.ops.length,
    operations: group.ops.map(operationName),
  }))
}

function countOperations(run: ParsedOperationRun) {
  return run.groups.reduce((total, group) => total + group.ops.length, 0)
}

function supportedDrawActionsForChart(chartType: ChartTypeValue) {
  return ALL_DRAW_ACTIONS.filter((action): action is DrawActionValue => {
    const status = RUNTIME_DRAW_SUPPORT_MATRIX[action]?.[chartType]
    return status === 'supported' || status === 'partial'
  })
}

export function getSupportedOperationsForChart(chartType: ChartTypeValue): SupportedOperationSummary {
  return {
    dataOperations: Object.keys(STANDARD_DATA_OP_HANDLERS),
    drawActions: supportedDrawActionsForChart(chartType),
  }
}

export async function runStubChartOperationRenderer(
  run: ParsedOperationRun,
  expectedChartType: ChartTypeValue,
  runnerLabel: string,
): Promise<OperationNextRunResult> {
  const groups = summarizeGroups(run)
  const result: OperationNextRunResult = {
    chartType: run.chartType,
    spec: run.runtimeSpec,
    groups,
    operationCount: countOperations(run),
  }
  const supported = getSupportedOperationsForChart(expectedChartType)

  console.log(`[operation-next] ${runnerLabel} operation renderer stub`, {
    chartType: run.chartType,
    operationCount: result.operationCount,
    groups,
    supported,
    spec: run.runtimeSpec,
  })

  return result
}

export function assertKnownOperationNextChartType(chartType: ChartTypeValue): ChartTypeValue {
  switch (chartType) {
    case ChartType.SIMPLE_BAR:
    case ChartType.STACKED_BAR:
    case ChartType.GROUPED_BAR:
    case ChartType.SIMPLE_LINE:
    case ChartType.MULTI_LINE:
      return chartType
    default:
      throw new Error(`operation-next: unsupported chart type "${chartType}"`)
  }
}

import * as d3 from 'd3'
import {
  addData,
  countData,
  compareBoolOp,
  scaleData,
  sumData,
} from '../../domain/operation/dataOps'
import { ChartType, type ChartTypeValue } from '../../domain/chart'
import { OperationOp, type DatumValue, type OperationSpec } from '../../domain/operation/types'
import { DataAttributes, SvgElements } from '../../rendering/interfaces'
import type { ChainState } from '../chainState'
import { ensureAnnotationLayer } from '../primitives/annotationLayer'
import { formatOperationValue } from '../primitives/formatValue'
import { drawResultBadge, type BadgeAnchor } from '../primitives/drawResultBadge'

/**
 * Terminal-op dispatch shared by all operation-next runners.
 *
 * Each terminal op (count, compareBool, sum, add, scale) produces a single
 * scalar/boolean result with no inherent chart-shape annotation. This helper
 * draws a corner badge with the formatted value via `drawResultBadge`. Runners
 * just check `isTerminalBadgeOperation(op)` and delegate here.
 */

export type TerminalBadgeOpName =
  | typeof OperationOp.Count
  | typeof OperationOp.CompareBool
  | typeof OperationOp.Sum
  | typeof OperationOp.Add
  | typeof OperationOp.Scale

export interface TerminalBadgeResult {
  result: DatumValue[]
  nextState: ChainState
}

export interface TerminalBadgeOptions {
  /** Override the badge anchor. Defaults to chart-type-aware: bar/line charts
   *  use 'top-center-above' for Count/Sum (matches user-facing convention of
   *  "Total N bars" sitting above the chart); other anchors default to
   *  'top-right'. */
  anchor?: BadgeAnchor
  /** Override the CSS class prefix; defaults to 'operation-next-terminal-badge'. */
  cssClassPrefix?: string
  /** Chart type the badge belongs to. Used to tailor Count/Sum text and
   *  anchor — e.g. on a bar chart Count reads "Total N bars" centered above
   *  the plot; on a line chart it reads "Total N points". */
  chartType?: ChartTypeValue
}

export function isTerminalBadgeOperation(operation: OperationSpec): boolean {
  return (
    operation.op === OperationOp.Count ||
    operation.op === OperationOp.CompareBool ||
    operation.op === OperationOp.Sum ||
    operation.op === OperationOp.Add ||
    operation.op === OperationOp.Scale
  )
}

function computeResult(operation: OperationSpec, data: DatumValue[]): DatumValue[] {
  switch (operation.op) {
    case OperationOp.Count:
      return countData(data, operation)
    case OperationOp.CompareBool:
      return compareBoolOp(data, operation)
    case OperationOp.Sum:
      return sumData(data, operation)
    case OperationOp.Add:
      return addData(data, operation)
    case OperationOp.Scale:
      return scaleData(data, operation)
    default:
      return []
  }
}

function formatBadgeText(operation: OperationSpec, result: DatumValue[], chartType?: ChartTypeValue): string {
  const value = Number(result[0]?.value)
  if (!Number.isFinite(value)) return String(value)
  const isBar =
    chartType === ChartType.SIMPLE_BAR ||
    chartType === ChartType.GROUPED_BAR ||
    chartType === ChartType.STACKED_BAR
  const isLine = chartType === ChartType.SIMPLE_LINE || chartType === ChartType.MULTI_LINE
  switch (operation.op) {
    case OperationOp.Count:
      if (isBar) return `Total ${value} bars`
      if (isLine) return `Total ${value} points`
      return `Count: ${value}`
    case OperationOp.CompareBool:
      return value === 1 ? 'Yes' : 'No'
    case OperationOp.Sum:
      return `Total: ${formatOperationValue(value)}`
    case OperationOp.Add:
      return `= ${formatOperationValue(value)}`
    case OperationOp.Scale:
      return `= ${formatOperationValue(value)}`
    default:
      return formatOperationValue(value)
  }
}

function defaultAnchorForChart(operation: OperationSpec, chartType?: ChartTypeValue): BadgeAnchor {
  if (operation.op !== OperationOp.Count && operation.op !== OperationOp.Sum) return 'top-right'
  const isChartTypeAware =
    chartType === ChartType.SIMPLE_BAR ||
    chartType === ChartType.GROUPED_BAR ||
    chartType === ChartType.STACKED_BAR ||
    chartType === ChartType.SIMPLE_LINE ||
    chartType === ChartType.MULTI_LINE
  return isChartTypeAware ? 'top-center-above' : 'top-right'
}

/**
 * Entry point. Computes the scalar/boolean, then draws a corner badge.
 *
 * The badge CSS class is `${cssClassPrefix}-${operation.op}` so each op-type's
 * badges are independently cleanup-able and idempotent re-runs replace prior
 * badges of the same op.
 */
export async function runTerminalBadgeOperation(
  container: HTMLElement,
  operation: OperationSpec,
  state: ChainState,
  opts?: TerminalBadgeOptions,
): Promise<TerminalBadgeResult> {
  const result = computeResult(operation, state.workingData)

  const svg = d3.select(container).select<SVGSVGElement>(SvgElements.Svg)
  if (svg.empty()) {
    return { result, nextState: { ...state, lastResult: result } }
  }
  const layer = ensureAnnotationLayer(svg)

  const layout = {
    marginLeft: Number(svg.attr(DataAttributes.MarginLeft) ?? 0),
    marginTop: Number(svg.attr(DataAttributes.MarginTop) ?? 0),
    plotWidth: Number(svg.attr(DataAttributes.PlotWidth) ?? 0),
    plotHeight: Number(svg.attr(DataAttributes.PlotHeight) ?? 0),
  }

  const cssClassPrefix = opts?.cssClassPrefix ?? 'operation-next-terminal-badge'
  const cssClass = `${cssClassPrefix}-${operation.op}`
  await drawResultBadge({
    layer,
    cssClass,
    text: formatBadgeText(operation, result, opts?.chartType),
    layout,
    anchor: opts?.anchor ?? defaultAnchorForChart(operation, opts?.chartType),
    fontSize: 16,
  })

  return {
    result,
    nextState: {
      ...state,
      lastResult: result,
      annotationRecords: [
        ...state.annotationRecords,
        { cssClass, role: 'result', persistent: false },
      ],
    },
  }
}

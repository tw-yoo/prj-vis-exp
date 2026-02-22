import type { DatumValue, OperationSpec } from '../../types'
import * as d3 from 'd3'
import {
  renderSimpleLineChart,
  type LineSpec,
  getSimpleLineStoredData,
  tagSimpleLineMarks,
  renderSplitSimpleLineChart,
  getSimpleLineSplitDomain,
} from '../../rendering/line/simpleLineRenderer.ts'
import { toDatumValuesFromRaw, type RawRow } from '../../rendering/ops/common/datum.ts'
import type { OpsSpecInput } from '../../rendering/ops/common/opsSpec.ts'
import { DrawAction, type DrawOp, type DrawFilterSpec } from '../../rendering/draw/types.ts'
import { SimpleLineDrawHandler } from '../../rendering/draw/line/SimpleLineDrawHandler.ts'
import { clearAnnotations } from '../../rendering/common/d3Helpers.ts'
import { runChartOperationsCommon } from './runChartOperationsCommon.ts'
import { runSimpleLineDrawPlan } from '../../rendering/ops/executor/runSimpleLineDrawPlan.ts'
import { SIMPLE_LINE_AUTO_DRAW_PLANS } from '../../rendering/ops/visual/line/simple/autoDrawPlanRegistry.ts'

function toDatumValues(rawData: RawRow[], xField: string, yField: string): DatumValue[] {
  return toDatumValuesFromRaw(rawData, { xField, yField })
}

type NumericOperator = 'gt' | 'gte' | 'lt' | 'lte'

function normalizeNumericOperator(op?: string): NumericOperator | null {
  if (!op) return null
  switch (op.toLowerCase()) {
    case '>':
    case 'gt':
    case 'greater':
    case 'greaterthan':
      return 'gt'
    case '>=':
    case 'gte':
    case 'greaterorequal':
      return 'gte'
    case '<':
    case 'lt':
    case 'less':
    case 'lessthan':
      return 'lt'
    case '<=':
    case 'lte':
    case 'lessorequal':
      return 'lte'
    default:
      return null
  }
}

function compareNumericValue(op: NumericOperator, actual: number, threshold: number) {
  if (!Number.isFinite(actual) || !Number.isFinite(threshold)) return false
  switch (op) {
    case 'gt':
      return actual > threshold
    case 'gte':
      return actual >= threshold
    case 'lt':
      return actual < threshold
    case 'lte':
      return actual <= threshold
    default:
      return false
  }
}

function matchesFilterForRow(row: RawRow, filter: DrawFilterSpec, spec: LineSpec) {
  const xField = spec.encoding.x.field
  const yField = spec.encoding.y.field

  if (filter.x) {
    const include = filter.x.include
    const exclude = filter.x.exclude
    const raw = row?.[xField]
    const value = raw != null ? String(raw) : ''
    if (include && include.length) {
      const includeSet = new Set(include.map(String))
      if (!includeSet.has(value)) return false
    }
    if (exclude && exclude.length) {
      const excludeSet = new Set(exclude.map(String))
      if (excludeSet.has(value)) return false
    }
  }

  if (filter.y) {
    const actual = Number(row?.[yField])
    const target = Number(filter.y.value)
    const operator = normalizeNumericOperator(filter.y.op)
    if (!Number.isFinite(actual) || !Number.isFinite(target) || !operator) {
      return false
    }
    if (!compareNumericValue(operator, actual, target)) return false
  }

  return true
}

async function renderLineChartWithData(container: HTMLElement, spec: LineSpec, values: RawRow[]) {
  const renderedSpec: LineSpec = {
    ...spec,
    data: { values },
  }
  await renderSimpleLineChart(container, renderedSpec)
}

async function convertLineChartToBars(container: HTMLElement, spec: LineSpec) {
  const stored = (getSimpleLineStoredData(container) || []) as RawRow[]
  if (!stored.length) return
  const barSpec: LineSpec = {
    ...spec,
    mark: { type: 'bar', point: false },
    data: { values: stored.map((row) => ({ ...row })) },
  }
  await renderSimpleLineChart(container, barSpec)
}

async function filterLineChart(container: HTMLElement, spec: LineSpec, filter: DrawFilterSpec) {
  const stored = (getSimpleLineStoredData(container) || []) as RawRow[]
  if (!stored.length) return
  const filtered = stored.filter((row) => matchesFilterForRow(row, filter, spec))
  await renderLineChartWithData(container, spec, filtered.map((row) => ({ ...row })))
}

async function handleSimpleLineDraw(
  container: HTMLElement,
  handler: SimpleLineDrawHandler,
  drawOp: DrawOp,
  spec: LineSpec,
) {
  if (drawOp.action === DrawAction.LineToBar) {
    await convertLineChartToBars(container, spec)
    return
  }
  if (drawOp.action === DrawAction.Filter && drawOp.filter) {
    await filterLineChart(container, spec, drawOp.filter)
    return
  }

  if (drawOp.action === DrawAction.Clear) {
    clearAnnotations(d3.select(container).select('svg'))
    handler.run(drawOp)
    return
  }
  if (
    drawOp.action === DrawAction.Highlight ||
    drawOp.action === DrawAction.Dim ||
    drawOp.action === DrawAction.LineTrace ||
    drawOp.action === DrawAction.Text ||
    drawOp.action === DrawAction.Rect ||
    drawOp.action === DrawAction.Line
  ) {
    handler.run(drawOp)
    return
  }
  console.warn('draw: unsupported action for simple line', drawOp.action)
}

async function handleSimpleLineSplit(container: HTMLElement, spec: LineSpec, drawOp: DrawOp) {
  if (drawOp.action === DrawAction.Split) {
    if (!drawOp.split) {
      console.warn('draw:split requires split spec', drawOp)
      return true
    }
    await renderSplitSimpleLineChart(container, spec, drawOp.split)
    return true
  }
  if (drawOp.action === DrawAction.Unsplit) {
    await renderSimpleLineChart(container, spec)
    return true
  }
  return false
}

export async function runSimpleLineOps(container: HTMLElement, vlSpec: LineSpec, opsSpec: OpsSpecInput) {
  const chartWorking = new Map<string, DatumValue[]>()
  const filterByChartDomain = (chartId: string, currentWorking: DatumValue[]) => {
    const domain = getSimpleLineSplitDomain(container, chartId)
    if (!domain || domain.size === 0) return currentWorking
    const domainSet = new Set(domain)
    return currentWorking.filter((datum) => domainSet.has(String(datum.target)))
  }
  const deriveOperationInput = (operation: OperationSpec, currentWorking: DatumValue[]) => {
    const chartId = operation.chartId
    if (!chartId) return currentWorking
    if (chartWorking.has(chartId)) return chartWorking.get(chartId)!
    const subset = filterByChartDomain(chartId, currentWorking)
    chartWorking.set(chartId, subset)
    return subset
  }
  const handleOperationResult = (operation: OperationSpec, result: DatumValue[], currentWorking: DatumValue[]) => {
    const chartId = operation.chartId
    if (chartId) {
      chartWorking.set(chartId, result)
      return currentWorking
    }
    chartWorking.clear()
    return result
  }

  return runChartOperationsCommon<LineSpec>({
    container,
    spec: vlSpec,
    opsSpec,
    render: async (host, spec) => {
      await renderSimpleLineChart(host, spec)
    },
    postRender: async (host, spec) => {
      await tagSimpleLineMarks(host, spec)
    },
    getWorkingData: (host, spec) => {
      const raw = getSimpleLineStoredData(host) || []
      return toDatumValues(raw, spec.encoding.x.field, spec.encoding.y.field)
    },
    createHandler: (host) => new SimpleLineDrawHandler(host),
    splitHandler: async (host, spec, handler, drawOp) => {
      const handled = await handleSimpleLineSplit(host, spec, drawOp)
      if (handled) {
        handler = new SimpleLineDrawHandler(host)
        chartWorking.clear()
      }
      return handled
    },
    handleDrawOp: (host, handler, drawOp) =>
      handleSimpleLineDraw(host, handler as SimpleLineDrawHandler, drawOp, vlSpec),
    clearAnnotations: ({ svg }) => clearAnnotations(svg),
    autoDrawPlans: SIMPLE_LINE_AUTO_DRAW_PLANS,
    getOperationInput: deriveOperationInput,
    handleOperationResult,
    runDrawPlan: async (drawPlan, handler) => {
      await runSimpleLineDrawPlan(container, drawPlan, { handler: handler as SimpleLineDrawHandler })
    },
  })
}

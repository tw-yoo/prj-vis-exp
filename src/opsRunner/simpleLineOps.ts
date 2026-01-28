import type { DatumValue, OperationSpec } from '../types'
import * as d3 from 'd3'
import {
  renderSimpleLineChart,
  type LineSpec,
  getSimpleLineStoredData,
  tagSimpleLineMarks,
} from '../renderer/line/simpleLineRenderer.ts'
import { toDatumValuesFromRaw, type RawRow } from '../renderer/ops/common/datum.ts'
import { DrawAction, type DrawOp, type DrawFilterSpec } from '../renderer/draw/types.ts'
import { SimpleLineDrawHandler } from '../renderer/draw/line/SimpleLineDrawHandler.ts'
import { clearAnnotations } from '../renderer/common/d3Helpers.ts'
import { runChartOperationsCommon } from './runChartOperationsCommon.ts'
import { runSimpleLineDrawPlan } from '../renderer/ops/executor/runSimpleLineDrawPlan.ts'

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

export async function runSimpleLineOps(container: HTMLElement, vlSpec: LineSpec, opsSpec: OperationSpec | OperationSpec[]) {
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
    handleDrawOp: (host, handler, drawOp) =>
      handleSimpleLineDraw(host, handler as SimpleLineDrawHandler, drawOp, vlSpec),
    clearAnnotations: ({ svg }) => clearAnnotations(svg),
    runDrawPlan: async (drawPlan, handler) => {
      await runSimpleLineDrawPlan(container, drawPlan, { handler: handler as SimpleLineDrawHandler })
    },
  })
}

import type { DatumValue, OperationSpec } from '../../types'
import * as d3 from 'd3'
import {
  renderSimpleLineChart,
  type LineSpec,
  getSimpleLineStoredData,
  tagSimpleLineMarks,
  renderSplitSimpleLineChart,
  getSimpleLineSplitDomain,
  resolveSimpleLineEncoding,
} from '../../rendering/line/simpleLineRenderer.ts'
import { toDatumValuesFromRaw, type RawRow } from '../../rendering/ops/common/datum.ts'
import type { OpsSpecInput } from '../../rendering/ops/common/opsSpec.ts'
import { DrawAction, type DrawOp, type DrawFilterSpec } from '../../rendering/draw/types.ts'
import { SimpleLineDrawHandler } from '../../rendering/draw/line/SimpleLineDrawHandler.ts'
import { clearAnnotations } from '../../rendering/common/d3Helpers.ts'
import { runChartOperationsCommon } from './runChartOperationsCommon.ts'
import { runSimpleLineDrawPlan } from '../../rendering/ops/executor/runSimpleLineDrawPlan.ts'
import { SIMPLE_LINE_AUTO_DRAW_PLANS } from '../../rendering/ops/visual/line/simple/simpleLineAutoDrawPlanBuilder.ts'
import type { RunChartOpsOptions } from './runChartOps.ts'
import { createChartScopedWorkingSet } from './chartScopedWorkingSet.ts'
import { LEGACY_SPLIT_DRAW_ACTIONS } from './drawActionPolicy.ts'

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
  const resolved = resolveSimpleLineEncoding(spec as any)
  if (!resolved) return false
  const xField = resolved.xField
  const yField = resolved.yField

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

async function handleSimpleLineDraw(
  container: HTMLElement,
  handler: SimpleLineDrawHandler,
  drawOp: DrawOp,
  spec: LineSpec,
) {
  if (drawOp.action === DrawAction.Split) {
    if (!drawOp.split) {
      console.warn('draw:split requires split spec', drawOp)
      return
    }
    await renderSplitSimpleLineChart(container, spec, drawOp.split)
    return
  }
  if (drawOp.action === DrawAction.Unsplit) {
    await renderSimpleLineChart(container, spec)
    return
  }
  if (drawOp.action === DrawAction.LineToBar) {
    await convertLineChartToBars(container, spec)
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
    drawOp.action === DrawAction.Line ||
    drawOp.action === DrawAction.Filter
  ) {
    await handler.run(drawOp)
    return
  }
  console.warn('draw: unsupported action for simple line', drawOp.action)
}

export async function runSimpleLineOps(
  container: HTMLElement,
  vlSpec: LineSpec,
  opsSpec: OpsSpecInput,
  options?: RunChartOpsOptions,
) {
  const { getOperationInput, handleOperationResult, clearChartWorking } = createChartScopedWorkingSet({
    getChartScopedData: (chartId, currentWorking) => {
      const domain = getSimpleLineSplitDomain(container, chartId)
      if (!domain || domain.size === 0) return currentWorking
      const domainSet = new Set(domain)
      return currentWorking.filter((datum) => domainSet.has(String(datum.target)))
    },
  })

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
      const resolved = resolveSimpleLineEncoding(spec as any)
      if (!resolved) return []
      const raw = getSimpleLineStoredData(host) || []
      const values = toDatumValues(raw as any, resolved.xField, resolved.yField)
      if (values.length) return values

      // Fallback: derive from tagged marks (works for data.url-backed charts).
      return Array.from(host.querySelectorAll<SVGGraphicsElement>('[data-target][data-value]'))
        .map((el) => {
          const target = el.getAttribute('data-target') ?? ''
          const value = Number(el.getAttribute('data-value'))
          if (!target || !Number.isFinite(value)) return null
          return {
            category: resolved.xField,
            measure: resolved.yField,
            target,
            group: null,
            value,
            id: el.getAttribute('data-id'),
          }
        })
        .filter(Boolean) as DatumValue[]
    },
    createHandler: (host) => new SimpleLineDrawHandler(host),
    handleDrawOp: async (host, handler, drawOp) => {
      await handleSimpleLineDraw(host, handler as SimpleLineDrawHandler, drawOp, vlSpec)
      if (LEGACY_SPLIT_DRAW_ACTIONS.has(drawOp.action)) {
        clearChartWorking()
      }
    },
    clearAnnotations: ({ svg }) => clearAnnotations(svg),
    autoDrawPlans: SIMPLE_LINE_AUTO_DRAW_PLANS,
    getOperationInput,
    handleOperationResult,
    runDrawPlan: async (drawPlan, handler) => {
      await runSimpleLineDrawPlan(container, drawPlan, { handler: handler as SimpleLineDrawHandler })
    },
    onOperationCompleted: options?.onOperationCompleted,
    runtimeScope: options?.runtimeScope ?? 'ops',
    resetRuntime: options?.resetRuntime ?? true,
    initialRenderMode: options?.initialRenderMode ?? 'always',
  })
}

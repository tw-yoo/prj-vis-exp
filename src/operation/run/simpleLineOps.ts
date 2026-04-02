import type { DatumValue, OperationSpec, JsonValue } from '../../types'
import * as d3 from 'd3'
import {
  renderSimpleLineChart,
  type LineSpec,
  getSimpleLineStoredData,
  tagSimpleLineMarks,
  getSimpleLineSplitDomain,
  resolveSimpleLineEncoding,
} from '../../rendering/line/simpleLineRenderer.ts'
import { toDatumValuesFromRaw, type RawRow } from '../../rendering/ops/common/datum.ts'
import type { OpsSpecInput } from '../../rendering/ops/common/opsSpec.ts'
import { DrawAction, type DrawOp, type DrawFilterSpec } from '../../rendering/draw/types.ts'
import { SimpleLineDrawHandler } from '../../rendering/draw/line/SimpleLineDrawHandler.ts'
import { clearAnnotations } from '../../rendering/common/d3Helpers.ts'
import { runChartOperationsCommon } from './runChartOperationsCommon.ts'
import { SIMPLE_LINE_AUTO_DRAW_PLANS } from '../../rendering/ops/visual/line/simple/simpleLineAutoDrawPlanBuilder.ts'
import type { RunChartOpsOptions } from './runChartOps.ts'
import { createChartScopedWorkingSet } from './chartScopedWorkingSet.ts'
import { renderSimpleBarChart, type SimpleBarSpec } from '../../rendering/bar/simpleBarRenderer.ts'
import { SimpleBarDrawHandler } from '../../rendering/draw/bar/SimpleBarDrawHandler.ts'
import { storeDerivedChartState } from '../../rendering/utils/derivedChartState.ts'
import { ChartType } from '../../domain/chart'
import { getRuntimeChartState } from '../../rendering/utils/runtimeChartState.ts'

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
  await convertLineToProperSimpleBar(container, spec)
}

async function ensureSimpleBarSurface(container: HTMLElement, spec: LineSpec) {
  const runtimeState = getRuntimeChartState(container)
  if (runtimeState?.chartType === ChartType.SIMPLE_BAR) return runtimeState.spec as SimpleBarSpec
  return convertLineToProperSimpleBar(container, spec)
}

async function convertLineToProperSimpleBar(
  container: HTMLElement,
  spec: LineSpec,
): Promise<SimpleBarSpec> {
  const stored = (getSimpleLineStoredData(container) || []) as RawRow[]
  const resolved = resolveSimpleLineEncoding(spec as any)
  if (!resolved || !stored.length) {
    throw new Error('convertLineToProperSimpleBar: missing data or encoding')
  }
  const { xField, yField } = resolved
  const xEncoding = spec.encoding?.x as Record<string, JsonValue> | undefined
  const yEncoding = spec.encoding?.y as Record<string, JsonValue> | undefined
  const simpleBarSpec: SimpleBarSpec = {
    ...spec,
    mark: 'bar',
    data: { values: stored.map((row) => ({ ...row })) },
    encoding: {
      x: {
        field: xField,
        type: (xEncoding?.type as string) ?? 'nominal',
        ...(xEncoding?.axis !== undefined ? { axis: xEncoding.axis } : {}),
        ...(xEncoding?.sort !== undefined ? { sort: xEncoding.sort } : {}),
      },
      y: { field: yField, type: (yEncoding?.type as string) ?? 'quantitative' },
    },
  } as unknown as SimpleBarSpec
  // Remove line-specific encoding hints
  const encAny = simpleBarSpec.encoding as unknown as Record<string, unknown>
  delete encAny.color
  await renderSimpleBarChart(container, simpleBarSpec)
  storeDerivedChartState(container, ChartType.SIMPLE_BAR, simpleBarSpec)
  return simpleBarSpec
}

export async function handleSimpleLineDraw(
  container: HTMLElement,
  handler: SimpleLineDrawHandler,
  drawOp: DrawOp,
  spec: LineSpec,
) {
  if (drawOp.action === DrawAction.Split) {
    console.debug('draw:split handled at runChartOps level', drawOp)
    return
  }
  if (drawOp.action === DrawAction.Unsplit) {
    console.debug('draw:unsplit handled at runChartOps level', drawOp)
    return
  }
  if (drawOp.action === DrawAction.LineToBar) {
    await convertLineChartToBars(container, spec)
    return
  }

  if (drawOp.action === DrawAction.Sort) {
    await ensureSimpleBarSurface(container, spec)
    const barHandler = new SimpleBarDrawHandler(container)
    await barHandler.run({ ...drawOp })
    return
  }
  if (drawOp.action === DrawAction.Sum) {
    await ensureSimpleBarSurface(container, spec)
    const barHandler = new SimpleBarDrawHandler(container)
    await barHandler.run({ ...drawOp })
    return
  }
  if (drawOp.action === DrawAction.Filter) {
    await ensureSimpleBarSurface(container, spec)
    const barHandler = new SimpleBarDrawHandler(container)
    await barHandler.run({ ...drawOp })
    return
  }

  if (drawOp.action === DrawAction.Clear) {
    clearAnnotations(d3.select(container).select('svg'))
    handler.run(drawOp)
    return
  }
  await handler.run(drawOp)
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
      return toDatumValues(raw as any, resolved.xField, resolved.yField)
    },
    createHandler: (host) => new SimpleLineDrawHandler(host),
    handleDrawOp: async (host, handler, drawOp) => {
      await handleSimpleLineDraw(host, handler as SimpleLineDrawHandler, drawOp, vlSpec)
      if (drawOp.action === DrawAction.Split || drawOp.action === DrawAction.Unsplit) {
        clearChartWorking()
      }
    },
    autoDrawPlans: SIMPLE_LINE_AUTO_DRAW_PLANS,
    getOperationInput,
    handleOperationResult,
    runDrawPlan: async (drawPlan, handler) => {
      for (const drawOp of drawPlan) {
        await handleSimpleLineDraw(container, handler as SimpleLineDrawHandler, drawOp, vlSpec)
      }
    },
    onOperationReady: options?.onOperationReady,
    onOperationCompleted: options?.onOperationCompleted,
    runtimeScope: options?.runtimeScope ?? 'ops',
    resetRuntime: options?.resetRuntime ?? true,
    initialRenderMode: options?.initialRenderMode ?? 'always',
    operationIndexStart: options?.operationIndexStart ?? 0,
  })
}

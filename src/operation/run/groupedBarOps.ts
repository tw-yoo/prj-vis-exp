import type { DatumValue, OperationSpec, JsonValue } from '../../types'
import { clearAnnotations } from '../../rendering/common/d3Helpers.ts'
import { runChartOperationsCommon } from './runChartOperationsCommon.ts'
import { DrawAction, type DrawSplitSpec } from '../../rendering/draw/types.ts'
import { GroupedBarDrawHandler } from '../../rendering/draw/bar/GroupedBarDrawHandler.ts'
import type { DrawOp } from '../../rendering/draw/types.ts'
import {
  renderGroupedBarChart,
  renderSplitGroupedBarChart,
  type GroupedSpec,
  getGroupedBarStoredData,
  getGroupedBarOriginalData,
  getGroupedBarSplitState,
} from '../../rendering/bar/groupedBarRenderer.ts'
import { toDatumValuesFromRaw, type RawRow } from '../../rendering/ops/common/datum.ts'
import type { OpsSpecInput } from '../../rendering/ops/common/opsSpec.ts'
import { runGroupedBarDrawPlan } from '../../rendering/ops/executor/runGroupedBarDrawPlan.ts'
import { convertGroupedToStacked } from '../../rendering/bar/stackGroupTransforms.ts'
import { aggregateDatumValuesByTarget } from '../../rendering/ops/common/workingData.ts'
import {
  handleGroupFilter,
  shouldAggregateWhenSingleGroup,
} from './barOpsCommon.ts'
import { normalizeComparisonCondition } from '../../rendering/draw/utils/comparison.ts'
import { DrawComparisonOperators, type DrawFilterSpec, type DrawSortSpec } from '../../rendering/draw/types.ts'
import type { RunChartOpsOptions } from './runChartOps.ts'

function toGroupedDatumValues(raw: JsonValue[], spec: GroupedSpec): DatumValue[] {
  const normalized = raw.filter((item): item is RawRow => typeof item === 'object' && item !== null)
  return toDatumValuesFromRaw(normalized, {
    xField: spec.encoding.x.field,
    yField: spec.encoding.y.field,
    groupField: spec.encoding.color?.field,
  })
}

async function handleGroupedBarDraw(
  container: HTMLElement,
  handler: GroupedBarDrawHandler,
  drawOp: DrawOp,
  spec: GroupedSpec,
) {
  if (drawOp.action === DrawAction.GroupedToStacked) {
    await convertGroupedToStacked(container, spec, drawOp.stackGroup)
    return
  }
  handler.run(drawOp)
}

function filterGroupedRows(rawRows: RawRow[], spec: GroupedSpec, filterSpec: DrawFilterSpec) {
  const xField = spec.encoding.x.field
  const yField = spec.encoding.y.field
  const includeSet = filterSpec.x?.include?.length ? new Set(filterSpec.x.include.map(String)) : null
  const excludeSet = filterSpec.x?.exclude?.length ? new Set(filterSpec.x.exclude.map(String)) : null

  let filtered = rawRows.filter((row) => {
    const label = row[xField]
    const key = label == null ? '' : String(label)
    if (includeSet && !includeSet.has(key)) return false
    if (excludeSet && excludeSet.has(key)) return false
    return true
  })

  if (filterSpec.y) {
    const threshold = Number(filterSpec.y.value)
    if (Number.isFinite(threshold)) {
      const comparison = normalizeComparisonCondition(filterSpec.y.op ?? undefined)
      const aggregate = new Map<string, number>()
      filtered.forEach((row) => {
        const key = row[xField] == null ? '' : String(row[xField])
        const value = Number(row[yField])
        if (!Number.isFinite(value) || key.length === 0) return
        aggregate.set(key, (aggregate.get(key) ?? 0) + value)
      })
      const keepTargets = new Set(
        Array.from(aggregate.entries())
          .filter(([, value]) => {
            switch (comparison) {
              case DrawComparisonOperators.Greater:
                return value > threshold
              case DrawComparisonOperators.GreaterEqual:
                return value >= threshold
              case DrawComparisonOperators.Less:
                return value < threshold
              case DrawComparisonOperators.LessEqual:
                return value <= threshold
              default:
                return true
            }
          })
          .map(([target]) => target),
      )
      filtered = filtered.filter((row) => keepTargets.has(String(row[xField] ?? '')))
    }
  }

  return filtered
}

function sortTargetsBySpec(rawRows: RawRow[], spec: GroupedSpec, sortSpec: DrawSortSpec | undefined) {
  const xField = spec.encoding.x.field
  const yField = spec.encoding.y.field
  const order = (sortSpec?.order ?? 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc'
  const by = sortSpec?.by ?? 'y'

  const targets = Array.from(new Set(rawRows.map((row) => String(row[xField] ?? '')).filter((target) => target.length > 0)))
  if (by === 'x') {
    targets.sort((a, b) => a.localeCompare(b))
  } else {
    const aggregate = new Map<string, number>()
    rawRows.forEach((row) => {
      const key = row[xField] == null ? '' : String(row[xField])
      const value = Number(row[yField])
      if (!Number.isFinite(value) || key.length === 0) return
      aggregate.set(key, (aggregate.get(key) ?? 0) + value)
    })
    targets.sort((a, b) => (aggregate.get(a) ?? 0) - (aggregate.get(b) ?? 0))
  }
  if (order === 'desc') targets.reverse()
  return targets
}

export async function runGroupedBarOps(
  container: HTMLElement,
  vlSpec: GroupedSpec,
  opsSpec: OpsSpecInput,
  options?: RunChartOpsOptions,
) {
  const chartWorking = new Map<string, DatumValue[]>()
  const filterRawByChartDomain = (chartId: string, rawRows: JsonValue[]) => {
    const splitState = getGroupedBarSplitState(container)
    if (!splitState) return rawRows
    const domain = splitState.domains[chartId]
    if (!domain || domain.size === 0) return rawRows
    return rawRows.filter((row) => {
      if (!row || typeof row !== 'object') return false
      const value = (row as RawRow)[splitState.field]
      if (value == null) return false
      return domain.has(String(value))
    })
  }

  const getOperationInput = (operation: OperationSpec, currentWorking: DatumValue[]) => {
    const chartId = operation.chartId
    const hasGroup = operation.group != null && String(operation.group).trim() !== ''
    const chartScoped =
      chartId == null
        ? currentWorking
        : chartWorking.get(chartId) ??
          toGroupedDatumValues(filterRawByChartDomain(chartId, getGroupedBarStoredData(container) as JsonValue[]), vlSpec)
    if (chartId && !chartWorking.has(chartId)) {
      chartWorking.set(chartId, chartScoped)
    }
    if (hasGroup) return chartScoped
    return shouldAggregateWhenSingleGroup(chartScoped) ? aggregateDatumValuesByTarget(chartScoped) : chartScoped
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

  return runChartOperationsCommon<GroupedSpec>({
    container,
    spec: vlSpec,
    opsSpec,
    render: renderGroupedBarChart,
    postRender: async () => {},
    getWorkingData: () => {
      const raw = (getGroupedBarStoredData(container) || []) as JsonValue[]
      return toGroupedDatumValues(raw, vlSpec)
    },
    createHandler: () => new GroupedBarDrawHandler(container),
    splitHandler: async (host, spec, handler, drawOp) => {
      if (drawOp.action === DrawAction.Filter && drawOp.filter && !drawOp.chartId) {
        const rows = (getGroupedBarStoredData(host) || []) as JsonValue[]
        const normalized = rows.filter((item): item is RawRow => typeof item === 'object' && item !== null)
        const filteredRows = filterGroupedRows(normalized, spec, drawOp.filter)
        await renderGroupedBarChart(host, { ...spec, data: { values: filteredRows } })
        chartWorking.clear()
        return true
      }
      if (drawOp.action === DrawAction.Sort && !drawOp.chartId) {
        const rows = (getGroupedBarStoredData(host) || []) as JsonValue[]
        const normalized = rows.filter((item): item is RawRow => typeof item === 'object' && item !== null)
        const sortedTargets = sortTargetsBySpec(normalized, spec, drawOp.sort)
        await renderGroupedBarChart(host, {
          ...spec,
          encoding: {
            ...spec.encoding,
            x: {
              ...spec.encoding.x,
              sort: sortedTargets,
            },
          },
        })
        chartWorking.clear()
        return true
      }
      if (drawOp.action === DrawAction.Split) {
        if (!drawOp.split || typeof drawOp.split !== 'object') {
          console.warn('draw:split requires split spec', drawOp)
          return true
        }
        await renderSplitGroupedBarChart(host, spec, drawOp.split as DrawSplitSpec)
        chartWorking.clear()
        return true
      }
      if (drawOp.action === DrawAction.Unsplit) {
        await renderGroupedBarChart(host, spec)
        chartWorking.clear()
        return true
      }
      const handled = await handleGroupFilter(host, spec, drawOp, {
        action: DrawAction.GroupedFilterGroups,
        getGroupField: (spec) => spec.encoding.color?.field,
        getOriginalData: getGroupedBarOriginalData,
        render: renderGroupedBarChart,
      })
      if (handled) chartWorking.clear()
      return handled
    },
    handleDrawOp: async (host, handler, drawOp) =>
      handleGroupedBarDraw(host, handler as GroupedBarDrawHandler, drawOp, vlSpec),
    clearAnnotations: ({ svg }) => clearAnnotations(svg),
    getOperationInput,
    handleOperationResult,
    runDrawPlan: async (drawPlan, handler) => {
      await runGroupedBarDrawPlan(container, drawPlan, { handler: handler as GroupedBarDrawHandler })
    },
    onOperationCompleted: options?.onOperationCompleted,
    runtimeScope: options?.runtimeScope ?? 'ops',
    resetRuntime: options?.resetRuntime ?? true,
  })
}

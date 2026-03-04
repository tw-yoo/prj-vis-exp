import type { DatumValue } from '../../../types'
import { ChartType, getChartType, type VegaLiteSpec } from '../../chartRenderer'
import { getPlotContext } from '../common/chartContext'
import { toDatumValuesFromRaw, type RawRow } from '../common/datum'
import { toWorkingDatumValuesFromStore } from '../common/workingData'
import type { OpsPlanContext } from './types'
import { getSimpleBarStoredData, type SimpleBarSpec } from '../../bar/simpleBarRenderer'
import { getStackedBarStoredData, type StackedSpec } from '../../bar/stackedBarRenderer'
import { getGroupedBarStoredData, type GroupedSpec } from '../../bar/groupedBarRenderer'
import { getSimpleLineStoredData, resolveSimpleLineEncoding, type LineSpec } from '../../line/simpleLineRenderer'
import { getMultipleLineStoredData, resolveMultiLineEncoding, type MultiLineSpec } from '../../line/multipleLineRenderer'

const groupFallback = (row: RawRow) => {
  const candidate = row?.group ?? row?.color ?? row?.series ?? null
  if (candidate == null) return null
  return String(candidate)
}

function buildSimpleBarWorkingData(container: HTMLElement, spec: SimpleBarSpec): DatumValue[] {
  const ctx = getPlotContext(container)
  const raw = (getSimpleBarStoredData(container) || []) as RawRow[]
  return toWorkingDatumValuesFromStore({
    raw,
    specXField: spec.encoding.x.field,
    specYField: spec.encoding.y.field,
    ctxXField: ctx.xField,
    ctxYField: ctx.yField,
  })
}

function buildStackedBarWorkingData(container: HTMLElement, spec: StackedSpec): DatumValue[] {
  const raw = (getStackedBarStoredData(container) || []) as RawRow[]
  return toDatumValuesFromRaw(
    raw,
    {
      xField: spec.encoding.x.field,
      yField: spec.encoding.y.field,
      groupField: spec.encoding.color?.field,
    },
    { groupFallback },
  )
}

function buildGroupedBarWorkingData(container: HTMLElement, spec: GroupedSpec): DatumValue[] {
  const raw = (getGroupedBarStoredData(container) || []) as RawRow[]
  return toDatumValuesFromRaw(
    raw,
    {
      xField: spec.encoding.x.field,
      yField: spec.encoding.y.field,
      groupField: spec.encoding.color?.field,
    },
    { groupFallback },
  )
}

function buildSimpleLineWorkingData(container: HTMLElement, spec: LineSpec): DatumValue[] {
  const raw = (getSimpleLineStoredData(container) || []) as RawRow[]
  const encoding = resolveSimpleLineEncoding(spec as any)
  if (!encoding) return []
  return toDatumValuesFromRaw(
    raw,
    {
      xField: encoding.xField,
      yField: encoding.yField,
      groupField: encoding.colorField ?? undefined,
    },
    { groupFallback },
  )
}

function buildMultipleLineWorkingData(container: HTMLElement, spec: MultiLineSpec): DatumValue[] {
  const raw = (getMultipleLineStoredData(container) || []) as RawRow[]
  const encoding = resolveMultiLineEncoding(spec)
  if (!encoding) return []
  return toDatumValuesFromRaw(
    raw,
    {
      xField: encoding.xField,
      yField: encoding.yField,
      groupField: encoding.colorField ?? undefined,
    },
    { groupFallback },
  )
}

export function buildOpsPlanContext(container: HTMLElement, spec: VegaLiteSpec): OpsPlanContext {
  const chartType = getChartType(spec)
  let workingData: DatumValue[] = []

  switch (chartType) {
    case ChartType.SIMPLE_BAR:
      workingData = buildSimpleBarWorkingData(container, spec as SimpleBarSpec)
      break
    case ChartType.STACKED_BAR:
      workingData = buildStackedBarWorkingData(container, spec as StackedSpec)
      break
    case ChartType.GROUPED_BAR:
      workingData = buildGroupedBarWorkingData(container, spec as GroupedSpec)
      break
    case ChartType.SIMPLE_LINE:
      workingData = buildSimpleLineWorkingData(container, spec as LineSpec)
      break
    case ChartType.MULTI_LINE:
      workingData = buildMultipleLineWorkingData(container, spec as MultiLineSpec)
      break
    default:
      workingData = []
  }

  return {
    container,
    spec,
    chartType,
    workingData,
  }
}

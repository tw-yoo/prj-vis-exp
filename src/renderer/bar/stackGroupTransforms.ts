import type { GroupedSpec } from './groupedBarRenderer'
import {
  getStackedBarStoredData,
  renderStackedBarChart,
  type StackedSpec,
} from './stackedBarRenderer'
import { getGroupedBarStoredData, renderGroupedBarChart } from './groupedBarRenderer'
import type { DrawStackGroupSpec } from '../draw/types'
import type { JsonObject, JsonValue } from '../../types'

type RawDatum = JsonObject

type BaseEncoding = {
  x: { field: string; type: string }
  y: { field: string; type: string; stack?: string | null }
  color?: { field?: string; type?: string }
}

function cloneRows(rows: RawDatum[]) {
  return rows.map((row) => ({ ...row }))
}

function hasValues(data: unknown): data is { values?: JsonValue[] } {
  return !!data && typeof data === 'object' && 'values' in data
}

function isRawDatum(value: JsonValue): value is RawDatum {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function resolveDataset(stored: RawDatum[], specData: unknown) {
  if (stored && stored.length) {
    return cloneRows(stored)
  }
  if (!hasValues(specData)) {
    return []
  }
  const values = specData.values ?? []
  const normalized = values.filter(isRawDatum).map((value) => ({ ...value }))
  return normalized
}

function ensureField(name?: string, fallback?: string) {
  return name ?? fallback ?? 'field'
}

function ensureType(override?: string, fallback?: string) {
  return override ?? fallback ?? 'nominal'
}

export async function convertStackedToGrouped(
  container: HTMLElement,
  spec: StackedSpec,
  options?: DrawStackGroupSpec,
) {
  const values = resolveDataset(getStackedBarStoredData(container), spec.data)
  if (!values.length) {
    console.warn('stacked-to-grouped: no dataset available to re-render grouped chart')
    return
  }
  const encoding = spec.encoding as BaseEncoding
  const swap = options?.swapAxes ?? false
  const sourceXField = encoding.x.field
  const sourceXType = encoding.x.type
  const sourceColorField = encoding.color?.field
  const sourceColorType = encoding.color?.type

  const xField = swap
    ? ensureField(options?.colorField, sourceColorField ?? sourceXField)
    : ensureField(options?.xField, sourceXField)
  const xType = swap ? ensureType(sourceColorType, sourceXType) : sourceXType
  const colorField = swap
    ? ensureField(options?.xField, sourceXField)
    : ensureField(options?.colorField, sourceColorField)
  const colorType = swap ? sourceXType : ensureType(sourceColorType, encoding.color?.type)

  if (!colorField) {
    console.warn('stacked-to-grouped: cannot infer color/group field to use for grouping')
    return
  }

  const baseColor = encoding.color ?? {}
  const groupedSpec: GroupedSpec = {
    ...spec,
    data: { values },
    encoding: {
      ...encoding,
      x: { field: xField, type: xType },
      y: encoding.y,
      color: {
        ...baseColor,
        field: colorField,
        type: colorType ?? 'nominal',
      },
    },
  }

  await renderGroupedBarChart(container, groupedSpec)
}

export async function convertGroupedToStacked(
  container: HTMLElement,
  spec: GroupedSpec,
  options?: DrawStackGroupSpec,
) {
  const values = resolveDataset(getGroupedBarStoredData(container), spec.data)
  if (!values.length) {
    console.warn('grouped-to-stacked: no dataset available to re-render stacked chart')
    return
  }
  const encoding = spec.encoding as BaseEncoding
  const swap = options?.swapAxes ?? false
  const sourceXField = encoding.x.field
  const sourceXType = encoding.x.type
  const sourceColorField = encoding.color?.field
  const sourceColorType = encoding.color?.type

  const xField = swap
    ? ensureField(options?.colorField, sourceColorField ?? sourceXField)
    : ensureField(options?.xField, sourceXField)
  const colorField = swap
    ? ensureField(options?.xField, sourceXField)
    : ensureField(options?.colorField, sourceColorField)
  const colorType = swap ? sourceXType : ensureType(sourceColorType, encoding.color?.type)

  if (!colorField) {
    console.warn('grouped-to-stacked: cannot infer color/group field to use for stacking')
    return
  }

  const baseColor = encoding.color ?? {}
  const stackedSpec: StackedSpec = {
    ...spec,
    data: { values },
    encoding: {
      ...encoding,
      x: { field: xField, type: sourceXType },
      y: { ...encoding.y, stack: 'zero' },
      color: {
        ...baseColor,
        field: colorField,
        type: colorType ?? 'nominal',
      },
    },
  }

  await renderStackedBarChart(container, stackedSpec)
}

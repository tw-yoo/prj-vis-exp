import type { JsonObject, JsonValue } from '../../types'
import { renderSimpleBarChart, type SimpleBarSpec } from './simpleBarRenderer'
import { getGroupedBarStoredData, type GroupedSpec } from './groupedBarRenderer'
import { getStackedBarStoredData, type StackedSpec } from './stackedBarRenderer'

type RawDatum = JsonObject

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

function resolveSeriesColor(rows: RawDatum[], seriesField: string, seriesValue: string | number) {
  const seriesKey = String(seriesValue)
  for (const row of rows) {
    if (row == null) continue
    if (String(row[seriesField] ?? '') !== seriesKey) continue
    const fill = row.__fill
    if (typeof fill === 'string') {
      const trimmed = fill.trim()
      if (trimmed.length > 0 && trimmed.toLowerCase() !== 'none') return trimmed
    }
  }
  return null
}

function setBarMarkColor(spec: SimpleBarSpec, color: string | null) {
  if (!color) return spec
  const mark = spec.mark
  if (!mark) return { ...spec, mark: { type: 'bar', color } }
  if (typeof mark === 'string') return { ...spec, mark: { type: mark, color } }
  if (typeof mark === 'object' && mark !== null) {
    return { ...spec, mark: { ...(mark as Record<string, JsonValue>), color } }
  }
  return spec
}

function toSimpleBarSpec(
  spec: GroupedSpec | StackedSpec,
  rows: RawDatum[],
  seriesField: string,
  seriesValue: string | number,
  options: { xField: string; xType: string; yField: string; yType: string; baseAxis?: JsonValue; baseSort?: JsonValue },
) {
  const filtered = rows.filter((row) => String(row?.[seriesField] ?? '') === String(seriesValue))

  const encoding: SimpleBarSpec['encoding'] = {
    x: {
      field: options.xField,
      type: options.xType,
      ...(options.baseSort !== undefined ? { sort: options.baseSort } : {}),
    },
    y: {
      field: options.yField,
      type: options.yType,
    },
  }
  if (options.baseAxis !== undefined) {
    ;(encoding.x as Record<string, JsonValue>).axis = options.baseAxis
  }

  const next: SimpleBarSpec = {
    ...spec,
    mark: 'bar',
    data: { values: filtered },
    encoding,
  }

  // Remove grouped/stacked hints that could confuse type inference or alter layout.
  const nextAny = next as unknown as Record<string, unknown>
  delete nextAny.facet
  delete nextAny.repeat

  const encAny = nextAny.encoding as Record<string, unknown>
  delete encAny.color
  delete encAny.column
  delete encAny.row
  delete encAny.xOffset
  delete encAny.yOffset
  if (typeof encAny.y === 'object' && encAny.y && 'stack' in (encAny.y as Record<string, unknown>)) {
    delete (encAny.y as Record<string, unknown>).stack
  }

  const color = resolveSeriesColor(rows, seriesField, seriesValue)
  return setBarMarkColor(next, color)
}

export async function convertStackedToSimple(
  container: HTMLElement,
  spec: StackedSpec,
  toSimple: { series: string | number },
) {
  const values = resolveDataset(getStackedBarStoredData(container) as RawDatum[], spec.data)
  if (!values.length) {
    console.warn('stacked-to-simple: no dataset available to re-render simple bar chart')
    return
  }
  const seriesField = spec.encoding.color?.field
  if (!seriesField) {
    console.warn('stacked-to-simple: stacked chart is missing a color/group field')
    return
  }
  const xField = spec.encoding.x.field
  const yField = spec.encoding.y.field
  const xType = spec.encoding.x.type
  const yType = spec.encoding.y.type
  const baseAxis = (spec.encoding.x as Record<string, JsonValue>).axis
  const baseSort = (spec.encoding.x as Record<string, JsonValue>).sort

  const simple = toSimpleBarSpec(spec, values, seriesField, toSimple.series, {
    xField,
    xType,
    yField,
    yType,
    baseAxis,
    baseSort,
  })
  await renderSimpleBarChart(container, simple)
}

export async function convertGroupedToSimple(
  container: HTMLElement,
  spec: GroupedSpec,
  toSimple: { series: string | number },
) {
  const values = resolveDataset(getGroupedBarStoredData(container) as RawDatum[], spec.data)
  if (!values.length) {
    console.warn('grouped-to-simple: no dataset available to re-render simple bar chart')
    return
  }

  const encodingAny = spec.encoding as unknown as Record<string, any>
  const xOffsetField = typeof encodingAny.xOffset?.field === 'string' ? (encodingAny.xOffset.field as string) : null
  const seriesField = xOffsetField ?? spec.encoding.color?.field
  if (!seriesField) {
    console.warn('grouped-to-simple: grouped chart is missing a series field (color or xOffset)')
    return
  }

  const xDef = spec.encoding.x
  const yDef = spec.encoding.y
  const yField = yDef.field
  const yType = yDef.type

  const baseAxis = (xDef as Record<string, JsonValue>).axis
  const baseSort = (xDef as Record<string, JsonValue>).sort

  // If x encodes the series itself (common faceted grouped pattern), promote facet field to x.
  const columnField = spec.encoding.column?.field
  const rowField = spec.encoding.row?.field
  const facetField = (columnField && columnField !== seriesField ? columnField : null) ?? (rowField && rowField !== seriesField ? rowField : null)

  const resolvedXField = xDef.field === seriesField && facetField ? facetField : xDef.field
  const resolvedXType =
    resolvedXField === columnField
      ? (spec.encoding.column?.type ?? xDef.type)
      : resolvedXField === rowField
        ? (spec.encoding.row?.type ?? xDef.type)
        : xDef.type

  const simple = toSimpleBarSpec(spec, values, seriesField, toSimple.series, {
    xField: resolvedXField,
    xType: resolvedXType,
    yField,
    yType,
    baseAxis,
    baseSort,
  })
  await renderSimpleBarChart(container, simple)
}


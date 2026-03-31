import type { JsonObject, JsonValue } from '../../types'
import { ChartType } from '../../domain/chart'
import { renderSimpleBarChart, type SimpleBarSpec, setSimpleBarStoredData } from './simpleBarRenderer'
import { getGroupedBarStoredData, type GroupedSpec } from './groupedBarRenderer'
import { getStackedBarStoredData, type StackedSpec } from './stackedBarRenderer'
import { storeDerivedChartState } from '../utils/derivedChartState'
import { storeRuntimeChartState } from '../utils/runtimeChartState'
import { DataAttributes } from '../interfaces'

type RawDatum = JsonObject
type SimpleSurfaceDatum = {
  target: string
  displayTarget: string
  value: number
  group?: string | null
}

function getLiveSvg(container: HTMLElement) {
  return container.querySelector('svg')
}

function isNodeHidden(node: Element) {
  const attrDisplay = (node.getAttribute('display') ?? '').trim().toLowerCase()
  if (attrDisplay === 'none') return true
  const styleDisplay = ((node as HTMLElement | SVGElement).style?.display ?? '').trim().toLowerCase()
  return styleDisplay === 'none'
}

function pruneHiddenSvgNodes(container: HTMLElement) {
  const svg = getLiveSvg(container)
  if (!svg) return
  Array.from(svg.querySelectorAll('*')).forEach((node) => {
    if (!isNodeHidden(node)) return
    node.remove()
  })
}

function normalizeSimpleBarDom(container: HTMLElement) {
  const svg = getLiveSvg(container)
  if (!svg) return

  svg.removeAttribute(DataAttributes.ColorField)
  svg.removeAttribute(DataAttributes.GroupLabel)
  svg.removeAttribute(DataAttributes.FacetField)

  Array.from(svg.querySelectorAll<SVGElement>('rect, path')).forEach((mark) => {
    if (isNodeHidden(mark)) {
      mark.remove()
      return
    }
    const target = (mark.getAttribute(DataAttributes.Target) ?? mark.getAttribute(DataAttributes.Id) ?? '').trim()
    if (!target) return
    mark.setAttribute(DataAttributes.Target, target)
    mark.setAttribute(DataAttributes.Id, target)
    mark.removeAttribute(DataAttributes.Series)
    mark.removeAttribute(DataAttributes.GroupValue)
  })
}

function finalizeSimpleBarHandoff(container: HTMLElement, spec: SimpleBarSpec, rows: RawDatum[]) {
  const svg = getLiveSvg(container)
  pruneHiddenSvgNodes(container)
  normalizeSimpleBarDom(container)
  if (svg) {
    svg.setAttribute(DataAttributes.XField, spec.encoding.x.field)
    svg.setAttribute(DataAttributes.YField, spec.encoding.y.field)
  }
  setSimpleBarStoredData(container, rows)
  storeRuntimeChartState(container, { chartType: ChartType.SIMPLE_BAR, spec, renderer: 'd3' })
  storeDerivedChartState(container, ChartType.SIMPLE_BAR, spec)
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

function resolveSeriesColorFromRenderedMarks(container: HTMLElement, seriesValue: string | number) {
  const seriesKey = String(seriesValue)
  const marks = container.querySelectorAll<SVGElement>('svg [data-series]')
  for (const mark of Array.from(marks)) {
    const markSeries = mark.getAttribute('data-series')
    if (markSeries == null || String(markSeries) !== seriesKey) continue
    const fill = (mark.getAttribute('fill') ?? '').trim()
    if (fill.length > 0 && fill.toLowerCase() !== 'none' && fill.toLowerCase() !== 'transparent') return fill
    const stroke = (mark.getAttribute('stroke') ?? '').trim()
    if (stroke.length > 0 && stroke.toLowerCase() !== 'none' && stroke.toLowerCase() !== 'transparent') return stroke
  }
  return null
}

function normalizeSimpleSurfaceRows(rows: SimpleSurfaceDatum[], yField: string, xField: string) {
  return rows.map((row) => ({
    [xField]: row.target,
    [yField]: row.value,
    target: row.target,
    displayTarget: row.displayTarget,
    name: row.displayTarget,
    value: row.value,
    group: row.group ?? null,
  })) as RawDatum[]
}

function simpleAxisLabelsFromSpec(spec: GroupedSpec | StackedSpec) {
  const axisLabelsMeta = (spec as { meta?: { axisLabels?: { x?: JsonValue; y?: JsonValue } } }).meta?.axisLabels ?? {}
  return {
    x: axisLabelsMeta.x ?? spec.encoding.x.field,
    y: axisLabelsMeta.y ?? spec.encoding.y.field,
  }
}

export async function renderBarSelectionAsSimpleSurface(
  container: HTMLElement,
  spec: GroupedSpec | StackedSpec,
  rows: SimpleSurfaceDatum[],
): Promise<SimpleBarSpec | null> {
  if (!rows.length) return null
  const yField = spec.encoding.y.field
  const yType = spec.encoding.y.type
  const xField = '__surface_target__'
  const normalizedRows = normalizeSimpleSurfaceRows(rows, yField, xField)
  const axisLabels = simpleAxisLabelsFromSpec(spec)
  const baseMeta = ((spec as { meta?: Record<string, unknown> }).meta ?? {}) as Record<string, unknown>
  const baseAxisLabels = (baseMeta.axisLabels as Record<string, JsonValue> | undefined) ?? {}
  const simpleSpec: SimpleBarSpec = {
    ...spec,
    mark: 'bar',
    data: { values: normalizedRows },
    encoding: {
      x: {
        field: xField,
        type: 'nominal',
        sort: normalizedRows.map((row) => String(row[xField] ?? '')),
      },
      y: {
        field: yField,
        type: yType,
      },
    },
    meta: {
      ...baseMeta,
      axisLabels: {
        ...baseAxisLabels,
        x: axisLabels.x,
        y: axisLabels.y,
      },
    },
  }

  const simpleAny = simpleSpec as unknown as Record<string, unknown>
  delete simpleAny.facet
  delete simpleAny.spec
  delete simpleAny.repeat
  const encAny = simpleAny.encoding as Record<string, unknown>
  delete encAny.color
  delete encAny.column
  delete encAny.row
  delete encAny.xOffset
  delete encAny.yOffset

  await renderSimpleBarChart(container, simpleSpec)
  setSimpleBarStoredData(container, normalizedRows)
  storeRuntimeChartState(container, { chartType: ChartType.SIMPLE_BAR, spec: simpleSpec, renderer: 'd3' })
  storeDerivedChartState(container, ChartType.SIMPLE_BAR, simpleSpec)
  return simpleSpec
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
  options: {
    xField: string
    xType: string
    yField: string
    yType: string
    baseAxis?: JsonValue
    baseSort?: JsonValue
    explicitColor?: string | null
  },
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

  const color = options.explicitColor ?? resolveSeriesColor(rows, seriesField, seriesValue)
  return setBarMarkColor(next, color)
}

export async function convertStackedToSimple(
  container: HTMLElement,
  spec: StackedSpec,
  toSimple: { series: string | number },
): Promise<SimpleBarSpec | null> {
  const values = resolveDataset(getStackedBarStoredData(container) as RawDatum[], spec.data)
  if (!values.length) {
    console.warn('stacked-to-simple: no dataset available to hand off simple bar chart state')
    return null
  }
  const seriesField = spec.encoding.color?.field
  if (!seriesField) {
    console.warn('stacked-to-simple: stacked chart is missing a color/group field')
    return null
  }
  const xField = spec.encoding.x.field
  const yField = spec.encoding.y.field
  const xType = spec.encoding.x.type
  const yType = spec.encoding.y.type
  const baseAxis = (spec.encoding.x as Record<string, JsonValue>).axis
  const baseSort = (spec.encoding.x as Record<string, JsonValue>).sort
  const explicitColor =
    resolveSeriesColor(values, seriesField, toSimple.series) ?? resolveSeriesColorFromRenderedMarks(container, toSimple.series)

  const simple = toSimpleBarSpec(spec, values, seriesField, toSimple.series, {
    xField,
    xType,
    yField,
    yType,
    baseAxis,
    baseSort,
    explicitColor,
  })
  finalizeSimpleBarHandoff(container, simple, (simple.data?.values as RawDatum[] | undefined) ?? [])
  return simple
}

export async function convertGroupedToSimple(
  container: HTMLElement,
  spec: GroupedSpec,
  toSimple: { series: string | number },
): Promise<SimpleBarSpec | null> {
  const values = resolveDataset(getGroupedBarStoredData(container) as RawDatum[], spec.data)
  if (!values.length) {
    console.warn('grouped-to-simple: no dataset available to hand off simple bar chart state')
    return null
  }

  const encodingAny = spec.encoding as unknown as Record<string, any>
  const xOffsetField = typeof encodingAny.xOffset?.field === 'string' ? (encodingAny.xOffset.field as string) : null
  const seriesField = xOffsetField ?? spec.encoding.color?.field
  if (!seriesField) {
    console.warn('grouped-to-simple: grouped chart is missing a series field (color or xOffset)')
    return null
  }

  const xDef = spec.encoding.x
  const yDef = spec.encoding.y
  const yField = yDef.field
  const yType = yDef.type

  const baseAxis = (xDef as Record<string, JsonValue>).axis
  const baseSort = (xDef as Record<string, JsonValue>).sort
  const explicitColor = resolveSeriesColor(values, seriesField, toSimple.series) ?? resolveSeriesColorFromRenderedMarks(container, toSimple.series)

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
    explicitColor,
  })
  finalizeSimpleBarHandoff(container, simple, (simple.data?.values as RawDatum[] | undefined) ?? [])
  return simple
}

import * as d3 from 'd3'
import type { GroupedSpec } from './groupedBarRenderer'
import {
  getStackedBarStoredData,
  renderStackedBarChart,
  type StackedSpec,
} from './stackedBarRenderer'
import { getGroupedBarStoredData, renderGroupedBarChart } from './groupedBarRenderer'
import type { DrawStackGroupSpec } from '../draw/types'
import type { JsonObject, JsonValue } from '../../types'
import { loadRowsFromVegaLiteData } from '../vegaLite/dataLoader'
import { applyVegaLiteTransforms } from '../vegaLite/transform'
import { storeDerivedChartState } from '../utils/derivedChartState'
import { ChartType } from '../../domain/chart'
import { NON_SPLIT_UPDATE_MS } from '../draw/animationPolicy'

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
  if (!hasValues(specData)) {
    return stored && stored.length ? cloneRows(stored) : []
  }
  const values = specData.values ?? []
  const normalized = values.filter(isRawDatum).map((value) => ({ ...value }))
  if (normalized.length) {
    // Prefer original spec inline data to avoid leaking renderer-specific fields (e.g., __fill).
    return normalized
  }
  return stored && stored.length ? cloneRows(stored) : []
}

async function resolveDatasetAsync(stored: RawDatum[], spec: { data?: unknown; transform?: unknown }) {
  const loaded = await loadRowsFromVegaLiteData(spec.data as any)
  if (loaded.length) {
    const transforms = Array.isArray(spec.transform) ? (spec.transform as JsonValue[]) : []
    const transformed = applyVegaLiteTransforms(loaded as unknown as RawDatum[], transforms)
    return transformed && transformed.length ? cloneRows(transformed as unknown as RawDatum[]) : cloneRows(loaded as any)
  }
  // Fallback: existing behavior (used when data url is unavailable in the workbench environment).
  return resolveDataset(stored, spec.data)
}

function ensureField(name?: string, fallback?: string) {
  return name ?? fallback ?? 'field'
}

function ensureType(override?: string, fallback?: string) {
  return override ?? fallback ?? 'nominal'
}

function resolveOrderedDomain(values: RawDatum[], field: string): Array<string | number> {
  const seen = new Set<string>()
  const domain: Array<string | number> = []
  values.forEach((row) => {
    const raw = row?.[field]
    if (raw == null) return
    const value = typeof raw === 'number' ? raw : String(raw)
    const key = typeof value === 'number' ? `n:${value}` : `s:${value}`
    if (seen.has(key)) return
    seen.add(key)
    domain.push(value)
  })
  return domain
}

export async function convertStackedToGrouped(
  container: HTMLElement,
  spec: StackedSpec,
  options?: DrawStackGroupSpec,
) {
  const storedRows = cloneRows(getStackedBarStoredData(container))
  const values = await resolveDatasetAsync(storedRows, spec)
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

  const xDomainSource = storedRows.length ? storedRows : values
  const xSortDomain = resolveOrderedDomain(xDomainSource, xField)

  const baseColor = encoding.color ?? {}
  const groupedSpec: GroupedSpec = {
    ...spec,
    data: { values },
    encoding: {
      ...encoding,
      x: {
        field: xField,
        type: xType,
        ...(xSortDomain.length > 0 ? { sort: xSortDomain } : {}),
      },
      // IMPORTANT: grouped charts must disable stacking to keep bars side-by-side.
      y: { ...encoding.y, stack: null },
      color: {
        ...baseColor,
        field: colorField,
        type: colorType ?? 'nominal',
      },
      // Keep the grouped-bar hint explicit so chart family inference stays stable.
      xOffset: { field: colorField, type: colorType ?? 'nominal' } as any,
    },
  }

  await animateStackedToGrouped(container, options?.visibleSeries)

  await renderGroupedBarChart(container, groupedSpec)
  storeDerivedChartState(container, ChartType.GROUPED_BAR, groupedSpec)
}

async function animateStackedToGrouped(
  container: HTMLElement,
  visibleSeries?: string[],
): Promise<void> {
  const svg = container.querySelector('svg')
  if (!svg) return

  const plotH = parseFloat(svg.getAttribute('data-plot-h') ?? '0')
  if (!plotH) return

  type BarEntry = {
    el: SVGRectElement
    target: string
    series: string
    value: number
    x: number
    bandwidth: number
  }

  const bars: BarEntry[] = Array.from(
    container.querySelectorAll<SVGRectElement>('rect.main-bar'),
  )
    .map((el) => ({
      el,
      target: el.getAttribute('data-target') ?? '',
      series: el.getAttribute('data-series') ?? el.getAttribute('data-group-value') ?? '',
      value: parseFloat(el.getAttribute('data-value') ?? '0'),
      x: parseFloat(el.getAttribute('x') ?? '0'),
      bandwidth: parseFloat(el.getAttribute('width') ?? '0'),
    }))
    .filter((b) => b.target && b.series)

  if (!bars.length) return

  const uniqueSeries = [...new Set(bars.map((b) => b.series))]
  const visibleSet = visibleSeries ? new Set(visibleSeries) : new Set(uniqueSeries)
  const activeSeries = uniqueSeries.filter((s) => visibleSet.has(s))
  const bandwidth = bars[0]?.bandwidth ?? 0

  // target별 현재 x 위치 (stacked에서 같은 target의 bars는 x가 동일)
  const targetToX = new Map<string, number>()
  bars.forEach((b) => { if (!targetToX.has(b.target)) targetToX.set(b.target, b.x) })

  // grouped 내부 sub-scale
  const groupedX = d3.scaleBand<string>()
    .domain(activeSeries)
    .range([0, bandwidth])
    .padding(0.18)

  // grouped용 y scale (단일 값 기준 max)
  const maxValue = d3.max(bars.filter((b) => visibleSet.has(b.series)), (b) => b.value) ?? 0
  const yGrouped = d3.scaleLinear()
    .domain([0, maxValue])
    .nice()
    .range([plotH, 0])

  const duration = NON_SPLIT_UPDATE_MS
  const ease = d3.easeCubicInOut

  // 비가시 바: fade out + collapse
  const hideBars = bars.filter((b) => !visibleSet.has(b.series))
  if (hideBars.length) {
    d3.selectAll<SVGRectElement, unknown>(hideBars.map((b) => b.el))
      .transition()
      .duration(duration)
      .ease(ease)
      .attr('opacity', 0)
      .attr('height', 0)
  }

  // 가시 바: stacked → grouped 위치로 이동
  const showBars = bars.filter((b) => visibleSet.has(b.series))
  showBars.forEach((b) => {
    const baseX = targetToX.get(b.target) ?? b.x
    const offsetX = groupedX(b.series) ?? 0
    d3.select(b.el)
      .transition()
      .duration(duration)
      .ease(ease)
      .attr('x', baseX + offsetX)
      .attr('width', groupedX.bandwidth())
      .attr('y', yGrouped(b.value))
      .attr('height', plotH - yGrouped(b.value))
  })

  // Y축 전환
  const yAxisEl = container.querySelector<SVGGElement>('svg g.y-axis')
  if (yAxisEl) {
    const yAxisGrouped = d3.axisLeft(yGrouped).ticks(5)
    d3.select<SVGGElement, unknown>(yAxisEl)
      .transition()
      .duration(duration)
      .ease(ease)
      .call(yAxisGrouped as any)
  }

  // transition 완료 대기
  const allBarsSel = d3.selectAll<SVGRectElement, unknown>(bars.map((b) => b.el))
  await allBarsSel.transition().duration(duration).end().catch(() => {})
}

export async function convertStackedToDiverging(container: HTMLElement, spec: StackedSpec) {
  const values = await resolveDatasetAsync(getStackedBarStoredData(container), spec)
  if (!values.length) {
    console.warn('stacked-to-diverging: no dataset available to re-render diverging chart')
    return
  }

  const encoding = spec.encoding as BaseEncoding
  const xField = encoding.x.field
  const yField = encoding.y.field

  const totalsByX = new Map<string, number>()
  values.forEach((row) => {
    const xVal = row?.[xField]
    const yVal = row?.[yField]
    if (xVal == null) return
    const numeric = Number(yVal)
    if (!Number.isFinite(numeric)) return
    const key = String(xVal)
    totalsByX.set(key, (totalsByX.get(key) ?? 0) + Math.abs(numeric))
  })
  const maxTotal = Math.max(0, ...Array.from(totalsByX.values()))
  const half = maxTotal > 0 ? maxTotal / 2 : 0

  const yEnc = (encoding.y ?? {}) as Record<string, unknown>
  const yScale = (yEnc.scale && typeof yEnc.scale === 'object' && !Array.isArray(yEnc.scale) ? yEnc.scale : {}) as Record<
    string,
    unknown
  >
  const hasExplicitDomain =
    yScale.domain !== undefined || yScale.domainMin !== undefined || yScale.domainMax !== undefined

  const divergingSpec: StackedSpec = {
    ...spec,
    data: { values },
    encoding: {
      ...encoding,
      y: {
        ...(encoding.y as any),
        // Centered stacking: bars diverge around y=0 (middle of the axis).
        stack: 'center',
        ...(half > 0 && !hasExplicitDomain ? { scale: { ...yScale, domain: [-half, half] } } : {}),
      } as any,
    },
  }

  await renderStackedBarChart(container, divergingSpec)
  storeDerivedChartState(container, ChartType.STACKED_BAR, divergingSpec)
}

export async function convertGroupedToStacked(
  container: HTMLElement,
  spec: GroupedSpec,
  options?: DrawStackGroupSpec,
) {
  const values = await resolveDatasetAsync(getGroupedBarStoredData(container), spec as any)
  if (!values.length) {
    console.warn('grouped-to-stacked: no dataset available to re-render stacked chart')
    return
  }
  const encoding = spec.encoding as BaseEncoding & {
    xOffset?: unknown
    yOffset?: unknown
    column?: unknown
    row?: unknown
  }
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
  // Ensure the converted spec is treated as stacked by removing grouped hints.
  const { xOffset: _xOffset, yOffset: _yOffset, column: _column, row: _row, ...encodingNoGroupedHints } =
    encoding as unknown as Record<string, unknown>

  const stackedSpec: StackedSpec = {
    ...spec,
    data: { values },
    encoding: {
      ...(encodingNoGroupedHints as unknown as BaseEncoding),
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
  storeDerivedChartState(container, ChartType.STACKED_BAR, stackedSpec)
}

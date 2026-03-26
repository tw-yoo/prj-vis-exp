import * as d3 from 'd3'
import type { JsonValue } from '../../types'
import type { MultiLineSpec } from './multipleLineRenderer'
import { getMultipleLineStoredData, resolveMultiLineEncoding } from './multipleLineRenderer'
import { renderGroupedBarChart, type GroupedSpec } from '../bar/groupedBarRenderer'
import { renderStackedBarChart, type StackedSpec } from '../bar/stackedBarRenderer'
import { SvgElements } from '../interfaces'

type RawDatum = Record<string, JsonValue>

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

function getDatumRecord(value: unknown): Record<string, unknown> {
  if (isRecord(value)) return value
  return {}
}

function resolveMarkDatum(rawDatum: unknown, el: Element): Record<string, unknown> {
  const ownerData = getDatumRecord(rawDatum)
  const embedded = getDatumRecord(ownerData.datum)
  const fallback = getDatumRecord((el as Element & { __data__?: unknown }).__data__)
  return Object.keys(embedded).length ? embedded : Object.keys(ownerData).length ? ownerData : fallback
}

function resolveCssColor(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed || trimmed === 'none') return null
  return trimmed
}

function resolveSeriesColorFromElement(el: Element): string | null {
  const computed = window.getComputedStyle(el as Element)
  const tagName = el.tagName.toLowerCase()
  if (tagName === SvgElements.Path) {
    return resolveCssColor(computed.stroke) ?? resolveCssColor(computed.fill)
  }
  return resolveCssColor(computed.fill) ?? resolveCssColor(computed.stroke)
}

function inferSeriesColorsFromRenderedMarks(container: HTMLElement, seriesField: string): Map<string, string> {
  const svg = container.querySelector(SvgElements.Svg)
  if (!(svg instanceof SVGSVGElement)) return new Map()

  const map = new Map<string, string>()
  const marks = Array.from(svg.querySelectorAll(`${SvgElements.Path},${SvgElements.Circle},${SvgElements.Rect}`))
  for (const mark of marks) {
    const raw = (mark as Element & { __data__?: unknown }).__data__
    const datum = resolveMarkDatum(raw, mark)
    const seriesValue = datum?.[seriesField]
    if (seriesValue == null) continue
    const key = String(seriesValue)
    if (map.has(key)) continue
    const color = resolveSeriesColorFromElement(mark)
    if (!color) continue
    map.set(key, color)
  }
  return map
}

function collectOrdinalDomain(rows: RawDatum[], field: string): string[] {
  const domain: string[] = []
  const seen = new Set<string>()
  rows.forEach((row) => {
    const value = row[field]
    if (value == null) return
    const key = String(value)
    if (seen.has(key)) return
    seen.add(key)
    domain.push(key)
  })
  return domain
}

function aggregateSeriesByX(rows: RawDatum[], xField: string, yField: string, seriesField: string): RawDatum[] {
  const buckets = new Map<string, { x: JsonValue; series: JsonValue; value: number }>()
  rows.forEach((row) => {
    const x = row[xField]
    const series = row[seriesField]
    const y = Number(row[yField])
    if (x == null || series == null || !Number.isFinite(y)) return
    const key = `${String(x)}__${String(series)}`
    const prev = buckets.get(key)
    if (!prev) {
      buckets.set(key, { x, series, value: y })
      return
    }
    prev.value += y
  })
  return Array.from(buckets.values()).map((entry) => ({
    [xField]: entry.x,
    [seriesField]: entry.series,
    [yField]: entry.value,
  }))
}

function resolvePalette(spec: MultiLineSpec): string[] {
  const configured = (spec as { config?: { range?: { category?: JsonValue } } }).config?.range?.category
  if (Array.isArray(configured)) {
    const values = configured.map((v) => (v == null ? '' : String(v))).filter((v) => v.trim().length > 0)
    if (values.length) return values
  }
  return d3.schemeTableau10.slice()
}

function resolveSeriesColorScale(spec: MultiLineSpec, seriesDomain: string[], inferred: Map<string, string>) {
  const candidates: unknown[] = []
  const baseEnc = asRecord((spec as { encoding?: unknown }).encoding)
  candidates.push(baseEnc.color)
  if (Array.isArray(spec.layer)) {
    spec.layer.forEach((layer) => {
      const layerEnc = asRecord((layer as { encoding?: unknown })?.encoding)
      candidates.push(layerEnc.color)
    })
  }

  const resolvedExisting = candidates.find((candidate) => {
    const rec = asRecord(candidate)
    const scale = asRecord(rec.scale)
    return Array.isArray(scale.domain) && Array.isArray(scale.range) && scale.domain.length === scale.range.length
  })
  const existingScale = asRecord(asRecord(resolvedExisting).scale) as { domain?: JsonValue; range?: JsonValue }
  const existingDomain = Array.isArray(existingScale.domain) ? (existingScale.domain as JsonValue[]).map(String) : null
  const existingRange = Array.isArray(existingScale.range) ? (existingScale.range as JsonValue[]).map(String) : null

  const byExisting = new Map<string, string>()
  if (existingDomain && existingRange && existingDomain.length === existingRange.length) {
    existingDomain.forEach((key, idx) => byExisting.set(key, existingRange[idx]))
  }

  const palette = resolvePalette(spec)
  const range = seriesDomain.map((series, idx) => {
    return (
      byExisting.get(series) ??
      inferred.get(series) ??
      palette[idx % palette.length] ??
      '#69b3a2'
    )
  })

  return {
    domain: seriesDomain,
    range,
  }
}

function resolveEncodingChannel(spec: MultiLineSpec, channel: 'x' | 'y', field: string): Record<string, JsonValue> | null {
  const baseEnc = asRecord((spec as { encoding?: unknown }).encoding)
  const baseCh = asRecord(baseEnc[channel])
  if (String(baseCh.field ?? '').trim() === field) return baseCh as Record<string, JsonValue>

  if (Array.isArray(spec.layer)) {
    for (const layer of spec.layer) {
      const layerEnc = asRecord((layer as { encoding?: unknown })?.encoding)
      const layerCh = asRecord(layerEnc[channel])
      if (String(layerCh.field ?? '').trim() === field) return layerCh as Record<string, JsonValue>
    }
  }

  return null
}

function buildBaseBarSpec(spec: MultiLineSpec, values: RawDatum[], encoding: { x: Record<string, JsonValue>; y: Record<string, JsonValue> }) {
  const title = (spec as { title?: JsonValue }).title
  return {
    $schema: spec.$schema,
    description: spec.description,
    title,
    width: spec.width,
    height: spec.height,
    padding: (spec as { padding?: JsonValue }).padding,
    config: spec.config,
    data: { values },
    mark: 'bar',
    encoding: {
      x: { ...encoding.x },
      y: { ...encoding.y },
    },
  }
}

export async function convertMultiLineToStackedBar(container: HTMLElement, spec: MultiLineSpec) {
  const encoding = resolveMultiLineEncoding(spec)
  const seriesField = encoding?.colorField ?? null
  if (!encoding) {
    console.warn('multi-line-to-stacked: missing x/y encoding')
    return
  }
  if (!seriesField) {
    console.warn('multi-line-to-stacked: color (series) field is required')
    return
  }
  const stored = (getMultipleLineStoredData(container) || []) as RawDatum[]
  if (!stored.length) {
    console.warn('multi-line-to-stacked: no stored dataset available')
    return
  }

  const xField = encoding.xField
  const yField = encoding.yField
  const aggregated = aggregateSeriesByX(stored, xField, yField, seriesField)
  const seriesDomain = collectOrdinalDomain(aggregated, seriesField)
  const inferredColors = inferSeriesColorsFromRenderedMarks(container, seriesField)
  const colorScale = resolveSeriesColorScale(spec, seriesDomain, inferredColors)

  const xChannel =
    resolveEncodingChannel(spec, 'x', xField) ?? ({ field: xField, type: encoding.xType ?? 'nominal', sort: null } as Record<string, JsonValue>)
  const yChannel =
    resolveEncodingChannel(spec, 'y', yField) ?? ({ field: yField, type: encoding.yType ?? 'quantitative' } as Record<string, JsonValue>)

  const stackedSpec: StackedSpec = {
    ...(buildBaseBarSpec(spec, aggregated, { x: xChannel, y: yChannel }) as unknown as StackedSpec),
    encoding: {
      x: xChannel as any,
      y: { ...(yChannel as any), stack: 'zero' },
      color: {
        field: seriesField,
        type: 'nominal',
        scale: colorScale,
      },
    },
  }

  await renderStackedBarChart(container, stackedSpec)
}

export async function convertMultiLineToGroupedBar(container: HTMLElement, spec: MultiLineSpec) {
  const encoding = resolveMultiLineEncoding(spec)
  const seriesField = encoding?.colorField ?? null
  if (!encoding) {
    console.warn('multi-line-to-grouped: missing x/y encoding')
    return
  }
  if (!seriesField) {
    console.warn('multi-line-to-grouped: color (series) field is required')
    return
  }
  const stored = (getMultipleLineStoredData(container) || []) as RawDatum[]
  if (!stored.length) {
    console.warn('multi-line-to-grouped: no stored dataset available')
    return
  }

  const xField = encoding.xField
  const yField = encoding.yField
  const aggregated = aggregateSeriesByX(stored, xField, yField, seriesField)
  const seriesDomain = collectOrdinalDomain(aggregated, seriesField)
  const inferredColors = inferSeriesColorsFromRenderedMarks(container, seriesField)
  const colorScale = resolveSeriesColorScale(spec, seriesDomain, inferredColors)

  const xChannel =
    resolveEncodingChannel(spec, 'x', xField) ?? ({ field: xField, type: encoding.xType ?? 'nominal', sort: null } as Record<string, JsonValue>)
  const yChannel =
    resolveEncodingChannel(spec, 'y', yField) ?? ({ field: yField, type: encoding.yType ?? 'quantitative' } as Record<string, JsonValue>)

  const groupedBase = buildBaseBarSpec(spec, aggregated, { x: xChannel, y: yChannel }) as unknown as GroupedSpec & {
    encoding: GroupedSpec['encoding'] & { xOffset?: unknown }
  }
  const groupedSpec: GroupedSpec = {
    ...(groupedBase as GroupedSpec),
    encoding: {
      x: xChannel as any,
      y: { ...(yChannel as any), stack: null },
      color: {
        field: seriesField,
        type: 'nominal',
        scale: colorScale,
      },
      xOffset: { field: seriesField, type: 'nominal' },
    } as unknown as GroupedSpec['encoding'],
  }

  await renderGroupedBarChart(container, groupedSpec)
}

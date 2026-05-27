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
import {
  resolveCategoricalDomain,
  resolveDiscreteDomainFromScale,
  resolveScaleDomain,
} from './barRuntime'

type RawDatum = JsonObject

type BaseEncoding = {
  x: { field: string; type: string }
  y: { field: string; type: string; stack?: string | null }
  color?: { field?: string; type?: string }
}

export type StackGroupTransformResult = {
  chartType: typeof ChartType.GROUPED_BAR | typeof ChartType.STACKED_BAR
  spec: GroupedSpec | StackedSpec
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
  // Drop any (target|series) → coords cache from a previous conversion so the
  // post-render diff only sees this run's predictions.
  animationTargetCache = new Map()
  const storedRows = cloneRows(getStackedBarStoredData(container))
  const values = await resolveDatasetAsync(storedRows, spec)
  if (!values.length) {
    console.warn('stacked-to-grouped: no dataset available to re-render grouped chart')
    return null
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
    return null
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

  // Pre-compute the SAME outer/inner/y scales that `renderGroupedBarChart`
  // will use, then animate stacked bars to those exact final positions. This
  // is what eliminates the "snap" between animation-end and renderer-paint
  // for case 11e148qcs7x70t8v: previously the animation used the stacked
  // bar's outer bandwidth (.padding(0.2)) and inner .padding(0.18), but the
  // grouped renderer rebuilds with .paddingInner(0.18).paddingOuter(0.08)
  // outer and .padding(0.08) inner — so every bar shifted +/- pixels at the
  // hand-off. The recipe below mirrors renderGroupedBarChart() lines 413-419
  // exactly: same domain resolution, same paddings, same .nice() y-scale.
  const yField = ensureField(encoding.y?.field, 'value')
  const aggregatedYValues = aggregateByCategorySeries(values, xField, yField, colorField)
  const xDomainForAnim = resolveCategoricalDomain(values, xField, xSortDomain.length > 0 ? xSortDomain : undefined, yField)
  const seriesDomainForAnim = resolveDiscreteDomainFromScale(
    values,
    colorField,
    (encoding.color as { scale?: unknown } | undefined)?.scale,
    colorField,
  )
  const yDomainForAnim = resolveScaleDomain(
    aggregatedYValues,
    (encoding.y as { scale?: unknown } | undefined)?.scale,
  )

  console.info(
    '[rendering] convertStackedToGrouped pre-anim layout ' +
      JSON.stringify({
        xField,
        yField,
        colorField,
        xDomain: xDomainForAnim,
        seriesDomain: seriesDomainForAnim,
        yDomain: yDomainForAnim,
        visibleSeries: options?.visibleSeries ?? null,
        valuesLen: values.length,
        sampleValues: values.slice(0, 3),
      }),
  )

  await animateStackedToGrouped(container, options?.visibleSeries, {
    xDomain: xDomainForAnim,
    seriesDomain: seriesDomainForAnim,
    yDomain: yDomainForAnim,
    hasSeriesField: true,
  })

  await renderGroupedBarChart(container, groupedSpec)
  storeDerivedChartState(container, ChartType.GROUPED_BAR, groupedSpec)

  // Post-render verification: read back the actual painted positions and emit
  // a side-by-side diff against the animation's predicted positions. Helps
  // detect future scale-config drift (renderer padding tweaks etc.) without
  // having to manually compare two log dumps.
  logAnimationVsRenderDiff(container, options?.visibleSeries)

  return { chartType: ChartType.GROUPED_BAR, spec: groupedSpec }
}

/**
 * Aggregates rows by (category, series) pair, returning each pair's summed
 * value. Mirrors `aggregateGroupedRows` in groupedBarRenderer.ts so the
 * pre-animation y-scale matches what the renderer will produce.
 */
function aggregateByCategorySeries(
  rows: RawDatum[],
  categoryField: string,
  valueField: string,
  seriesField: string | null | undefined,
): number[] {
  const map = new Map<string, number>()
  rows.forEach((row) => {
    const categoryRaw = row[categoryField]
    const value = Number(row[valueField])
    if (categoryRaw == null || !Number.isFinite(value)) return
    const seriesRaw = seriesField ? row[seriesField] ?? null : null
    const key = `${String(categoryRaw)}__${seriesRaw == null ? '' : String(seriesRaw)}`
    map.set(key, (map.get(key) ?? 0) + value)
  })
  return Array.from(map.values())
}

/**
 * After the grouped renderer paints, read the actual (x, y, width, height) of
 * every main-bar and emit a JSON line per bar diffing it against the
 * animation's predicted position (keyed by `target|series`). A non-zero delta
 * indicates the scale config or layout drifted between animation and renderer
 * — i.e. the "jump" is back. Keyed by attributes (not DOM identity) because
 * `renderGroupedBarChart` wipes the SVG and re-creates rect nodes from
 * scratch on every call.
 */
function logAnimationVsRenderDiff(container: HTMLElement, visibleSeries: string[] | undefined): void {
  const visibleSet = visibleSeries ? new Set(visibleSeries) : null
  const bars = Array.from(container.querySelectorAll<SVGRectElement>('rect.main-bar'))
  const rows = bars
    .map((rect) => {
      const series = rect.getAttribute('data-series') ?? rect.getAttribute('data-group-value') ?? ''
      if (visibleSet && !visibleSet.has(series)) return null
      const target = rect.getAttribute('data-target') ?? ''
      const cached = animationTargetCache.get(`${target}|${series}`)
      const renderedX = Number(rect.getAttribute('x') ?? 0)
      const renderedY = Number(rect.getAttribute('y') ?? 0)
      const renderedW = Number(rect.getAttribute('width') ?? 0)
      const renderedH = Number(rect.getAttribute('height') ?? 0)
      return {
        target,
        series,
        rendered: { x: renderedX, y: renderedY, w: renderedW, h: renderedH },
        animatedTo: cached ?? null,
        delta: cached
          ? {
              dx: +(renderedX - cached.x).toFixed(2),
              dy: +(renderedY - cached.y).toFixed(2),
              dw: +(renderedW - cached.w).toFixed(2),
              dh: +(renderedH - cached.h).toFixed(2),
            }
          : null,
      }
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
  const maxAbsDelta = rows.reduce((acc, r) => {
    if (!r.delta) return acc
    return Math.max(acc, Math.abs(r.delta.dx), Math.abs(r.delta.dy), Math.abs(r.delta.dw), Math.abs(r.delta.dh))
  }, 0)
  console.info(
    '[rendering] stacked-to-grouped post-render diff ' +
      JSON.stringify({ maxAbsDelta: +maxAbsDelta.toFixed(2), bars: rows }),
  )
  animationTargetCache = new Map()
}

/**
 * Cache populated by `animateStackedToGrouped` and read by
 * `logAnimationVsRenderDiff`. Keyed by `${target}|${series}` rather than DOM
 * node because `renderGroupedBarChart` swaps out all rect nodes. Reset
 * between conversions so stale entries from a prior pairDiff don't pollute
 * the diff log.
 */
let animationTargetCache: Map<string, { x: number; y: number; w: number; h: number }> = new Map()

/**
 * Pre-computed target layout passed in from `convertStackedToGrouped`. These
 * fields mirror what `renderGroupedBarChart` will compute internally so the
 * animation can drive bars to those exact final positions — eliminating the
 * "snap" between animation-end and renderer-paint that case
 * 11e148qcs7x70t8v exhibited before this change. See
 * `convertStackedToGrouped` for how each value is derived; the d3 scale
 * recipe below must stay in lockstep with groupedBarRenderer.ts lines
 * 413-419.
 */
type StackedToGroupedTargetLayout = {
  xDomain: Array<string | number>
  seriesDomain: Array<string | number>
  yDomain: [number, number]
  hasSeriesField: boolean
}

async function animateStackedToGrouped(
  container: HTMLElement,
  visibleSeries: string[] | undefined,
  targetLayout: StackedToGroupedTargetLayout,
): Promise<void> {
  const svg = container.querySelector('svg')
  if (!svg) return

  const plotH = parseFloat(svg.getAttribute('data-plot-h') ?? '0')
  const plotW = parseFloat(svg.getAttribute('data-plot-w') ?? '0')
  if (!plotH || !plotW) return

  type BarEntry = {
    el: SVGRectElement
    target: string
    series: string
    value: number
    x: number
    y: number
    width: number
    height: number
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
      y: parseFloat(el.getAttribute('y') ?? '0'),
      width: parseFloat(el.getAttribute('width') ?? '0'),
      height: parseFloat(el.getAttribute('height') ?? '0'),
    }))
    .filter((b) => b.target && b.series)

  if (!bars.length) return

  const visibleSet = visibleSeries
    ? new Set(visibleSeries)
    : new Set([...new Set(bars.map((b) => b.series))])

  // Outer / inner / y scales: MUST mirror groupedBarRenderer.ts so the
  // animation's end-frame matches the renderer's first paint pixel-for-pixel.
  // Stacked uses .padding(0.2), grouped uses .paddingInner(0.18).paddingOuter(0.08)
  // — replicate the latter here, not the former.
  const xScale = d3
    .scaleBand<string | number>()
    .domain(targetLayout.xDomain)
    .range([0, plotW])
    .paddingInner(0.18)
    .paddingOuter(0.08)
  const innerScale = d3
    .scaleBand<string | number>()
    .domain(targetLayout.seriesDomain)
    .range([0, Math.max(xScale.bandwidth(), 1)])
    .padding(targetLayout.hasSeriesField ? 0.08 : 0)
  const yGrouped = d3.scaleLinear().domain(targetLayout.yDomain).nice().range([plotH, 0])
  const zeroY = yGrouped(0)

  console.info(
    '[rendering] animateStackedToGrouped scales ' +
      JSON.stringify({
        plotW,
        plotH,
        outerBandwidth: xScale.bandwidth(),
        innerBandwidth: innerScale.bandwidth(),
        outerStep: xScale.step(),
        innerStep: innerScale.step(),
        outerPaddingInner: xScale.paddingInner(),
        outerPaddingOuter: xScale.paddingOuter(),
        innerPadding: innerScale.padding(),
        niceYDomain: yGrouped.domain(),
        xDomain: targetLayout.xDomain,
        seriesDomain: targetLayout.seriesDomain,
        yDomainPre: targetLayout.yDomain,
      }),
  )

  const duration = NON_SPLIT_UPDATE_MS
  const ease = d3.easeCubicInOut

  // Collect every transition's `.end()` promise so the final `await` waits
  // for the ACTUAL animations to settle. Previous implementation created a
  // fresh unnamed transition at the tail, which d3 treats as an interrupt of
  // the prior unnamed transitions on the same elements — the stacked→grouped
  // animation barely had time to start before being cancelled. That is the
  // root cause of the "no animation" symptom reported on case
  // 11e148qcs7x70t8v.
  const transitionPromises: Promise<void>[] = []

  // 비가시 바: fade out + collapse
  const hideBars = bars.filter((b) => !visibleSet.has(b.series))
  if (hideBars.length) {
    hideBars.forEach((b) => {
      animationTargetCache.set(`${b.target}|${b.series}`, { x: b.x, y: b.y, w: b.width, h: 0 })
    })
    transitionPromises.push(
      d3.selectAll<SVGRectElement, unknown>(hideBars.map((b) => b.el))
        .transition()
        .duration(duration)
        .ease(ease)
        .attr('opacity', 0)
        .attr('height', 0)
        .end()
        .catch(() => undefined),
    )
  }

  // 가시 바: stacked → grouped 위치로 이동, with the renderer's exact final
  // positions cached per-rect so `logAnimationVsRenderDiff` can compare.
  const showBars = bars.filter((b) => visibleSet.has(b.series))
  const debugRows: Array<Record<string, unknown>> = []
  showBars.forEach((b) => {
    const groupOriginX = xScale(b.target) ?? 0
    const offsetX = innerScale(b.series) ?? 0
    const finalX = groupOriginX + offsetX
    const finalW = innerScale.bandwidth()
    const finalY = b.value >= 0 ? yGrouped(b.value) : zeroY
    const finalH = Math.abs(yGrouped(b.value) - zeroY)

    animationTargetCache.set(`${b.target}|${b.series}`, { x: finalX, y: finalY, w: finalW, h: finalH })
    debugRows.push({
      target: b.target,
      series: b.series,
      value: b.value,
      from: { x: b.x, y: b.y, w: b.width, h: b.height },
      to: { x: finalX, y: finalY, w: finalW, h: finalH },
      delta: {
        dx: +(finalX - b.x).toFixed(2),
        dy: +(finalY - b.y).toFixed(2),
        dw: +(finalW - b.width).toFixed(2),
        dh: +(finalH - b.height).toFixed(2),
      },
    })

    transitionPromises.push(
      d3.select(b.el)
        .transition()
        .duration(duration)
        .ease(ease)
        .attr('x', finalX)
        .attr('width', finalW)
        .attr('y', finalY)
        .attr('height', finalH)
        .end()
        .catch(() => undefined),
    )
  })

  console.info(
    '[rendering] animateStackedToGrouped per-bar plan ' +
      JSON.stringify({
        showBarCount: showBars.length,
        hideBarCount: hideBars.length,
        bars: debugRows,
      }),
  )

  // Y축 전환
  const yAxisEl = container.querySelector<SVGGElement>('svg g.y-axis')
  if (yAxisEl) {
    const yAxisGrouped = d3.axisLeft(yGrouped).ticks(5)
    transitionPromises.push(
      d3.select<SVGGElement, unknown>(yAxisEl)
        .transition()
        .duration(duration)
        .ease(ease)
        .call(yAxisGrouped as any)
        .end()
        .catch(() => undefined),
    )
  }

  console.info(
    '[rendering] animateStackedToGrouped scheduled ' +
      JSON.stringify({
        duration,
        showBarCount: showBars.length,
        hideBarCount: hideBars.length,
        transitionCount: transitionPromises.length,
      }),
  )

  // Await every transition's natural completion. No additional empty
  // transition that would interrupt the real ones.
  await Promise.all(transitionPromises)
  console.info('[rendering] animateStackedToGrouped settled')
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
    return null
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
    return null
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

  await animateGroupedToStacked(container)
  await renderStackedBarChart(container, stackedSpec)
  storeDerivedChartState(container, ChartType.STACKED_BAR, stackedSpec)
  return { chartType: ChartType.STACKED_BAR, spec: stackedSpec }
}

async function animateGroupedToStacked(container: HTMLElement): Promise<void> {
  const svg = container.querySelector('svg')
  if (!svg) return

  type BarEntry = {
    el: SVGRectElement
    panelKey: string
    target: string
    series: string
    value: number
    x: number
    y: number
    width: number
  }

  const bars: BarEntry[] = Array.from(container.querySelectorAll<SVGRectElement>('rect.main-bar'))
    .map((el) => ({
      el,
      panelKey: el.getAttribute('data-chart-id') ?? 'root',
      target: el.getAttribute('data-target') ?? '',
      series: el.getAttribute('data-series') ?? el.getAttribute('data-group-value') ?? '',
      value: parseFloat(el.getAttribute('data-value') ?? '0'),
      x: parseFloat(el.getAttribute('x') ?? '0'),
      y: parseFloat(el.getAttribute('y') ?? '0'),
      width: parseFloat(el.getAttribute('width') ?? '0'),
    }))
    .filter((bar) => bar.target && bar.series && Number.isFinite(bar.value))

  if (!bars.length) return

  const byPanel = d3.group(bars, (bar) => bar.panelKey)
  const metrics = new Map<SVGRectElement, { x: number; y: number; width: number; height: number }>()
  const axisTransitions: Array<Promise<void>> = []

  byPanel.forEach((panelBars, panelKey) => {
    const panel =
      panelKey === 'root'
        ? null
        : container.querySelector<SVGGElement>(`g[data-chart-id="${CSS.escape(panelKey)}"]`)
    const plotH = parseFloat(
      panel?.getAttribute('data-panel-plot-h') ??
      svg.getAttribute('data-plot-h') ??
      '0',
    )
    if (!plotH) return

    const targets = [...new Set(panelBars.map((bar) => bar.target))]
    const series = [...new Set(panelBars.map((bar) => bar.series))]
    const groupedByTarget = d3.group(panelBars, (bar) => bar.target)
    const maxTotal = d3.max(targets, (target) => {
      const targetBars = groupedByTarget.get(target) ?? []
      return d3.sum(targetBars, (bar) => Math.max(0, bar.value))
    }) ?? 0
    const yStacked = d3.scaleLinear().domain([0, maxTotal]).nice().range([plotH, 0])

    targets.forEach((target) => {
      const targetBars = groupedByTarget.get(target) ?? []
      const x1 = d3.min(targetBars, (bar) => bar.x) ?? 0
      const x2 = d3.max(targetBars, (bar) => bar.x + bar.width) ?? x1
      let cursor = 0
      series.forEach((seriesKey) => {
        const bar = targetBars.find((entry) => entry.series === seriesKey)
        if (!bar) return
        const next = cursor + Math.max(0, bar.value)
        metrics.set(bar.el, {
          x: x1,
          y: yStacked(next),
          width: Math.max(1, x2 - x1),
          height: Math.max(0, yStacked(cursor) - yStacked(next)),
        })
        cursor = next
      })
    })

    const yAxisEl = panel
      ? panel.querySelector<SVGGElement>('g.y-axis')
      : container.querySelector<SVGGElement>('svg g.y-axis')
    if (yAxisEl) {
      axisTransitions.push(
        d3.select<SVGGElement, unknown>(yAxisEl)
          .transition()
          .duration(NON_SPLIT_UPDATE_MS)
          .ease(d3.easeCubicInOut)
          .call(d3.axisLeft(yStacked).ticks(5) as any)
          .end()
          .catch(() => {}),
      )
    }
  })

  if (!metrics.size) return

  const barTransition = d3
    .selectAll<SVGRectElement, unknown>(Array.from(metrics.keys()))
    .interrupt()
    .transition()
    .duration(NON_SPLIT_UPDATE_MS)
    .ease(d3.easeCubicInOut)
    .attr('x', function () { return metrics.get(this)?.x ?? parseFloat(this.getAttribute('x') ?? '0') })
    .attr('y', function () { return metrics.get(this)?.y ?? parseFloat(this.getAttribute('y') ?? '0') })
    .attr('width', function () { return metrics.get(this)?.width ?? parseFloat(this.getAttribute('width') ?? '0') })
    .attr('height', function () { return metrics.get(this)?.height ?? parseFloat(this.getAttribute('height') ?? '0') })

  await Promise.all([
    barTransition.end().catch(() => {}),
    ...axisTransitions,
  ])
}

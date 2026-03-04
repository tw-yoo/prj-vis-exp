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

export async function convertStackedToGrouped(
  container: HTMLElement,
  spec: StackedSpec,
  options?: DrawStackGroupSpec,
) {
  const values = await resolveDatasetAsync(getStackedBarStoredData(container), spec)
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
      // IMPORTANT: grouped charts must disable stacking; otherwise Vega-Lite will keep stacking bars.
      y: { ...encoding.y, stack: null },
      color: {
        ...baseColor,
        field: colorField,
        type: colorType ?? 'nominal',
      },
      // Workbench chart type inference + Vega-Lite grouped rendering hint.
      // Vega-Lite v5 runtime supports xOffset; v3 schema may warn but still renders in our workbench.
      xOffset: { field: colorField, type: colorType ?? 'nominal' } as any,
    },
  }

  await renderGroupedBarChart(container, groupedSpec)
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
        // Vega-Lite centered stacking: bars diverge around y=0 (middle of the axis).
        stack: 'center',
        ...(half > 0 && !hasExplicitDomain ? { scale: { ...yScale, domain: [-half, half] } } : {}),
      } as any,
    },
  }

  await renderStackedBarChart(container, divergingSpec)
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
  // Ensure Workbench + Vega-Lite treat this as stacked (remove grouped hints).
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
}

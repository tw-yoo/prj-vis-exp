import type { ChartSpec } from '../../../src/api/types'

const CHART_SPEC_MODULES = import.meta.glob('../../../ChartQA/data/vlSpec/**/*.json', {
  as: 'raw',
}) as Record<string, () => Promise<string>>

const SPEC_LOADERS = new Map<string, () => Promise<string>>()
for (const [key, loader] of Object.entries(CHART_SPEC_MODULES)) {
  const id = key.split('/').pop()?.replace('.json', '')
  if (id) SPEC_LOADERS.set(id, loader)
}

export function listChartIds(): string[] {
  return [...SPEC_LOADERS.keys()].sort()
}

export function hasChartQASpec(chartId: string): boolean {
  return SPEC_LOADERS.has(chartId)
}

function normalizeSpecDataUrl(rawUrl: string | undefined): string | undefined {
  if (!rawUrl || typeof rawUrl !== 'string') return rawUrl
  if (/^https?:\/\//i.test(rawUrl)) return rawUrl
  if (rawUrl.startsWith('/')) return rawUrl
  if (rawUrl.startsWith('ChartQA/')) return `/${rawUrl}`
  if (rawUrl.startsWith('data/test/')) return `/${rawUrl}`
  if (rawUrl.startsWith('data/')) return `/ChartQA/${rawUrl}`
  return rawUrl
}

function patchSpecDataUrls(spec: ChartSpec): ChartSpec {
  const clone: ChartSpec = JSON.parse(JSON.stringify(spec)) as ChartSpec
  const dataLike = clone.data as { url?: unknown } | undefined
  if (dataLike && typeof dataLike.url === 'string') {
    ;(clone.data as { url?: string }).url = normalizeSpecDataUrl(dataLike.url)
  }
  if (Array.isArray(clone.layer)) {
    clone.layer = clone.layer.map((layer) => {
      const next = { ...(layer as Record<string, unknown>) }
      const layerData = next.data as { url?: unknown } | undefined
      if (layerData && typeof layerData.url === 'string') {
        next.data = {
          ...layerData,
          url: normalizeSpecDataUrl(layerData.url),
        } as unknown as ChartSpec['data']
      }
      return next
    }) as unknown as ChartSpec['layer']
  }
  return clone
}

export type SpecResolution =
  | { ok: true; spec: ChartSpec }
  | { ok: false; error: string }

export async function resolveSpec(chartId: string): Promise<SpecResolution> {
  if (!chartId) {
    return { ok: false, error: 'chart_id is empty.' }
  }
  const loader = SPEC_LOADERS.get(chartId)
  if (!loader) {
    return {
      ok: false,
      error: `No ChartQA spec for chart_id "${chartId}".`,
    }
  }
  try {
    const raw = await loader()
    const parsed = JSON.parse(raw) as ChartSpec
    return { ok: true, spec: patchSpecDataUrls(parsed) }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

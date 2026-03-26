import type { OpsSpecInput, VegaLiteSpec } from '../../../src/api/types'

export const DEMO_VL_SPEC_PATH = '/survey/data/vlSpec/ch_bar_grouped_203_88.json'
export const DEMO_OPS_SPEC_PATH = '/survey/data/opsSpec/op_bar_grouped_203_88.json'
export const DEMO_SENTENCES_PATH = '/survey/data/demo/sentences_bar_grouped_203_88.json'

export type DemoAssets = {
  vlSpec: VegaLiteSpec
  opsSpec: OpsSpecInput
  sentences: string[]
}

function normalizeStaticDataUrl(url: string) {
  const trimmed = url.trim()
  if (!trimmed) return trimmed
  if (trimmed.startsWith('/') || /^https?:\/\//i.test(trimmed)) return trimmed
  return `/${trimmed.replace(/^\.?\//, '')}`
}

function normalizeSpecDataPath(spec: VegaLiteSpec): VegaLiteSpec {
  if (!spec.data?.url || typeof spec.data.url !== 'string') {
    return spec
  }
  return {
    ...spec,
    data: {
      ...spec.data,
      url: normalizeStaticDataUrl(spec.data.url),
    },
  }
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`Failed to load ${path} (${response.status})`)
  }
  return response.json() as Promise<T>
}

function assertSentenceList(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    throw new Error('Sentence JSON must be a string array.')
  }
  return value
}

export async function loadDemoAssets(): Promise<DemoAssets> {
  const [vlSpecRaw, opsSpec, sentencesRaw] = await Promise.all([
    fetchJson<VegaLiteSpec>(DEMO_VL_SPEC_PATH),
    fetchJson<OpsSpecInput>(DEMO_OPS_SPEC_PATH),
    fetchJson<unknown>(DEMO_SENTENCES_PATH),
  ])

  return {
    vlSpec: normalizeSpecDataPath(vlSpecRaw),
    opsSpec,
    sentences: assertSentenceList(sentencesRaw),
  }
}

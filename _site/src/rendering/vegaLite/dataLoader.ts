import { csvParse } from 'd3-dsv'
import type { JsonValue } from '../../types'

export type VegaLiteDataRef =
  | {
      url?: string
      values?: JsonValue[]
      [key: string]: unknown
    }
  | undefined

type RawDatum = Record<string, JsonValue>

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function normalizeVegaLiteDataUrl(rawUrl: string | undefined): string | undefined {
  if (!rawUrl || typeof rawUrl !== 'string') return rawUrl
  const url = rawUrl.trim()
  if (!url) return url
  if (/^[a-z][a-z0-9+\-.]*:/i.test(url)) return url
  if (url.startsWith('/')) return url
  if (url.startsWith('./') || url.startsWith('../')) return url
  if (url.startsWith('ChartQA/')) return `/${url}`
  return url
}

function buildDataUrlCandidates(rawUrl: string): string[] {
  const base = normalizeVegaLiteDataUrl(rawUrl)?.trim() || ''
  if (!base) return []
  if (/^[a-z][a-z0-9+\-.]*:/i.test(base)) return [base]
  if (base.startsWith('/')) return [base]
  if (base.startsWith('./') || base.startsWith('../')) return [base]
  return [base, `/${base}`]
}

function toAbsoluteUrl(raw: string) {
  if (typeof window === 'undefined') return raw
  try {
    return new URL(raw, window.location.href).toString()
  } catch {
    return raw
  }
}

function looksLikeHtml(text: string) {
  const trimmed = (text || '').trim().toLowerCase()
  return trimmed.startsWith('<!doctype') || trimmed.startsWith('<html') || trimmed.startsWith('<head') || trimmed.startsWith('<body')
}

export async function loadRowsFromVegaLiteData(
  data: VegaLiteDataRef,
  opts: { debugLabel?: string; debug?: boolean } = {},
): Promise<RawDatum[]> {
  if (!data || !isRecord(data)) return []

  const values = data.values
  if (Array.isArray(values)) {
    return values.filter((v): v is RawDatum => !!v && typeof v === 'object' && !Array.isArray(v)) as RawDatum[]
  }

  const rawUrl = typeof data.url === 'string' ? data.url : ''
  const candidates = buildDataUrlCandidates(rawUrl)
  if (!candidates.length) return []

  for (const url of candidates) {
    const abs = toAbsoluteUrl(url)
    let res: Response
    try {
      res = await fetch(abs, { cache: 'no-store' })
    } catch (err) {
      if (opts.debug) console.warn(`[dataLoader] fetch failed (${opts.debugLabel ?? url})`, err)
      continue
    }

    if (!res.ok) {
      if (opts.debug) console.warn(`[dataLoader] HTTP ${res.status} (${opts.debugLabel ?? url})`)
      continue
    }

    const contentType = res.headers.get('content-type') || ''
    const isJson = contentType.includes('application/json') || url.toLowerCase().endsWith('.json')

    try {
      if (isJson) {
        const parsed = await res.json()
        if (Array.isArray(parsed)) {
          return parsed.filter((v): v is RawDatum => !!v && typeof v === 'object' && !Array.isArray(v)) as RawDatum[]
        }
        return []
      }

      const text = await res.text()
      if (looksLikeHtml(text)) {
        if (opts.debug) console.warn(`[dataLoader] HTML fallback detected (${opts.debugLabel ?? url})`)
        continue
      }

      // d3-dsv returns string values; Vega-Lite will parse numbers where needed.
      const rows = csvParse(text) as unknown as Array<Record<string, string>>
      return rows.map((row) => row as unknown as RawDatum)
    } catch (err) {
      if (opts.debug) console.warn(`[dataLoader] parse failed (${opts.debugLabel ?? url})`, err)
    }
  }

  return []
}

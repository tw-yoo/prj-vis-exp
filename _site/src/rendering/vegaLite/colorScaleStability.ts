import type { JsonValue } from '../../types'
import { applyVegaLiteTransforms } from './transform'
import { walkVegaLiteSpec } from './specWalk'

type RawDatum = Record<string, JsonValue>

type DebugOptions = {
  debug?: boolean
  logColorStability?: boolean
}

type EnsureOptions = {
  loadRows: (data: unknown) => Promise<RawDatum[]>
  debug?: DebugOptions
  legendBehavior?: 'presentOnly' | 'all' | 'spec'
}

type CategoryPalette = string[]

const PALETTE_MAP_CACHE: Map<string, Map<string, string>> = new Map()
const CANONICAL_DOMAIN_CACHE: Map<string, JsonValue[]> = new Map()
const MAX_CACHE_ENTRIES = 100

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function stableHashString(input: string) {
  // djb2
  let hash = 5381
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 33) ^ input.charCodeAt(i)
  }
  return (hash >>> 0).toString(16)
}

function toAbsoluteUrl(raw: string) {
  if (typeof window === 'undefined') return raw
  try {
    return new URL(raw, window.location.href).toString()
  } catch {
    return raw
  }
}

function dataIdentity(data: unknown): string {
  if (!isRecord(data)) return 'data:none'
  if (typeof data.url === 'string' && data.url.trim() !== '') {
    return `url:${toAbsoluteUrl(data.url.trim())}`
  }
  if (Array.isArray(data.values)) {
    try {
      const str = JSON.stringify(data.values)
      return `values:${stableHashString(str)}`
    } catch {
      return `values:${String(data.values.length)}`
    }
  }
  return 'data:unknown'
}

function specIdentity(specRoot: Record<string, unknown>): string | null {
  const description = typeof specRoot.description === 'string' ? specRoot.description.trim() : ''
  const title = typeof specRoot.title === 'string' ? specRoot.title.trim() : ''
  const parts = [description, title].filter((value) => value.length > 0)
  if (parts.length === 0) return null
  return parts.join('|')
}

function calculateSignature(transforms: JsonValue[]) {
  const parts: string[] = []
  transforms.forEach((t) => {
    if (!isRecord(t)) return
    const calc = t.calculate
    const asKey = t.as
    if (typeof calc === 'string' && typeof asKey === 'string') {
      parts.push(`${asKey}=${calc}`)
    }
  })
  return parts.join('|')
}

function transformsOnlyCalculate(transforms: JsonValue[]) {
  return transforms.filter((t) => isRecord(t) && typeof (t as any).calculate === 'string' && typeof (t as any).as === 'string')
}

function domainSignature(domain: JsonValue[]) {
  return stableHashString(domain.map((value) => String(value)).join('\u0001'))
}

function hasFilterTransform(transforms: JsonValue[]) {
  return transforms.some((t) => isRecord(t) && (t as Record<string, unknown>).filter !== undefined)
}

function asField(channel: unknown) {
  if (!isRecord(channel)) return ''
  return typeof channel.field === 'string' ? channel.field.trim() : ''
}

function isSubsetDomain(values: JsonValue[], candidateSuperset: JsonValue[]) {
  const set = new Set(candidateSuperset.map((v) => String(v)))
  return values.every((v) => set.has(String(v)))
}

function sortDomainValues(values: JsonValue[]) {
  return values.slice().sort((a, b) => {
    const numA = Number(a)
    const numB = Number(b)
    const bothNumeric = Number.isFinite(numA) && Number.isFinite(numB)
    if (bothNumeric) return numA - numB
    return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
  })
}

function canonicalizeDomainOrder(domain: JsonValue[], colorEnc: Record<string, unknown>) {
  const sort = colorEnc.sort
  if (Array.isArray(sort)) {
    const sortOrder = new Map(sort.map((v, i) => [String(v), i]))
    const known = domain
      .filter((v) => sortOrder.has(String(v)))
      .sort((a, b) => (sortOrder.get(String(a)) ?? 0) - (sortOrder.get(String(b)) ?? 0))
    const unknown = sortDomainValues(domain.filter((v) => !sortOrder.has(String(v))))
    return [...known, ...unknown]
  }

  // Preserve observed order by default. We only reorder when the spec explicitly requests it.
  if (sort === undefined || sort === null) return domain
  if (sort === 'ascending' || sort === true) {
    return sortDomainValues(domain)
  }
  if (sort === 'descending') {
    return sortDomainValues(domain).reverse()
  }
  return domain
}

function uniqueDomain(values: JsonValue[]) {
  const out: JsonValue[] = []
  const seen = new Set<string>()
  values.forEach((v) => {
    if (v == null) return
    const key = String(v)
    if (!key || seen.has(key)) return
    seen.add(key)
    out.push(v)
  })
  return out
}

function resolveCategoryPaletteFromSpecRoot(specRoot: Record<string, unknown>): CategoryPalette {
  const candidate = (specRoot as any)?.config?.range?.category
  if (Array.isArray(candidate) && candidate.every((v) => typeof v === 'string' && v.trim().length > 0)) {
    return candidate as string[]
  }
  // Fallback: match normalizeSpec default palette (kept local to avoid importing domain logic).
  return ['#60a5fa', '#fb7185', '#f59e0b', '#10b981', '#c084fc', '#f472b6', '#22d3ee', '#a3e635', '#f97316']
}

function evictIfNeeded<T>(cache: Map<string, T>) {
  if (cache.size <= MAX_CACHE_ENTRIES) return
  const first = cache.keys().next().value
  if (first) cache.delete(first)
}

function hasExplicitScaleDomainOrRange(colorEnc: Record<string, unknown>) {
  const scale = isRecord(colorEnc.scale) ? (colorEnc.scale as Record<string, unknown>) : null
  if (!scale) return false
  return scale.domain !== undefined || scale.range !== undefined
}

function ensureLegendValues(colorEnc: Record<string, unknown>, values: JsonValue[], behavior: EnsureOptions['legendBehavior']) {
  if (behavior !== 'presentOnly') return
  if (colorEnc.legend === null) return
  const legend = isRecord(colorEnc.legend) ? (colorEnc.legend as Record<string, unknown>) : null
  if (legend && legend.values !== undefined) return
  colorEnc.legend = { ...(legend ?? {}), values }
}

function ensureScaleDomainRange(colorEnc: Record<string, unknown>, domain: JsonValue[], range: string[]) {
  const scale = isRecord(colorEnc.scale) ? (colorEnc.scale as Record<string, unknown>) : {}
  colorEnc.scale = { ...scale, domain, range }
}

function buildPaletteMap(fullDomain: JsonValue[], palette: CategoryPalette) {
  const map = new Map<string, string>()
  fullDomain.forEach((value, idx) => {
    map.set(String(value), palette[idx % palette.length]!)
  })
  return map
}

export async function ensureStableOrdinalColorMapping(spec: unknown, options: EnsureOptions): Promise<unknown> {
  if (!isRecord(spec)) return spec

  const specRoot = spec as Record<string, unknown>
  const palette = resolveCategoryPaletteFromSpecRoot(specRoot)
  const legendBehavior = options.legendBehavior ?? 'presentOnly'
  const debug = options.debug ?? {}
  const rowsCache: Map<string, Promise<RawDatum[]>> = new Map()

  const loadRowsCached = (data: unknown) => {
    const key = dataIdentity(data)
    if (!rowsCache.has(key)) {
      rowsCache.set(key, options.loadRows(data))
    }
    return rowsCache.get(key)!
  }

  await walkVegaLiteSpec(specRoot, async ({ node, effectiveData, effectiveTransforms }) => {
    const encoding = isRecord(node.encoding) ? (node.encoding as Record<string, unknown>) : null
    if (!encoding) return

    const color = encoding.color
    if (!isRecord(color)) return
    if (typeof color.field !== 'string' || color.field.trim() === '') return

    const hasFilter = hasFilterTransform(effectiveTransforms)
    const colorField = color.field.trim()
    const dataKey = dataIdentity(effectiveData)
    const specKey = specIdentity(specRoot)
    const calcSig = calculateSignature(effectiveTransforms)
    const xField = asField(encoding.x)
    const yField = asField(encoding.y)
    // IMPORTANT: data.url can change when the app materializes temp.csv for filtered variants.
    // Use a "logical spec key" (description/title) when available so canonical domains persist
    // across equivalent specs with different data identities.
    const logicalKey = specKey ? `spec:${specKey}` : `data:${dataKey}`
    const domainKeyBase = `domain:${logicalKey}|field:${colorField}|x:${xField}|y:${yField}|calc:${calcSig}`
    const hasExplicitScale = hasExplicitScaleDomainOrRange(color)
    const rowsAll = await loadRowsCached(effectiveData)
    const rowsCalc = applyVegaLiteTransforms(rowsAll, transformsOnlyCalculate(effectiveTransforms))
    const observedDomainRaw = uniqueDomain(rowsCalc.map((row) => (row as RawDatum)[colorField]))
    if (observedDomainRaw.length === 0) return
    const observedDomain = canonicalizeDomainOrder(observedDomainRaw, color)

    const cachedCanonicalDomain = CANONICAL_DOMAIN_CACHE.get(domainKeyBase) ?? []
    const canonicalDomain =
      cachedCanonicalDomain.length > 0 && isSubsetDomain(observedDomain, cachedCanonicalDomain)
        ? cachedCanonicalDomain
        : observedDomain
    CANONICAL_DOMAIN_CACHE.set(domainKeyBase, canonicalDomain)
    evictIfNeeded(CANONICAL_DOMAIN_CACHE)

    // Never override an explicit spec scale; still keep canonical domain cached for downstream variants.
    if (hasExplicitScale) return

    const paletteKey = `pal:${domainKeyBase}|domain:${domainSignature(canonicalDomain)}`
    if (!PALETTE_MAP_CACHE.has(paletteKey)) {
      PALETTE_MAP_CACHE.set(paletteKey, buildPaletteMap(canonicalDomain, palette))
      evictIfNeeded(PALETTE_MAP_CACHE)
    }

    const paletteMap = PALETTE_MAP_CACHE.get(paletteKey)!
    const presentDomain = (() => {
      if (!hasFilter) return canonicalDomain
      const rowsFiltered = applyVegaLiteTransforms(rowsAll, effectiveTransforms)
      const presentDomainRaw = uniqueDomain(rowsFiltered.map((row) => (row as RawDatum)[colorField]))
      if (presentDomainRaw.length === 0) return []

      // Keep legend + scale order stable by ordering present domain by the canonical (unfiltered) domain.
      const presentSet = new Set(presentDomainRaw.map((v) => String(v)))
      const presentDomainOrdered = canonicalDomain.filter((v) => presentSet.has(String(v)))
      const extras = presentDomainRaw.filter((v) => !presentDomainOrdered.some((x) => String(x) === String(v)))
      return [...presentDomainOrdered, ...extras]
    })()
    if (presentDomain.length === 0) return

    const range = presentDomain.map((value) => paletteMap.get(String(value)) ?? palette[0]!)
    ensureScaleDomainRange(color, presentDomain, range)
    if (hasFilter) {
      ensureLegendValues(color, presentDomain, legendBehavior)
    }

    if (debug.logColorStability) {
      console.log('[ColorStability]', {
        field: colorField,
        observedDomain,
        canonicalDomain,
        presentDomain,
        range,
        dataKey,
      })
    }
  })

  return specRoot
}

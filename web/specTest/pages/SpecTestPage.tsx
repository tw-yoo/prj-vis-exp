import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import '../../App.css'
import '../specTest.css'
import type { VegaLiteSpec } from '../../../src/api/types'
import { browserEngine } from '../../engine/createBrowserEngine'
import { csvParse, tsvParse } from 'd3'

type UnknownRecord = Record<string, unknown>

type UiField = {
  key: string
  kind: string
  required: boolean
  options?: string[]
  optionsSource?: string
  refAllowed?: boolean
  description?: string
}

type UiOp = {
  op: string
  label: string
  fields: UiField[]
  semanticNotes?: string[]
}

type OpRegistrySchema = {
  version: number
  ops: UiOp[]
  meta?: {
    refFormat?: string
    nodeIdRequired?: boolean
    inputsRequired?: boolean
    sentenceIndexRequired?: boolean
  }
}

type ChartContext = {
  fields: string[]
  dimension_fields: string[]
  measure_fields: string[]
  primary_dimension: string
  primary_measure: string
  series_field?: string | null
  categorical_values: Record<string, Array<string | number>>
}

type CanonicalizeResponse = {
  ops_spec: Record<string, UnknownRecord[]>
  warnings?: string[]
  chart_context: ChartContext
}

type EditableOp = UnknownRecord & {
  op: string
  id: string
  meta: { nodeId: string; inputs: string[]; sentenceIndex: number }
}

type SentenceNode = {
  sentenceIndex: number
  opIds: string[]
}

type GraphLayoutNode = {
  id: string
  op: string
  sentenceIndex: number
  x: number
  y: number
}

type GraphLayoutEdge = {
  from: string
  to: string
}

const CHART_SPEC_MODULES = {
  ...import.meta.glob('../../../ChartQA/data/vlSpec/**/*.json', { as: 'raw' }),
  // TEMP: include repo-local test specs for quick debugging in specTest.
  ...import.meta.glob('../../../data/test/spec/*.json', { as: 'raw' }),
} as Record<string, () => Promise<string>>

function resolveDefaultNlpEndpoint(): string {
  const env =
    typeof import.meta !== 'undefined' ? ((import.meta as { env?: Record<string, unknown> }).env ?? {}) : {}
  const fromEnv = typeof env.VITE_NLP_SERVER_URL === 'string' ? env.VITE_NLP_SERVER_URL : ''
  const normalized = fromEnv.trim()
  if (normalized) return normalized.replace(/\/+$/, '')
  return 'http://localhost:3000'
}

function normalizeSpecDataUrl(rawUrl: string | undefined) {
  if (!rawUrl || typeof rawUrl !== 'string') return rawUrl
  if (/^https?:\/\//i.test(rawUrl)) return rawUrl
  if (rawUrl.startsWith('/')) return rawUrl
  if (rawUrl.startsWith('ChartQA/')) return `/${rawUrl}`
  // TEMP: repo-local test fixtures live under /data/test/** (not under /ChartQA/**).
  // Without this, "data/test/..." would be incorrectly rewritten to "/ChartQA/data/test/..."
  // and the dev server might return HTML (SPA fallback), causing empty/invalid data and
  // Vega warnings like "Infinite extent for field ...".
  if (rawUrl.startsWith('data/test/')) return `/${rawUrl}`
  if (rawUrl.startsWith('data/')) return `/ChartQA/${rawUrl}`
  return rawUrl
}

function patchSpecDataUrls(spec: VegaLiteSpec): VegaLiteSpec {
  const clone: VegaLiteSpec = JSON.parse(JSON.stringify(spec)) as VegaLiteSpec
  if (clone.data && typeof (clone.data as { url?: unknown }).url === 'string') {
    ;(clone.data as { url?: string }).url = normalizeSpecDataUrl((clone.data as { url?: string }).url)
  }
  if (Array.isArray(clone.layer)) {
    clone.layer = clone.layer.map((layer) => {
      const nextLayer = { ...(layer as Record<string, unknown>) }
      const layerData = nextLayer.data as { url?: unknown } | undefined
      if (layerData && typeof layerData.url === 'string') {
        nextLayer.data = { ...layerData, url: normalizeSpecDataUrl(layerData.url) } as unknown as VegaLiteSpec['data']
      }
      return nextLayer
    }) as unknown as VegaLiteSpec['layer']
  }
  return clone
}

function splitSentences(explanation: string): string[] {
  const trimmed = (explanation || '').trim()
  if (!trimmed) return []

  // Primary rule: a blank line (double newline) separates sentences/steps.
  // Users write one step, then insert an empty line, then the next step.
  const hasBlankLine = /\n\s*\n/.test(trimmed)
  if (hasBlankLine) {
    const blocks = trimmed
      .split(/\n\s*\n+/g)
      .map((s) => (s || '').trim())
      .filter(Boolean)
      .map((block) => block.replace(/\s*\n\s*/g, ' ').trim())
    if (blocks.length) return blocks
  }

  // Fallback: split by sentence-ending punctuation or newlines.
  // IMPORTANT: do NOT split on single newlines. Authors may wrap lines manually.
  // Only blank lines (handled above) split sentences/steps.
  const normalized = trimmed.replace(/\s*\n\s*/g, ' ').trim()
  const raw = normalized
    .split(/(?:[.!?]\s+)/g)
    .map((s) => (s || '').trim())
    .filter(Boolean)
  return raw.length ? raw : [trimmed]
}

function groupNameForSentenceIndex(sentenceIndex: number): string {
  if (sentenceIndex <= 1) return 'ops'
  return `ops${sentenceIndex}`
}

function defaultOpName(registry: OpRegistrySchema | null): string {
  const names = registry?.ops?.map((item) => item.op) ?? []
  if (names.includes('retrieveValue')) return 'retrieveValue'
  return names[0] ?? 'average'
}

function isNumericText(value: string): boolean {
  const t = value.trim()
  if (!t) return false
  return /^-?(?:\\d+\\.?\\d*|\\d*\\.?\\d+)(?:e[+-]?\\d+)?$/i.test(t)
}

function parseScalar(value: string): string | number {
  const t = value.trim()
  if (isNumericText(t)) return Number(t)
  return t
}

function sampleUniqueValues(
  rows: UnknownRecord[],
  fieldName: string,
  limit: number,
): Array<string | number | boolean> {
  const seen = new Set<string>()
  const out: Array<string | number | boolean> = []
  for (const row of rows) {
    const raw = row[fieldName]
    if (raw === null || raw === undefined) continue
    if (typeof raw !== 'string' && typeof raw !== 'number' && typeof raw !== 'boolean') continue
    const key = `${typeof raw}:${String(raw)}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(raw)
    if (out.length >= limit) break
  }
  return out
}

function pruneNulls(value: unknown): unknown {
  if (value === null || value === undefined) return undefined
  if (Array.isArray(value)) {
    const out = value.map(pruneNulls).filter((v) => v !== undefined)
    return out
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    Object.entries(value as Record<string, unknown>).forEach(([k, v]) => {
      const pv = pruneNulls(v)
      if (pv === undefined) return
      out[k] = pv
    })
    return out
  }
  return value
}

async function loadChartSpecById(chartId: string): Promise<{ chartId: string; spec: VegaLiteSpec }> {
  const trimmed = chartId.trim()
  if (!trimmed) throw new Error('chart_id is empty.')

  const matches = Object.entries(CHART_SPEC_MODULES).filter(([path]) => path.endsWith(`/${trimmed}.json`))  
  if (!matches.length) {
    throw new Error(`Could not find ChartQA spec for id "${trimmed}".`)
  }
  if (matches.length > 1) {
    throw new Error(`Chart id "${trimmed}" matched multiple specs; please use a more specific id.`)
  }
  const raw = await matches[0][1]()
  const parsed = JSON.parse(raw) as VegaLiteSpec
  return { chartId: trimmed, spec: patchSpecDataUrls(parsed) }
}

function asRecord(value: unknown): UnknownRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as UnknownRecord
}

function normalizeRow(row: UnknownRecord): UnknownRecord {
  const out: UnknownRecord = {}
  Object.entries(row).forEach(([k, v]) => {
    if (v === null || v === undefined) {
      out[k] = null
      return
    }
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      out[k] = v
      return
    }
    out[k] = String(v)
  })
  return out
}

async function loadDataRowsFromSpec(spec: VegaLiteSpec): Promise<UnknownRecord[]> {
  const data = asRecord((spec as unknown as UnknownRecord).data)
  const valuesRaw = data?.values
  if (Array.isArray(valuesRaw)) {
    return valuesRaw
      .map((entry) => asRecord(entry))
      .filter((v): v is UnknownRecord => !!v)
      .map((row) => normalizeRow(row))
  }

  const urlRaw = data?.url
  const url = typeof urlRaw === 'string' ? normalizeSpecDataUrl(urlRaw) : ''
  if (!url) return []

  const response = await fetch(url, { method: 'GET', cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`Failed to load chart data (${response.status}): ${url}`)
  }

  const contentType = (response.headers.get('content-type') ?? '').toLowerCase()
  // If the dev server returns SPA HTML for an unknown path, parsing it as CSV silently
  // produces empty/invalid rows and Vega ends up with "Infinite extent" warnings.
  if (contentType.includes('text/html')) {
    throw new Error(`Chart data URL resolved to HTML (likely wrong path mapping): ${url}`)
  }

  const lowerUrl = url.toLowerCase()
  if (contentType.includes('application/json') || lowerUrl.endsWith('.json')) {
    const payload = (await response.json()) as unknown
    if (Array.isArray(payload)) {
      return payload
        .map((entry) => asRecord(entry))
        .filter((v): v is UnknownRecord => !!v)
        .map((row) => normalizeRow(row))
    }
    const obj = asRecord(payload)
    if (obj && Array.isArray(obj.values)) {
      return obj.values
        .map((entry) => asRecord(entry))
        .filter((v): v is UnknownRecord => !!v)
        .map((row) => normalizeRow(row))
    }
    return []
  }

  const text = await response.text()
  const parsed = lowerUrl.endsWith('.tsv') || contentType.includes('text/tab-separated-values') ? tsvParse(text) : csvParse(text)
  return parsed.map((row) => normalizeRow(row as unknown as UnknownRecord))
}

function downloadJson(fileName: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function formatViewSummary(view: UnknownRecord | null): string {
  if (!view) return ''
  const parts: string[] = []
  const split = typeof view.split === 'string' ? view.split : ''
  const align = typeof view.align === 'string' ? view.align : ''
  const highlight = view.highlight === true
  const referenceLine = view.reference_line === true
  const note = typeof view.note === 'string' ? view.note.trim() : ''

  if (highlight) parts.push('highlight')
  if (referenceLine) parts.push('refLine')
  if (split && split !== 'none') parts.push(`split=${split}`)
  if (align && align !== 'none') parts.push(`align=${align}`)
  if (note) {
    const short = note.length > 42 ? `${note.slice(0, 42)}…` : note
    parts.push(`note="${short}"`)
  }
  return parts.length ? `view: ${parts.join(', ')}` : ''
}

function extractOpView(op: UnknownRecord | null): UnknownRecord | null {
  if (!op) return null
  const meta = asRecord(op.meta)
  if (!meta) return null
  const view = asRecord(meta.view)
  return view ?? null
}

function groupNameToSentenceIndex(groupName: string): number | null {
  if (groupName === 'ops') return 1
  if (!groupName.startsWith('ops')) return null
  const rest = groupName.slice(3)
  if (!/^\d+$/.test(rest)) return null
  const idx = Number(rest)
  return idx >= 2 ? idx : null
}

function inferLaneCountFromGroups(groups: Record<string, UnknownRecord[]>): number {
  let maxFromGroupName = 1
  let maxFromMeta = 1
  Object.entries(groups).forEach(([groupName, list]) => {
    const gIdx = groupNameToSentenceIndex(groupName)
    if (gIdx) maxFromGroupName = Math.max(maxFromGroupName, gIdx)
    if (!Array.isArray(list)) return
    list.forEach((op) => {
      const meta = asRecord(op.meta)
      const sIdx = meta && typeof meta.sentenceIndex === 'number' ? meta.sentenceIndex : null
      if (sIdx && Number.isFinite(sIdx)) maxFromMeta = Math.max(maxFromMeta, Math.floor(sIdx))
    })
  })
  return Math.max(1, maxFromGroupName, maxFromMeta)
}

function inferLaneCountFromState(sentences: string[], ops: Record<string, EditableOp>): number {
  const fromSentences = Math.max(1, sentences.length)
  let fromOps = 1
  Object.values(ops).forEach((op) => {
    const idx = op?.meta?.sentenceIndex
    if (typeof idx === 'number' && Number.isFinite(idx)) fromOps = Math.max(fromOps, Math.floor(idx))
  })
  return Math.max(1, fromSentences, fromOps)
}

function padSentences(sentences: string[], laneCount: number): string[] {
  const out: string[] = []
  const n = Math.max(1, laneCount)
  if (!sentences.length) {
    for (let i = 1; i <= n; i += 1) {
      out.push(i === 1 ? '(No sentence text available)' : `(missing sentence ${i})`)
    }
    return out
  }
  for (let i = 1; i <= n; i += 1) {
    const s = sentences[i - 1]
    out.push(typeof s === 'string' && s.trim() ? s : `(missing sentence ${i})`)
  }
  return out
}

function normalizeImportedGroups(payload: unknown): Record<string, UnknownRecord[]> {
  const obj = asRecord(payload)
  if (!obj) throw new Error('Invalid JSON: expected an object.')

  const candidate =
    asRecord(obj.gold_ops_spec) ??
    asRecord(obj.ops_spec) ??
    // /generate_grammar minimal response shape: { "ops1": { "ops": [...], "ops2": [...] } }
    asRecord(obj.ops1) ??
    (obj as unknown as UnknownRecord)
  const out: Record<string, UnknownRecord[]> = {}

  Object.entries(candidate).forEach(([group, list]) => {
    if (!group || typeof group !== 'string') return
    if (!Array.isArray(list)) return
    out[group] = list.map((v) => (asRecord(v) ?? {})) as UnknownRecord[]
  })
  if (!Array.isArray(out.ops)) out.ops = []
  return out
}

export default function SpecTestPage() {
  const chartRef = useRef<HTMLDivElement | null>(null)
  const graphRef = useRef<HTMLDivElement | null>(null)
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const endpoint = useMemo(() => resolveDefaultNlpEndpoint(), [])
  const debugDefault = useMemo(() => new URLSearchParams(window.location.search).get('debug') === '1', [])
  const [debugEnabled, setDebugEnabled] = useState<boolean>(debugDefault)
  const debugLog = useCallback(
    (...args: unknown[]) => {
      if (!debugEnabled) return
      // eslint-disable-next-line no-console
      console.log('[specTest]', ...args)
    },
    [debugEnabled],
  )

  // TEMP: default chart for specTest debugging (repo-local).
  const [chartId, setChartId] = useState('bar_stacked_ver')
  const [question, setQuestion] = useState('')
  const [explanation, setExplanation] = useState('')
  const [importedSentencesOverride, setImportedSentencesOverride] = useState<string[] | null>(null)

  const [vlSpec, setVlSpec] = useState<VegaLiteSpec | null>(null)
  const [dataRows, setDataRows] = useState<UnknownRecord[]>([])
  const [chartContext, setChartContext] = useState<ChartContext | null>(null)

  const [registry, setRegistry] = useState<OpRegistrySchema | null>(null)
  const [registryError, setRegistryError] = useState<string | null>(null)

  const [ops, setOps] = useState<Record<string, EditableOp>>({})
  const [sentenceNodes, setSentenceNodes] = useState<Record<number, SentenceNode>>({})
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [draftOp, setDraftOp] = useState<EditableOp | null>(null)
  const [draftDirty, setDraftDirty] = useState(false)
  const [inspectorTab, setInspectorTab] = useState<'fields' | 'relations'>('fields')
  const [status, setStatus] = useState('Ready.')
  const [error, setError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [graphWidth, setGraphWidth] = useState<number>(800)

  const baseSentences = useMemo(
    () => importedSentencesOverride ?? splitSentences(explanation),
    [importedSentencesOverride, explanation],
  )
  const laneSentenceCount = useMemo(
    () => inferLaneCountFromState(baseSentences, ops),
    [baseSentences, ops],
  )
  const laneSentences = useMemo(() => padSentences(baseSentences, laneSentenceCount), [baseSentences, laneSentenceCount])

  // Monotonic id allocator to avoid duplicate nodeIds when users click "+ Op" quickly.
  const nextIdRef = useRef<number>(1)
  // Track ids we've handed out or received to prevent accidental reuse across resets.
  const reservedNodeIdsRef = useRef<Set<string>>(new Set())

  const selectedOp = selectedNodeId ? ops[selectedNodeId] ?? null : null
  const activeOp = draftOp && selectedNodeId && draftOp.meta.nodeId === selectedNodeId ? draftOp : selectedOp

  const opSchemaByName = useMemo(() => {
    const out = new Map<string, UiOp>()
    registry?.ops?.forEach((op) => out.set(op.op, op))
    return out
  }, [registry])

  const allNodeIdsSorted = useMemo(() => {
    const ids = Object.keys(ops)
    const num = (id: string) => {
      const m = id.match(/^n(\\d+)$/)
      return m ? Number(m[1]) : 999999
    }
    return ids.sort((a, b) => num(a) - num(b))
  }, [ops])

  const summarizeOps = useCallback(
    (value: Record<string, EditableOp>) => {
      const ids = Object.keys(value).sort()
      return ids.map((id) => {
        const node = value[id]
        return {
          nodeId: node?.meta?.nodeId ?? id,
          op: node?.op,
          sentenceIndex: node?.meta?.sentenceIndex,
          inputs: node?.meta?.inputs ?? [],
        }
      })
    },
    [],
  )

  useEffect(() => {
    debugLog('selectedNodeId changed', { selectedNodeId })
  }, [debugLog, selectedNodeId])

  useEffect(() => {
    debugLog('ops state changed', { nodeCount: Object.keys(ops).length, nodes: summarizeOps(ops) })
  }, [debugLog, ops, summarizeOps])

  useEffect(() => {
    if (!graphRef.current) return
    const el = graphRef.current
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0]
      const w = Math.max(320, Math.floor(entry.contentRect.width))
      setGraphWidth(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Keep allocator in sync with current ops ids (e.g., after canonicalize) without ever decreasing.
  useEffect(() => {
    let max = 0
    for (const id of Object.keys(ops)) {
      const m = id.match(/^n(\d+)$/)
      if (m) max = Math.max(max, Number(m[1]))
      reservedNodeIdsRef.current.add(id)
    }
    nextIdRef.current = Math.max(nextIdRef.current, max + 1)
  }, [ops])

  const opsBySentence = useMemo(() => {
    const out: Record<number, EditableOp[]> = {}
    for (let i = 1; i <= laneSentenceCount; i += 1) {
      const container = sentenceNodes[i]
      const rawIds = container?.opIds ?? []
      const ids = Array.from(new Set(rawIds))
      out[i] = ids.map((id) => ops[id]).filter((op): op is EditableOp => !!op)
    }
    return out
  }, [laneSentenceCount, ops, sentenceNodes])

  const sentenceStats = useMemo(() => {
    const opToSentence: Record<string, number> = {}
    for (let i = 1; i <= laneSentenceCount; i += 1) {
      const ids = sentenceNodes[i]?.opIds ?? []
      ids.forEach((id) => {
        opToSentence[id] = i
      })
    }

    const out: Record<number, { opCount: number; crossDepCount: number }> = {}
    for (let i = 1; i <= laneSentenceCount; i += 1) {
      const ids = sentenceNodes[i]?.opIds ?? []
      let cross = 0
      ids.forEach((id) => {
        const op = ops[id]
        const inputs = op?.meta?.inputs ?? []
        inputs.forEach((inp) => {
          const srcSentence = opToSentence[inp]
          if (srcSentence && srcSentence !== i) cross += 1
        })
      })
      out[i] = { opCount: ids.length, crossDepCount: cross }
    }
    return out
  }, [laneSentenceCount, ops, sentenceNodes])

  const allocateNodeId = useCallback((): string => {
    // Guarantee uniqueness even if some other code path resets counters/state.
    let n = nextIdRef.current
    let id = `n${n}`
    const reserved = reservedNodeIdsRef.current
    while (reserved.has(id)) {
      n += 1
      id = `n${n}`
    }
    reserved.add(id)
    nextIdRef.current = n + 1
    return id
  }, [])

  // Ensure each sentence lane has a container node by default.
  useEffect(() => {
    if (laneSentenceCount < 1) return

    setSentenceNodes((prev) => {
      const missing: number[] = []
      for (let i = 1; i <= laneSentenceCount; i += 1) {
        if (!prev[i]) missing.push(i)
      }
      if (!missing.length) return prev
      const next: Record<number, SentenceNode> = { ...prev }
      for (const sentenceIndex of missing) {
        next[sentenceIndex] = { sentenceIndex, opIds: [] }
      }
      debugLog('autoCreateSentenceContainers', { missingCount: missing.length, missing })
      return next
    })
  }, [debugLog, laneSentenceCount])

  const resolveOptions = useCallback(
    (source: string | undefined): Array<string | number> => {
      if (!chartContext || !source) return []
      if (source === 'fields') return chartContext.fields ?? []
      if (source === 'measure_fields') return chartContext.measure_fields ?? []
      if (source === 'dimension_fields') return chartContext.dimension_fields ?? []
      if (source === 'series_domain') {
        const sf = chartContext.series_field
        if (!sf) return []
        return chartContext.categorical_values?.[sf] ?? []
      }
      if (source === 'targets') {
        const dim = chartContext.primary_dimension
        return chartContext.categorical_values?.[dim] ?? []
      }
      return []
    },
    [chartContext],
  )

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setRegistryError(null)
      try {
        const response = await fetch(`${endpoint}/op_registry`, { method: 'GET', cache: 'no-store' })
        if (!response.ok) throw new Error(`Failed to load op_registry (${response.status})`)
        const schema = (await response.json()) as OpRegistrySchema
        if (cancelled) return
        setRegistry(schema)
      } catch (e) {
        if (cancelled) return
        setRegistryError(e instanceof Error ? e.message : String(e))
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [endpoint])

  const handleLoadChart = useCallback(async () => {
    setError(null)
    setWarnings([])
    setStatus('Loading chart...')
    setImportedSentencesOverride(null)
    try {
      const loaded = await loadChartSpecById(chartId)
      setVlSpec(loaded.spec)
      setStatus('Loading data rows...')
      const rows = await loadDataRowsFromSpec(loaded.spec)
      setDataRows(rows)
      if (!chartRef.current) throw new Error('Chart host is not ready.')
      await browserEngine.renderChart(chartRef.current, loaded.spec)
      setStatus(`Loaded chart "${loaded.chartId}" (${rows.length} rows). Building chart context...`)

      // Fetch canonicalize chart_context with an empty ops_spec (UI dropdowns).
      const payload = {
        question: question || 'placeholder',
        explanation: explanation || 'placeholder',
        vega_lite_spec: loaded.spec,
        data_rows: rows,
        ops_spec: { ops: [] },
      }
      const response = await fetch(`${endpoint}/canonicalize_opsspec`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) {
        const text = await response.text()
        throw new Error(`Failed to build chart context (${response.status}): ${text || response.statusText}`)
      }
      const body = (await response.json()) as CanonicalizeResponse
      setChartContext(body.chart_context)
      setStatus('Ready.')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStatus('Load failed.')
    }
  }, [chartId, endpoint, explanation, question])

  const handleAddOp = useCallback(
    (sentenceIndex: number) => {
      if (draftDirty) {
        setError('Unsaved changes. Click Save or Cancel before adding a new op.')
        return
      }
      setError(null)
      setWarnings([])

      const container = sentenceNodes[sentenceIndex] ?? { sentenceIndex, opIds: [] }
      const parentId = container.opIds.length ? container.opIds[container.opIds.length - 1] : null

      const nodeId = allocateNodeId()
      const next: EditableOp = {
        op: defaultOpName(registry),
        id: nodeId,
        meta: { nodeId, inputs: parentId ? [parentId] : [], sentenceIndex },
      }
      debugLog('addOp', { sentenceIndex, nodeId, parentId, next })
      setOps((prev) => ({ ...prev, [nodeId]: next }))
      setSentenceNodes((prev) => {
        const current = prev[sentenceIndex] ?? { sentenceIndex, opIds: [] }
        if (current.opIds.includes(nodeId)) {
          return prev
        }
        return {
          ...prev,
          [sentenceIndex]: { sentenceIndex, opIds: [...current.opIds, nodeId] },
        }
      })
      setSelectedNodeId(nodeId)
      setDraftOp(JSON.parse(JSON.stringify(next)) as EditableOp)
      setDraftDirty(false)
    },
    [allocateNodeId, debugLog, draftDirty, registry, sentenceNodes],
  )

  const startEditingOp = useCallback(
    (nodeId: string) => {
      if (draftDirty) {
        setError('Unsaved changes. Click Save or Cancel before selecting another op.')
        return
      }
      setError(null)
      setSelectedNodeId(nodeId)
      const op = ops[nodeId]
      setDraftOp(op ? (JSON.parse(JSON.stringify(op)) as EditableOp) : null)
      setDraftDirty(false)
      setInspectorTab('fields')
    },
    [draftDirty, ops],
  )

  const updateDraftField = useCallback(
    (key: string, value: unknown) => {
      setDraftOp((prev) => {
        if (!prev) return prev
        const next = { ...prev, [key]: value } as EditableOp
        debugLog('updateDraftField', { nodeId: prev.meta?.nodeId, key, value })
        return next
      })
      setDraftDirty(true)
    },
    [debugLog],
  )

  const updateDraftMeta = useCallback(
    (patch: Partial<EditableOp['meta']>) => {
      setDraftOp((prev) => {
        if (!prev) return prev
        const meta = { ...prev.meta, ...patch }
        const next = { ...prev, meta } as EditableOp
        debugLog('updateDraftMeta', { nodeId: prev.meta?.nodeId, patch })
        return next
      })
      setDraftDirty(true)
    },
    [debugLog],
  )

  const handleSaveDraft = useCallback(() => {
    if (!selectedNodeId || !draftOp) return
    if (!draftDirty) {
      setStatus('Already saved.')
      return
    }
    setError(null)
    const key = selectedNodeId
    setOps((prev) => {
      if (!prev[key]) return prev
      const snapshot = JSON.parse(JSON.stringify(draftOp)) as EditableOp
      // Hard guard: nodeId is the identity; keep it stable.
      snapshot.id = key
      snapshot.meta = { ...snapshot.meta, nodeId: key }
      debugLog('saveDraft', { selectedNodeId, key, op: snapshot.op })
      return { ...prev, [key]: snapshot }
    })
    setDraftDirty(false)
    setStatus('Saved.')
  }, [debugLog, draftDirty, draftOp, selectedNodeId])

  const handleCancelDraft = useCallback(() => {
    if (!selectedNodeId) return
    const op = ops[selectedNodeId]
    if (!op) return
    if (!draftDirty) return
    setError(null)
    setDraftOp(JSON.parse(JSON.stringify(op)) as EditableOp)
    setDraftDirty(false)
    setStatus('Canceled changes.')
  }, [draftDirty, ops, selectedNodeId])

  const setRefValue = useCallback(
    (key: string, refNodeId: string) => {
      if (!draftOp) return
      if (!/^n\\d+$/.test(refNodeId)) return
      updateDraftField(key, `ref:${refNodeId}`)
      const existing = draftOp?.meta?.inputs ?? []
      if (!existing.includes(refNodeId)) updateDraftMeta({ inputs: [...existing, refNodeId].sort() })
    },
    [draftOp, updateDraftField, updateDraftMeta],
  )

  const buildOpsSpecGroups = useCallback(() => {
    const groups: Record<string, UnknownRecord[]> = {}
    for (let i = 1; i <= laneSentenceCount; i += 1) {
      const groupName = groupNameForSentenceIndex(i)
      const container = sentenceNodes[i]
      const ids = container?.opIds ?? []
      groups[groupName] = ids.map((id) => ops[id]).filter((op): op is EditableOp => !!op)
    }
    if (!Array.isArray(groups.ops)) groups.ops = []
    return groups
  }, [laneSentenceCount, ops, sentenceNodes])

  const applyCanonicalizedOpsSpec = useCallback(
    (body: CanonicalizeResponse, laneCount: number) => {
      setChartContext(body.chart_context)
      setWarnings(body.warnings ?? [])

      // Replace UI state with canonicalized ops_spec output.
      const nextOps: Record<string, EditableOp> = {}
      const nextSentenceNodes: Record<number, SentenceNode> = {}
      for (let i = 1; i <= laneCount; i += 1) {
        nextSentenceNodes[i] = { sentenceIndex: i, opIds: [] }
      }

      Object.entries(body.ops_spec ?? {}).forEach(([groupName, list]) => {
        const idx =
          groupName === 'ops'
            ? 1
            : groupName.startsWith('ops') && /^\d+$/.test(groupName.slice(3))
              ? Number(groupName.slice(3))
              : null
        if (!idx || idx < 1 || idx > laneCount) return

        const opIds: string[] = []
        const seen = new Set<string>()
        list.forEach((raw) => {
          const meta = asRecord(raw.meta) ?? {}
          const nodeId = typeof meta.nodeId === 'string' ? meta.nodeId : typeof raw.id === 'string' ? raw.id : ''
          if (!nodeId) return
          if (seen.has(nodeId)) return
          seen.add(nodeId)
          nextOps[nodeId] = raw as unknown as EditableOp
          opIds.push(nodeId)
        })
        nextSentenceNodes[idx] = { sentenceIndex: idx, opIds }
      })
      setOps(nextOps)
      setSentenceNodes(nextSentenceNodes)
      setSelectedNodeId(null)
      setDraftOp(null)
      setDraftDirty(false)
    },
    [],
  )

  const handleValidateCanonicalize = useCallback(async () => {
    if (!vlSpec) {
      setError('Load a chart first.')
      return
    }
    setError(null)
    setStatus('Canonicalizing...')
    setWarnings([])
    try {
      const payload = {
        question: question.trim() || 'placeholder',
        explanation: explanation.trim() || 'placeholder',
        vega_lite_spec: vlSpec,
        data_rows: dataRows,
        ops_spec: buildOpsSpecGroups(),
      }
      const response = await fetch(`${endpoint}/canonicalize_opsspec`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) {
        const text = await response.text()
        throw new Error(text || response.statusText)
      }
      const body = (await response.json()) as CanonicalizeResponse
      applyCanonicalizedOpsSpec(body, laneSentenceCount)
      setStatus('Canonicalized.')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStatus('Canonicalize failed.')
    }
  }, [vlSpec, question, explanation, dataRows, buildOpsSpecGroups, endpoint, applyCanonicalizedOpsSpec, laneSentenceCount])

  const handleImportSpec = useCallback(async () => {
    const el = importInputRef.current
    const file = el?.files?.[0]
    if (!file) return

    setError(null)
    setWarnings([])
    setStatus('Importing...')

    try {
      const text = await file.text()
      const payload = JSON.parse(text) as unknown
      const obj = asRecord(payload) ?? {}

      const importedChartId = typeof obj.chart_id === 'string' ? obj.chart_id : ''
      const importedQuestion = typeof obj.question === 'string' ? obj.question : ''
      const importedExplanation = typeof obj.explanation === 'string' ? obj.explanation : ''
      const importedExplanationSentences = Array.isArray(obj.explanation_sentences)
        ? (obj.explanation_sentences.filter((s) => typeof s === 'string').map((s) => String(s)) as string[])
        : []
      const importedGroupSentences = asRecord(obj.group_sentences) ?? null
      const importedSpec = (obj.vega_lite_spec as VegaLiteSpec | undefined) ?? null
      const importedRows = Array.isArray(obj.data_rows) ? (obj.data_rows as UnknownRecord[]) : null
      const importedGroups = normalizeImportedGroups(payload)

      const laneCountFromGroups = inferLaneCountFromGroups(importedGroups)
      const laneCountFromExplanation = Math.max(splitSentences(importedExplanation).length, importedExplanationSentences.length, 1)
      const importedLaneCount = Math.max(1, laneCountFromGroups, laneCountFromExplanation)

      // Prefer explicit explanation text; otherwise, reconstruct from sentence metadata if present.
      let nextExplanation = importedExplanation
      let nextSentencesOverride: string[] | null = null

      if (!nextExplanation.trim() && importedExplanationSentences.length) {
        nextExplanation = importedExplanationSentences.join(' ')
        nextSentencesOverride = importedExplanationSentences
      }
      if (!nextExplanation.trim() && importedGroupSentences) {
        const fromGroups: string[] = []
        for (let i = 1; i <= importedLaneCount; i += 1) {
          const g = groupNameForSentenceIndex(i)
          const s = importedGroupSentences[g]
          fromGroups.push(typeof s === 'string' && s.trim() ? s : `(missing sentence ${i})`)
        }
        nextExplanation = fromGroups.join(' ')
        nextSentencesOverride = fromGroups
      }
      if (!nextExplanation.trim() && !nextSentencesOverride) {
        // ops_spec-only imports (like nlp_server/test.json)
        const placeholders: string[] = []
        for (let i = 1; i <= importedLaneCount; i += 1) {
          placeholders.push(i === 1 ? '(No sentence text available)' : `(missing sentence ${i})`)
        }
        nextSentencesOverride = placeholders
        nextExplanation = placeholders.join(' ')
      }

      if (importedChartId) setChartId(importedChartId)
      if (importedQuestion) setQuestion(importedQuestion)
      setExplanation(nextExplanation)
      setImportedSentencesOverride(nextSentencesOverride)

      if (importedSpec && importedRows) {
        setVlSpec(importedSpec)
        setDataRows(importedRows)
        if (!chartRef.current) throw new Error('Chart host is not ready.')
        await browserEngine.renderChart(chartRef.current, importedSpec)
      }

      // Validate + canonicalize if we have enough chart inputs; otherwise, just load raw groups.
      if (importedSpec && importedRows) {
        const payload2 = {
          question: (importedQuestion || question || 'placeholder').trim() || 'placeholder',
          explanation: (nextExplanation || explanation || 'placeholder').trim() || 'placeholder',
          vega_lite_spec: importedSpec,
          data_rows: importedRows,
          ops_spec: importedGroups,
        }
        const response = await fetch(`${endpoint}/canonicalize_opsspec`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload2),
        })
        if (!response.ok) {
          const t = await response.text()
          throw new Error(t || response.statusText)
        }
        const body = (await response.json()) as CanonicalizeResponse
        applyCanonicalizedOpsSpec(body, importedLaneCount)
      } else {
        // Best-effort raw import (no server validation).
        const nextOps: Record<string, EditableOp> = {}
        const nextSentenceNodes: Record<number, SentenceNode> = {}
        for (let i = 1; i <= importedLaneCount; i += 1) nextSentenceNodes[i] = { sentenceIndex: i, opIds: [] }

        Object.entries(importedGroups).forEach(([groupName, list]) => {
          const idx =
            groupName === 'ops'
              ? 1
              : groupName.startsWith('ops') && /^\d+$/.test(groupName.slice(3))
                ? Number(groupName.slice(3))
                : null
          if (!idx || idx < 1 || idx > importedLaneCount) return
          const opIds: string[] = []
          list.forEach((raw) => {
            const meta = asRecord(raw.meta) ?? {}
            const nodeId = typeof meta.nodeId === 'string' ? meta.nodeId : typeof raw.id === 'string' ? raw.id : ''
            if (!nodeId) return
            nextOps[nodeId] = raw as unknown as EditableOp
            opIds.push(nodeId)
          })
          nextSentenceNodes[idx] = { sentenceIndex: idx, opIds }
        })
        setOps(nextOps)
        setSentenceNodes(nextSentenceNodes)
        setSelectedNodeId(null)
        setDraftOp(null)
        setDraftDirty(false)
        setWarnings([
          'Imported ops_spec without vega_lite_spec/data_rows; skipped server canonicalize.',
          'Sentence text was reconstructed from import metadata or placeholders.',
        ])
      }

      setStatus('Imported.')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStatus('Import failed.')
    } finally {
      // Allow re-importing the same file by resetting the input value.
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }, [applyCanonicalizedOpsSpec, endpoint, explanation, question])

  const handleDownloadGold = useCallback(async () => {
    if (!vlSpec) {
      setError('Load a chart first.')
      return
    }
    setError(null)
    setStatus('Validating before download...')
    setWarnings([])
    try {
      const payload = {
        question: question.trim() || 'placeholder',
        explanation: explanation.trim() || 'placeholder',
        vega_lite_spec: vlSpec,
        data_rows: dataRows,
        ops_spec: buildOpsSpecGroups(),
      }
      const response = await fetch(`${endpoint}/canonicalize_opsspec`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) {
        const text = await response.text()
        throw new Error(text || response.statusText)
      }
      const body = (await response.json()) as CanonicalizeResponse
      setWarnings(body.warnings ?? [])

      const explanationSentences = splitSentences(explanation.trim())
      const groupSentences: Record<string, string> = {}
      for (let i = 1; i <= laneSentenceCount; i += 1) {
        groupSentences[groupNameForSentenceIndex(i)] = laneSentences[i - 1] ?? `(missing sentence ${i})`
      }
      const nodeSentences: Record<string, string> = {}
      Object.entries(body.ops_spec ?? {}).forEach(([groupName, list]) => {
        if (!Array.isArray(list)) return
        const groupIdx = groupNameToSentenceIndex(groupName) ?? 1
        list.forEach((raw) => {
          const meta = asRecord(raw.meta) ?? {}
          const nodeId = typeof meta.nodeId === 'string' ? meta.nodeId : typeof raw.id === 'string' ? raw.id : ''
          const sIdx = typeof meta.sentenceIndex === 'number' ? meta.sentenceIndex : groupIdx
          if (!nodeId) return
          nodeSentences[nodeId] = laneSentences[Math.max(1, sIdx) - 1] ?? `(missing sentence ${sIdx})`
        })
      })

      const now = new Date()
      const bundle = pruneNulls({
        version: 2,
        created_at: now.toISOString(),
        chart_id: chartId.trim(),
        question: question.trim(),
        explanation: explanation.trim(),
        explanation_sentences: explanationSentences,
        group_sentences: groupSentences,
        node_sentences: nodeSentences,
        vega_lite_spec: vlSpec,
        data_rows: dataRows,
        gold_ops_spec: body.ops_spec,
        notes: '',
      })

      const stamp = `${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(
        now.getHours(),
      ).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`
      downloadJson(`gold_${chartId.trim() || 'chart'}_${stamp}.json`, bundle)
      setStatus('Downloaded.')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStatus('Download failed.')
    }
  }, [vlSpec, endpoint, question, explanation, dataRows, buildOpsSpecGroups, chartId, laneSentenceCount, laneSentences])

  const selectedUiOp = activeOp ? opSchemaByName.get(activeOp.op) ?? null : null

  const incomingEdges = useMemo(() => {
    if (!activeOp?.meta?.nodeId) return []
    const target = activeOp.meta.nodeId
    const incoming: Array<{ nodeId: string; op: string }> = []
    Object.values(ops).forEach((op) => {
      const id = op?.meta?.nodeId
      if (!id || id === target) return
      const inputs = op?.meta?.inputs ?? []
      if (Array.isArray(inputs) && inputs.includes(target)) {
        incoming.push({ nodeId: id, op: op.op })
      }
    })
    incoming.sort((a, b) => a.nodeId.localeCompare(b.nodeId))
    return incoming
  }, [activeOp?.meta?.nodeId, ops])

  const collectScalarRefs = useCallback((obj: unknown): string[] => {
    const out: string[] = []
    const visit = (value: unknown) => {
      if (typeof value === 'string' && value.startsWith('ref:')) {
        out.push(value)
        return
      }
      if (Array.isArray(value)) {
        value.forEach(visit)
        return
      }
      if (value && typeof value === 'object') {
        Object.values(value as Record<string, unknown>).forEach(visit)
      }
    }
    visit(obj)
    return Array.from(new Set(out)).sort()
  }, [])

  const scalarRefs = useMemo(() => (activeOp ? collectScalarRefs(activeOp) : []), [activeOp, collectScalarRefs])

  const graphLayout = useMemo(() => {
    const nodeWidth = 170
    const nodeHeight = 70
    const gapX = 26
    const gapY = 70
    const pad = 18

    const nodes = Object.values(ops).filter((n): n is EditableOp => !!n?.meta?.nodeId)
    const ids = nodes.map((n) => n.meta.nodeId)
    const byId = new Map<string, EditableOp>()
    nodes.forEach((n) => byId.set(n.meta.nodeId, n))

    const edges: GraphLayoutEdge[] = []
    const indeg = new Map<string, number>()
    const incoming: Record<string, string[]> = {}
    ids.forEach((id) => {
      indeg.set(id, 0)
      incoming[id] = []
    })

    nodes.forEach((n) => {
      const to = n.meta.nodeId
      const ins = Array.isArray(n.meta.inputs) ? n.meta.inputs : []
      ins.forEach((from) => {
        if (!byId.has(from)) return
        edges.push({ from, to })
        incoming[to].push(from)
        indeg.set(to, (indeg.get(to) ?? 0) + 1)
      })
    })

    // Kahn topo + level assignment (level = max(parent level)+1).
    const level = new Map<string, number>()
    const queue: string[] = ids.filter((id) => (indeg.get(id) ?? 0) === 0)
    queue.sort()
    queue.forEach((id) => level.set(id, 0))

    const topo: string[] = []
    while (queue.length) {
      const cur = queue.shift()
      if (!cur) break
      topo.push(cur)
      edges
        .filter((e) => e.from === cur)
        .forEach((e) => {
          const next = e.to
          indeg.set(next, (indeg.get(next) ?? 0) - 1)
          const nextLevel = Math.max(level.get(next) ?? 0, (level.get(cur) ?? 0) + 1)
          level.set(next, nextLevel)
          if ((indeg.get(next) ?? 0) === 0) queue.push(next)
        })
      queue.sort()
    }

    // Cycle fallback: any remaining nodes get level 0.
    ids.forEach((id) => {
      if (!level.has(id)) level.set(id, 0)
    })

    const maxLevel = Math.max(0, ...ids.map((id) => level.get(id) ?? 0))
    const byLevel: Record<number, string[]> = {}
    for (let l = 0; l <= maxLevel; l += 1) byLevel[l] = []
    ids.forEach((id) => {
      const l = level.get(id) ?? 0
      byLevel[l] = byLevel[l] ?? []
      byLevel[l].push(id)
    })

    const num = (id: string) => {
      const m = id.match(/^n(\d+)$/)
      return m ? Number(m[1]) : 999999
    }
    Object.keys(byLevel).forEach((k) => {
      const l = Number(k)
      byLevel[l].sort((a, b) => {
        const sa = byId.get(a)?.meta?.sentenceIndex ?? 999
        const sb = byId.get(b)?.meta?.sentenceIndex ?? 999
        if (sa !== sb) return sa - sb
        return num(a) - num(b)
      })
    })

    const maxCount = Math.max(1, ...Object.values(byLevel).map((list) => list.length))
    const requiredWidth = pad * 2 + maxCount * nodeWidth + (maxCount - 1) * gapX
    const width = Math.max(graphWidth, requiredWidth)
    const height = pad * 2 + (maxLevel + 1) * nodeHeight + maxLevel * gapY

    const layoutNodes: GraphLayoutNode[] = []
    Object.entries(byLevel).forEach(([k, list]) => {
      const l = Number(k)
      const rowWidth = list.length * nodeWidth + Math.max(0, list.length - 1) * gapX
      const startX = Math.max(pad, Math.floor((width - rowWidth) / 2))
      list.forEach((id, idx) => {
        const op = byId.get(id)
        if (!op) return
        layoutNodes.push({
          id,
          op: op.op,
          sentenceIndex: op.meta.sentenceIndex,
          x: startX + idx * (nodeWidth + gapX),
          y: pad + l * (nodeHeight + gapY),
        })
      })
    })

    const pos = new Map<string, { x: number; y: number }>()
    layoutNodes.forEach((n) => pos.set(n.id, { x: n.x, y: n.y }))

    const visibleEdges = edges.filter((e) => pos.has(e.from) && pos.has(e.to))

    return { nodeWidth, nodeHeight, width, height, nodes: layoutNodes, edges: visibleEdges }
  }, [graphWidth, ops])

  return (
    <div className="app-shell spec-test-shell">
      <section className="card spec-test-card">
        <div className="card-header">
          <div className="card-title">specTest</div>
        </div>

        <div className="spec-test-status" data-testid="spectest-status">
          {status}
        </div>
        {registryError ? <div className="spec-test-error">Failed to load op registry: {registryError}</div> : null}
        {error ? (
          <div className="spec-test-error" data-testid="spectest-error">
            {error}
          </div>
        ) : null}
        {warnings.length ? (
          <details className="spec-test-warnings" open>
            <summary>Warnings ({warnings.length})</summary>
            <ul>
              {warnings.map((w, idx) => (
                <li key={idx}>{w}</li>
              ))}
            </ul>
          </details>
        ) : null}

        <div className="spec-test-controls">
          <label className="spec-test-field">
            <span>chart_id</span>
            <input value={chartId} onChange={(e) => setChartId(e.target.value)} placeholder="e.g., 10x2rgiqw97wdspi" />
          </label>
          <button type="button" className="spec-test-btn" onClick={() => void handleLoadChart()}>
            Load Chart
          </button>
          <button type="button" className="spec-test-btn" onClick={() => void handleValidateCanonicalize()} disabled={!vlSpec}>
            Canonicalize
          </button>
          <button type="button" className="spec-test-btn primary" onClick={() => void handleDownloadGold()} disabled={!vlSpec}>
            Download Spec
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={() => void handleImportSpec()}
          />
          <button
            type="button"
            className="spec-test-btn"
            onClick={() => importInputRef.current?.click()}
            title="Import a previously downloaded gold_*.json (or an ops_spec JSON)."
          >
            Import Spec
          </button>
          <label className="spec-test-debug-toggle">
            <input type="checkbox" checked={debugEnabled} onChange={(e) => setDebugEnabled(e.target.checked)} />
            Debug console logs
          </label>
          <a className="spec-test-link" href="/" title="Back to workbench">
            Workbench
          </a>
        </div>

        <div className="spec-test-layout">
          <div className="spec-test-row spec-test-row--top">
            <section className="spec-test-pane spec-test-pane--inputs">
              <div className="spec-test-pane-header">Question + Explanation</div>
              <div className="spec-test-pane-body">
                <div className="spec-test-inputs spec-test-inputs--stacked">
                  <label className="spec-test-field grow">
                    <span>question</span>
                    <textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={2} />
                  </label>
                  <label className="spec-test-field grow">
                    <span>explanation</span>
                    <textarea
                      value={explanation}
                      onChange={(e) => {
                        setExplanation(e.target.value)
                        setImportedSentencesOverride(null)
                      }}
                      rows={6}
                    />
                    <div className="spec-test-hint">
                      Sentences: {baseSentences.length || 0} (Lanes: {laneSentenceCount}; Sentence i uses group {`ops/ops2/ops3...`})
                    </div>
                  </label>
                </div>
              </div>
            </section>

            <section className="spec-test-pane spec-test-pane--chart">
              <div className="spec-test-pane-header">Chart Preview</div>
              <div className="spec-test-pane-body">
                <div ref={chartRef} className="chart-host spec-test-chart-host" data-testid="spectest-chart-host" />
                {chartContext ? (
                  <pre className="spec-test-context" data-testid="spectest-chart-context">
                    {JSON.stringify(
                      {
                        primary_dimension: chartContext.primary_dimension,
                        primary_measure: chartContext.primary_measure,
                        series_field: chartContext.series_field ?? null,
                        measure_fields: chartContext.measure_fields,
                        dimension_fields: chartContext.dimension_fields,
                      },
                      null,
                      2,
                    )}
                  </pre>
                ) : null}
              </div>
            </section>
          </div>

          <div className="spec-test-row spec-test-row--mid">
            <section className="spec-test-pane spec-test-pane--lanes">
              <div className="spec-test-pane-header">Tree Generation</div>
              <div className="spec-test-pane-body lanes">
                {laneSentences.map((sentence, index) => {
                  const sentenceIndex = index + 1
                  const groupName = groupNameForSentenceIndex(sentenceIndex)
                  const laneNodes = opsBySentence[sentenceIndex] ?? []
                  return (
                    <div key={groupName} className="lane" data-testid={`lane-${groupName}`}>
                      <div className="lane-header">
                        <div className="lane-title">
                          {groupName}
                          <span className="lane-subtitle">
                            Sentence {sentenceIndex}
                            <span className="lane-metrics">
                              ({sentenceStats[sentenceIndex]?.opCount ?? 0} ops, {sentenceStats[sentenceIndex]?.crossDepCount ?? 0}{' '}
                              cross)
                            </span>
                          </span>
                        </div>
                        <button
                          type="button"
                          className="spec-test-btn tiny"
                          onClick={() => handleAddOp(sentenceIndex)}
                          disabled={draftDirty}
                          title={draftDirty ? 'Save/Cancel changes before adding a new op.' : 'Add an op to this sentence.'}
                        >
                          + Op
                        </button>
                      </div>
                      <div className="lane-sentence" title={sentence}>
                        {sentence}
                      </div>
                      <div className="lane-nodes">
                        {laneNodes.map((node) => (
                          <button
                            type="button"
                            key={node.meta.nodeId}
                            className={`node-card ${selectedNodeId === node.meta.nodeId ? 'is-selected' : ''}`}
                            onClick={() => {
                              debugLog('selectNode', { nodeId: node.meta.nodeId })
                              startEditingOp(node.meta.nodeId)
                            }}
                          >
                            <div className="node-title">
                              <span className="node-id">{node.meta.nodeId}</span>
                              <span className="node-op">{node.op}</span>
                            </div>
                            <div className="node-inputs">inputs: {(node.meta.inputs ?? []).join(', ') || '(none)'}</div>
                            {(() => {
                              const summary = formatViewSummary(extractOpView(node as unknown as UnknownRecord))
                              return summary ? <div className="node-view">{summary}</div> : null
                            })()}
                          </button>
                        ))}
                        {!laneNodes.length ? <div className="lane-empty">No nodes.</div> : null}
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>

            <section className="spec-test-pane spec-test-pane--inspector">
              <div className="spec-test-pane-header spec-test-pane-header--with-actions">
                <span>Node Specification</span>
                <div className="inspector-header-actions">
                  <button
                    type="button"
                    className={`spec-test-btn tiny ${draftDirty ? 'primary' : ''}`}
                    onClick={handleSaveDraft}
                    disabled={!activeOp}
                    title={activeOp ? (draftDirty ? 'Save this operation' : 'No changes to save') : 'Select an operation'}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    className="spec-test-btn tiny"
                    onClick={handleCancelDraft}
                    disabled={!activeOp || !draftDirty}
                    title={activeOp ? (draftDirty ? 'Discard changes' : 'No changes to discard') : 'Select an operation'}
                  >
                    Cancel
                  </button>
                </div>
              </div>
              <div className="spec-test-pane-body inspector">
                {!activeOp ? (
                  <div className="inspector-empty">Select a node to edit its operation and parameters.</div>
                ) : (
                  <>
                    <div className="inspector-tabs">
                      <button
                        type="button"
                        className={`inspector-tab ${inspectorTab === 'fields' ? 'is-active' : ''}`}
                        onClick={() => setInspectorTab('fields')}
                      >
                        Fields
                      </button>
                      <button
                        type="button"
                        className={`inspector-tab ${inspectorTab === 'relations' ? 'is-active' : ''}`}
                        onClick={() => setInspectorTab('relations')}
                      >
                        Relations
                      </button>
                      {draftDirty ? (
                        <span className="inspector-dirty">Unsaved</span>
                      ) : (
                        <span className="inspector-clean">Saved</span>
                      )}
                    </div>

                    <div className="inspector-row">
                      <label className="spec-test-field">
                        <span>nodeId</span>
                        <input value={activeOp.meta.nodeId} readOnly />
                      </label>
                      <label className="spec-test-field">
                        <span>sentenceIndex</span>
                        <input value={String(activeOp.meta.sentenceIndex)} readOnly />
                        <div className="spec-test-hint">
                          Sentence-layer is fixed by lane (ops/ops2/ops3...). Use + Op in the target lane.
                        </div>
                      </label>
                    </div>

                    {inspectorTab === 'fields' ? (
                      <>
                        <label className="spec-test-field">
                          <span>op</span>
                          <select
                            value={activeOp.op}
                            onChange={(e) => {
                              const nextOp = e.target.value
                              if (!draftOp) return
                              // Keep meta/id stable; reset op-specific keys in the draft only.
                              const base: EditableOp = {
                                op: nextOp,
                                id: draftOp.id,
                                meta: draftOp.meta,
                              }
                              setDraftOp(base)
                              setDraftDirty(true)
                            }}
                          >
                            {registry?.ops?.map((item) => (
                              <option key={item.op} value={item.op}>
                                {item.op}
                              </option>
                            ))}
                          </select>
                        </label>

                        {selectedUiOp?.semanticNotes?.length ? (
                          <details className="inspector-notes" open>
                            <summary>Semantic Notes</summary>
                            <ul>
                              {selectedUiOp.semanticNotes.map((note, idx) => (
                                <li key={idx}>{note}</li>
                              ))}
                            </ul>
                          </details>
                        ) : null}

                        <div className="inspector-fields">
                          {(selectedUiOp?.fields ?? []).map((field) => {
                            const key = field.key
                            const value = activeOp[key]
                            const options = field.options ?? (field.optionsSource ? resolveOptions(field.optionsSource) : [])
                            const isRef = typeof value === 'string' && value.startsWith('ref:')
                            const refTarget = isRef ? String(value).slice('ref:'.length) : ''
                          const previewLimit = 5
                          const maxCandidates = 50
                          const candidates =
                            options.length && options.length <= maxCandidates
                              ? options
                              : options.length
                                ? options.slice(0, maxCandidates)
                                : field.kind === 'string' && key === 'field' && chartContext
                                  ? chartContext.fields
                                  : []
                          const dataCandidates =
                            !options.length && chartContext && typeof value === 'string' && chartContext.fields.includes(String(value))
                              ? sampleUniqueValues(dataRows, String(value), maxCandidates)
                              : []

                      const renderScalarInput = () => {
                        if (field.kind === 'boolean') {
                          return (
                            <input
                              type="checkbox"
                              checked={Boolean(value)}
                              onChange={(e) => updateDraftField(key, e.target.checked)}
                            />
                          )
                        }
                        if (field.kind === 'number') {
                          return (
                            <input
                              type="number"
                              value={typeof value === 'number' ? value : value === undefined ? '' : String(value)}
                              onChange={(e) => updateDraftField(key, e.target.value === '' ? undefined : Number(e.target.value))}
                            />
                          )
                        }
                        if (field.kind === 'enum' && field.options?.length) {
                          return (
                            <select
                              value={typeof value === 'string' ? value : value === undefined ? '' : String(value)}
                              onChange={(e) => updateDraftField(key, e.target.value || undefined)}
                            >
                              <option value="">(empty)</option>
                              {field.options.map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                          )
                        }
                        if (options.length) {
                          return (
                            <select
                              value={typeof value === 'string' || typeof value === 'number' ? String(value) : ''}
                              onChange={(e) => {
                                const raw = e.target.value
                                updateDraftField(key, raw ? parseScalar(raw) : undefined)
                              }}
                            >
                              <option value="">(empty)</option>
                              {options.map((opt) => (
                                <option key={String(opt)} value={String(opt)}>
                                  {String(opt)}
                                </option>
                              ))}
                            </select>
                          )
                        }
                        return (
                          <input
                            value={value === undefined ? '' : String(value)}
                            onChange={(e) => updateDraftField(key, e.target.value === '' ? undefined : parseScalar(e.target.value))}
                          />
                        )
                      }

                      const renderArrayInput = () => {
                        const arr = Array.isArray(value) ? (value as Array<string | number>) : []
                        if (options.length) {
                          return (
                            <select
                              multiple
                              value={arr.map((v) => String(v))}
                              onChange={(e) => {
                                const values = Array.from(e.target.selectedOptions).map((o) => parseScalar(o.value))
                                updateDraftField(key, values.length ? values : undefined)
                              }}
                            >
                              {options.map((opt) => (
                                <option key={String(opt)} value={String(opt)}>
                                  {String(opt)}
                                </option>
                              ))}
                            </select>
                          )
                        }
                        return (
                          <input
                            value={arr.join(',')}
                            onChange={(e) => {
                              const raw = e.target.value.trim()
                              if (!raw) {
                                updateDraftField(key, undefined)
                                return
                              }
                              const values = raw.split(',').map((t) => parseScalar(t))
                              updateDraftField(key, values)
                            }}
                            placeholder="comma-separated"
                          />
                        )
                      }

                          return (
                            <div key={key} className="inspector-field">
                          <div className="inspector-field-head">
                            <div className="inspector-field-key">
                              {key}
                              {field.required ? <span className="req">*</span> : null}
                            </div>
                            {field.refAllowed ? (
                              <div className="inspector-field-ref">
                                <select
                                  value={isRef ? 'ref' : 'literal'}
                                  onChange={(e) => {
                                    if (e.target.value === 'literal') {
                                      updateDraftField(key, undefined)
                                      return
                                    }
                                    const first = allNodeIdsSorted.find((id) => id !== activeOp.meta.nodeId) ?? ''
                                    if (first) setRefValue(key, first)
                                  }}
                                >
                                  <option value="literal">literal</option>
                                  <option value="ref">ref</option>
                                </select>
                              </div>
                            ) : null}
                          </div>

                          {field.refAllowed && isRef ? (
                            <select
                              value={refTarget}
                              onChange={(e) => {
                                const id = e.target.value
                                if (id) setRefValue(key, id)
                              }}
                            >
                              <option value="">(select node)</option>
                              {allNodeIdsSorted
                                .filter((id) => id !== activeOp.meta.nodeId)
                                .map((id) => (
                                  <option key={id} value={id}>
                                    {id}
                                  </option>
                                ))}
                            </select>
                          ) : field.kind.endsWith('Array') ? (
                            renderArrayInput()
                          ) : (
                            renderScalarInput()
                          )}

                          {field.description ? <div className="spec-test-hint">{field.description}</div> : null}

                          {/* Candidate preview: show small, click-to-fill chips under the input. */}
                          {candidates.length ? (
                            <details className="spec-test-hint" open>
                              <summary>Candidates</summary>
                              <div className="candidate-preview">
                                {candidates.slice(0, previewLimit).map((opt) => (
                                  <button
                                    key={`${key}-cand-${String(opt)}`}
                                    type="button"
                                    className="candidate-chip"
                                    onClick={() => updateDraftField(key, opt)}
                                  >
                                    {String(opt)}
                                  </button>
                                ))}
                                {candidates.length > previewLimit ? (
                                  <span className="candidate-more">+{candidates.length - previewLimit} more</span>
                                ) : null}
                              </div>
                              {candidates.length > previewLimit ? (
                                <div className="candidate-preview">
                                  {candidates.slice(previewLimit).map((opt) => (
                                    <button
                                      key={`${key}-cand-more-${String(opt)}`}
                                      type="button"
                                      className="candidate-chip"
                                      onClick={() => updateDraftField(key, opt)}
                                    >
                                      {String(opt)}
                                    </button>
                                  ))}
                                </div>
                              ) : null}
                            </details>
                          ) : null}

                          {dataCandidates.length ? (
                            <details className="spec-test-hint">
                              <summary>Data Preview ({dataCandidates.length})</summary>
                              <div className="candidate-preview">
                                {dataCandidates.slice(0, previewLimit).map((opt) => (
                                  <button
                                    key={`${key}-data-${String(opt)}`}
                                    type="button"
                                    className="candidate-chip"
                                    onClick={() => updateDraftField(key, opt)}
                                  >
                                    {String(opt)}
                                  </button>
                                ))}
                                {dataCandidates.length > previewLimit ? (
                                  <span className="candidate-more">+{dataCandidates.length - previewLimit} more</span>
                                ) : null}
                              </div>
                              {dataCandidates.length > previewLimit ? (
                                <div className="candidate-preview">
                                  {dataCandidates.slice(previewLimit).map((opt) => (
                                    <button
                                      key={`${key}-data-more-${String(opt)}`}
                                      type="button"
                                      className="candidate-chip"
                                      onClick={() => updateDraftField(key, opt)}
                                    >
                                      {String(opt)}
                                    </button>
                                  ))}
                                </div>
                              ) : null}
                            </details>
                          ) : null}
                            </div>
                          )
                          })}
                        </div>
                      </>
                    ) : (
                      <div className="relations-panel">
                        <label className="spec-test-field">
                          <span>meta.inputs (edges)</span>
                          <select
                            multiple
                            value={activeOp.meta.inputs}
                            onChange={(e) => {
                              const values = Array.from(e.target.selectedOptions).map((o) => o.value)
                              updateDraftMeta({ inputs: values.sort() })
                            }}
                          >
                            {allNodeIdsSorted
                              .filter((id) => id !== activeOp.meta.nodeId)
                              .map((id) => (
                                <option key={id} value={id}>
                                  {id}
                                </option>
                              ))}
                          </select>
                          <div className="spec-test-hint">Edges must point to existing nodeIds. Scalar refs also add edges.</div>
                        </label>

                        <div className="relation-block">
                          <div className="relation-title">Outgoing</div>
                          <div className="relation-body">
                            {activeOp.meta.inputs.length ? activeOp.meta.inputs.join(', ') : '(none)'}
                          </div>
                        </div>

                        <div className="relation-block">
                          <div className="relation-title">Incoming</div>
                          <div className="relation-body">
                            {incomingEdges.length
                              ? incomingEdges.map((e) => `${e.nodeId}(${e.op})`).join(', ')
                              : '(none)'}
                          </div>
                        </div>

                        <div className="relation-block">
                          <div className="relation-title">Scalar Refs</div>
                          <div className="relation-body">{scalarRefs.length ? scalarRefs.join(', ') : '(none)'}</div>
                        </div>
                      </div>
                    )}

                    <details className="inspector-raw">
                      <summary>Raw JSON (selected op)</summary>
                      <pre>{JSON.stringify(activeOp, null, 2)}</pre>
                    </details>
                  </>
                )}
              </div>
            </section>
          </div>
        </div>

        <section className="spec-test-pane spec-test-graph-pane">
          <div className="spec-test-pane-header">Tree</div>
          <div className="spec-test-pane-body">
            <div className="spec-test-graph" ref={graphRef}>
              <div className="spec-test-graph-canvas" style={{ width: graphLayout.width, height: graphLayout.height }}>
                <svg className="spec-test-graph-svg" width={graphLayout.width} height={graphLayout.height}>
                  <defs>
                    <marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto">
                      <path d="M0,0 L0,6 L9,3 z" fill="rgba(17,24,39,0.55)" />
                    </marker>
                  </defs>
                  {graphLayout.edges.map((e) => {
                    const from = graphLayout.nodes.find((n) => n.id === e.from)
                    const to = graphLayout.nodes.find((n) => n.id === e.to)
                    if (!from || !to) return null
                    const x1 = from.x + graphLayout.nodeWidth / 2
                    const y1 = from.y + graphLayout.nodeHeight
                    const x2 = to.x + graphLayout.nodeWidth / 2
                    const y2 = to.y
                    const midY = (y1 + y2) / 2
                    const d = `M ${x1} ${y1} C ${x1} ${midY} ${x2} ${midY} ${x2} ${y2}`
                    return <path key={`${e.from}->${e.to}`} d={d} fill="none" stroke="rgba(17,24,39,0.45)" strokeWidth={1.6} markerEnd="url(#arrow)" />
                  })}
                </svg>

                {graphLayout.nodes.map((n) => (
                  (() => {
                    const op = ops[n.id] as unknown as UnknownRecord
                    const viewSummary = formatViewSummary(extractOpView(op))
                    const sentenceText = laneSentences[Math.max(1, n.sentenceIndex) - 1] ?? ''
                    const sentenceShort = sentenceText.length > 60 ? `${sentenceText.slice(0, 60)}…` : sentenceText
                    const title = viewSummary
                      ? `${n.id} • ${n.op} • sentence ${n.sentenceIndex} • ${sentenceShort} • ${viewSummary}`
                      : `${n.id} • ${n.op} • sentence ${n.sentenceIndex} • ${sentenceShort}`
                    return (
                      <button
                    key={n.id}
                    type="button"
                    className={`spec-test-graph-node ${selectedNodeId === n.id ? 'is-selected' : ''}`}
                    style={{ left: n.x, top: n.y, width: graphLayout.nodeWidth, height: graphLayout.nodeHeight }}
                    onClick={() => startEditingOp(n.id)}
                    title={title}
                    disabled={draftDirty}
                  >
                    <div className="spec-test-graph-node-title">
                      <span className="spec-test-graph-node-id">{n.id}</span>
                      <span className="spec-test-graph-node-op">{n.op}</span>
                    </div>
                    <div className="spec-test-graph-node-sub">ops{n.sentenceIndex === 1 ? '' : n.sentenceIndex}</div>
                    {sentenceShort ? <div className="spec-test-graph-node-sentence">{sentenceShort}</div> : null}
                    {viewSummary ? <div className="spec-test-graph-node-view">{viewSummary}</div> : null}
                      </button>
                    )
                  })()
                ))}
              </div>
            </div>
          </div>
        </section>
      </section>
    </div>
  )
}

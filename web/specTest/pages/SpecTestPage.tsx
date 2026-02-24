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

const CHART_SPEC_MODULES = import.meta.glob('../../../ChartQA/data/vlSpec/**/*.json', {
  as: 'raw',
}) as Record<string, () => Promise<string>>

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

export default function SpecTestPage() {
  const chartRef = useRef<HTMLDivElement | null>(null)
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

  const [chartId, setChartId] = useState('10x2rgiqw97wdspi')
  const [question, setQuestion] = useState('')
  const [explanation, setExplanation] = useState('')
  const sentences = useMemo(() => splitSentences(explanation), [explanation])
  const laneSentenceCount = useMemo(() => Math.max(sentences.length, 1), [sentences.length])
  const laneSentences = useMemo(
    () => (sentences.length ? sentences : ['(No explanation sentences yet)']),
    [sentences.length, sentences],
  )

  const [vlSpec, setVlSpec] = useState<VegaLiteSpec | null>(null)
  const [dataRows, setDataRows] = useState<UnknownRecord[]>([])
  const [chartContext, setChartContext] = useState<ChartContext | null>(null)

  const [registry, setRegistry] = useState<OpRegistrySchema | null>(null)
  const [registryError, setRegistryError] = useState<string | null>(null)

  const [ops, setOps] = useState<Record<string, EditableOp>>({})
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [draftOp, setDraftOp] = useState<EditableOp | null>(null)
  const [draftDirty, setDraftDirty] = useState(false)
  const [status, setStatus] = useState('Ready.')
  const [error, setError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])

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

  const nextNodeId = useMemo(() => {
    let max = 0
    for (const id of Object.keys(ops)) {
      const m = id.match(/^n(\\d+)$/)
      if (m) max = Math.max(max, Number(m[1]))
    }
    return `n${max + 1}`
  }, [ops])

  const nodesBySentence = useMemo(() => {
    const out: Record<number, EditableOp[]> = {}
    Object.values(ops).forEach((op) => {
      const si = op.meta?.sentenceIndex ?? 1
      out[si] ??= []
      out[si].push(op)
    })
    Object.values(out).forEach((list) => {
      list.sort((a, b) => a.meta.nodeId.localeCompare(b.meta.nodeId))
    })
    return out
  }, [ops])

  // Ensure each sentence lane has at least one operation by default.
  useEffect(() => {
    if (!registry) return
    if (laneSentenceCount < 1) return

    setOps((prev) => {
      const hasSentence: Record<number, boolean> = {}
      Object.values(prev).forEach((op) => {
        const si = op.meta?.sentenceIndex ?? 1
        hasSentence[si] = true
      })

      const missing: number[] = []
      for (let i = 1; i <= laneSentenceCount; i += 1) {
        if (!hasSentence[i]) missing.push(i)
      }
      if (!missing.length) return prev

      let max = 0
      for (const id of Object.keys(prev)) {
        const m = id.match(/^n(\d+)$/)
        if (m) max = Math.max(max, Number(m[1]))
      }

      const next: Record<string, EditableOp> = { ...prev }
      for (const sentenceIndex of missing) {
        max += 1
        const nodeId = `n${max}`
        next[nodeId] = {
          op: defaultOpName(registry),
          id: nodeId,
          meta: { nodeId, inputs: [], sentenceIndex },
        }
      }
      debugLog('autoCreateSentenceOps', { missingCount: missing.length, missing })
      return next
    })
  }, [debugLog, registry, laneSentenceCount])

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

      const existing = (nodesBySentence[sentenceIndex] ?? []).slice()
      const parentId = existing.length ? existing[existing.length - 1]?.meta?.nodeId : null

      const nodeId = nextNodeId
      const next: EditableOp = {
        op: defaultOpName(registry),
        id: nodeId,
        meta: { nodeId, inputs: parentId ? [parentId] : [], sentenceIndex },
      }
      debugLog('addOp', { sentenceIndex, nodeId, parentId, next })
      setOps((prev) => ({ ...prev, [nodeId]: next }))
      setSelectedNodeId(nodeId)
      setDraftOp(JSON.parse(JSON.stringify(next)) as EditableOp)
      setDraftDirty(false)
    },
    [debugLog, draftDirty, nextNodeId, nodesBySentence, registry],
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
    setError(null)
    setOps((prev) => {
      if (!prev[selectedNodeId]) return prev
      debugLog('saveDraft', { nodeId: selectedNodeId, op: draftOp.op })
      return { ...prev, [selectedNodeId]: draftOp }
    })
    setDraftDirty(false)
    setStatus('Saved.')
  }, [debugLog, draftOp, selectedNodeId])

  const handleCancelDraft = useCallback(() => {
    if (!selectedNodeId) return
    const op = ops[selectedNodeId]
    if (!op) return
    setError(null)
    setDraftOp(JSON.parse(JSON.stringify(op)) as EditableOp)
    setDraftDirty(false)
    setStatus('Canceled changes.')
  }, [ops, selectedNodeId])

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
    Object.values(ops).forEach((op) => {
      const si = op.meta?.sentenceIndex ?? 1
      const g = groupNameForSentenceIndex(si)
      groups[g] ??= []
      groups[g].push(op)
    })
    Object.values(groups).forEach((list) => {
      list.sort((a, b) => String((a as EditableOp).meta?.nodeId ?? '').localeCompare(String((b as EditableOp).meta?.nodeId ?? '')))
    })
    groups.ops ??= []
    return groups
  }, [ops])

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
      setChartContext(body.chart_context)
      setWarnings(body.warnings ?? [])

      // Replace UI state with canonicalized ops_spec output.
      const nextOps: Record<string, EditableOp> = {}
      Object.values(body.ops_spec ?? {}).forEach((list) => {
        list.forEach((raw) => {
          const meta = asRecord(raw.meta) ?? {}
          const nodeId = typeof meta.nodeId === 'string' ? meta.nodeId : typeof raw.id === 'string' ? raw.id : ''
          if (!nodeId) return
          nextOps[nodeId] = raw as unknown as EditableOp
        })
      })
      setOps(nextOps)
      setSelectedNodeId(null)
      setDraftOp(null)
      setDraftDirty(false)
      setStatus('Canonicalized.')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStatus('Canonicalize failed.')
    }
  }, [vlSpec, question, explanation, dataRows, buildOpsSpecGroups, endpoint])

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

      const now = new Date()
      const bundle = pruneNulls({
        version: 1,
        created_at: now.toISOString(),
        chart_id: chartId.trim(),
        question: question.trim(),
        explanation: explanation.trim(),
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
  }, [vlSpec, endpoint, question, explanation, dataRows, buildOpsSpecGroups, chartId])

  const selectedUiOp = activeOp ? opSchemaByName.get(activeOp.op) ?? null : null

  return (
    <div className="app-shell spec-test-shell">
      <section className="card spec-test-card">
        <div className="card-header">
          <div className="card-title">specTest (Gold OpsSpec Editor)</div>
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
            Download Gold Bundle
          </button>
          <label className="spec-test-debug-toggle">
            <input type="checkbox" checked={debugEnabled} onChange={(e) => setDebugEnabled(e.target.checked)} />
            Debug console logs
          </label>
          <a className="spec-test-link" href="/" title="Back to workbench">
            Workbench
          </a>
        </div>

        <div className="spec-test-inputs">
          <label className="spec-test-field grow">
            <span>question</span>
            <textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={2} />
          </label>
          <label className="spec-test-field grow">
            <span>explanation</span>
            <textarea value={explanation} onChange={(e) => setExplanation(e.target.value)} rows={4} />
            <div className="spec-test-hint">
              Sentences: {sentences.length || 0} (Sentence i uses group {`ops/ops2/ops3...`})
            </div>
          </label>
        </div>

        <div className="spec-test-split">
          <section className="spec-test-pane">
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

          <section className="spec-test-pane wide">
            <div className="spec-test-pane-header">Sentence Lanes (ops/ops2/ops3...)</div>
            <div className="spec-test-pane-body lanes">
              {laneSentences.map((sentence, index) => {
                const sentenceIndex = index + 1
                const groupName = groupNameForSentenceIndex(sentenceIndex)
                const laneNodes = nodesBySentence[sentenceIndex] ?? []
                return (
                  <div key={groupName} className="lane" data-testid={`lane-${groupName}`}>
                    <div className="lane-header">
                      <div className="lane-title">
                        {groupName}
                        <span className="lane-subtitle">Sentence {sentenceIndex}</span>
                      </div>
                      <button type="button" className="spec-test-btn tiny" onClick={() => handleAddOp(sentenceIndex)}>
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
                        </button>
                      ))}
                      {!laneNodes.length ? <div className="lane-empty">No nodes.</div> : null}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          <section className="spec-test-pane">
            <div className="spec-test-pane-header">Inspector</div>
            <div className="spec-test-pane-body inspector">
              {!activeOp ? (
                <div className="inspector-empty">Select a node to edit its operation and parameters.</div>
              ) : (
                <>
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
                    <div className="spec-test-field">
                      <span>actions</span>
                      <div className="inspector-actions">
                        <button
                          type="button"
                          className="spec-test-btn"
                          onClick={handleSaveDraft}
                          disabled={!draftDirty}
                          title={draftDirty ? 'Save this operation' : 'No changes to save'}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          className="spec-test-btn"
                          onClick={handleCancelDraft}
                          disabled={!draftDirty}
                          title={draftDirty ? 'Discard changes' : 'No changes to discard'}
                        >
                          Cancel
                        </button>
                      </div>
                      {draftDirty ? <div className="spec-test-hint">Unsaved changes</div> : null}
                    </div>
                  </div>

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

                  <details className="inspector-raw">
                    <summary>Raw JSON (selected op)</summary>
                    <pre>{JSON.stringify(selectedOp, null, 2)}</pre>
                  </details>
                </>
              )}
            </div>
          </section>
        </div>
      </section>
    </div>
  )
}

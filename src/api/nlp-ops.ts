import { csvParse, tsvParse } from 'd3'
import type { VegaLiteSpec } from '../domain/chart'
import type { OpsSpecGroupMap } from '../domain/operation/opsSpec'
import { normalizeOpsGroups } from '../domain/operation/opsSpec'

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
type UnknownRecord = Record<string, unknown>

export type ParseToOperationSpecCommand = {
  text: string
  question?: string
  explanation?: string
  spec: VegaLiteSpec
  container?: HTMLElement | null
  endpoint?: string
  fetcher?: FetchLike
  debug?: boolean
}

export type ParseToOpsResult = {
  resolvedText: string
  opsSpec: OpsSpecGroupMap
  warnings: string[]
}

type GenerateGrammarRequest = {
  question: string
  explanation: string
  vega_lite_spec: VegaLiteSpec
  data_rows: UnknownRecord[]
  debug: boolean
}

type GenerateGrammarResponse = Record<string, unknown> & {
  ops1?: unknown
  resolvedText?: unknown
  resolved_text?: unknown
  warnings?: unknown
}

function resolveDefaultEndpoint(): string {
  const env =
    typeof import.meta !== 'undefined' ? ((import.meta as { env?: Record<string, unknown> }).env ?? {}) : {}
  const fromEnv = typeof env.VITE_NLP_SERVER_URL === 'string' ? env.VITE_NLP_SERVER_URL : ''
  const normalized = fromEnv.trim()
  if (normalized) return normalized.replace(/\/+$/, '')
  return 'http://localhost:3000'
}

function asRecord(value: unknown): UnknownRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as UnknownRecord
}

function toSpecDataUrl(spec: UnknownRecord): string | null {
  const data = asRecord(spec.data)
  if (!data) return null
  const url = data.url
  if (typeof url !== 'string') return null
  const normalized = url.trim()
  return normalized || null
}

function normalizeRow(value: unknown): UnknownRecord | null {
  const row = asRecord(value)
  if (!row) return null
  const out: UnknownRecord = {}
  for (const [key, entry] of Object.entries(row)) {
    if (entry === null || entry === undefined) {
      out[key] = null
      continue
    }
    if (typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'boolean') {
      out[key] = entry
      continue
    }
    out[key] = String(entry)
  }
  return out
}

async function loadDataRows(spec: VegaLiteSpec, fetcher: FetchLike): Promise<UnknownRecord[]> {
  const specRecord = spec as unknown as UnknownRecord
  const valuesRaw = asRecord(specRecord.data)?.values
  if (Array.isArray(valuesRaw)) {
    return valuesRaw.map((row) => normalizeRow(row)).filter((row): row is UnknownRecord => !!row)
  }

  const url = toSpecDataUrl(specRecord)
  if (!url) return []

  const response = await fetcher(url, { method: 'GET' })
  if (!response.ok) return []

  const contentType = (response.headers.get('content-type') ?? '').toLowerCase()
  if (contentType.includes('application/json') || url.toLowerCase().endsWith('.json')) {
    const payload = await response.json()
    if (Array.isArray(payload)) {
      return payload.map((row) => normalizeRow(row)).filter((row): row is UnknownRecord => !!row)
    }
    const obj = asRecord(payload)
    if (obj && Array.isArray(obj.values)) {
      return obj.values.map((row) => normalizeRow(row)).filter((row): row is UnknownRecord => !!row)
    }
    return []
  }

  const text = await response.text()
  const lowerUrl = url.toLowerCase()
  const parsed =
    lowerUrl.endsWith('.tsv') || contentType.includes('text/tab-separated-values') ? tsvParse(text) : csvParse(text)
  return parsed.map((row) => normalizeRow(row)).filter((row): row is UnknownRecord => !!row)
}

function normalizeWarnings(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
}

function normalizeGroupMap(raw: unknown): OpsSpecGroupMap {
  if (!raw || typeof raw !== 'object') {
    throw new Error('NLP server response is invalid: response must be an opsSpec groups object.')
  }
  const groups = normalizeOpsGroups(raw as OpsSpecGroupMap)
  if (!groups.length) {
    return { ops: [] }
  }

  const out: OpsSpecGroupMap = {}
  for (const group of groups) {
    out[group.name] = group.ops
  }
  if (!Array.isArray(out.ops)) out.ops = []
  return out
}

export async function parseToOperationSpec(command: ParseToOperationSpecCommand): Promise<ParseToOpsResult> {
  const endpoint = (command.endpoint ?? resolveDefaultEndpoint()).replace(/\/+$/, '')
  const fetcher = command.fetcher ?? fetch.bind(globalThis)
  const text = command.text.trim()
  const question = (command.question ?? '').trim()
  const explanation = (command.explanation ?? '').trim()
  if (!text) {
    return { resolvedText: '', opsSpec: { ops: [] }, warnings: ['Input text is empty.'] }
  }

  const dataRows = await loadDataRows(command.spec, fetcher)
  const payload: GenerateGrammarRequest = {
    question: question || text,
    explanation: explanation || text,
    vega_lite_spec: command.spec,
    data_rows: dataRows,
    debug: Boolean(command.debug),
  }

  const response = await fetcher(`${endpoint}/generate_grammar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`NLP server request failed (${response.status}): ${detail || response.statusText}`)
  }

  const body = (await response.json()) as GenerateGrammarResponse
  // Backward-compatible: older servers wrap the group map under "ops1".
  const maybeWrapped = asRecord(body.ops1)
  const groupSource = maybeWrapped ?? body
  const opsSpec = normalizeGroupMap(groupSource)
  const resolvedTextRaw = typeof body.resolvedText === 'string' ? body.resolvedText : body.resolved_text

  return {
    resolvedText: typeof resolvedTextRaw === 'string' && resolvedTextRaw.trim().length > 0 ? resolvedTextRaw : text,
    opsSpec,
    warnings: normalizeWarnings(body.warnings),
  }
}

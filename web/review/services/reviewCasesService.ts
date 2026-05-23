import { csvFormat, csvParse } from 'd3'

export const REVIEW_COLUMNS = [
  'chart_id',
  'chart_type',
  'status',
  'question',
  'explanation',
  'operation_spec',
  'feedback',
  'updated_at',
] as const

export type ReviewColumn = (typeof REVIEW_COLUMNS)[number]

export type ReviewStatus = 'pending' | 'verified' | 'bug' | 'wontfix'

export const CHART_TYPE_VALUES = [
  'simpleBar',
  'stackedBar',
  'groupedBar',
  'simpleLine',
  'multipleLine',
] as const

export type ReviewChartType = (typeof CHART_TYPE_VALUES)[number]

export type ReviewRow = {
  chart_id: string
  chart_type: string
  status: ReviewStatus
  question: string
  explanation: string
  operation_spec: string
  feedback: string
  updated_at: string
}

const STATUS_VALUES: ReviewStatus[] = ['pending', 'verified', 'bug', 'wontfix']

function normalizeStatus(raw: string | undefined): ReviewStatus {
  const trimmed = (raw ?? '').trim().toLowerCase() as ReviewStatus
  return STATUS_VALUES.includes(trimmed) ? trimmed : 'pending'
}

export function createEmptyRow(): ReviewRow {
  return {
    chart_id: '',
    chart_type: '',
    status: 'pending',
    question: '',
    explanation: '',
    operation_spec: '',
    feedback: '',
    updated_at: '',
  }
}

function rawToRow(raw: Record<string, string>): ReviewRow {
  return {
    chart_id: raw.chart_id ?? '',
    chart_type: (raw.chart_type ?? '').trim(),
    status: normalizeStatus(raw.status),
    question: raw.question ?? '',
    explanation: raw.explanation ?? '',
    operation_spec: raw.operation_spec ?? '',
    feedback: raw.feedback ?? '',
    updated_at: raw.updated_at ?? '',
  }
}

export function rowsEqual(a: ReviewRow, b: ReviewRow): boolean {
  // updated_at is server-stamped; ignore it for dirtiness comparison.
  return (
    a.chart_id === b.chart_id &&
    a.chart_type === b.chart_type &&
    a.status === b.status &&
    a.question === b.question &&
    a.explanation === b.explanation &&
    a.operation_spec === b.operation_spec &&
    a.feedback === b.feedback
  )
}

export function rowsToCsv(rows: ReviewRow[]): string {
  const records = rows.map((row) => {
    const record: Record<string, string> = {}
    for (const column of REVIEW_COLUMNS) {
      record[column] = row[column] ?? ''
    }
    return record
  })
  const body = csvFormat(records, [...REVIEW_COLUMNS])
  return body.endsWith('\n') ? body : `${body}\n`
}

export function csvToRows(text: string): ReviewRow[] {
  const parsed = csvParse(text)
  return parsed.map((entry) => rawToRow(entry as unknown as Record<string, string>))
}

function buildCsvUrl(file?: string): string {
  const base = '/api/review/csv'
  const trimmed = (file ?? '').trim()
  if (!trimmed) return base
  return `${base}?file=${encodeURIComponent(trimmed)}`
}

export type ReviewFileList = {
  files: string[]
  default: string
}

export async function fetchFileList(): Promise<ReviewFileList> {
  const response = await fetch('/api/review/files', { method: 'GET' })
  if (!response.ok) {
    throw new Error(`Failed to list review files (${response.status})`)
  }
  const json = (await response.json()) as Partial<ReviewFileList>
  const files = Array.isArray(json.files) ? json.files.filter((f) => typeof f === 'string') : []
  const fallback = typeof json.default === 'string' ? json.default : files[0] ?? ''
  return { files, default: fallback }
}

export async function fetchAll(file?: string): Promise<ReviewRow[]> {
  const response = await fetch(buildCsvUrl(file), { method: 'GET' })
  if (!response.ok) {
    throw new Error(`Failed to load review CSV (${response.status})`)
  }
  const text = await response.text()
  return csvToRows(text)
}

type SaveState = {
  inFlight: Promise<void> | null
  pending: { rows: ReviewRow[]; file?: string } | null
  lastError: Error | null
}

const saveState: SaveState = {
  inFlight: null,
  pending: null,
  lastError: null,
}

async function pushOnce(rows: ReviewRow[], file?: string): Promise<void> {
  const body = rowsToCsv(rows)
  const response = await fetch(buildCsvUrl(file), {
    method: 'PUT',
    headers: { 'Content-Type': 'text/csv; charset=utf-8' },
    body,
  })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Failed to save review CSV (${response.status}): ${text}`)
  }
}

export async function saveAll(rows: ReviewRow[], file?: string): Promise<void> {
  if (saveState.inFlight) {
    saveState.pending = { rows, file }
    return saveState.inFlight
  }
  const run = async (): Promise<void> => {
    try {
      await pushOnce(rows, file)
      while (saveState.pending) {
        const next = saveState.pending
        saveState.pending = null
        await pushOnce(next.rows, next.file)
      }
      saveState.lastError = null
    } catch (error) {
      saveState.lastError = error instanceof Error ? error : new Error(String(error))
      throw saveState.lastError
    } finally {
      saveState.inFlight = null
    }
  }
  saveState.inFlight = run()
  return saveState.inFlight
}

export function getLastSaveError(): Error | null {
  return saveState.lastError
}

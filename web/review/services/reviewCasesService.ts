import { csvFormat, csvParse } from 'd3'

// CSV schema:
//   • status is split into op_status (operation_spec correctness) + viz_status
//     (visualization correctness).
//   • feedback is split into op_feedback + viz_feedback so reviewers can flag
//     "the operation_spec is wrong" vs "the rendered visualization is wrong"
//     separately, which makes downstream triage easier.
//   • Legacy single `status` / `feedback` columns are auto-migrated on load.
export const REVIEW_COLUMNS = [
  'chart_id',
  'chart_type',
  'op_status',
  'viz_status',
  'question',
  'explanation',
  'operation_spec',
  'op_feedback',
  'viz_feedback',
  'updated_at',
] as const

export type ReviewColumn = (typeof REVIEW_COLUMNS)[number]

export type ReviewStatus = 'pending' | 'verified' | 'bug' | 'wontfix'

/** Which review axis a status value applies to. */
export type ReviewStatusKind = 'op' | 'viz'

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
  op_status: ReviewStatus
  viz_status: ReviewStatus
  question: string
  explanation: string
  operation_spec: string
  op_feedback: string
  viz_feedback: string
  updated_at: string
}

/** Which feedback axis a textual comment applies to. */
export type ReviewFeedbackKind = 'op' | 'viz'

const STATUS_VALUES: ReviewStatus[] = ['pending', 'verified', 'bug', 'wontfix']

function normalizeStatus(raw: string | undefined): ReviewStatus {
  const trimmed = (raw ?? '').trim().toLowerCase() as ReviewStatus
  return STATUS_VALUES.includes(trimmed) ? trimmed : 'pending'
}

/**
 * Derives a single row-level status for visual decoration (e.g. dirty stripe
 * color). When the two axes disagree, the more attention-grabbing axis wins:
 * bug > wontfix > pending > verified.
 */
const STATUS_PRIORITY: Record<ReviewStatus, number> = {
  bug: 3,
  wontfix: 2,
  pending: 1,
  verified: 0,
}
export function rowDerivedStatus(row: ReviewRow): ReviewStatus {
  return STATUS_PRIORITY[row.op_status] >= STATUS_PRIORITY[row.viz_status]
    ? row.op_status
    : row.viz_status
}

export function createEmptyRow(): ReviewRow {
  return {
    chart_id: '',
    chart_type: '',
    op_status: 'pending',
    viz_status: 'pending',
    question: '',
    explanation: '',
    operation_spec: '',
    op_feedback: '',
    viz_feedback: '',
    updated_at: '',
  }
}

function rawToRow(raw: Record<string, string>): ReviewRow {
  // Backward-compat:
  //   • Legacy single `status` column → fan out to both op_status / viz_status.
  //   • Legacy single `feedback` column → migrate into op_feedback only
  //     (visualization-side feedback is opt-in; defaults to empty).
  const legacyStatus = normalizeStatus(raw.status)
  const legacyFeedback = raw.feedback ?? ''
  const opStatusRaw = raw.op_status ?? ''
  const vizStatusRaw = raw.viz_status ?? ''
  const opFeedbackRaw = raw.op_feedback ?? ''
  const vizFeedbackRaw = raw.viz_feedback ?? ''
  return {
    chart_id: raw.chart_id ?? '',
    chart_type: (raw.chart_type ?? '').trim(),
    op_status: opStatusRaw ? normalizeStatus(opStatusRaw) : legacyStatus,
    viz_status: vizStatusRaw ? normalizeStatus(vizStatusRaw) : legacyStatus,
    question: raw.question ?? '',
    explanation: raw.explanation ?? '',
    operation_spec: raw.operation_spec ?? '',
    op_feedback: opFeedbackRaw || legacyFeedback,
    viz_feedback: vizFeedbackRaw,
    updated_at: raw.updated_at ?? '',
  }
}

export function rowsEqual(a: ReviewRow, b: ReviewRow): boolean {
  // updated_at is server-stamped; ignore it for dirtiness comparison.
  return (
    a.chart_id === b.chart_id &&
    a.chart_type === b.chart_type &&
    a.op_status === b.op_status &&
    a.viz_status === b.viz_status &&
    a.question === b.question &&
    a.explanation === b.explanation &&
    a.operation_spec === b.operation_spec &&
    a.op_feedback === b.op_feedback &&
    a.viz_feedback === b.viz_feedback
  )
}

/** True if either feedback column has non-whitespace content. */
export function rowHasFeedback(row: ReviewRow): boolean {
  return row.op_feedback.trim().length > 0 || row.viz_feedback.trim().length > 0
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

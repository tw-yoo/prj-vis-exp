import type { ChartTypeValue } from '../../../src/api/types'
import { ChartType } from '../../../src/api/types'
import type { ReviewRow } from './reviewCasesService'

export type SlashCommandKey = 'op' | 'group' | 'chart' | 'severity' | 'tag'

export type SlashCommand = {
  key: SlashCommandKey
  label: string
  hint: string
  chipTone: 'blue' | 'purple' | 'teal' | 'red' | 'amber' | 'slate'
  staticValues?: readonly string[]
  rowValues?: (row: ReviewRow) => string[]
}

const SEVERITIES = ['low', 'med', 'high'] as const

const CHART_TYPE_VALUES: ChartTypeValue[] = Object.values(ChartType) as ChartTypeValue[]

export const FEEDBACK_COMMANDS: readonly SlashCommand[] = [
  {
    key: 'op',
    label: 'op',
    hint: 'Reference an operation by its id from this row’s operation_spec.',
    chipTone: 'blue',
    rowValues: (row) => extractOpIds(row.operation_spec),
  },
  {
    key: 'group',
    label: 'group',
    hint: 'Reference an ops group key when operation_spec is a group map.',
    chipTone: 'purple',
    rowValues: (row) => extractGroupKeys(row.operation_spec),
  },
  {
    key: 'chart',
    label: 'chart',
    hint: 'Tag the chart type this issue concerns.',
    chipTone: 'teal',
    staticValues: CHART_TYPE_VALUES,
  },
  {
    key: 'severity',
    label: 'severity',
    hint: 'Bug severity.',
    chipTone: 'red',
    staticValues: SEVERITIES,
  },
  {
    key: 'tag',
    label: 'tag',
    hint: 'Free-form category label (e.g. axis-jitter, label-overlap).',
    chipTone: 'amber',
  },
] as const

const COMMAND_BY_KEY = new Map<string, SlashCommand>(FEEDBACK_COMMANDS.map((c) => [c.key, c]))

export function getCommand(key: string): SlashCommand | null {
  return COMMAND_BY_KEY.get(key) ?? null
}

export type TextSegment = { kind: 'text'; text: string }
export type TagSegment = { kind: 'tag'; command: SlashCommandKey; value: string; raw: string }
export type FeedbackSegment = TextSegment | TagSegment

const TAG_PATTERN = /\/([A-Za-z]+):([^\s]+)/g

export function parseFeedback(text: string): FeedbackSegment[] {
  if (!text) return []
  const segments: FeedbackSegment[] = []
  let lastIndex = 0
  for (const match of text.matchAll(TAG_PATTERN)) {
    const start = match.index ?? 0
    const [raw, cmdName, value] = match
    if (!COMMAND_BY_KEY.has(cmdName)) continue
    if (start > lastIndex) {
      segments.push({ kind: 'text', text: text.slice(lastIndex, start) })
    }
    segments.push({
      kind: 'tag',
      command: cmdName as SlashCommandKey,
      value,
      raw,
    })
    lastIndex = start + raw.length
  }
  if (lastIndex < text.length) {
    segments.push({ kind: 'text', text: text.slice(lastIndex) })
  }
  return segments
}

export function formatFeedback(segments: FeedbackSegment[]): string {
  return segments
    .map((s) => (s.kind === 'text' ? s.text : `/${s.command}:${s.value}`))
    .join('')
}

export function extractTagsByCommand(text: string): Record<SlashCommandKey, string[]> {
  const acc: Record<SlashCommandKey, string[]> = {
    op: [],
    group: [],
    chart: [],
    severity: [],
    tag: [],
  }
  for (const seg of parseFeedback(text)) {
    if (seg.kind === 'tag') acc[seg.command].push(seg.value)
  }
  return acc
}

export function getRowAutocompleteOptions(row: ReviewRow, command: SlashCommandKey): string[] {
  const def = COMMAND_BY_KEY.get(command)
  if (!def) return []
  if (def.staticValues) return [...def.staticValues]
  if (def.rowValues) return def.rowValues(row)
  return []
}

function extractOpIds(opsRaw: string): string[] {
  const parsed = safeParse(opsRaw)
  if (!parsed) return []
  const ids = new Set<string>()
  walkOps(parsed, (op) => {
    if (typeof op?.id === 'string') ids.add(op.id)
  })
  return [...ids]
}

function extractGroupKeys(opsRaw: string): string[] {
  const parsed = safeParse(opsRaw)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return []
  return Object.keys(parsed).filter((key) => {
    const value = (parsed as Record<string, unknown>)[key]
    return Array.isArray(value) || (typeof value === 'object' && value !== null && Array.isArray((value as Record<string, unknown>).ops))
  })
}

function safeParse(raw: string): unknown {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return null
  try {
    return JSON.parse(trimmed)
  } catch {
    return null
  }
}

function walkOps(value: unknown, visit: (op: Record<string, unknown>) => void): void {
  if (Array.isArray(value)) {
    value.forEach((item) => walkOps(item, visit))
    return
  }
  if (!value || typeof value !== 'object') return
  const obj = value as Record<string, unknown>
  if (typeof obj.op === 'string') visit(obj)
  Object.values(obj).forEach((child) => walkOps(child, visit))
}

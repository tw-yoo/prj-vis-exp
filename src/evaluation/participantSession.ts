import type { ExplanationMethod } from './renderers/types'

export type SequenceItem = {
  chart_id: string
  method: ExplanationMethod
}

export type ParticipantData = {
  code: string
  sequence: SequenceItem[]
}

type ParticipantsFile = Record<string, { sequence: SequenceItem[] }>

const STORAGE_KEY = 'eval.participant'
const CODE_PATTERN = /^[A-Za-z0-9]{6}$/

export function normalizeCode(input: string): string {
  return input.trim().toUpperCase()
}

export function isValidCodeFormat(input: string): boolean {
  return CODE_PATTERN.test(input.trim())
}

export async function lookupParticipant(rawCode: string, participantsUrl: string): Promise<ParticipantData | null> {
  const code = normalizeCode(rawCode)
  if (!isValidCodeFormat(code)) return null
  const response = await fetch(participantsUrl, { cache: 'no-store' })
  if (!response.ok) throw new Error(`Failed to load participants file (${response.status})`)
  const data = (await response.json()) as ParticipantsFile
  const entry = data[code]
  if (!entry || !Array.isArray(entry.sequence) || entry.sequence.length === 0) return null
  return { code, sequence: entry.sequence }
}

export function saveSession(data: ParticipantData): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

export function loadSession(): ParticipantData | null {
  const raw = sessionStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as ParticipantData
    if (!parsed.code || !Array.isArray(parsed.sequence) || parsed.sequence.length === 0) return null
    return parsed
  } catch {
    return null
  }
}

export function clearSession(): void {
  sessionStorage.removeItem(STORAGE_KEY)
}

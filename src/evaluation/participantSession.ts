import type { ExplanationMethod } from './renderers/types'

// ---- Participant model -----------------------------------------------------
// participants.json: { CODE: { order: { system: "SO1", chart: "CO1" } } }
//   order.system -> order_system.json -> ordered systems, e.g. ["Ours","B1","B2"]
//   order.chart  -> order_chart.json  -> ordered groups,  e.g. ["G1","G2","G3"]
// The i-th system is paired with the i-th group (Latin square). Each group's
// 5 charts (chart_group.json) are then shown in a per-participant random order.

export type SystemName = 'Ours' | 'B1' | 'B2' | 'B3'

export type ParticipantOrder = {
  system: string
  chart: string
}

export type ParticipantData = {
  code: string
  order: ParticipantOrder
}

export type SequenceItem = {
  chart_id: string
  method: ExplanationMethod
  system: string
  group: string
  question: string
  answer: string
  // Ground truth for the correct/incorrect-answer manipulation. `answer` is the
  // value SHOWN to the participant (wrong for incorrect items); `answerIsCorrect`
  // is whether that shown answer is actually correct; `correctAnswer` is the true
  // value. Carried through to the saved doc for scoring (none of these are shown).
  answerIsCorrect: boolean
  correctAnswer: string
}

export type OrderSystemFile = Record<string, string[]>
export type OrderChartFile = Record<string, string[]>
export type ChartGroupEntry = { id: string; question?: string; answer?: string; answerIsCorrect?: boolean; correctAnswer?: string }
export type ChartGroupFile = Record<string, Record<string, ChartGroupEntry>>

type ParticipantsFile = Record<string, { order?: ParticipantOrder }>

const STORAGE_KEY = 'eval.participant'
const CODE_PATTERN = /^[A-Za-z0-9]{6}$/

export function normalizeCode(input: string): string {
  return input.trim().toUpperCase()
}

export function isValidCodeFormat(input: string): boolean {
  return CODE_PATTERN.test(input.trim())
}

function isValidOrder(order: ParticipantOrder | undefined): order is ParticipantOrder {
  return !!order && typeof order.system === 'string' && typeof order.chart === 'string'
}

export async function lookupParticipant(rawCode: string, participantsUrl: string): Promise<ParticipantData | null> {
  const code = normalizeCode(rawCode)
  if (!isValidCodeFormat(code)) return null
  const response = await fetch(participantsUrl, { cache: 'no-store' })
  if (!response.ok) throw new Error(`Failed to load participants file (${response.status})`)
  const data = (await response.json()) as ParticipantsFile
  const entry = data[code]
  if (!entry || !isValidOrder(entry.order)) return null
  return { code, order: { system: entry.order.system, chart: entry.order.chart } }
}

export function saveSession(data: ParticipantData): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

export function loadSession(): ParticipantData | null {
  const raw = sessionStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as ParticipantData
    if (!parsed.code || !isValidOrder(parsed.order)) return null
    return parsed
  } catch {
    return null
  }
}

export function clearSession(): void {
  sessionStorage.removeItem(STORAGE_KEY)
}

export function systemToMethod(system: string): ExplanationMethod {
  if (system === 'Ours') return 'ours'
  if (system === 'B1') return 'b1'
  if (system === 'B2') return 'b2'
  if (system === 'B3') return 'b3'
  throw new Error(`Unknown system "${system}" (expected Ours | B1 | B2 | B3).`)
}

// ---- Deterministic shuffle (seeded by participant code) --------------------
// Stable across reloads / re-entry so ?page navigation stays aligned with the
// same chart on each page, and orders are reproducible for analysis.
function hashString(str: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function () {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const a = items.slice()
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * Build the flat presentation sequence for a participant. The i-th system in
 * `orderSystem[order.system]` is paired with the i-th group in
 * `orderChart[order.chart]` (each system explains its paired group's 5 charts).
 * All paired charts are then shuffled together into one fully-interleaved
 * presentation order, deterministic in `seed` (the participant code) so reloads
 * / ?page navigation stay aligned. Each item still carries its `system`, so the
 * viewer can group by system for the per-system evaluations shown at the end.
 * With 4 systems and 4 groups of 5 charts, this yields 20 items.
 */
export function buildSequence(
  order: ParticipantOrder,
  cfg: { orderSystem: OrderSystemFile; orderChart: OrderChartFile; chartGroup: ChartGroupFile },
  seed: string,
): SequenceItem[] {
  const systems = cfg.orderSystem[order.system]
  const groups = cfg.orderChart[order.chart]
  if (!Array.isArray(systems)) throw new Error(`Unknown system order "${order.system}".`)
  if (!Array.isArray(groups)) throw new Error(`Unknown chart order "${order.chart}".`)

  const rng = mulberry32(hashString(seed))
  const pairCount = Math.min(systems.length, groups.length)
  const items: SequenceItem[] = []

  for (let i = 0; i < pairCount; i += 1) {
    const system = systems[i]
    const group = groups[i]
    const method = systemToMethod(system)
    const groupCharts = cfg.chartGroup[group]
    if (!groupCharts) throw new Error(`Unknown chart group "${group}".`)
    for (const chart of Object.values(groupCharts)) {
      items.push({
        chart_id: chart.id,
        method,
        system,
        group,
        question: chart.question ?? '',
        answer: chart.answer ?? '',
        answerIsCorrect: chart.answerIsCorrect ?? true,
        correctAnswer: chart.correctAnswer ?? (chart.answer ?? ''),
      })
    }
  }

  // Fully interleave: shuffle every (system, group) chart together so the
  // participant sees systems in random order, one chart at a time, rather than
  // five-in-a-row per system. Per-system evaluations are deferred to the end.
  return shuffle(items, rng)
}

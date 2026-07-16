// Schedulable-window model for the pre-registration availability picker.
// Pure data/formatting helpers live here (no component) so the picker file can
// stay a component-only module for React Fast Refresh.
//
// A session is SESSION_MIN long and must fit entirely inside the daily window
// [DAY_START_MIN, DAY_END_MIN]. Start times step by STEP_MIN, so the latest
// start is DAY_END_MIN - SESSION_MIN. Edit these to change the grid.
export const RANGE_START = { year: 2026, month: 7, day: 16 } // inclusive, 1-indexed month
export const RANGE_END = { year: 2026, month: 7, day: 26 } // inclusive
export const DAY_START_MIN = 9 * 60 // 09:00
export const DAY_END_MIN = 24 * 60 // 24:00 (midnight) — a session must END by this
export const SESSION_MIN = 90 // each selection reserves 1h30m
export const STEP_MIN = 15 // start-time granularity
export const TZ_LABEL = 'KST'

// Time-of-day buckets, by session START time, so a 15-hour window stays
// scannable. A slot belongs to the first period whose `endBefore` it starts before.
const PERIOD_DEFS: { key: string; label: string; endBefore: number }[] = [
  { key: 'morning', label: 'Morning', endBefore: 12 * 60 },
  { key: 'afternoon', label: 'Afternoon', endBefore: 17 * 60 },
  { key: 'evening', label: 'Evening', endBefore: Number.POSITIVE_INFINITY },
]

const pad2 = (n: number) => String(n).padStart(2, '0')

export function fmtTime(min: number): string {
  // No modulo on the hour: a session that runs to midnight reads as "24:00"
  // (a clear end-of-range), not "00:00". Start times never reach 24:00.
  return `${pad2(Math.floor(min / 60))}:${pad2(min % 60)}`
}

export interface Slot {
  id: string // canonical, sortable: "2026-07-16T09:00"
  startLabel: string // "09:00"
  endLabel: string // "10:30"
}

export interface Period {
  key: string
  label: string
  slots: Slot[]
}

export interface Day {
  dateKey: string // "2026-07-16"
  weekday: string // "Thu"
  monthShort: string // "Jul"
  dayNum: number // 16
  isWeekend: boolean
  slots: Slot[] // flat, all periods
  periods: Period[] // grouped by time of day (non-empty periods only)
}

function periodKeyFor(startMin: number): string {
  return (PERIOD_DEFS.find((p) => startMin < p.endBefore) ?? PERIOD_DEFS[PERIOD_DEFS.length - 1]).key
}

export function buildDays(): Day[] {
  const days: Day[] = []
  const end = new Date(RANGE_END.year, RANGE_END.month - 1, RANGE_END.day)
  const cursor = new Date(RANGE_START.year, RANGE_START.month - 1, RANGE_START.day)
  while (cursor <= end) {
    const year = cursor.getFullYear()
    const month = cursor.getMonth() + 1
    const day = cursor.getDate()
    const dateKey = `${year}-${pad2(month)}-${pad2(day)}`
    const slots: Slot[] = []
    const byPeriod = new Map<string, Slot[]>()
    for (let start = DAY_START_MIN; start + SESSION_MIN <= DAY_END_MIN; start += STEP_MIN) {
      const slot: Slot = { id: `${dateKey}T${fmtTime(start)}`, startLabel: fmtTime(start), endLabel: fmtTime(start + SESSION_MIN) }
      slots.push(slot)
      const key = periodKeyFor(start)
      const bucket = byPeriod.get(key)
      if (bucket) bucket.push(slot)
      else byPeriod.set(key, [slot])
    }
    const periods: Period[] = PERIOD_DEFS.filter((p) => byPeriod.has(p.key)).map((p) => ({
      key: p.key,
      label: p.label,
      slots: byPeriod.get(p.key) ?? [],
    }))
    days.push({
      dateKey,
      weekday: cursor.toLocaleDateString('en-US', { weekday: 'short' }),
      monthShort: cursor.toLocaleDateString('en-US', { month: 'short' }),
      dayNum: day,
      isWeekend: cursor.getDay() === 0 || cursor.getDay() === 6,
      slots,
      periods,
    })
    cursor.setDate(cursor.getDate() + 1)
  }
  return days
}

// Turn a canonical slot id ("2026-07-16T09:00") into a human-readable label
// ("Thu Jul 16, 09:00–10:30 KST") for storage alongside the canonical ids.
export function formatSlotLabel(id: string): string {
  const [dateKey, hhmm] = id.split('T')
  const [year, month, day] = dateKey.split('-').map(Number)
  const [hh, mm] = hhmm.split(':').map(Number)
  const startMin = hh * 60 + mm
  const dt = new Date(year, month - 1, day)
  const weekday = dt.toLocaleDateString('en-US', { weekday: 'short' })
  const monthShort = dt.toLocaleDateString('en-US', { month: 'short' })
  return `${weekday} ${monthShort} ${day}, ${fmtTime(startMin)}–${fmtTime(startMin + SESSION_MIN)} ${TZ_LABEL}`
}

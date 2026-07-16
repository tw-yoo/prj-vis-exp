import { useMemo, useState } from 'react'
import {
  buildDays,
  DAY_END_MIN,
  DAY_START_MIN,
  fmtTime,
  SESSION_MIN,
  STEP_MIN,
  TZ_LABEL,
  type Day,
  type Period,
} from './availabilitySlots'
import './availabilityPicker.css'

export interface AvailabilityPickerProps {
  value: string[]
  onChange: (next: string[]) => void
}

export function AvailabilityPicker({ value, onChange }: AvailabilityPickerProps) {
  const days = useMemo(() => buildDays(), [])
  const selected = useMemo(() => new Set(value), [value])
  // Start with the first day open so the interaction is obvious; the rest stay
  // collapsed so 11 days × 55 slots never appear as one overwhelming wall.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(days[0] ? [days[0].dateKey] : []))

  // Keep the stored list in canonical (chronological) order.
  const commit = (next: Set<string>) => onChange([...next].sort())

  const toggleSlot = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    commit(next)
  }

  const allSelected = (slots: { id: string }[]) => slots.length > 0 && slots.every((s) => selected.has(s.id))
  const countSelected = (slots: { id: string }[]) => slots.reduce((n, s) => n + (selected.has(s.id) ? 1 : 0), 0)

  const toggleGroup = (slots: { id: string }[]) => {
    const next = new Set(selected)
    if (allSelected(slots)) slots.forEach((s) => next.delete(s.id))
    else slots.forEach((s) => next.add(s.id))
    commit(next)
  }

  const toggleExpanded = (dateKey: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(dateKey)) next.delete(dateKey)
      else next.add(dateKey)
      return next
    })
  }

  const allOpen = expanded.size === days.length
  const setAllOpen = (open: boolean) => setExpanded(open ? new Set(days.map((d) => d.dateKey)) : new Set())

  const totalSlots = days.reduce((sum, d) => sum + d.slots.length, 0)
  const firstStart = fmtTime(DAY_START_MIN)
  const lastStart = fmtTime(DAY_END_MIN - SESSION_MIN)
  const sessionHrs = Math.floor(SESSION_MIN / 60)
  const sessionMins = SESSION_MIN % 60
  const sessionText = sessionMins ? `${sessionHrs}h ${sessionMins}m` : `${sessionHrs}h`

  const renderPeriod = (period: Period) => {
    const on = allSelected(period.slots)
    const count = countSelected(period.slots)
    return (
      <div className="avail-period" key={period.key}>
        <div className="avail-period__head">
          <span className="avail-period__label">
            {period.label}
            {count > 0 ? <span className="avail-period__count">{count}</span> : null}
          </span>
          <button
            type="button"
            className={`avail-period__all${on ? ' is-on' : ''}`}
            aria-pressed={on}
            onClick={() => toggleGroup(period.slots)}
          >
            {on ? 'Clear' : 'Select all'}
          </button>
        </div>
        <div className="avail-period__slots">
          {period.slots.map((slot) => {
            const slotOn = selected.has(slot.id)
            return (
              <button
                key={slot.id}
                type="button"
                className={`avail-slot${slotOn ? ' is-on' : ''}`}
                aria-pressed={slotOn}
                title={`${slot.startLabel}–${slot.endLabel} ${TZ_LABEL}`}
                onClick={() => toggleSlot(slot.id)}
              >
                <span className="avail-slot__start">{slot.startLabel}</span>
                <span className="avail-slot__end">–{slot.endLabel}</span>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  const renderDay = (day: Day) => {
    const isOpen = expanded.has(day.dateKey)
    const dayCount = countSelected(day.slots)
    return (
      <div key={day.dateKey} className={`avail-day${day.isWeekend ? ' avail-day--weekend' : ''}${isOpen ? ' is-open' : ''}`}>
        <button
          type="button"
          className="avail-day__toggle"
          aria-expanded={isOpen}
          onClick={() => toggleExpanded(day.dateKey)}
        >
          <span className={`avail-day__chev${isOpen ? ' is-open' : ''}`} aria-hidden="true" />
          <span className="avail-day__date">
            <span className="avail-day__weekday">{day.weekday}</span>
            <span className="avail-day__daynum">
              {day.monthShort} {day.dayNum}
            </span>
          </span>
          {dayCount > 0 ? (
            <span className="avail-day__badge">{dayCount} selected</span>
          ) : (
            <span className="avail-day__hint">{isOpen ? 'Tap the times that work' : 'Choose times'}</span>
          )}
        </button>

        {isOpen ? <div className="avail-day__body">{day.periods.map(renderPeriod)}</div> : null}
      </div>
    )
  }

  return (
    <div className="avail">
      <ul className="avail__legend">
        <li>
          Each slot is a <strong>{sessionText}</strong> session. Open a day and tap every start time that works — pick as
          many as you like.
        </li>
        <li>
          Start times run from <strong>{firstStart}</strong> to <strong>{lastStart}</strong>, in {STEP_MIN}-minute steps
          (all times <strong>{TZ_LABEL}</strong>).
        </li>
      </ul>

      <div className="avail__toolbar">
        <button type="button" className="avail__expand" onClick={() => setAllOpen(!allOpen)}>
          {allOpen ? 'Collapse all days' : 'Expand all days'}
        </button>
      </div>

      <div className="avail__days" role="group" aria-label="Available time slots">
        {days.map(renderDay)}
      </div>

      <div className="avail__summary" aria-live="polite">
        <span className="avail__summary-count">
          {value.length > 0 ? (
            <>
              <strong>{value.length}</strong> of {totalSlots} slots selected
            </>
          ) : (
            'No time slots selected yet'
          )}
        </span>
        {value.length > 0 ? (
          <button type="button" className="avail__clear" onClick={() => onChange([])}>
            Clear all
          </button>
        ) : null}
      </div>
    </div>
  )
}

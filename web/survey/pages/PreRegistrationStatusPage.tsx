import { useCallback, useEffect, useMemo, useState } from 'react'
import { listPreRegistrations, updatePreRegistrationSchedule, updatePreRegistrationCompletion } from '../services'
import type { PreRegistrationRecord } from '../services'
import { formatSlotLabel } from '../components'
import './preRegistrationStatus.css'

const ACCESS_CODE = '3854'
const SESSION_KEY = 'preRegStatusUnlocked'

type JsonValue = PreRegistrationRecord['fields'][string]

function asString(value: JsonValue): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value)
}

function asStringArray(value: JsonValue): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

/** Preferred availability labels for a record (fall back to raw slot ids). */
function availabilityLabels(fields: PreRegistrationRecord['fields']): string[] {
  const labels = asStringArray(fields.availabilityLabels)
  if (labels.length > 0) return labels
  return asStringArray(fields.availability).map((slot) => {
    try {
      return formatSlotLabel(slot)
    } catch {
      return slot
    }
  })
}

function availabilitySlots(fields: PreRegistrationRecord['fields']): Array<{ id: string; label: string }> {
  const ids = asStringArray(fields.availability)
  const labels = availabilityLabels(fields)
  return ids.map((id, index) => ({ id, label: labels[index] || id }))
}

/**
 * Three mutually exclusive buckets. `studyCompleted` wins over `scheduled`
 * (a completed session keeps its scheduled flag), so a record is counted once.
 */
function bucketOf(fields: PreRegistrationRecord['fields']): 0 | 1 | 2 {
  if (fields.studyCompleted === true || fields.studyCompleted === 'true') return 2
  if (fields.scheduled === true || fields.scheduled === 'true') return 1
  return 0
}

function formatTimestamp(value: string): string {
  if (!value) return '—'
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return value
  return dt.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
}

interface PendingSchedule {
  scheduled: boolean
  choice: string // slot id, '__manual__', or ''
  manual: string // datetime-local value
  note: string
}

function initialSchedule(fields: PreRegistrationRecord['fields'], slotIds: Set<string>): PendingSchedule {
  const scheduled = fields.scheduled === true || fields.scheduled === 'true'
  const scheduledAt = asString(fields.scheduledAt)
  const isSlot = scheduledAt !== '' && slotIds.has(scheduledAt)
  return {
    scheduled,
    choice: scheduledAt === '' ? '' : isSlot ? scheduledAt : '__manual__',
    manual: isSlot ? '' : scheduledAt,
    note: asString(fields.scheduleNote),
  }
}

function GateForm({ onUnlock }: { onUnlock: () => void }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState(false)

  const submit = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault()
      if (code.trim() === ACCESS_CODE) {
        sessionStorage.setItem(SESSION_KEY, '1')
        onUnlock()
      } else {
        setError(true)
      }
    },
    [code, onUnlock],
  )

  return (
    <div className="prs-gate">
      <form className="prs-gate__card" onSubmit={submit}>
        <h1>Pre-registration status</h1>
        <p className="prs-muted">Enter the access code to view registrations.</p>
        <input
          className="prs-gate__input"
          type="password"
          inputMode="numeric"
          autoFocus
          placeholder="Access code"
          value={code}
          onChange={(event) => {
            setCode(event.target.value)
            setError(false)
          }}
        />
        {error ? <p className="prs-error">Incorrect code.</p> : null}
        <button className="prs-btn prs-btn--primary" type="submit">
          Unlock
        </button>
      </form>
    </div>
  )
}

function RecordCard({
  record,
  onSaved,
}: {
  record: PreRegistrationRecord
  onSaved: (id: string, fields: PreRegistrationRecord['fields']) => void
}) {
  const slots = useMemo(() => availabilitySlots(record.fields), [record.fields])
  const slotIds = useMemo(() => new Set(slots.map((slot) => slot.id)), [slots])
  const [pending, setPending] = useState<PendingSchedule>(() => initialSchedule(record.fields, slotIds))
  const [saving, setSaving] = useState(false)
  const [savedNote, setSavedNote] = useState('')
  const [completing, setCompleting] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const currentlyScheduled = record.fields.scheduled === true || record.fields.scheduled === 'true'
  const currentLabel = asString(record.fields.scheduledLabel)
  const currentlyCompleted = record.fields.studyCompleted === true || record.fields.studyCompleted === 'true'

  const setCompletion = useCallback(
    async (completed: boolean) => {
      setCompleting(true)
      try {
        await updatePreRegistrationCompletion(record.id, completed)
        onSaved(record.id, {
          ...record.fields,
          studyCompleted: completed,
          studyCompletedAt: completed ? new Date().toISOString() : '',
        })
        setExpanded(false)
      } catch (error) {
        setSavedNote(`Failed: ${error instanceof Error ? error.message : String(error)}`)
      } finally {
        setCompleting(false)
      }
    },
    [onSaved, record.fields, record.id],
  )

  const resolvedLabel = useCallback((): string => {
    if (!pending.scheduled) return ''
    if (pending.choice === '__manual__') {
      if (!pending.manual) return ''
      const dt = new Date(pending.manual)
      return Number.isNaN(dt.getTime())
        ? pending.manual
        : dt.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
    }
    const slot = slots.find((item) => item.id === pending.choice)
    return slot ? slot.label : ''
  }, [pending, slots])

  const save = useCallback(async () => {
    const scheduledAt = pending.scheduled
      ? pending.choice === '__manual__'
        ? pending.manual
        : pending.choice
      : ''
    if (pending.scheduled && !scheduledAt) {
      setSavedNote('Pick a time before saving.')
      return
    }
    setSaving(true)
    setSavedNote('')
    try {
      const label = resolvedLabel()
      await updatePreRegistrationSchedule(record.id, {
        scheduled: pending.scheduled,
        scheduledAt,
        scheduledLabel: label,
        scheduleNote: pending.note,
      })
      onSaved(record.id, {
        ...record.fields,
        scheduled: pending.scheduled,
        scheduledAt,
        scheduledLabel: label,
        scheduleNote: pending.note,
        scheduleUpdatedAt: new Date().toISOString(),
      })
      setSavedNote('Saved.')
    } catch (error) {
      setSavedNote(`Failed: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setSaving(false)
    }
  }, [onSaved, pending, record.fields, record.id, resolvedLabel])

  const labels = availabilityLabels(record.fields)

  // Every card starts collapsed to a single clickable summary line (so a long
  // list stays scannable regardless of scheduling state); clicking it expands
  // the full card, revealing the person's availability + the scheduling
  // controls.
  if (!expanded) {
    const statusBadge = currentlyCompleted ? (
      <span className="prs-badge prs-badge--done">✓ Completed</span>
    ) : currentlyScheduled ? (
      <span className="prs-badge prs-badge--yes">Scheduled · {currentLabel || '—'}</span>
    ) : (
      <span className="prs-badge prs-badge--no">Not scheduled</span>
    )
    return (
      <article
        className={`prs-card prs-card--collapsed${
          currentlyCompleted ? ' prs-card--done' : currentlyScheduled ? ' prs-card--scheduled' : ''
        }`}
      >
        <button className="prs-collapsed-row" type="button" onClick={() => setExpanded(true)} aria-expanded="false">
          <span className="prs-collapsed-chevron" aria-hidden="true" />
          <span className="prs-email prs-collapsed-email">{record.email}</span>
          <span className="prs-muted prs-small prs-collapsed-avail">
            {labels.length} time{labels.length === 1 ? '' : 's'}
          </span>
          {statusBadge}
        </button>
      </article>
    )
  }

  return (
    <article
      className={`prs-card${
        currentlyCompleted ? ' prs-card--done' : currentlyScheduled ? ' prs-card--scheduled' : ''
      }`}
    >
      <header className="prs-card__head">
        <div className="prs-head-left">
          <button
            className="prs-chevron-btn"
            type="button"
            onClick={() => setExpanded(false)}
            aria-expanded="true"
            aria-label="Collapse"
          >
            <span className="prs-collapsed-chevron prs-collapsed-chevron--open" aria-hidden="true" />
          </button>
          <div>
            <h3 className="prs-email">{record.email}</h3>
            <p className="prs-muted prs-small">Submitted {formatTimestamp(asString(record.fields.submittedAt))}</p>
          </div>
        </div>
        <span
          className={`prs-badge ${
            currentlyCompleted ? 'prs-badge--done' : currentlyScheduled ? 'prs-badge--yes' : 'prs-badge--no'
          }`}
        >
          {currentlyCompleted
            ? '✓ Completed'
            : currentlyScheduled
              ? `Scheduled · ${currentLabel || '—'}`
              : 'Not scheduled'}
        </span>
      </header>

      <div className="prs-card__body">
        <div className="prs-field">
          <span className="prs-field__label">Availability ({labels.length})</span>
          {labels.length > 0 ? (
            <ul className="prs-avail">
              {labels.map((label, index) => (
                <li key={`${record.id}-avail-${index}`}>{label}</li>
              ))}
            </ul>
          ) : (
            <p className="prs-muted prs-small">No availability recorded.</p>
          )}
        </div>

        <div className="prs-schedule">
          <label className="prs-check">
            <input
              type="checkbox"
              checked={pending.scheduled}
              onChange={(event) => setPending((prev) => ({ ...prev, scheduled: event.target.checked }))}
            />
            <span>Session scheduled</span>
          </label>

          {pending.scheduled ? (
            <>
              <label className="prs-field__label" htmlFor={`slot-${record.id}`}>
                Session time
              </label>
              <select
                id={`slot-${record.id}`}
                className="prs-select"
                value={pending.choice}
                onChange={(event) => setPending((prev) => ({ ...prev, choice: event.target.value }))}
              >
                <option value="">Select a time…</option>
                {slots.map((slot) => (
                  <option key={slot.id} value={slot.id}>
                    {slot.label}
                  </option>
                ))}
                <option value="__manual__">Other time (enter manually)…</option>
              </select>

              {pending.choice === '__manual__' ? (
                <input
                  className="prs-input"
                  type="datetime-local"
                  value={pending.manual}
                  onChange={(event) => setPending((prev) => ({ ...prev, manual: event.target.value }))}
                />
              ) : null}

              <input
                className="prs-input"
                type="text"
                placeholder="Note (optional)"
                value={pending.note}
                onChange={(event) => setPending((prev) => ({ ...prev, note: event.target.value }))}
              />
            </>
          ) : null}

          <div className="prs-actions">
            <button className="prs-btn prs-btn--primary" type="button" onClick={() => void save()} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            {savedNote ? <span className="prs-saved">{savedNote}</span> : null}
          </div>
        </div>

        <div className="prs-complete">
          <button
            className="prs-btn prs-btn--complete"
            type="button"
            onClick={() => void setCompletion(true)}
            disabled={completing}
          >
            {completing ? 'Saving…' : '✓ Mark study completed'}
          </button>
        </div>
      </div>
    </article>
  )
}

export default function PreRegistrationStatusPage() {
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem(SESSION_KEY) === '1')
  const [records, setRecords] = useState<PreRegistrationRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setRecords(await listPreRegistrations())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (unlocked) void load()
  }, [unlocked, load])

  const handleSaved = useCallback((id: string, fields: PreRegistrationRecord['fields']) => {
    setRecords((prev) => prev.map((record) => (record.id === id ? { ...record, fields } : record)))
  }, [])

  // Pending first, then scheduled by session time (soonest first), completed at
  // the bottom. Re-derived from `records` so an inline save re-sorts immediately.
  const sorted = useMemo(() => {
    return [...records].sort((a, b) => {
      const bucketA = bucketOf(a.fields)
      const bucketB = bucketOf(b.fields)
      if (bucketA !== bucketB) return bucketA - bucketB
      if (bucketA === 1) {
        // Slot ids and manual datetime-local values are both ISO-ish → lexicographic == chronological.
        return asString(a.fields.scheduledAt).localeCompare(asString(b.fields.scheduledAt))
      }
      return asString(b.fields.submittedAt).localeCompare(asString(a.fields.submittedAt))
    })
  }, [records])

  const counts = useMemo(() => {
    const tally = { pending: 0, scheduled: 0, completed: 0 }
    for (const record of records) {
      const bucket = bucketOf(record.fields)
      if (bucket === 2) tally.completed += 1
      else if (bucket === 1) tally.scheduled += 1
      else tally.pending += 1
    }
    return tally
  }, [records])

  if (!unlocked) {
    return <GateForm onUnlock={() => setUnlocked(true)} />
  }

  return (
    <div className="prs-page">
      <div className="prs-shell">
        <header className="prs-header">
          <div>
            <h1>Pre-registration status</h1>
            <p className="prs-muted">
              {records.length} registered · {counts.completed} completed · {counts.scheduled} scheduled ·{' '}
              {counts.pending} pending
            </p>
          </div>
          <button className="prs-btn" type="button" onClick={() => void load()} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </header>

        {error ? <p className="prs-error">Failed to load: {error}</p> : null}
        {loading && records.length === 0 ? <p className="prs-muted">Loading…</p> : null}
        {!loading && records.length === 0 && !error ? (
          <p className="prs-muted">No pre-registrations yet.</p>
        ) : null}

        <div className="prs-list">
          {sorted.map((record) => (
            <RecordCard key={record.id} record={record} onSaved={handleSaved} />
          ))}
        </div>
      </div>
    </div>
  )
}

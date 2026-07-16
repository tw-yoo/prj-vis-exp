import { useCallback, useEffect, useMemo, useState } from 'react'
import { listPreRegistrations, updatePreRegistrationSchedule } from '../services'
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

  const currentlyScheduled = record.fields.scheduled === true || record.fields.scheduled === 'true'
  const currentLabel = asString(record.fields.scheduledLabel)

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

  return (
    <article className={`prs-card${currentlyScheduled ? ' prs-card--scheduled' : ''}`}>
      <header className="prs-card__head">
        <div>
          <h3 className="prs-email">{record.email}</h3>
          <p className="prs-muted prs-small">Submitted {formatTimestamp(asString(record.fields.submittedAt))}</p>
        </div>
        <span className={`prs-badge ${currentlyScheduled ? 'prs-badge--yes' : 'prs-badge--no'}`}>
          {currentlyScheduled ? `Scheduled · ${currentLabel || '—'}` : 'Not scheduled'}
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
      const list = await listPreRegistrations()
      list.sort((a, b) => asString(b.fields.submittedAt).localeCompare(asString(a.fields.submittedAt)))
      setRecords(list)
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

  const scheduledCount = useMemo(
    () => records.filter((record) => record.fields.scheduled === true || record.fields.scheduled === 'true').length,
    [records],
  )

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
              {records.length} registered · {scheduledCount} scheduled · {records.length - scheduledCount} pending
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
          {records.map((record) => (
            <RecordCard key={record.id} record={record} onSaved={handleSaved} />
          ))}
        </div>
      </div>
    </div>
  )
}

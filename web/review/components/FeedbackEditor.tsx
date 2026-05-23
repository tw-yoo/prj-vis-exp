import { useEffect, useMemo, useRef, useState } from 'react'
import {
  FEEDBACK_COMMANDS,
  getCommand,
  getRowAutocompleteOptions,
  parseFeedback,
  type SlashCommand,
  type SlashCommandKey,
} from '../services/feedbackTags'
import type { ReviewRow } from '../services/reviewCasesService'

type Props = {
  row: ReviewRow
  value: string
  editing: boolean
  onStartEdit: () => void
  onCommit: (next: string) => void
  onCancel: () => void
}

type DropdownState =
  | { mode: 'closed' }
  | { mode: 'commands'; from: number; query: string }
  | { mode: 'values'; from: number; query: string; command: SlashCommand }

export default function FeedbackEditor(props: Props) {
  if (!props.editing) {
    return (
      <FeedbackChipsPreview
        value={props.value}
        onStartEdit={props.onStartEdit}
      />
    )
  }
  return <FeedbackEditMode {...props} />
}

function FeedbackChipsPreview({ value, onStartEdit }: { value: string; onStartEdit: () => void }) {
  const segments = useMemo(() => parseFeedback(value), [value])
  if (!value.trim()) {
    return (
      <button type="button" className="review-cell-preview is-empty review-feedback-trigger" onClick={onStartEdit}>
        (click to add feedback)
      </button>
    )
  }
  return (
    <div className="review-feedback-preview" onClick={onStartEdit} role="button" tabIndex={0}>
      {segments.map((seg, i) => {
        if (seg.kind === 'text') {
          return (
            <span key={i} className="review-feedback-text">
              {seg.text}
            </span>
          )
        }
        const tone = getCommand(seg.command)?.chipTone ?? 'slate'
        return (
          <span key={i} className={`review-chip review-chip--${tone}`}>
            <span className="review-chip-key">{seg.command}</span>
            <span className="review-chip-sep">:</span>
            <span className="review-chip-value">{seg.value}</span>
          </span>
        )
      })}
    </div>
  )
}

function FeedbackEditMode({ row, value, onCommit, onCancel }: Props) {
  const [draft, setDraft] = useState(value)
  const [dropdown, setDropdown] = useState<DropdownState>({ mode: 'closed' })
  const [highlightIdx, setHighlightIdx] = useState(0)
  const taRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    taRef.current?.focus()
    const el = taRef.current
    if (el) el.setSelectionRange(el.value.length, el.value.length)
  }, [])

  const recomputeDropdown = (text: string, caret: number) => {
    const head = text.slice(0, caret)
    // commands mode: most recent `/` not yet followed by `:` and not in middle of word
    const cmdMatch = head.match(/(^|\s)(\/([A-Za-z]*))$/)
    if (cmdMatch) {
      const slashStart = caret - cmdMatch[2].length
      const query = cmdMatch[3]
      setDropdown({ mode: 'commands', from: slashStart, query })
      setHighlightIdx(0)
      return
    }
    // values mode: `/<cmd>:<partial>` token currently being typed
    const valMatch = head.match(/(^|\s)(\/([A-Za-z]+):([^\s]*))$/)
    if (valMatch) {
      const cmdKey = valMatch[3]
      const partial = valMatch[4]
      const cmd = getCommand(cmdKey)
      if (cmd) {
        const tokenStart = caret - valMatch[2].length
        setDropdown({ mode: 'values', from: tokenStart, query: partial, command: cmd })
        setHighlightIdx(0)
        return
      }
    }
    setDropdown({ mode: 'closed' })
  }

  const commit = (text: string) => {
    onCommit(text)
  }

  const applyDropdownOption = (selectedLabel: string) => {
    if (dropdown.mode === 'closed') return
    const el = taRef.current
    if (!el) return
    const caret = el.selectionStart ?? draft.length
    if (dropdown.mode === 'commands') {
      const next = draft.slice(0, dropdown.from) + `/${selectedLabel}:` + draft.slice(caret)
      const newCaret = dropdown.from + selectedLabel.length + 2
      setDraft(next)
      setDropdown({ mode: 'closed' })
      requestAnimationFrame(() => {
        if (taRef.current) {
          taRef.current.value = next
          taRef.current.setSelectionRange(newCaret, newCaret)
          taRef.current.focus()
          recomputeDropdown(next, newCaret)
        }
      })
    } else {
      const next = draft.slice(0, dropdown.from) + `/${dropdown.command.key}:${selectedLabel}` + draft.slice(caret)
      const newCaret = dropdown.from + selectedLabel.length + dropdown.command.key.length + 2
      setDraft(next)
      setDropdown({ mode: 'closed' })
      requestAnimationFrame(() => {
        if (taRef.current) {
          taRef.current.value = next
          taRef.current.setSelectionRange(newCaret, newCaret)
          taRef.current.focus()
        }
      })
    }
  }

  const dropdownOptions: string[] = useMemo(() => {
    if (dropdown.mode === 'commands') {
      const q = dropdown.query.toLowerCase()
      return FEEDBACK_COMMANDS.filter((c) => c.key.toLowerCase().startsWith(q)).map((c) => c.key)
    }
    if (dropdown.mode === 'values') {
      const all = getRowAutocompleteOptions(row, dropdown.command.key as SlashCommandKey)
      const q = dropdown.query.toLowerCase()
      const filtered = q ? all.filter((v) => v.toLowerCase().includes(q)) : all
      return filtered
    }
    return []
  }, [dropdown, row])

  const onKey = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      if (dropdown.mode !== 'closed') {
        setDropdown({ mode: 'closed' })
        return
      }
      onCancel()
      return
    }
    if (dropdown.mode !== 'closed' && dropdownOptions.length) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setHighlightIdx((i) => (i + 1) % dropdownOptions.length)
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setHighlightIdx((i) => (i - 1 + dropdownOptions.length) % dropdownOptions.length)
        return
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault()
        applyDropdownOption(dropdownOptions[highlightIdx])
        return
      }
    }
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault()
      commit(draft)
    }
  }

  return (
    <div className="review-feedback-edit">
      <textarea
        ref={taRef}
        className="review-editor-textarea review-feedback-textarea"
        value={draft}
        onChange={(e) => {
          const v = e.target.value
          setDraft(v)
          recomputeDropdown(v, e.target.selectionStart ?? v.length)
        }}
        onClick={(e) => {
          const t = e.target as HTMLTextAreaElement
          recomputeDropdown(t.value, t.selectionStart ?? t.value.length)
        }}
        onKeyUp={(e) => {
          if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
            const t = e.target as HTMLTextAreaElement
            recomputeDropdown(t.value, t.selectionStart ?? t.value.length)
          }
        }}
        onBlur={() => {
          // small delay so a dropdown click can fire first
          setTimeout(() => {
            if (dropdown.mode === 'closed') commit(draft)
          }, 150)
        }}
        onKeyDown={onKey}
        rows={4}
        spellCheck={false}
        placeholder="Bug notes. Type `/` for tags (e.g. /op:avg1 /severity:high)."
      />
      {dropdown.mode !== 'closed' && dropdownOptions.length > 0 ? (
        <div className="review-slash-dropdown">
          <div className="review-slash-dropdown-header">
            {dropdown.mode === 'commands' ? 'Slash command' : `/${dropdown.command.key}: …`}
          </div>
          {dropdownOptions.map((opt, i) => {
            const def = dropdown.mode === 'commands' ? getCommand(opt) : null
            return (
              <button
                key={opt}
                type="button"
                className={`review-slash-option ${i === highlightIdx ? 'is-active' : ''}`}
                onMouseDown={(ev) => {
                  ev.preventDefault()
                  applyDropdownOption(opt)
                }}
                onMouseEnter={() => setHighlightIdx(i)}
              >
                <span className="review-slash-option-label">{opt}</span>
                {def?.hint ? <span className="review-slash-option-hint">{def.hint}</span> : null}
              </button>
            )
          })}
        </div>
      ) : null}
      <div className="review-editor-hint">
        Cmd/Ctrl+Enter to save · Esc to cancel · type `/` for tags
      </div>
    </div>
  )
}

import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import {
  FEEDBACK_COMMANDS,
  getCommand,
  getRowAutocompleteOptions,
  type SlashCommand,
  type SlashCommandKey,
} from '../services/feedbackTags'
import type { ReviewRow } from '../services/reviewCasesService'

type DropdownState =
  | { mode: 'closed' }
  | { mode: 'commands'; from: number; query: string }
  | { mode: 'values'; from: number; query: string; command: SlashCommand }

type Props = {
  /** Controlled feedback text. */
  value: string
  /** Live updates while typing — wire straight to row state; autosave handles persistence. */
  onChange: (next: string) => void
  /** The row used to resolve autocomplete options (e.g. /op:<nodeId> from operation_spec). */
  row: ReviewRow
  placeholder?: string
  rows?: number
  /** Focus the textarea on mount. */
  autoFocus?: boolean
  /** Extra className appended to the textarea (e.g. for chart-card-specific tweaks). */
  className?: string
}

/**
 * Textarea with a `/`-triggered command palette. Mirrors the original
 * FeedbackEditor's slash UX:
 *
 *   • Typing `/` (after a space or at line start) opens a command list filtered
 *     by what follows. Pressing Enter/Tab inserts `/<command>:` and the
 *     palette switches to value mode.
 *   • Value mode shows row-aware autocomplete (e.g. nodeIds parsed from
 *     operation_spec for `/op:`). Enter/Tab inserts the value.
 *   • Esc closes the palette. ArrowUp/Down navigates options.
 *   • Click anywhere else: palette closes; the parent autosave eventually flushes.
 *
 * The component is fully controlled — `value` lives in the row, `onChange`
 * routes back to ReviewPage's handleOpFeedbackChange / handleVizFeedbackChange.
 */
export default function SlashTextarea({
  value,
  onChange,
  row,
  placeholder,
  rows = 4,
  autoFocus,
  className,
}: Props) {
  const [dropdown, setDropdown] = useState<DropdownState>({ mode: 'closed' })
  const [highlightIdx, setHighlightIdx] = useState(0)
  const taRef = useRef<HTMLTextAreaElement | null>(null)
  const autoFocusedRef = useRef(false)

  // Autofocus on mount (and place caret at end), once per component instance.
  if (autoFocus && !autoFocusedRef.current && taRef.current) {
    autoFocusedRef.current = true
    const el = taRef.current
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }

  const recomputeDropdown = (text: string, caret: number) => {
    const head = text.slice(0, caret)
    // Commands palette: most recent `/` at line/whitespace start, no `:` yet.
    const cmdMatch = head.match(/(^|\s)(\/([A-Za-z]*))$/)
    if (cmdMatch) {
      const slashStart = caret - cmdMatch[2].length
      const query = cmdMatch[3]
      setDropdown({ mode: 'commands', from: slashStart, query })
      setHighlightIdx(0)
      return
    }
    // Values palette: a `/<cmd>:<partial>` token currently being typed.
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

  const applyDropdownOption = (selectedLabel: string) => {
    if (dropdown.mode === 'closed') return
    const el = taRef.current
    if (!el) return
    const caret = el.selectionStart ?? value.length
    if (dropdown.mode === 'commands') {
      const next = value.slice(0, dropdown.from) + `/${selectedLabel}:` + value.slice(caret)
      const newCaret = dropdown.from + selectedLabel.length + 2
      onChange(next)
      setDropdown({ mode: 'closed' })
      requestAnimationFrame(() => {
        if (taRef.current) {
          taRef.current.setSelectionRange(newCaret, newCaret)
          taRef.current.focus()
          recomputeDropdown(next, newCaret)
        }
      })
    } else {
      const next =
        value.slice(0, dropdown.from) +
        `/${dropdown.command.key}:${selectedLabel}` +
        value.slice(caret)
      const newCaret = dropdown.from + selectedLabel.length + dropdown.command.key.length + 2
      onChange(next)
      setDropdown({ mode: 'closed' })
      requestAnimationFrame(() => {
        if (taRef.current) {
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
      return q ? all.filter((v) => v.toLowerCase().includes(q)) : all
    }
    return []
  }, [dropdown, row])

  const onKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape' && dropdown.mode !== 'closed') {
      event.preventDefault()
      setDropdown({ mode: 'closed' })
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
  }

  return (
    <div className="review-feedback-slash-wrapper">
      <textarea
        ref={taRef}
        className={`review-feedback-textarea ${className ?? ''}`}
        value={value}
        rows={rows}
        spellCheck={false}
        placeholder={placeholder}
        onChange={(e) => {
          const v = e.target.value
          onChange(v)
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
          // Slight delay so a dropdown click can fire before we hide it.
          setTimeout(() => setDropdown({ mode: 'closed' }), 150)
        }}
        onKeyDown={onKey}
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
    </div>
  )
}

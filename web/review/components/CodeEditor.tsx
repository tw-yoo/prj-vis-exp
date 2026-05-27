import { useEffect, useRef, useState } from 'react'
import { EditorState, type Extension } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { bracketMatching, indentOnInput } from '@codemirror/language'
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete'
import { linter, lintGutter, lintKeymap } from '@codemirror/lint'
import { searchKeymap } from '@codemirror/search'
import { json, jsonParseLinter } from '@codemirror/lang-json'
import { opsSpecCompletionSource } from '../services/opsSpecCompletion'

export type CodeEditorLanguage = 'json' | 'json-ops' | 'plaintext'

type Props = {
  value: string
  language: CodeEditorLanguage
  onCommit: (value: string) => void
  onCancel: () => void
  minHeight?: number
  autoFocus?: boolean
}

function prettify(raw: string, language: CodeEditorLanguage): string {
  if (language === 'plaintext') return raw
  const trimmed = raw.trim()
  if (!trimmed) return ''
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2)
  } catch {
    return raw
  }
}

export default function CodeEditor({
  value,
  language,
  onCommit,
  onCancel,
  minHeight = 180,
  autoFocus = true,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onCommitRef = useRef(onCommit)
  const onCancelRef = useRef(onCancel)
  const [validationError, setValidationError] = useState<string | null>(null)

  useEffect(() => {
    onCommitRef.current = onCommit
    onCancelRef.current = onCancel
  }, [onCommit, onCancel])

  useEffect(() => {
    if (!hostRef.current) return

    const isPlaintext = language === 'plaintext'

    const tryCommit = () => {
      const text = viewRef.current?.state.doc.toString() ?? ''
      if (!isPlaintext && text.trim()) {
        try {
          JSON.parse(text)
        } catch (err) {
          setValidationError(err instanceof Error ? err.message : String(err))
          return
        }
      }
      setValidationError(null)
      onCommitRef.current(text)
    }

    // Line numbers / history / active-line are shared across all languages.
    // JSON-only goodies (bracket matching, auto-close, linter, autocompletion)
    // are skipped for plaintext to keep the editor light and free of red
    // squigglies on free-form text like the question field.
    const extensions: Extension[] = [
      lineNumbers(),
      highlightActiveLine(),
      history(),
      ...(isPlaintext
        ? []
        : [
            bracketMatching(),
            closeBrackets(),
            indentOnInput(),
            json(),
            linter(jsonParseLinter()),
            lintGutter(),
            autocompletion(
              language === 'json-ops'
                ? { override: [opsSpecCompletionSource] }
                : undefined,
            ),
          ]),
      keymap.of([
        {
          key: 'Mod-Enter',
          run: () => {
            tryCommit()
            return true
          },
        },
        {
          key: 'Escape',
          run: () => {
            onCancelRef.current()
            return true
          },
        },
        ...(isPlaintext ? [] : closeBracketsKeymap),
        ...defaultKeymap,
        ...historyKeymap,
        ...searchKeymap,
        ...(isPlaintext ? [] : completionKeymap),
        ...(isPlaintext ? [] : lintKeymap),
        indentWithTab,
      ]),
      EditorView.theme(
        {
          '&': { fontSize: '12px', color: '#e2e8f0' },
          '.cm-content': {
            fontFamily: '"SFMono-Regular", Menlo, Consolas, monospace',
            caretColor: '#ffffff',
          },
          '.cm-scroller': { minHeight: `${minHeight}px` },
          '.cm-cursor, .cm-dropCursor': {
            borderLeftColor: '#ffffff',
            borderLeftWidth: '2px',
          },
          '&.cm-focused .cm-cursor': {
            borderLeftColor: '#ffffff',
          },
          '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
            background: 'rgba(37, 99, 235, 0.4)',
          },
        },
        { dark: true },
      ),
      EditorView.lineWrapping,
    ]

    const view = new EditorView({
      state: EditorState.create({
        doc: prettify(value, language),
        extensions,
      }),
      parent: hostRef.current,
    })
    viewRef.current = view
    if (autoFocus) {
      requestAnimationFrame(() => view.focus())
    }
    return () => {
      view.destroy()
      viewRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, minHeight])

  return (
    <div className="review-code-editor">
      <div ref={hostRef} className="review-code-editor-host" />
      {validationError ? (
        <div className="review-editor-error">JSON error: {validationError}</div>
      ) : null}
      <div className="review-editor-hint">
        Cmd/Ctrl+Enter to save · Esc to cancel
        {language === 'json-ops' ? ' · type a quote to get ops autocomplete' : ''}
      </div>
    </div>
  )
}

import { useMemo } from 'react'

type Props = {
  text: string
  /** Optional placeholder rendered when `text` is empty/whitespace only. */
  placeholder?: string
}

/**
 * Read-only renderer that lays out text with a CodeMirror-style line-number
 * gutter. Lightweight (no CodeMirror) so it can be used on every visible row
 * without slowing the page down. The gutter / content split is a CSS grid
 * (`.review-line-numbered` → 2 cols). A long wrapped line keeps its single
 * gutter number aligned to the top.
 */
export default function LineNumberedText({ text, placeholder = '(empty — click to edit)' }: Props) {
  const lines = useMemo(() => {
    if (!text || !text.trim()) return null
    // Preserve the exact line break structure — don't trim individual lines,
    // and don't collapse blank lines (they're meaningful in explanations).
    return text.split('\n')
  }, [text])

  if (!lines) {
    return <em className="cell-empty">{placeholder}</em>
  }

  return (
    <div className="review-line-numbered" role="presentation">
      {lines.map((line, i) => (
        <div key={i} className="review-line-numbered-row">
          <span className="review-line-numbered-num" aria-hidden="true">{i + 1}</span>
          <span className="review-line-numbered-content">{line || ' '}</span>
        </div>
      ))}
    </div>
  )
}

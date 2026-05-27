import { Suspense, lazy, useEffect, useMemo, useRef } from 'react'
import {
  rowDerivedStatus,
  rowHasFeedback,
  type ReviewRow,
  type ReviewStatus,
  type ReviewStatusKind,
} from '../services/reviewCasesService'
import LineNumberedText from './LineNumberedText'
import OperationSpecView from './OperationSpecView'

const CodeEditor = lazy(() => import('./CodeEditor'))

export type EditingCell =
  | null
  | {
      rowIndex: number
      field: 'question' | 'explanation' | 'operation_spec'
    }

type Props = {
  rows: ReviewRow[]
  visibleIndexes: number[]
  dirtyIndexes: Set<number>
  selectedRowIndex: number | null
  editingCell: EditingCell
  onSelectRow: (rowIndex: number) => void
  onStartEdit: (cell: NonNullable<EditingCell>) => void
  onCancelEdit: () => void
  onCommitEdit: (
    rowIndex: number,
    field: 'question' | 'explanation' | 'operation_spec',
    value: string,
  ) => void
  /**
   * Called when the user changes either status axis (`op` or `viz`) on a row.
   */
  onStatusChange: (rowIndex: number, kind: ReviewStatusKind, status: ReviewStatus) => void
  /**
   * Starts the per-row sentence-summary ops walkthrough (rendered as the
   * "Run ops" button in OperationSpecView's header, beside the JSON tab).
   */
  onRunOps: (rowIndex: number) => void
  /** True while an ops session is mid-flight; disables the Run button. */
  opsRunning: boolean
  /**
   * Toggles the detached feedback panel for the given row. The panel itself
   * lives next to the chart pane and is rendered by ReviewPage — this row
   * only owns the open/close trigger button.
   */
  onToggleFeedbackPanel: (rowIndex: number) => void
  /** Index of the row whose feedback panel is currently open (or null). */
  feedbackPanelRowIndex: number | null
}

const STATUS_OPTIONS: ReviewStatus[] = ['pending', 'verified', 'bug', 'wontfix']

function previewJson(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return '(empty — click to edit)'
  try {
    const parsed = JSON.parse(trimmed) as unknown
    const compact = JSON.stringify(parsed)
    return compact.length > 140 ? `${compact.slice(0, 137)}…` : compact
  } catch {
    return `${trimmed.slice(0, 137)}${trimmed.length > 137 ? '…' : ''} (invalid JSON)`
  }
}

export default function ReviewTable(props: Props) {
  const {
    rows,
    visibleIndexes,
    dirtyIndexes,
    selectedRowIndex,
    editingCell,
    onSelectRow,
    onStartEdit,
    onCancelEdit,
    onCommitEdit,
    onStatusChange,
    onRunOps,
    opsRunning,
    onToggleFeedbackPanel,
    feedbackPanelRowIndex,
  } = props

  const visibleRows = useMemo(
    () => visibleIndexes.map((index) => ({ index, row: rows[index] })),
    [visibleIndexes, rows],
  )

  if (!visibleRows.length) {
    return (
      <div className="review-table-empty">
        No rows match your filter. {rows.length === 0 ? (
          <>Click <strong>+ Add row</strong> in the toolbar to create one.</>
        ) : (
          <>Try clearing the search or status chips.</>
        )}
      </div>
    )
  }

  return (
    <div className="review-grid">
      <div className="review-grid-header">
        <div className="review-grid-header-row">
          <div className="cell-num">#</div>
          <div>chart_id</div>
          <div>status</div>
          <div>question</div>
        </div>
        <div className="review-grid-header-row review-grid-header-row--secondary">
          <div>explanation</div>
          <div>operation_spec</div>
        </div>
      </div>
      <div className="review-grid-body">
        {visibleRows.map(({ index, row }) => {
          const isSelected = selectedRowIndex === index
          const isDirty = dirtyIndexes.has(index)
          const derivedStatus = rowDerivedStatus(row)
          const isEditing = (field: string) =>
            editingCell?.rowIndex === index && editingCell.field === field
          return (
            <div
              key={index}
              className={`review-row status-${derivedStatus} ${isSelected ? 'is-selected' : ''} ${
                isDirty ? 'is-dirty' : ''
              }`}
            >
              <div className="review-row__line1">
                <div className="cell-num">
                  <span className="row-number">{index + 1}</span>
                  {isDirty ? <span className="row-dirty-dot" title="Unsaved changes">●</span> : null}
                </div>
                <div className="cell-chart-id">
                  <button
                    type="button"
                    className={`chart-id-link ${row.chart_id ? '' : 'is-empty'}`}
                    onClick={() => row.chart_id && onSelectRow(index)}
                    disabled={!row.chart_id}
                    title={row.chart_id ? 'Click to render this chart' : 'No chart_id set'}
                  >
                    {row.chart_id || '(no chart_id)'}
                  </button>
                  {row.chart_type ? (
                    <span className="chart-type-badge" title={`chart_type: ${row.chart_type}`}>
                      {row.chart_type}
                    </span>
                  ) : null}
                  {(() => {
                    const isOpen = feedbackPanelRowIndex === index
                    const hasContent = rowHasFeedback(row)
                    return (
                      <button
                        type="button"
                        className={`row-feedback-toggle ${hasContent ? 'has-content' : ''} ${
                          isOpen ? 'is-active' : ''
                        }`}
                        onClick={() => onToggleFeedbackPanel(index)}
                        title={
                          isOpen
                            ? 'Close feedback panel'
                            : hasContent
                            ? 'Edit feedback (has content)'
                            : 'Open feedback panel'
                        }
                      >
                        <span className="row-feedback-toggle-label">
                          {isOpen ? 'Close' : 'Feedback'}
                        </span>
                        {hasContent && !isOpen ? (
                          <span className="row-feedback-toggle-dot" aria-hidden="true">●</span>
                        ) : null}
                      </button>
                    )
                  })()}
                </div>
                <div className="cell-status">
                  <label className="status-axis-row">
                    <span className="status-axis-label" title="Operation_spec correctness">Op</span>
                    <select
                      className={`review-status-select status-${row.op_status}`}
                      value={row.op_status}
                      onChange={(event) =>
                        onStatusChange(index, 'op', event.target.value as ReviewStatus)
                      }
                    >
                      {STATUS_OPTIONS.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="status-axis-row">
                    <span className="status-axis-label" title="Visualization output correctness">Viz</span>
                    <select
                      className={`review-status-select status-${row.viz_status}`}
                      value={row.viz_status}
                      onChange={(event) =>
                        onStatusChange(index, 'viz', event.target.value as ReviewStatus)
                      }
                    >
                      {STATUS_OPTIONS.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div
                  className="cell-question review-cell-editable"
                  onClick={() => {
                    if (!isEditing('question')) {
                      onStartEdit({ rowIndex: index, field: 'question' })
                    }
                  }}
                >
                  {isEditing('question') ? (
                    <AutoGrowEditor
                      initial={row.question}
                      multiline={false}
                      onCommit={(v) => onCommitEdit(index, 'question', v)}
                      onCancel={onCancelEdit}
                    />
                  ) : (
                    <span className="review-cell-preview">
                      {row.question.trim() || <em className="cell-empty">(empty — click to edit)</em>}
                    </span>
                  )}
                </div>
              </div>
              <div className="review-row__line2">
                <div
                  className="cell-explanation review-cell-editable"
                  onClick={() => {
                    if (!isEditing('explanation')) {
                      onStartEdit({ rowIndex: index, field: 'explanation' })
                    }
                  }}
                >
                  {isEditing('explanation') ? (
                    <div onClick={(e) => e.stopPropagation()}>
                      <Suspense fallback={<EditorLoading />}>
                        <CodeEditor
                          value={row.explanation}
                          language="plaintext"
                          onCommit={(v) => onCommitEdit(index, 'explanation', v)}
                          onCancel={onCancelEdit}
                          minHeight={140}
                        />
                      </Suspense>
                    </div>
                  ) : (
                    <LineNumberedText text={row.explanation} />
                  )}
                </div>
                <div
                  className="cell-ops review-cell-editable"
                  onClick={() => {
                    if (!isEditing('operation_spec')) {
                      onStartEdit({ rowIndex: index, field: 'operation_spec' })
                    }
                  }}
                >
                  <OperationSpecView
                    spec={row.operation_spec}
                    row={row}
                    editing={isEditing('operation_spec')}
                    onExitEdit={onCancelEdit}
                    onRunOps={() => onRunOps(index)}
                    runDisabled={opsRunning || isEditing('operation_spec')}
                    editorSlot={
                      isEditing('operation_spec') ? (
                        <Suspense fallback={<EditorLoading />}>
                          <CodeEditor
                            value={row.operation_spec}
                            language="json-ops"
                            onCommit={(v) => onCommitEdit(index, 'operation_spec', v)}
                            onCancel={onCancelEdit}
                          />
                        </Suspense>
                      ) : null
                    }
                  />
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function EditorLoading() {
  return <div className="review-editor-loading">Loading editor…</div>
}

type AutoGrowProps = {
  initial: string
  multiline: boolean
  onCommit: (value: string) => void
  onCancel: () => void
}

function AutoGrowEditor({ initial, multiline, onCommit, onCancel }: AutoGrowProps) {
  const taRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    const el = taRef.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
    autoSize(el)
  }, [])

  if (!multiline) {
    return (
      <input
        autoFocus
        className="review-editor-input"
        defaultValue={initial}
        onBlur={(e) => onCommit(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            onCancel()
          } else if (e.key === 'Enter') {
            e.preventDefault()
            onCommit((e.target as HTMLInputElement).value)
          }
        }}
      />
    )
  }
  return (
    <textarea
      ref={taRef}
      className="review-editor-textarea"
      defaultValue={initial}
      onBlur={(e) => onCommit(e.currentTarget.value)}
      onChange={(e) => autoSize(e.currentTarget)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          onCancel()
        } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
          e.preventDefault()
          onCommit((e.target as HTMLTextAreaElement).value)
        }
      }}
    />
  )
}

function autoSize(el: HTMLTextAreaElement) {
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight + 2}px`
}

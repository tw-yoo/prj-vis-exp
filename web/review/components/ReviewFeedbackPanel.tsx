import type { ReviewRow } from '../services/reviewCasesService'
import SlashTextarea from './SlashTextarea'

type Props = {
  row: ReviewRow
  rowIndex: number
  /** Closes the panel (the trigger button in the row will also close it). */
  onClose: () => void
  /** Called when the user edits either feedback textarea. Updates flow through
   * ReviewPage → debounced autosave just like every other field edit. */
  onOpFeedbackChange: (rowIndex: number, value: string) => void
  onVizFeedbackChange: (rowIndex: number, value: string) => void
}

/**
 * Detached feedback editor that mounts above the chart pane. The row table
 * itself only carries a small trigger button — opening this panel surfaces
 * both feedback axes (operation_spec correctness vs visualization output)
 * as separate slash-enabled textareas, so reviewers can leave targeted notes
 * that downstream triage / labeling can route by axis.
 *
 * Each textarea supports the `/`-trigger command palette (e.g.
 * `/op:n1 wrong field` or `/severity:high`). Edits write straight to the row;
 * autosave (1.5 s idle debounce) takes care of persistence.
 */
export default function ReviewFeedbackPanel({
  row,
  rowIndex,
  onClose,
  onOpFeedbackChange,
  onVizFeedbackChange,
}: Props) {
  return (
    <div className="card review-feedback-card" role="region" aria-label="Row feedback">
      <div className="card-header">
        <div className="card-title">
          Feedback
          {row.chart_id ? (
            <span className="review-chart-id"> · {row.chart_id}</span>
          ) : null}
        </div>
        <div className="card-actions">
          <button
            type="button"
            className="pill-btn section-toggle-btn"
            onClick={onClose}
            title="Close the feedback panel"
          >
            Close
          </button>
        </div>
      </div>

      <div className="review-feedback-grid">
        <label className="review-feedback-field">
          <span className="review-feedback-axis-label">
            <span className="review-feedback-axis-tag">Op</span>
            Operation_spec feedback
          </span>
          <SlashTextarea
            value={row.op_feedback}
            onChange={(v) => onOpFeedbackChange(rowIndex, v)}
            row={row}
            rows={4}
            autoFocus
            placeholder="Operation_spec feedback. Type `/` for tags (e.g. /op:n1 wrong field, /severity:high)."
          />
        </label>

        <label className="review-feedback-field">
          <span className="review-feedback-axis-label">
            <span className="review-feedback-axis-tag">Viz</span>
            Visualization feedback
          </span>
          <SlashTextarea
            value={row.viz_feedback}
            onChange={(v) => onVizFeedbackChange(rowIndex, v)}
            row={row}
            rows={4}
            placeholder="Visualization feedback. Type `/` for tags (e.g. /chart:simpleBar annotation misplaced, /severity:medium)."
          />
        </label>
      </div>

      <div className="review-feedback-hint">
        Type `/` to pick a tag (op / group / chart / severity / tag).
      </div>
    </div>
  )
}

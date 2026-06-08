import type { ReviewChartType, ReviewStatus } from '../services/reviewCasesService'

type Props = {
  totalRows: number
  visibleRows: number
  feedbackRows: number
  unsavedRows: number
  /** Filter on the operation_spec correctness axis. */
  opStatusFilter: ReviewStatus | 'all'
  onOpStatusFilterChange: (next: ReviewStatus | 'all') => void
  /** Filter on the visualization correctness axis. */
  vizStatusFilter: ReviewStatus | 'all'
  onVizStatusFilterChange: (next: ReviewStatus | 'all') => void
  chartTypeFilter: ReviewChartType | 'all'
  onChartTypeFilterChange: (next: ReviewChartType | 'all') => void
  feedbackOnly: boolean
  onFeedbackOnlyChange: (next: boolean) => void
  /** Live chart_id search text (controlled input value; does NOT filter yet). */
  chartIdSearchInput: string
  onChartIdSearchInputChange: (next: string) => void
  /** Commit the pending text as the active chart_id filter (Search button / Enter). */
  onChartIdSearchSubmit: () => void
  /** Clear both the input and the active chart_id filter. */
  onChartIdSearchClear: () => void
  /** Whether a chart_id search is currently applied (toggles the Clear button). */
  chartIdSearchActive: boolean
  saving: boolean
  saveError: string | null
  onAddRow: () => void
  onSaveAll: () => void
  availableFiles: string[]
  currentFile: string
  onFileChange: (next: string) => void
}

const STATUS_FILTER_OPTIONS: Array<{ value: ReviewStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'bug', label: 'Bug' },
  { value: 'verified', label: 'Verified' },
  { value: 'wontfix', label: "Won't fix" },
]

const CHART_TYPE_FILTER_OPTIONS: Array<{ value: ReviewChartType | 'all'; label: string }> = [
  { value: 'all', label: 'All charts' },
  { value: 'simpleBar', label: 'Simple bar' },
  { value: 'stackedBar', label: 'Stacked bar' },
  { value: 'groupedBar', label: 'Grouped bar' },
  { value: 'simpleLine', label: 'Simple line' },
  { value: 'multipleLine', label: 'Multi line' },
]

export default function ReviewToolbar(props: Props) {
  const saveDisabled = props.unsavedRows === 0 || props.saving
  return (
    <div className="review-toolbar">
      <div className="review-toolbar-row">
        <label className="review-file-picker">
          <span className="review-file-picker-label">CSV</span>
          <select
            className="review-file-picker-select"
            value={props.currentFile}
            onChange={(event) => props.onFileChange(event.target.value)}
            disabled={props.availableFiles.length === 0}
            title={
              props.availableFiles.length === 0
                ? 'No CSV files found in data/review'
                : 'Switch which CSV the review page reads/writes'
            }
          >
            {props.availableFiles.length === 0 ? (
              <option value="">(no files)</option>
            ) : (
              props.availableFiles.map((file) => (
                <option key={file} value={file}>
                  {file}
                </option>
              ))
            )}
          </select>
        </label>
        <span className="review-counts">
          {props.visibleRows} / {props.totalRows} rows
          {props.feedbackRows > 0 ? ` · ${props.feedbackRows} with feedback` : ''}
        </span>
        <span className="review-toolbar-spacer" />
        <button
          type="button"
          className={`review-save-btn ${props.unsavedRows > 0 ? 'is-dirty' : ''}`}
          onClick={props.onSaveAll}
          disabled={saveDisabled}
          title={
            props.unsavedRows === 0
              ? 'No unsaved changes'
              : `Save ${props.unsavedRows} row${props.unsavedRows === 1 ? '' : 's'} to CSV`
          }
        >
          {props.saving
            ? 'Saving…'
            : props.unsavedRows > 0
            ? `Save · ${props.unsavedRows} unsaved`
            : 'Saved'}
        </button>
        <button type="button" className="review-add-btn" onClick={props.onAddRow}>
          + Add row
        </button>
      </div>
      {props.saveError ? (
        <div className="review-toolbar-row review-save-error">Save failed: {props.saveError}</div>
      ) : null}
      <div className="review-toolbar-row">
        <form
          className="review-search"
          onSubmit={(event) => {
            // Commit-on-submit only: keystrokes never filter; the Search button
            // (type="submit") and Enter both route through here.
            event.preventDefault()
            props.onChartIdSearchSubmit()
          }}
        >
          <span className="review-search-label">chart_id</span>
          <input
            type="text"
            className="review-search-input"
            placeholder="Search by chart_id…"
            value={props.chartIdSearchInput}
            onChange={(event) => props.onChartIdSearchInputChange(event.target.value)}
            spellCheck={false}
            autoComplete="off"
          />
          <button type="submit" className="review-search-btn">
            Search
          </button>
          {props.chartIdSearchActive ? (
            <button
              type="button"
              className="review-search-clear"
              onClick={props.onChartIdSearchClear}
              title="Clear chart_id search"
            >
              Clear
            </button>
          ) : null}
        </form>
      </div>
      <div className="review-toolbar-row">
        <div className="review-status-filter-group" title="Operation_spec correctness">
          <span className="review-status-filter-axis">Op</span>
          <div className="review-status-chips">
            {STATUS_FILTER_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`review-status-chip ${
                  props.opStatusFilter === option.value ? 'is-active' : ''
                }`}
                onClick={() => props.onOpStatusFilterChange(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div className="review-status-filter-group" title="Visualization output correctness">
          <span className="review-status-filter-axis">Viz</span>
          <div className="review-status-chips">
            {STATUS_FILTER_OPTIONS.map((option) => (
              <button
                key={`viz-${option.value}`}
                type="button"
                className={`review-status-chip ${
                  props.vizStatusFilter === option.value ? 'is-active' : ''
                }`}
                onClick={() => props.onVizStatusFilterChange(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <label className="review-feedback-toggle">
          <input
            type="checkbox"
            checked={props.feedbackOnly}
            onChange={(event) => props.onFeedbackOnlyChange(event.target.checked)}
          />
          Has feedback
        </label>
      </div>
      <div className="review-toolbar-row">
        <div className="review-chart-type-chips">
          {CHART_TYPE_FILTER_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`review-chart-type-chip ${
                props.chartTypeFilter === option.value ? 'is-active' : ''
              }`}
              onClick={() => props.onChartTypeFilterChange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

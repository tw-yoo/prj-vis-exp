import { forwardRef, type Ref } from 'react'

export type ChartPaneStatus =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'rendered' }
  | { kind: 'ran-ops' }
  | { kind: 'error'; message: string }

type Props = {
  status: ChartPaneStatus
  stale: boolean
  selectedChartId: string | null
  canRender: boolean
  onRerender: () => void
  onResetChart: () => void
}

function statusLabel(status: ChartPaneStatus): string {
  switch (status.kind) {
    case 'idle':
      return 'Select a row to render.'
    case 'loading':
      return 'Loading…'
    case 'rendered':
      return ''
    case 'ran-ops':
      return ''
    case 'error':
      return `Error: ${status.message}`
  }
}

function ReviewChartPaneImpl(props: Props, ref: Ref<HTMLDivElement>) {
  const { status, stale, selectedChartId, canRender } = props
  return (
    <div className="card review-chart-card">
      <div className="card-header">
        <div className="card-title">
          Chart preview
          {selectedChartId ? (
            <span className="review-chart-id"> · {selectedChartId}</span>
          ) : null}
        </div>
        <div className="card-actions">
          <button
            type="button"
            className="pill-btn section-toggle-btn"
            onClick={props.onResetChart}
            disabled={!canRender}
          >
            Reset chart
          </button>
          <button
            type="button"
            className="pill-btn section-toggle-btn"
            onClick={props.onRerender}
            disabled={!canRender}
          >
            Re-render
          </button>
        </div>
      </div>
      {stale ? (
        <div className="review-stale-pin">
          Spec or ops were edited — click <strong>Re-render</strong> to apply.
        </div>
      ) : null}
      <div className="review-chart-status">{statusLabel(status)}</div>
      {/* chart-stage + chart-stage-viewport + chart-stage-summary-slot:
       * mirrors the workbench layout so the shared `renderSentenceSummaryOverlay`
       * helper (src/api/sentence-summary-overlay) can mount its sentence-list
       * UI in the same slot we use elsewhere. */}
      <div className="chart-stage">
        <div className="chart-stage-viewport">
          <div className="review-chart-host chart-host" ref={ref} />
        </div>
        <div className="chart-stage-summary-slot" data-summary-overlay-slot="true" />
      </div>
    </div>
  )
}

const ReviewChartPane = forwardRef<HTMLDivElement, Props>(ReviewChartPaneImpl)
ReviewChartPane.displayName = 'ReviewChartPane'
export default ReviewChartPane

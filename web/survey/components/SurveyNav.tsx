import './surveyUi.css'

export interface SurveyNavProps {
  onPrev?: () => void
  onNext: () => void
  prevLabel?: string
  nextLabel?: string
  prevDisabled?: boolean
  nextDisabled?: boolean
  hidePrev?: boolean
  align?: 'start' | 'center'
  totalPages?: number | null
  currentPage?: number | null
  showProgress?: boolean
}

export function SurveyNav({
  onPrev,
  onNext,
  prevLabel = 'Previous',
  nextLabel = 'Next',
  prevDisabled = false,
  nextDisabled = false,
  hidePrev = false,
  align = 'start',
  totalPages = null,
  currentPage = null,
  showProgress = true,
}: SurveyNavProps) {
  const hasProgress = showProgress && totalPages != null && currentPage != null && totalPages > 0
  const progressPercent = hasProgress ? ((currentPage / totalPages) * 100).toFixed(2) : '0'

  return (
    <div className={`survey-nav ${align === 'center' ? 'survey-nav--centered' : 'survey-nav--start'}`}>
      <div className="survey-nav__inner">
        {!hidePrev && (
          <button type="button" className="button prev-btn" onClick={onPrev} disabled={prevDisabled}>
            {prevLabel}
          </button>
        )}

        {hasProgress ? (
          <div className="progress-container">
            <progress className="progress-bar" max={totalPages} value={currentPage} />
            <br />
            <span>
              ({currentPage}/{totalPages}) {progressPercent}%
            </span>
          </div>
        ) : (
          <div className="progress-container" style={{ display: 'none' }} />
        )}

        <button type="button" className="button next-btn" onClick={onNext} disabled={nextDisabled}>
          {nextLabel}
        </button>
      </div>
    </div>
  )
}


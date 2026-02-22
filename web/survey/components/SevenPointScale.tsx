import './surveyUi.css'

export interface SevenPointScaleProps {
  id: string
  label: string
  leftLabel?: string
  rightLabel?: string
  value: number | null
  required?: boolean
  valueLabels?: string[]
  layout?: 'stacked' | 'compact'
  onChange: (value: number) => void
}

export function SevenPointScale({
  id,
  label,
  value,
  required = true,
  valueLabels,
  layout = 'stacked',
  onChange,
}: SevenPointScaleProps) {
  const legendId = `${id}-legend`
  const hasValueLabels = Array.isArray(valueLabels) && valueLabels.length === 7
  const labels = hasValueLabels ? valueLabels : Array.from({ length: 7 }, () => '')
  const className = `seven-scale ${layout === 'compact' ? 'seven-scale--compact' : ''} ${hasValueLabels ? 'seven-scale--with-labels' : ''}`.trim()

  return (
    <fieldset className="question-card-field" data-required={required ? 'true' : 'false'}>
      <legend id={legendId} className={`question ${required ? '' : 'optional-question'}`.trim()}>
        {label}
      </legend>
      <div className={className} role="radiogroup" aria-labelledby={legendId}>
        <div className="seven-scale__options">
          {Array.from({ length: 7 }, (_, index) => {
            const optionValue = index + 1
            const optionId = `${id}-opt-${optionValue}`
            return (
              <label key={optionId} htmlFor={optionId} className={`seven-scale__option ${value === optionValue ? 'is-selected' : ''}`.trim()}>
                <input
                  id={optionId}
                  type="radio"
                  name={id}
                  value={String(optionValue)}
                  checked={value === optionValue}
                  onChange={() => onChange(optionValue)}
                />
                {hasValueLabels ? (
                  <span className="seven-scale__text">{labels[index]}</span>
                ) : (
                  <span className="seven-scale__score">{optionValue}</span>
                )}
              </label>
            )
          })}
        </div>
      </div>
    </fieldset>
  )
}

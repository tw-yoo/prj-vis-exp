import './surveyUi.css'

export interface LikertQuestionProps {
  name: string
  questionText: string
  labels: string[]
  value: string
  required?: boolean
  onChange: (value: string) => void
}

export function LikertQuestion({
  name,
  questionText,
  labels,
  value,
  required = true,
  onChange,
}: LikertQuestionProps) {
  return (
    <fieldset className="likert-group" aria-label={questionText} data-required={required ? 'true' : 'false'}>
      <legend className={`question ${required ? '' : 'optional-question'}`.trim()}>{questionText}</legend>
      <div className="options">
        {labels.map((label, index) => {
          const optionValue = String(index + 1)
          const optionId = `${name}-opt-${index + 1}`
          return (
            <label key={optionId} className="likert-option" htmlFor={optionId}>
              <input
                id={optionId}
                type="radio"
                name={name}
                value={optionValue}
                checked={value === optionValue}
                onChange={(event) => onChange(event.target.value)}
              />
              <span className="custom-radio" />
              <span className="option-text">{label}</span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}


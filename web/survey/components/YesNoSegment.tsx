import './surveyUi.css'

export interface YesNoSegmentProps {
  id: string
  label: string
  value: 'yes' | 'no' | ''
  required?: boolean
  onChange: (value: 'yes' | 'no') => void
}

export function YesNoSegment({ id, label, value, required = true, onChange }: YesNoSegmentProps) {
  const yesId = `${id}-yes`
  const noId = `${id}-no`
  const legendId = `${id}-legend`

  return (
    <fieldset className="question-card-field" data-required={required ? 'true' : 'false'}>
      <legend id={legendId} className={`question ${required ? '' : 'optional-question'}`.trim()}>
        {label}
      </legend>
      <div className="segment-group" role="radiogroup" aria-labelledby={legendId}>
        <label htmlFor={yesId} className={`segment-option ${value === 'yes' ? 'is-selected' : ''}`.trim()}>
          <input id={yesId} type="radio" name={id} value="yes" checked={value === 'yes'} onChange={() => onChange('yes')} />
          <span>Yes</span>
        </label>
        <label htmlFor={noId} className={`segment-option ${value === 'no' ? 'is-selected' : ''}`.trim()}>
          <input id={noId} type="radio" name={id} value="no" checked={value === 'no'} onChange={() => onChange('no')} />
          <span>No</span>
        </label>
      </div>
    </fieldset>
  )
}

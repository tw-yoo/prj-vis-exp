import './surveyUi.css'

export interface OpenEndedInputProps {
  id: string
  labelText: string
  placeholder?: string
  multiline?: boolean
  inputType?: 'text' | 'email' | 'number' | 'password'
  value: string
  required?: boolean
  rows?: number
  onChange: (value: string) => void
}

function inferOptional(labelText: string, placeholder: string) {
  const label = labelText.toLowerCase()
  const hint = placeholder.toLowerCase()
  return label.includes('optional') || hint.includes('optional')
}

export function OpenEndedInput({
  id,
  labelText,
  placeholder = '',
  multiline = false,
  inputType = 'text',
  value,
  required,
  rows = 3,
  onChange,
}: OpenEndedInputProps) {
  const isRequired = typeof required === 'boolean' ? required : !inferOptional(labelText, placeholder)

  return (
    <div className="text-input-wrapper" data-required={isRequired ? 'true' : 'false'}>
      <label className={`question ${isRequired ? '' : 'optional-question'}`.trim()} htmlFor={id}>
        {labelText}
      </label>

      {multiline ? (
        <textarea
          id={id}
          name={id}
          className="text-input"
          placeholder={placeholder}
          rows={rows}
          value={value}
          required={isRequired}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          id={id}
          name={id}
          type={inputType}
          className="text-input"
          placeholder={placeholder}
          value={value}
          required={isRequired}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </div>
  )
}

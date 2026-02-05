import { useMemo, useState } from 'react'
import './surveyUi.css'

export interface RankingQuestionProps {
  name: string
  questionText: string
  options: string[]
  required?: boolean
  onChange?: (orderedValues: string[]) => void
}

function emptyAssignments(length: number) {
  return Array.from({ length }, () => null as number | null)
}

function toOrderedValues(assignments: Array<number | null>, options: string[]) {
  return assignments.map((optionIndex) => (optionIndex == null ? '' : String(options[optionIndex])))
}

export function RankingQuestion({ name, questionText, options, required = true, onChange }: RankingQuestionProps) {
  const [assignments, setAssignments] = useState<Array<number | null>>(() => emptyAssignments(options.length))
  const [selectedOption, setSelectedOption] = useState<number | null>(null)

  const orderedValues = useMemo(() => toOrderedValues(assignments, options), [assignments, options])

  const commitAssignments = (nextAssignments: Array<number | null>) => {
    setAssignments(nextAssignments)
    onChange?.(toOrderedValues(nextAssignments, options))
  }

  const assign = (optionIndex: number, rankIndex: number) => {
    const nextAssignments = assignments.map((value) => (value === optionIndex ? null : value))
    nextAssignments[rankIndex] = optionIndex
    setSelectedOption(null)
    commitAssignments(nextAssignments)
  }

  const clearRank = (rankIndex: number) => {
    const nextAssignments = assignments.slice()
    nextAssignments[rankIndex] = null
    commitAssignments(nextAssignments)
  }

  return (
    <fieldset className="ranking-group" aria-label={questionText} data-required={required ? 'true' : 'false'}>
      <legend className={`question ${required ? '' : 'optional-question'}`.trim()}>{questionText}</legend>
      <input type="hidden" name={name} value={orderedValues.join(',')} />

      <p className="ranking-help">Place selected options here: click a number or drop a button onto a slot.</p>
      <div className="rank-grid" aria-label="Ranked order">
        {options.map((_, rankIndex) => {
          const assignedOption = assignments[rankIndex]
          const assignedLabel = assignedOption == null ? null : options[assignedOption]
          return (
            <button
              key={`${name}_rank_${rankIndex}`}
              type="button"
              className={`rank-slot ${assignedOption == null ? 'is-empty' : 'has-assignment'}`.trim()}
              aria-label={assignedOption == null ? `Rank ${rankIndex + 1} (empty)` : `Rank ${rankIndex + 1}: ${assignedLabel}`}
              onClick={() => {
                if (selectedOption != null) {
                  assign(selectedOption, rankIndex)
                  return
                }
                if (assignedOption != null) {
                  clearRank(rankIndex)
                }
              }}
              onDragOver={(event) => {
                event.preventDefault()
                event.currentTarget.classList.add('drag-over')
              }}
              onDragLeave={(event) => {
                event.currentTarget.classList.remove('drag-over')
              }}
              onDrop={(event) => {
                event.preventDefault()
                event.currentTarget.classList.remove('drag-over')
                const value = Number(event.dataTransfer.getData('text/plain'))
                if (!Number.isFinite(value)) return
                if (value < 0 || value >= options.length) return
                assign(value, rankIndex)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
                  event.preventDefault()
                  if (selectedOption != null) {
                    assign(selectedOption, rankIndex)
                    return
                  }
                  if (assignedOption != null) {
                    clearRank(rankIndex)
                  }
                }
              }}
            >
              {assignedOption == null ? rankIndex + 1 : `${rankIndex + 1}. ${assignedLabel}`}
            </button>
          )
        })}
      </div>

      <p className="ranking-help">Drag these buttons onto the numbered slots above, or click a button then a number.</p>
      <div className="option-pool">
        {options.map((option, optionIndex) => {
          const rankPosition = assignments.indexOf(optionIndex)
          return (
            <button
              key={`${name}_option_${optionIndex}`}
              type="button"
              className={`rank-option ${rankPosition !== -1 ? 'has-rank' : ''} ${selectedOption === optionIndex ? 'is-selected' : ''}`.trim()}
              aria-pressed={selectedOption === optionIndex}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData('text/plain', String(optionIndex))
                event.dataTransfer.effectAllowed = 'move'
              }}
              onClick={() => {
                setSelectedOption((previous) => (previous === optionIndex ? null : optionIndex))
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  setSelectedOption((previous) => (previous === optionIndex ? null : optionIndex))
                  return
                }
                const digit = Number(event.key)
                if (Number.isInteger(digit) && digit >= 1 && digit <= options.length) {
                  event.preventDefault()
                  assign(optionIndex, digit - 1)
                }
              }}
            >
              <span className="option-text">{option}</span>
              <span className="rank-badge" aria-hidden="true">
                {rankPosition !== -1 ? rankPosition + 1 : ''}
              </span>
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}


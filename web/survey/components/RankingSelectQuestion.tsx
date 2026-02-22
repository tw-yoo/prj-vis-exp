import type { SystemId } from '../types'
import './surveyUi.css'

interface RankingOption {
  id: SystemId
  label: string
}

export interface RankingSelectQuestionProps {
  questionText: string
  options: RankingOption[]
  value: SystemId[]
  onChange: (next: SystemId[]) => void
  required?: boolean
}

const RANK_LABELS = ['1st', '2nd', '3rd']

function normalizeRanking(value: SystemId[]) {
  return RANK_LABELS.map((_, rankIndex) => value[rankIndex] ?? '') as Array<SystemId | ''>
}

function toRankingArray(value: Array<SystemId | ''>) {
  return value.filter((item): item is SystemId => item !== '')
}

export function RankingSelectQuestion({
  questionText,
  options,
  value,
  onChange,
  required = true,
}: RankingSelectQuestionProps) {
  const selectedByRank = normalizeRanking(value)

  const getAvailableOptions = (rankIndex: number) => {
    const current = selectedByRank[rankIndex]
    const selectedElsewhere = new Set(
      selectedByRank.filter((selected, otherRank) => selected !== '' && otherRank !== rankIndex),
    )

    return options.filter((option) => option.id === current || !selectedElsewhere.has(option.id))
  }

  const handleChange = (rankIndex: number, nextValue: string) => {
    const next = [...selectedByRank]
    next[rankIndex] = options.some((option) => option.id === nextValue) ? (nextValue as SystemId) : ''

    if (next[rankIndex] === '') {
      for (let index = rankIndex + 1; index < next.length; index += 1) {
        next[index] = ''
      }
    }

    onChange(toRankingArray(next))
  }

  return (
    <fieldset className="ranking-select-group" aria-label={questionText} data-required={required ? 'true' : 'false'}>
      <legend className={`question ${required ? '' : 'optional-question'}`.trim()}>{questionText}</legend>
      <div className="ranking-select-list">
        {RANK_LABELS.map((rankLabel, rankIndex) => {
          const rowDisabled = rankIndex > 0 && selectedByRank[rankIndex - 1] === ''
          const available = getAvailableOptions(rankIndex)

          return (
            <label key={`${questionText}-${rankLabel}`} className={`ranking-select-row ${rowDisabled ? 'is-disabled' : ''}`.trim()}>
              <span className="ranking-select-row__rank">{rankLabel}</span>
              <select
                className="ranking-select-row__select"
                value={selectedByRank[rankIndex]}
                onChange={(event) => handleChange(rankIndex, event.target.value)}
                disabled={rowDisabled}
              >
                <option value="">Select a system</option>
                {available.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

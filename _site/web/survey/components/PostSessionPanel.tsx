import { useMemo } from 'react'
import type { PostSessionExample, PostSessionResponse, SystemId } from '../types'
import { OpenEndedInput } from './OpenEndedInput'
import { PostSessionMatrix } from './PostSessionMatrix'
import { RankingSelectQuestion } from './RankingSelectQuestion'
import './surveyUi.css'

const SYSTEM_ORDER: SystemId[] = ['system1', 'system2', 'system3']
const SYSTEM_LABELS: Record<SystemId, string> = {
  system1: 'System 1',
  system2: 'System 2',
  system3: 'System 3',
}

type RankingKey = keyof PostSessionResponse['ranking']

function normalizeExamples(examples: PostSessionExample[]) {
  const map: Record<SystemId, PostSessionExample> = {
    system1: { systemId: 'system1', systemLabel: SYSTEM_LABELS.system1, examples: [] },
    system2: { systemId: 'system2', systemLabel: SYSTEM_LABELS.system2, examples: [] },
    system3: { systemId: 'system3', systemLabel: SYSTEM_LABELS.system3, examples: [] },
  }
  examples.forEach((entry) => {
    map[entry.systemId] = entry
  })
  return map
}

export interface PostSessionPanelProps {
  examples: PostSessionExample[]
  value: PostSessionResponse
  onMatrixChange: (systemId: SystemId, field: 'clarity' | 'complexConfidence' | 'evidence', score: number) => void
  onRankingChange: (key: RankingKey, value: SystemId[]) => void
  onKeyDifferencesChange: (value: string) => void
  errorMessage?: string
}

export function PostSessionPanel({
  examples,
  value,
  onMatrixChange,
  onRankingChange,
  onKeyDifferencesChange,
  errorMessage,
}: PostSessionPanelProps) {
  const examplesBySystem = useMemo(() => normalizeExamples(examples), [examples])
  const rankingOptions = useMemo(
    () => SYSTEM_ORDER.map((systemId) => ({ id: systemId, label: SYSTEM_LABELS[systemId] })),
    [],
  )

  return (
    <section className="post-session-root">
      <header className="post-session-header">
        <h2>Post Session</h2>
        <p>Review examples from all three systems, then answer the comparative questions below.</p>
      </header>

      {errorMessage ? (
        <div className="survey-engine__error" role="status" aria-live="polite">
          {errorMessage}
        </div>
      ) : null}

      <section className="post-session-section" aria-labelledby="post-examples-title">
        <h3 id="post-examples-title">System Examples</h3>
        <div className="post-examples-stack">
          {SYSTEM_ORDER.map((systemId) => {
            const entry = examplesBySystem[systemId]
            return (
              <article key={systemId} className="post-example-card">
                <h4>{entry.systemLabel || SYSTEM_LABELS[systemId]}</h4>
                <div className="post-example-items">
                  {entry.examples.length === 0 ? (
                    <p className="post-example-empty">No examples available.</p>
                  ) : (
                    entry.examples.slice(0, 2).map((example, index) => (
                      <section key={`${systemId}-example-${index}`} className="post-example-item">
                        <h5>{example.title}</h5>
                        <p>
                          <strong>Question:</strong> {example.question}
                        </p>
                        <p>
                          <strong>Answer:</strong> {example.answer}
                        </p>
                        <p>
                          <strong>Explanation:</strong> {example.explanation}
                        </p>
                      </section>
                    ))
                  )}
                </div>
              </article>
            )
          })}
        </div>
      </section>

      <PostSessionMatrix value={value.matrix} onChange={onMatrixChange} />

      <section className="post-session-section" aria-labelledby="post-ranking-title">
        <h3 id="post-ranking-title">Q2. Rank the three systems</h3>
        <div className="post-ranking-grid">
          <RankingSelectQuestion
            questionText="Which system do you trust the most?"
            options={rankingOptions}
            value={value.ranking.trustMost}
            onChange={(next) => onRankingChange('trustMost', next)}
          />
          <RankingSelectQuestion
            questionText="Which system provided the easiest-to-understand explanations?"
            options={rankingOptions}
            value={value.ranking.easiestExplanation}
            onChange={(next) => onRankingChange('easiestExplanation', next)}
          />
          <RankingSelectQuestion
            questionText="Which system would you prefer to use for real-world data analysis?"
            options={rankingOptions}
            value={value.ranking.realWorldUse}
            onChange={(next) => onRankingChange('realWorldUse', next)}
          />
        </div>
      </section>

      <section className="post-session-section" aria-labelledby="post-diff-title">
        <h3 id="post-diff-title">Q3. What were the key differences you noticed between the explanations provided by the three systems?</h3>
        <OpenEndedInput
          id="post-session-differences"
          labelText="What were the key differences you noticed between the explanations provided by the three systems?"
          hideLabel
          multiline
          rows={5}
          value={value.keyDifferences}
          onChange={onKeyDifferencesChange}
        />
      </section>
    </section>
  )
}

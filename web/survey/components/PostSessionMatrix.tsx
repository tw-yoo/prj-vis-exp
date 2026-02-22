import type { PostSessionResponse, SystemId } from '../types'
import { SevenPointScale } from './SevenPointScale'
import './surveyUi.css'

type MatrixField = 'clarity' | 'complexConfidence' | 'evidence'

const STATEMENTS: Array<{ key: MatrixField; prompt: string }> = [
  { key: 'clarity', prompt: 'The explanation clearly showed the steps taken to derive the answer.' },
  { key: 'complexConfidence', prompt: "I am confident in this system's ability to answer complex chart questions correctly." },
  { key: 'evidence', prompt: 'The explanation provided sufficient evidence to allow me to accept or reject the answer.' },
]
const AGREEMENT_SCALE_LABELS = [
  'Strongly disagree',
  'Disagree',
  'Slightly disagree',
  'Neutral',
  'Slightly agree',
  'Agree',
  'Strongly agree',
]

const SYSTEM_ROWS: Array<{ id: SystemId; label: string }> = [
  { id: 'system1', label: 'System 1' },
  { id: 'system2', label: 'System 2' },
  { id: 'system3', label: 'System 3' },
]

export interface PostSessionMatrixProps {
  value: PostSessionResponse['matrix']
  onChange: (systemId: SystemId, field: MatrixField, score: number) => void
}

export function PostSessionMatrix({ value, onChange }: PostSessionMatrixProps) {
  return (
    <section className="post-session-section" aria-labelledby="post-matrix-title">
      <h3 id="post-matrix-title">Q1. Rate each system (1-7)</h3>
      <div className="post-matrix-grid">
        {SYSTEM_ROWS.map((system) => (
          <article key={system.id} className="post-matrix-card">
            <h4>{system.label}</h4>
            {STATEMENTS.map((statement) => (
              <SevenPointScale
                key={`${system.id}-${statement.key}`}
                id={`matrix-${system.id}-${statement.key}`}
                label={statement.prompt}
                leftLabel="Strongly disagree"
                rightLabel="Strongly agree"
                valueLabels={AGREEMENT_SCALE_LABELS}
                value={value[system.id][statement.key]}
                layout="compact"
                onChange={(score) => onChange(system.id, statement.key, score)}
              />
            ))}
          </article>
        ))}
      </div>
    </section>
  )
}

import { getDrawActionLabel, TimelineStepKind, type TimelineStep } from '../../../src/api/legacy'

type DrawTimelinePanelProps = {
  steps: TimelineStep[]
  running: boolean
  statusText?: string
  selectedStepId: string | null
  onSelectStep: (id: string | null) => void
  onToggleStep: (id: string) => void
  onRemoveStep: (id: string) => void
  onMoveStep: (id: string, direction: -1 | 1) => void
  onRunAll: () => void
  onRunOne: (id: string) => void
  onStop: () => void
  onClear: () => void
  onInsertSleep: (seconds: number) => void
  onCopyJson: () => void
  onCopyTs: () => void
  onAppendToBuilder: () => void
}

const describeStep = (step: TimelineStep) => {
  if (step.kind === TimelineStepKind.Sleep) return `sleep ${Math.max(0, step.durationMs) / 1000}s`
  if (step.kind === TimelineStepKind.Group) return `group (${step.children.length})`
  return getDrawActionLabel(step.op)
}

export default function DrawTimelinePanel({
  steps,
  running,
  statusText,
  selectedStepId,
  onSelectStep,
  onToggleStep,
  onRemoveStep,
  onMoveStep,
  onRunAll,
  onRunOne,
  onStop,
  onClear,
  onInsertSleep,
  onCopyJson,
  onCopyTs,
  onAppendToBuilder,
}: DrawTimelinePanelProps) {
  return (
    <section className="draw-timeline-panel">
      <div className="draw-timeline-header">
        <div className="draw-timeline-title">Interaction Timeline</div>
        <div className="draw-timeline-actions">
          <button type="button" className="pill-btn" onClick={onRunAll} disabled={running || steps.length === 0}>
            Run All
          </button>
          <button type="button" className="pill-btn" onClick={onStop} disabled={!running}>
            Stop
          </button>
          <button type="button" className="pill-btn" onClick={onClear} disabled={running || steps.length === 0}>
            Clear Session
          </button>
        </div>
      </div>
      <div className="draw-timeline-actions-row">
        <button type="button" className="pill-btn" onClick={() => onInsertSleep(1)} disabled={running}>
          + Sleep 1s
        </button>
        <button type="button" className="pill-btn" onClick={onCopyJson} disabled={steps.length === 0}>
          Copy JSON
        </button>
        <button type="button" className="pill-btn" onClick={onCopyTs} disabled={steps.length === 0}>
          Copy TS (DSL)
        </button>
        <button type="button" className="pill-btn" onClick={onAppendToBuilder} disabled={steps.length === 0}>
          Append To OpsBuilder
        </button>
      </div>
      {statusText ? <div className="draw-timeline-empty">{statusText}</div> : null}
      <div className="draw-timeline-list">
        {steps.length === 0 ? <div className="draw-timeline-empty">No recorded steps.</div> : null}
        {steps.map((step, index) => (
          <div
            key={step.id}
            className={`draw-timeline-item ${selectedStepId === step.id ? 'is-selected' : ''}`}
            onClick={() => onSelectStep(step.id)}
          >
            <div className="draw-timeline-item-main">
              <label>
                <input
                  type="checkbox"
                  checked={step.enabled}
                  onChange={(event) => {
                    event.stopPropagation()
                    onToggleStep(step.id)
                  }}
                />
              </label>
              <span className="draw-timeline-item-index">{index + 1}.</span>
              <span className="draw-timeline-item-label">{step.label || describeStep(step)}</span>
            </div>
            <div className="draw-timeline-item-actions">
              <button type="button" className="pill-btn tiny-btn" onClick={() => onRunOne(step.id)} disabled={running || !step.enabled}>
                Run
              </button>
              <button type="button" className="pill-btn tiny-btn" onClick={() => onMoveStep(step.id, -1)} disabled={running || index === 0}>
                ↑
              </button>
              <button type="button" className="pill-btn tiny-btn" onClick={() => onMoveStep(step.id, 1)} disabled={running || index === steps.length - 1}>
                ↓
              </button>
              <button type="button" className="pill-btn tiny-btn" onClick={() => onRemoveStep(step.id)} disabled={running}>
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

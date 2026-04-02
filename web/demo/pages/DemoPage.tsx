import { useCallback, useEffect, useRef, useState } from 'react'
import '../../App.css'
import './demo.css'
import type { DemoSentenceBinding } from '../../../src/api/demo-binding'
import type { ChartSpec } from '../../../src/api/types'
import { browserEngine } from '../../engine/createBrowserEngine'
import { DEMO_CHARTS, loadDemoChartSpec } from '../services/demoAssets'
import { createDemoPlaybackSession } from '../services/demoPlaybackSession'

const initialChart = DEMO_CHARTS[0] ?? null
const initialQuestion = initialChart?.questions[0] ?? null

export default function DemoPage() {
  const chartRef = useRef<HTMLDivElement | null>(null)
  const playbackSessionRef = useRef(createDemoPlaybackSession())
  const [selectedChartId, setSelectedChartId] = useState(initialChart?.id ?? '')
  const [selectedQuestionId, setSelectedQuestionId] = useState(initialQuestion?.id ?? '')
  const [selectedSpec, setSelectedSpec] = useState<ChartSpec | null>(null)
  const [bindings, setBindings] = useState<DemoSentenceBinding[]>([])
  const [activeSentenceIndex, setActiveSentenceIndex] = useState<number | null>(null)
  const [lastExecutedStep, setLastExecutedStep] = useState(-1)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [status, setStatus] = useState('Preparing demo charts...')
  const [error, setError] = useState<string | null>(null)

  const selectedChart = DEMO_CHARTS.find((chart) => chart.id === selectedChartId) ?? initialChart
  const selectedQuestion =
    selectedChart?.questions.find((question) => question.id === selectedQuestionId) ?? selectedChart?.questions[0] ?? null

  useEffect(() => {
    let cancelled = false

    const initialize = async () => {
      if (!selectedChart || !selectedQuestion || !chartRef.current) return

      setLoading(true)
      setError(null)
      setStatus('Loading chart and question...')

      try {
        const [nextSpec] = await Promise.all([loadDemoChartSpec(selectedChart.specPath)])
        const nextBindings = browserEngine.buildDemoSentenceBindings(selectedQuestion.sentences, selectedQuestion.opsSpec)
        if (cancelled) return

        setSelectedSpec(nextSpec)
        setBindings(nextBindings)
        setActiveSentenceIndex(null)
        setLastExecutedStep(-1)
        await playbackSessionRef.current.initialize(chartRef.current, nextSpec)
        if (cancelled) return
        setStatus(`Loaded ${selectedChart.title} / ${selectedQuestion.title}. ${nextBindings.length} step(s) ready.`)
      } catch (initError) {
        if (cancelled) return
        const message = initError instanceof Error ? initError.message : String(initError)
        setError(message)
        setStatus('Failed to prepare the demo.')
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void initialize()
    return () => {
      cancelled = true
    }
  }, [selectedChart, selectedQuestion])

  useEffect(() => {
    return () => {
      playbackSessionRef.current.reset()
    }
  }, [])

  const handleChartChange = useCallback((chartId: string) => {
    const nextChart = DEMO_CHARTS.find((chart) => chart.id === chartId)
    setSelectedChartId(chartId)
    setSelectedQuestionId(nextChart?.questions[0]?.id ?? '')
  }, [])

  const handleQuestionChange = useCallback((questionId: string) => {
    setSelectedQuestionId(questionId)
  }, [])

  const handleSentenceClick = useCallback(
    async (index: number) => {
      if (!selectedChart || !selectedQuestion || !selectedSpec || !chartRef.current || running) return
      if (playbackSessionRef.current.isStepLocked(index)) {
        setStatus(`Step ${index + 1} is locked until step ${index} is complete.`)
        return
      }

      setRunning(true)
      setError(null)
      setStatus(`Running step ${index + 1} of ${bindings.length}...`)

      try {
        const result = await playbackSessionRef.current.activateStep(index, bindings[index]?.ops ?? [])
        setActiveSentenceIndex(index)
        setLastExecutedStep(playbackSessionRef.current.getLastExecutedStep())
        setStatus(
          `${result.kind === 'restored' ? 'Restored' : 'Executed'} step ${index + 1} of ${bindings.length} for ${selectedQuestion.title}.`,
        )
      } catch (runError) {
        const message = runError instanceof Error ? runError.message : String(runError)
        setError(`Failed to execute step ${index + 1}: ${message}`)
        setStatus('Step execution failed.')
      } finally {
        setRunning(false)
      }
    },
    [bindings, running, selectedChart, selectedQuestion, selectedSpec],
  )

  if (!selectedChart || !selectedQuestion) {
    return (
      <div className="app-shell demo-shell">
        <section className="card demo-card">
          <div className="demo-error">No demo charts are configured.</div>
        </section>
      </div>
    )
  }

  return (
    <div className="app-shell demo-shell">
      <section className="card demo-card">
        <div className="card-header">
          <div className="card-title">Demo</div>
        </div>

        <section className="demo-toolbar">
          <div className="demo-toolbar-group">
            <div className="demo-toolbar-label">Chart Types</div>
            <div className="demo-chip-row">
              {DEMO_CHARTS.map((chart, index) => (
                <button
                  key={chart.id}
                  type="button"
                  className={`demo-chip ${chart.id === selectedChart.id ? 'is-active' : ''}`}
                  data-testid={`demo-chart-tab-${index}`}
                  onClick={() => handleChartChange(chart.id)}
                >
                  {chart.title}
                </button>
              ))}
            </div>
          </div>

          <div className="demo-toolbar-group">
            <div className="demo-toolbar-label">Questions</div>
            <div className="demo-question-grid">
              {selectedChart.questions.map((question, index) => (
                <button
                  key={question.id}
                  type="button"
                  className={`demo-question-card ${question.id === selectedQuestion.id ? 'is-active' : ''}`}
                  data-testid={`demo-question-item-${index}`}
                  onClick={() => handleQuestionChange(question.id)}
                >
                  <span className="demo-question-card-index">Q{index + 1}</span>
                  <span className="demo-question-card-title">{question.title}</span>
                  <span className="demo-question-card-body">{question.question}</span>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="demo-brief">
          <div className="demo-brief-eyebrow">{selectedChart.subtitle}</div>
          <div className="demo-brief-question" data-testid="demo-question-text">
            {selectedQuestion.question}
          </div>
          <div className="demo-brief-description" data-testid="demo-description-text">
            {selectedQuestion.description}
          </div>
        </section>

        <div className="demo-status" data-testid="demo-status">
          {status}
        </div>
        {error ? (
          <div className="demo-error" data-testid="demo-error">
            {error}
          </div>
        ) : null}

        <div className="demo-split">
          <section className="demo-pane demo-pane-chart">
            <div className="demo-pane-header">Chart</div>
            <div className="demo-pane-body demo-pane-body-chart">
              <div ref={chartRef} className="chart-host demo-chart-host" data-testid="demo-chart-host" />
            </div>
          </section>

          <section className="demo-pane demo-pane-steps">
            <div className="demo-pane-header">Explanation Steps</div>
            <div className="demo-pane-body demo-pane-body-steps">
              <ol className="demo-sentence-list" data-testid="demo-sentence-list">
                {bindings.map((binding, index) => (
                  <li key={`${binding.groupName}-${index}`}>
                    {/*
                      Forward-only demo playback:
                      - current/next step is clickable
                      - later steps stay locked until the previous one completes
                    */}
                    <button
                      type="button"
                      className={`demo-sentence-item ${activeSentenceIndex === index ? 'is-active' : ''}`}
                      data-testid={`demo-sentence-item-${index}`}
                      onClick={() => void handleSentenceClick(index)}
                      disabled={loading || running || index > lastExecutedStep + 1}
                    >
                      <span className="demo-sentence-index">{index + 1}.</span>
                      <span>{binding.sentence}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          </section>
        </div>
      </section>
    </div>
  )
}

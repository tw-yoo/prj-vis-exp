import { useCallback, useEffect, useRef, useState } from 'react'
import '../../App.css'
import './demo.css'
import type { DemoSentenceBinding } from '../../../src/api/demo-binding'
import type { VegaLiteSpec } from '../../../src/api/types'
import { browserEngine } from '../../engine/createBrowserEngine'
import { loadDemoAssets } from '../services/demoAssets'

export default function DemoPage() {
  const chartRef = useRef<HTMLDivElement | null>(null)
  const [vlSpec, setVlSpec] = useState<VegaLiteSpec | null>(null)
  const [bindings, setBindings] = useState<DemoSentenceBinding[]>([])
  const [activeSentenceIndex, setActiveSentenceIndex] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [status, setStatus] = useState('Loading demo assets...')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const initialize = async () => {
      setLoading(true)
      setError(null)
      setStatus('Loading demo assets...')
      try {
        const assets = await loadDemoAssets()
        const nextBindings = browserEngine.buildDemoSentenceBindings(assets.sentences, assets.opsSpec)
        if (cancelled) return
        setVlSpec(assets.vlSpec)
        setBindings(nextBindings)
        setActiveSentenceIndex(null)
        if (!chartRef.current) {
          throw new Error('Chart host is not ready.')
        }
        await browserEngine.renderChart(chartRef.current, assets.vlSpec)
        if (cancelled) return
        setStatus(`Loaded ${nextBindings.length} sentence(s). Click a sentence to run its group.`)
      } catch (initError) {
        if (cancelled) return
        const message = initError instanceof Error ? initError.message : String(initError)
        setError(message)
        setStatus('Failed to load demo assets.')
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
  }, [])

  const handleSentenceClick = useCallback(
    async (index: number) => {
      if (!vlSpec || !chartRef.current || running) return
      const selected = bindings[index]
      if (!selected) return

      setRunning(true)
      setError(null)
      setStatus(`Running group: ${selected.groupName}`)

      try {
        await browserEngine.renderChart(chartRef.current, vlSpec)
        await browserEngine.runChartOps(chartRef.current, vlSpec, selected.ops)
        setActiveSentenceIndex(index)
        setStatus(`Executed group: ${selected.groupName}`)
      } catch (runError) {
        const message = runError instanceof Error ? runError.message : String(runError)
        setError(`Failed to execute group "${selected.groupName}": ${message}`)
        setStatus('Group execution failed.')
      } finally {
        setRunning(false)
      }
    },
    [bindings, running, vlSpec],
  )

  return (
    <div className="app-shell demo-shell">
      <section className="card demo-card">
        <div className="card-header">
          <div className="card-title">Demo</div>
        </div>

        <div className="demo-status" data-testid="demo-status">
          {status}
        </div>
        {error ? (
          <div className="demo-error" data-testid="demo-error">
            {error}
          </div>
        ) : null}

        <div className="demo-split">
          <section className="demo-pane">
            <div className="demo-pane-header">Chart</div>
            <div className="demo-pane-body">
              <div ref={chartRef} className="chart-host demo-chart-host" data-testid="demo-chart-host" />
            </div>
          </section>

          <section className="demo-pane">
            <div className="demo-pane-header">Explanation Sentences</div>
            <div className="demo-pane-body">
              <ol className="demo-sentence-list" data-testid="demo-sentence-list">
                {bindings.map((binding, index) => (
                  <li key={`${binding.groupName}-${index}`}>
                    <button
                      type="button"
                      className={`demo-sentence-item ${activeSentenceIndex === index ? 'is-active' : ''}`}
                      data-testid={`demo-sentence-item-${index}`}
                      onClick={() => void handleSentenceClick(index)}
                      disabled={loading || running || !vlSpec}
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

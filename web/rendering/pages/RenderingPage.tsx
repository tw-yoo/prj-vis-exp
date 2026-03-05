import { useEffect, useRef, useState } from 'react'
import '../../App.css'
import './rendering.css'
import type { VegaLiteSpec } from '../../../src/api/types'
import { browserEngine } from '../../engine/createBrowserEngine'

// Hardcoded spec file path
const SPEC_FILE_PATH = '/ChartQA/data/vlSpec/bar/simple/0baf5ch9y4z8914p.json'

export default function RenderingPage() {
  const chartRef = useRef<HTMLDivElement | null>(null)
  const [spec, setSpec] = useState<VegaLiteSpec | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Load spec on mount
  useEffect(() => {
    let cancelled = false

    const loadSpec = async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch(SPEC_FILE_PATH, { cache: 'no-store' })
        if (!response.ok) {
          throw new Error(`Failed to load spec from ${SPEC_FILE_PATH} (${response.status})`)
        }
        const loadedSpec = (await response.json()) as VegaLiteSpec
        if (cancelled) return
        setSpec(loadedSpec)
      } catch (loadError) {
        if (cancelled) return
        const message = loadError instanceof Error ? loadError.message : String(loadError)
        setError(message)
        setLoading(false)
      }
    }

    void loadSpec()
    return () => {
      cancelled = true
    }
  }, [])

  // Render chart when spec is loaded and ref is ready
  useEffect(() => {
    if (!spec || !chartRef.current) return

    const renderChart = async () => {
      try {
        await browserEngine.renderChart(chartRef.current as HTMLDivElement, spec)
        setLoading(false)
      } catch (renderError) {
        const message = renderError instanceof Error ? renderError.message : String(renderError)
        setError(message)
        setLoading(false)
      }
    }

    void renderChart()
  }, [spec])

  const handleButtonClick = async () => {
    // Placeholder for future functionality
    console.log('Button clicked')
  }

  return (
    <div className="app-shell rendering-shell">
      <section className="rendering-container">
        <div className="rendering-content">
          {loading ? (
            <div className="rendering-status">Loading chart...</div>
          ) : error ? (
            <div className="rendering-error">Error: {error}</div>
          ) : (
            <>
              <div className="chart-host" ref={chartRef} />
              <div className="rendering-controls">
                <button className="pill-btn" onClick={handleButtonClick}>
                  Execute Action
                </button>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  )
}

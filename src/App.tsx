import { useRef, useState } from 'react'
import './App.css'
import { renderVegaLiteChart, type VegaLiteSpec } from './utils/chartRenderer'

function App() {
  const [vlSpec, setVlSpec] = useState('')
  const [opsSpec, setOpsSpec] = useState('')
  const chartRef = useRef<HTMLDivElement | null>(null)

  const handleRenderChart = async () => {
    try {
      const parsed = JSON.parse(vlSpec) as VegaLiteSpec
      if (!chartRef.current) {
        alert('Chart container is not ready.')
        return
      }
      await renderVegaLiteChart(chartRef.current, parsed)
    } catch (error) {
      console.error('Failed to parse Vega-Lite spec', error)
      alert('Invalid JSON')
    }
  }

  return (
    <div className="app-shell">
      <div className="layout-body">
        <section className="card">
          <div className="card-header">
            <label className="card-title" htmlFor="vl-spec">
              Vega-Lite Spec
            </label>
            <button type="button" className="pill-btn" onClick={handleRenderChart}>
              Render Chart
            </button>
          </div>
          <textarea
            id="vl-spec"
            placeholder="Paste Vega-Lite JSON here"
            value={vlSpec}
            onChange={(event) => setVlSpec(event.target.value)}
          />
        </section>

        <section className="card">
          <div className="card-header">
            <label className="card-title" htmlFor="ops-spec">
              Operations Spec
            </label>
            <button type="button" className="pill-btn">
              Run Operations
            </button>
          </div>
          <textarea
            id="ops-spec"
            placeholder="Paste Atomic-Ops JSON here"
            value={opsSpec}
            onChange={(event) => setOpsSpec(event.target.value)}
          />
        </section>

        <section className="card">
          <div className="card-header">
            <div className="card-title">Chart Preview</div>
          </div>
          <div className="chart-host" ref={chartRef} />
        </section>
      </div>
    </div>
  )
}

export default App

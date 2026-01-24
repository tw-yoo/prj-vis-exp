import { useCallback, useEffect, useRef, useState } from 'react'
import type React from 'react'
import './App.css'
import barSimpleVerSpecRaw from '../data/test/spec/bar_simple_ver.json?raw'
import { runSimpleBarOps, type SimpleBarSpec } from './renderer/bar/simpleBarRenderer'

const vlSpecPlaceholder = barSimpleVerSpecRaw

function App() {
  const [vlSpec, setVlSpec] = useState(vlSpecPlaceholder)
  const [opsSpec, setOpsSpec] = useState('')
  const [pendingOps, setPendingOps] = useState<any[] | null>(null)
  const chartRef = useRef<HTMLDivElement | null>(null)

  const prettyFormatJson = (value: string) => {
    try {
      return JSON.stringify(JSON.parse(value), null, 2)
    } catch {
      return value
    }
  }

  const renderChart = useCallback(
    async (specString: string) => {
      try {
        const parsed = JSON.parse(specString) as SimpleBarSpec
        if (!chartRef.current) {
          alert('Chart container is not ready.')
          return
        }
        // Use the same renderer used for operations to keep appearance consistent.
        await runSimpleBarOps(chartRef.current, parsed, null)
      } catch (error) {
        console.error('Failed to parse Vega-Lite spec', error)
        alert('Invalid JSON')
      }
    },
    []
  )

  const handleRenderChart = () => {
    const specString = vlSpec.trim() === '' ? vlSpecPlaceholder : vlSpec
    void renderChart(specString)
  }

  const handleOpsBlur: React.FocusEventHandler<HTMLTextAreaElement> = (event) => {
    const formatted = prettyFormatJson(event.target.value)
    setOpsSpec(formatted)
  }

  const handleRunOperations = async () => {
    if (!chartRef.current) {
      alert('Chart container is not ready.')
      return
    }
    try {
      const parsed = opsSpec.trim() ? JSON.parse(opsSpec) : null
      const arrayForm = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.ops) ? parsed.ops : []
      if (!arrayForm.length) {
        alert('No operations found.')
        setPendingOps(null)
        return
      }
      setPendingOps(arrayForm)
    } catch (error) {
      console.error('Failed to parse Operations spec', error)
      alert('Invalid Operations JSON')
      setPendingOps(null)
    }
  }

  const handleStartOps = async () => {
    if (!chartRef.current) return
    const opsArray = pendingOps ?? []
    const specString = vlSpec.trim() === '' ? vlSpecPlaceholder : vlSpec
    let parsedVl: SimpleBarSpec
    try {
      parsedVl = JSON.parse(specString)
    } catch (error) {
      console.error('Failed to parse Vega-Lite spec for operations', error)
      alert('Invalid Vega-Lite JSON')
      return
    }
    try {
      await runSimpleBarOps(chartRef.current, parsedVl, { ops: opsArray })
    } catch (error) {
      console.error('Run Operations failed', error)
      alert('Failed to run operations. Check the console for details.')
    }
  }

  useEffect(() => {
    void renderChart(vlSpecPlaceholder)
  }, [renderChart])

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
            placeholder={vlSpecPlaceholder}
            value={vlSpec}
            onChange={(event) => setVlSpec(event.target.value)}
          />
        </section>

        <section className="card">
          <div className="card-header">
            <label className="card-title" htmlFor="ops-spec">
              Operations Spec
            </label>
            <button type="button" className="pill-btn" onClick={handleRunOperations}>
              Run Operations
            </button>
          </div>
          <textarea
            id="ops-spec"
            placeholder="Paste Atomic-Ops JSON here"
            value={opsSpec}
            onChange={(event) => setOpsSpec(event.target.value)}
            onBlur={handleOpsBlur}
          />
        </section>

        <section className="card">
          <div className="card-header">
            <div className="card-title">Chart Preview</div>
          </div>
          <div className="chart-host" ref={chartRef} />
          {pendingOps && pendingOps.length > 0 && (
            <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-start' }}>
              <button type="button" className="pill-btn" onClick={handleStartOps}>
                Start
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

export default App

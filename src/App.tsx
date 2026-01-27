import { useCallback, useEffect, useRef, useState } from 'react'
import type React from 'react'
import './App.css'
import barSimpleSpecRaw from '../data/test/spec/bar_simple_ver.json?raw'
import lineSimpleSpecRaw from '../data/test/spec/line_simple.json?raw'
import type { JsonValue, OperationSpec } from './types'
import { renderChart as renderChartDispatch } from './renderer/renderChart'
import {runChartOps} from "./renderer/runChartOps.ts";

const vlSpecPlaceholder = barSimpleSpecRaw
// const vlSpecPlaceholder = lineSimpleSpecRaw

function App() {
  const [vlSpec, setVlSpec] = useState(vlSpecPlaceholder)
  const [opsSpec, setOpsSpec] = useState('')
  const [pendingOps, setPendingOps] = useState<OperationSpec[] | null>(null)
  const chartRef = useRef<HTMLDivElement | null>(null)

  const prettyFormatJson = (value: string) => {
    try {
      return JSON.stringify(JSON.parse(value), null, 2)
    } catch {
      return value
    }
  }

  const getLineIndent = (line: string) => {
    const match = line.match(/^\s+/)
    return match ? match[0] : ''
  }

  const handleOpsKeyDown: React.KeyboardEventHandler<HTMLTextAreaElement> = (event) => {
    const { key, currentTarget } = event
    if (!['Tab', 'Enter', '{', '['].includes(key)) return

    const { selectionStart, selectionEnd, value } = currentTarget
    if (selectionStart == null || selectionEnd == null) return

    if (key === '{' || key === '[') {
      event.preventDefault()
      const closeChar = key === '{' ? '}' : ']'
      const before = value.slice(0, selectionStart)
      const after = value.slice(selectionEnd)
      const next = `${before}${key}${closeChar}${after}`
      setOpsSpec(next)
      requestAnimationFrame(() => {
        const cursor = selectionStart + 1
        currentTarget.selectionStart = currentTarget.selectionEnd = cursor
      })
      return
    }

    if (key === 'Tab') {
      event.preventDefault()
      const indent = '  '
      const before = value.slice(0, selectionStart)
      const after = value.slice(selectionEnd)
      const next = `${before}${indent}${after}`
      setOpsSpec(next)
      requestAnimationFrame(() => {
        currentTarget.selectionStart = currentTarget.selectionEnd = selectionStart + indent.length
      })
      return
    }

    if (key === 'Enter') {
      event.preventDefault()
      const before = value.slice(0, selectionStart)
      const after = value.slice(selectionEnd)
      const prevLine = before.split('\n').pop() ?? ''
      const baseIndent = getLineIndent(prevLine)
      const trimmedPrev = prevLine.trimEnd()
      const opensBlock = trimmedPrev.endsWith('{') || trimmedPrev.endsWith('[')
      const nextChar = after[0]
      const hasAutoClose = (trimmedPrev.endsWith('{') && nextChar === '}') || (trimmedPrev.endsWith('[') && nextChar === ']')

      const nextIndent = `${baseIndent}${opensBlock ? '  ' : ''}`

      if (opensBlock && hasAutoClose) {
        const nextValue = `${before}\n${nextIndent}\n${baseIndent}${after}`
        setOpsSpec(nextValue)
        requestAnimationFrame(() => {
          const cursor = selectionStart + 1 + nextIndent.length
          currentTarget.selectionStart = currentTarget.selectionEnd = cursor
        })
        return
      }

      const nextValue = `${before}\n${nextIndent}${after}`
      setOpsSpec(nextValue)
      requestAnimationFrame(() => {
        const cursor = selectionStart + 1 + nextIndent.length
        currentTarget.selectionStart = currentTarget.selectionEnd = cursor
      })
    }
  }

  const renderChart = useCallback(
    async (specString: string) => {
      try {
        const parsed = JSON.parse(specString)
        if (!chartRef.current) {
          alert('Chart container is not ready.')
          return
        }
        await renderChartDispatch(chartRef.current, parsed)
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
    if (!chartRef.current) { alert('Chart container is not ready.'); return }

    const specString = vlSpec.trim() === '' ? vlSpecPlaceholder : vlSpec
    await renderChart(specString)

    try {
      const parsed = opsSpec.trim() ? (JSON.parse(opsSpec) as JsonValue) : null
      const arrayForm = Array.isArray(parsed)
        ? (parsed as OperationSpec[])
        : parsed && typeof parsed === 'object' && Array.isArray((parsed as { ops?: JsonValue })?.ops)
          ? ((parsed as unknown as { ops: OperationSpec[] }).ops ?? [])
          : parsed && typeof parsed === 'object'
            ? ([parsed as OperationSpec] as OperationSpec[])
            : []

      if (!arrayForm.length) { alert('No operations found.'); setPendingOps(null); return}
      setPendingOps(arrayForm);

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
    let parsedVlSpec: any

    try {
      parsedVlSpec = JSON.parse(specString)
    } catch (error) {
      console.error('Failed to parse Vega-Lite spec for operations', error)
      alert('Invalid Vega-Lite JSON')
      return
    }

    try {
      await runChartOps(chartRef.current, parsedVlSpec, { ops: opsArray })
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
            onKeyDown={handleOpsKeyDown}
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

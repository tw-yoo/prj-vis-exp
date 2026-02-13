import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type React from 'react'
import './App.css'
import barSimpleSpecRaw from '../data/test/spec/example.json?raw'
// ChartQA/data/vlSpec/bar/simple/0o12tngadmjjux2n.json
// ../ChartQA/data/vlSpec/bar/grouped/0gacqohbzj07n25s.json?raw
import lineSimpleSpecRaw from '../data/test/spec/line_simple.json?raw'
import type { OperationSpec } from './types'
import { renderChart as renderChartDispatch } from './renderer/renderChart'
import { runChartOps } from './renderer/runChartOps'
import { clearAnnotations } from './renderer/common/d3Helpers'
import { runOpsPlan } from './renderer/ops/opsPlans'
import * as d3 from 'd3'
import type { ChartTypeValue, VegaLiteSpec } from './utils/chartRenderer'
import { getChartType } from './utils/chartRenderer'
import OpsBuilder from './opsBuilder/OpsBuilder'
import { collectOpsBuilderOptionSources, getEmptyOptionSources } from './opsBuilder/optionSources'
const ResultViewerPage = lazy(() => import('./survey/pages/ResultViewerPage'))
const ConsentPage = lazy(() => import('./survey/pages/ConsentPage'))
const PreRegistrationPage = lazy(() => import('./survey/pages/PreRegistrationPage'))
const MainSurveyPage = lazy(() => import('./survey/pages/MainSurveyPage'))
const DataCollectionPage = lazy(() => import('./survey/pages/DataCollectionPage'))

const vlSpecPlaceholder = barSimpleSpecRaw
// const vlSpecPlaceholder = lineSimpleSpecRaw

const EXPORT_SCALE = 3
const OPS_PLAN_MODULES = import.meta.glob('../data/expert/**/*.ts')

const canvasToBlob = (canvas: HTMLCanvasElement, type = 'image/png'): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob)
      } else {
        reject(new Error('Canvas export produced no data'))
      }
    }, type)
  })

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = (event) => {
      const type = typeof event === 'string' ? event : event?.type ?? 'error'
      reject(new Error(`Failed to load exported image (${type})`))
    }
    image.src = src
  })

const getSvgDimensions = (svg: SVGSVGElement) => {
  const rect = svg.getBoundingClientRect()
  const widthAttr = svg.getAttribute('width')
  const heightAttr = svg.getAttribute('height')
  const attrWidth = widthAttr ? parseFloat(widthAttr) : NaN
  const attrHeight = heightAttr ? parseFloat(heightAttr) : NaN
  return {
    width: rect.width || (Number.isFinite(attrWidth) ? attrWidth : 0) || 1,
    height: rect.height || (Number.isFinite(attrHeight) ? attrHeight : 0) || 1,
  }
}

async function createPngBlobFromSvg(svg: SVGSVGElement, scale: number) {
  const clone = svg.cloneNode(true) as SVGSVGElement
  const { width, height } = getSvgDimensions(svg)
  clone.setAttribute('width', String(width))
  clone.setAttribute('height', String(height))
  if (!clone.getAttribute('xmlns')) {
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  }

  const serialized = new XMLSerializer().serializeToString(clone)
  const blob = new Blob(['<?xml version="1.0" encoding="utf-8"?>\n', serialized], {
    type: 'image/svg+xml;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  try {
    const image = await loadImage(url)
    const exportWidth = Math.round(image.width * scale) || Math.max(1, Math.round(width * scale))
    const exportHeight = Math.round(image.height * scale) || Math.max(1, Math.round(height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = exportWidth
    canvas.height = exportHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('Canvas context not available for export')
    }
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, exportWidth, exportHeight)
    ctx.drawImage(image, 0, 0, exportWidth, exportHeight)
    return canvasToBlob(canvas)
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function createPngBlobFromCanvas(canvasEl: HTMLCanvasElement, scale: number) {
  const rect = canvasEl.getBoundingClientRect()
  const baseWidth = canvasEl.width || Math.round(rect.width) || 1
  const baseHeight = canvasEl.height || Math.round(rect.height) || 1
  const exportWidth = Math.round(baseWidth * scale)
  const exportHeight = Math.round(baseHeight * scale)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, exportWidth)
  canvas.height = Math.max(1, exportHeight)
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Canvas context not available for export')
  }
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(canvasEl, 0, 0, canvas.width, canvas.height)
  return canvasToBlob(canvas)
}

async function captureChartAsBlob(container: HTMLElement, scale: number) {
  const svg = container.querySelector('svg')
  if (svg instanceof SVGSVGElement) {
    return createPngBlobFromSvg(svg, scale)
  }

  const canvasEl = container.querySelector('canvas')
  if (canvasEl instanceof HTMLCanvasElement) {
    return createPngBlobFromCanvas(canvasEl, scale)
  }

  throw new Error('No SVG or canvas found inside the chart container')
}

const triggerDownload = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

function App() {
  const viewMode = useMemo(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get('view')
  }, [])
  const isSurveyView = useMemo(
    () =>
      viewMode === 'result-viewer' ||
      viewMode === 'consent' ||
      viewMode === 'pre-registration' ||
      viewMode === 'main-survey' ||
      viewMode === 'data-collection',
    [viewMode],
  )

  useEffect(() => {
    const className = 'survey-light-mode'
    if (isSurveyView) {
      document.body.classList.add(className)
      return () => {
        document.body.classList.remove(className)
      }
    }

    document.body.classList.remove(className)
    return undefined
  }, [isSurveyView])

  const surveyPage = useMemo(() => {
    switch (viewMode) {
      case 'result-viewer':
        return <ResultViewerPage />
      case 'consent':
        return <ConsentPage />
      case 'pre-registration':
        return <PreRegistrationPage />
      case 'main-survey':
        return <MainSurveyPage />
      case 'data-collection':
        return <DataCollectionPage />
      default:
        return null
    }
  }, [viewMode])

  if (surveyPage) {
    return (
      <Suspense fallback={<div className="app-shell">Loading survey page…</div>}>
        {surveyPage}
      </Suspense>
    )
  }

  return <ChartWorkbenchPage />
}

function ChartWorkbenchPage() {
  const [vlSpec, setVlSpec] = useState(vlSpecPlaceholder)
  const [builderGroups, setBuilderGroups] = useState<OperationSpec[][]>([])
  const [opsGroups, setOpsGroups] = useState<OperationSpec[][]>([])
  const [currentOpsIndex, setCurrentOpsIndex] = useState(-1)
  const [opsRunning, setOpsRunning] = useState(false)
  const chartRef = useRef<HTMLDivElement | null>(null)
  const [chartType, setChartType] = useState<ChartTypeValue | null>(null)
  const [opsErrors, setOpsErrors] = useState<Record<string, string>>({})
  const [opsValidationTick, setOpsValidationTick] = useState(0)
  const [lastValidatedTick, setLastValidatedTick] = useState(0)
  const [pendingRunOps, setPendingRunOps] = useState(false)
  const [optionSources, setOptionSources] = useState(getEmptyOptionSources)
  const [planPath, setPlanPath] = useState('')
  const [planGroups, setPlanGroups] = useState<OperationSpec[][] | null>(null)
  const [planError, setPlanError] = useState<string | null>(null)
  const [planLoading, setPlanLoading] = useState(false)
  const planModuleKeys = useMemo(() => Object.keys(OPS_PLAN_MODULES).sort(), [])
  const planOptions = useMemo(
    () =>
      planModuleKeys
        .map((key) => key.replace(/^\.\//, '').replace(/^\.\.\//, ''))
        .sort(),
    [planModuleKeys],
  )

  const sanitizeJsonInput = (value: string) => {
    if (!value) return value
    let text = value
    if (text.charCodeAt(0) === 0xfeff) {
      text = text.slice(1)
    }
    const normalized = text.replace(/\r\n/g, '\n')
    const lines = normalized.split('\n')
    const isBlankLine = (line: string) => line.trim() === ''
    const isMarkerLine = (line: string) => {
      const trimmed = line.trim()
      return trimmed === '---' || trimmed.startsWith('```')
    }

    let start = 0
    let end = lines.length

    const dropLeadingWhitespace = () => {
      while (start < end && isBlankLine(lines[start])) {
        start++
      }
    }
    const dropTrailingWhitespace = () => {
      while (start < end && isBlankLine(lines[end - 1])) {
        end--
      }
    }

    dropLeadingWhitespace()
    while (start < end && isMarkerLine(lines[start])) {
      start++
      dropLeadingWhitespace()
    }
    dropTrailingWhitespace()
    while (start < end && isMarkerLine(lines[end - 1])) {
      end--
      dropTrailingWhitespace()
    }

    return lines.slice(start, end).join('\n')
  }

  const renderChart = useCallback(
    async (specString: string): Promise<ChartTypeValue | null> => {
      try {
        const sanitizedSpec = sanitizeJsonInput(specString)
        const parsed = JSON.parse(sanitizedSpec) as VegaLiteSpec
        if (!chartRef.current) {
          alert('Chart container is not ready.')
          return null
        }
        await renderChartDispatch(chartRef.current, parsed)
        const inferred = getChartType(parsed as VegaLiteSpec)
        setChartType(inferred)
        setOptionSources(collectOpsBuilderOptionSources({ container: chartRef.current, spec: parsed as VegaLiteSpec }))
        return inferred
      } catch (error) {
        console.error('Failed to parse Vega-Lite spec', error)
        alert('Invalid JSON')
        return null
      }
    },
    []
  )

  const handleRenderChart = () => {
    const specString = vlSpec.trim() === '' ? vlSpecPlaceholder : vlSpec
    void renderChart(specString)
  }

  const handleOpsExportChange = (groups: OperationSpec[][], errors: Record<string, string>) => {
    setBuilderGroups(groups)
    setOpsErrors(errors)
    setLastValidatedTick(opsValidationTick)
  }

  const resolvePlanModuleKey = (input: string) => {
    const raw = input.trim()
    if (!raw) return null
    const withExt = raw.endsWith('.ts') ? raw : `${raw}.ts`
    const dataPath = withExt.startsWith('data/') ? `../${withExt}` : withExt
    const dotPath = dataPath.startsWith('./') ? dataPath : `./${dataPath}`
    if (dotPath in OPS_PLAN_MODULES) return dotPath
    if (dataPath in OPS_PLAN_MODULES) return dataPath
    if (withExt in OPS_PLAN_MODULES) return withExt
    const bySuffix = planModuleKeys.find((key) => key.endsWith(withExt))
    return bySuffix ?? null
  }

  const handleLoadPlan = async () => {
    if (!chartRef.current) return
    setPlanError(null)
    const resolvedKey = resolvePlanModuleKey(planPath)
    if (!resolvedKey) {
      setPlanError('Plan file not found.')
      return
    }
    const specString = vlSpec.trim() === '' ? vlSpecPlaceholder : vlSpec
    setPlanLoading(true)
    try {
      const sanitizedSpec = sanitizeJsonInput(specString)
      const parsedSpec = JSON.parse(sanitizedSpec) as VegaLiteSpec
      await renderChartDispatch(chartRef.current, parsedSpec)
      const loader = OPS_PLAN_MODULES[resolvedKey]
      if (!loader) {
        setPlanError('Plan loader not found.')
        return
      }
      const module = (await loader()) as { default?: unknown }
      if (!module?.default) {
        setPlanError('Plan file must export default.')
        return
      }
      const groups = await runOpsPlan(chartRef.current, parsedSpec, module.default as any)
      if (!groups.length) {
        setPlanError('Plan produced no operations.')
        return
      }
      setPlanGroups(groups)
      setCurrentOpsIndex(-1)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load plan.'
      setPlanError(message)
    } finally {
      setPlanLoading(false)
    }
  }

  const handleClearPlan = () => {
    setPlanGroups(null)
    setPlanError(null)
  }

  const handleRunOperations = () => {
    if (chartRef.current) {
      const svg = d3.select(chartRef.current).select('svg')
      if (!svg.empty()) clearAnnotations(svg)
    }
    setPendingRunOps(true)
    setOpsValidationTick((value) => value + 1)
  }

  const runOpsGroup = async (groupIndex: number) => {
    if (!chartRef.current) return
    const opsArray = opsGroups[groupIndex] ?? []
    if (!opsArray.length) return
    const specString = vlSpec.trim() === '' ? vlSpecPlaceholder : vlSpec
    await renderChart(specString)
    const sanitizedVlSpec = sanitizeJsonInput(specString)
    let parsedVlSpec: VegaLiteSpec

    try {
      parsedVlSpec = JSON.parse(sanitizedVlSpec) as VegaLiteSpec
    } catch (error) {
      console.error('Failed to parse Vega-Lite spec for operations', error)
      alert('Invalid Vega-Lite JSON')
      return
    }

    if (Object.keys(opsErrors).length > 0) {
      alert('Fix operation errors before running.')
      return
    }

    try {
      setOpsRunning(true)
      await runChartOps(chartRef.current, parsedVlSpec, { ops: opsArray })
    } catch (error) {
      console.error('Run Operations failed', error)
      alert('Failed to run operations. Check the console for details.')
    } finally {
      setOpsRunning(false)
    }
  }

  const handleStartOps = async () => {
    await runOpsGroup(0)
    setCurrentOpsIndex(0)
  }

  const handleNextOps = async () => {
    const nextIndex = currentOpsIndex + 1
    if (nextIndex >= opsGroups.length) return
    await runOpsGroup(nextIndex)
    setCurrentOpsIndex(nextIndex)
  }

  const handlePrevOps = async () => {
    const prevIndex = currentOpsIndex - 1
    if (prevIndex < 0) return
    await runOpsGroup(prevIndex)
    setCurrentOpsIndex(prevIndex)
  }

  const handleDownloadChart = useCallback(async () => {
    if (!chartRef.current) {
      alert('Chart container is not ready.')
      return
    }

    try {
      const blob = await captureChartAsBlob(chartRef.current, EXPORT_SCALE)
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      triggerDownload(blob, `chart-preview-${timestamp}.png`)
    } catch (error) {
      console.error('Failed to export chart as PNG', error)
      alert('Failed to generate PNG. Check the console for details.')
    }
  }, [])

  useEffect(() => {
    void renderChart(vlSpecPlaceholder)
  }, [renderChart])

  useEffect(() => {
    if (!pendingRunOps || lastValidatedTick !== opsValidationTick) return
    if (!planGroups && Object.keys(opsErrors).length > 0) {
      alert('Fix operation errors before running.')
      setPendingRunOps(false)
      return
    }
    const nextGroups = planGroups ?? builderGroups
    if (!nextGroups.length) {
      alert('No operations found.')
      setOpsGroups([])
      setCurrentOpsIndex(-1)
      setPendingRunOps(false)
      return
    }
    setOpsGroups(nextGroups)
    setCurrentOpsIndex(-1)
    setPendingRunOps(false)
  }, [pendingRunOps, opsErrors, builderGroups, planGroups, lastValidatedTick, opsValidationTick])

  return (
    <div className="app-shell">
      <div className="layout-body">
        <section className="card ops-card">
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

        <section className="card ops-card">
          <div className="card-header">
            <div className="card-title">Operations</div>
            {planGroups ? <div className="plan-badge">Plan mode</div> : null}
          </div>
          <div className="plan-loader">
            <label className="plan-label" htmlFor="ops-plan-path">
              OpsPlan
            </label>
            <input
              id="ops-plan-path"
              className="plan-input"
              list="ops-plan-options"
              placeholder="data/expert/e1/1_bar_simple_a_0o12tngadmjjux2n.ts"
              value={planPath}
              onChange={(event) => setPlanPath(event.target.value)}
            />
            <datalist id="ops-plan-options">
              {planOptions.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
            <button type="button" className="pill-btn" onClick={handleLoadPlan} disabled={planLoading}>
              {planLoading ? 'Loading…' : 'Load'}
            </button>
            <button type="button" className="pill-btn" onClick={handleClearPlan} disabled={!planGroups && !planError}>
              Clear
            </button>
          </div>
          {planError ? <div className="plan-error">{planError}</div> : null}
          <OpsBuilder
            chartType={chartType}
            onExportChange={handleOpsExportChange}
            optionSources={optionSources}
            validationTick={opsValidationTick}
          />
          <div className="ops-runbar">
            <button
              type="button"
              className="pill-btn"
              onClick={handleRunOperations}
              disabled={opsRunning || (!planGroups && Object.keys(opsErrors).length > 0)}
            >
              Run Operations
            </button>
          </div>
        </section>

        <section className="card">
          <div className="card-header chart-header">
            <div className="card-title">Chart Preview</div>
            <div className="chart-header-center">
              {opsGroups.length > 0 && currentOpsIndex === -1 ? (
                <button
                  type="button"
                  className="pill-btn"
                  onClick={handleStartOps}
                  disabled={opsRunning || (!planGroups && Object.keys(opsErrors).length > 0)}
                >
                  Start
                </button>
              ) : null}
            </div>
            <div className="chart-header-right">
              <button type="button" className="pill-btn" onClick={handleDownloadChart}>
                Save as PNG
              </button>
            </div>
          </div>
          <div className="chart-host" ref={chartRef} />
          {opsGroups.length > 0 && (
            <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-start' }}>
              {currentOpsIndex > 0 ? (
                <button
                  type="button"
                  className="pill-btn"
                  onClick={handlePrevOps}
                  disabled={opsRunning || Object.keys(opsErrors).length > 0}
                  style={{ marginLeft: 8 }}
                >
                  Prev
                </button>
              ) : null}
              {currentOpsIndex >= 0 && currentOpsIndex < opsGroups.length - 1 ? (
                <button
                  type="button"
                  className="pill-btn"
                  onClick={handleNextOps}
                  disabled={opsRunning || Object.keys(opsErrors).length > 0}
                  style={{ marginLeft: 8 }}
                >
                  Next
                </button>
              ) : null}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

export default App

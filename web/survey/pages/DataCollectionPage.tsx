import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { JsonValue, VegaLiteSpec } from '../../../src/api/types'
import { browserEngine } from '../../engine/createBrowserEngine'
import { OpenEndedInput, SurveyNav } from '../components'
import { fetchSurveyJson, fetchSurveyText, getDocument, patchDocument } from '../services'
import {
  buildDataCollectionPageDescriptors,
  computeProgressCurrent,
  computeProgressTotal,
} from '../engine/dataCollectionConfig'
import { tutorialExamplesData } from '../engine/tutorialExamplesData'
import './dataCollection.css'

const renderVegaLiteChart = browserEngine.renderVegaLiteChart

const DATA_COLLECTION_BASE = '/survey/data_collection'
const FIRESTORE_COLLECTION = 'data_collection'
const SESSION_STORAGE_KEY = 'data_collection_state_v1'
const SESSION_TTL_MS = 30 * 60 * 1000
const PAGE_QUERY_KEY = 'page'

const OFFLINE_MODE = (() => {
  const params = new URLSearchParams(window.location.search)
  const raw = params.get('offline')
  if (!raw) return false
  return raw === '1' || raw.toLowerCase() === 'true'
})()

interface TaskOpsSelection {
  selected: string[]
  others: string[]
}

interface TaskResponse {
  question: string
  explanation: string
  ops: TaskOpsSelection
}

type TaskResponseMap = Record<string, TaskResponse>
type AssignmentMap = Record<string, string[]>
type ChartSheetMap = Record<string, Record<string, string>>

interface OpsOption {
  value: string
  label?: string
  tip?: string
}

interface StoredSessionState {
  version: number
  idx: number
  participantCode: string | null
  draftParticipantCode: string
  assignedCharts: string[]
  tutorialCharts: string[]
  allResponses: TaskResponseMap
  tutorialResponses: TaskResponseMap
  lastUpdated: number
  expiresAt: number
}

const DEFAULT_OPS_OPTIONS: OpsOption[] = [
  { value: 'Retrieve Value', tip: 'Look up a single data point.' },
  { value: 'Filter', tip: 'Select data points that meet conditions.' },
  { value: 'Find Extremum', tip: 'Find the maximum or minimum value.' },
  { value: 'Determine Range', tip: 'Difference between max and min values.' },
  { value: 'Compare', tip: 'Compare values between two items/groups.' },
  { value: 'Sort', tip: 'Order data ascending or descending.' },
  { value: 'Sum', tip: 'Add values together.' },
  { value: 'Average', tip: 'Compute the mean of values.' },
  { value: 'Difference', tip: 'Subtract one value or group from another.' },
  { value: 'Nth', tip: 'Pick the 1st/2nd/3rd (or Nth) item after sorting.' },
  { value: 'Count', tip: 'Count the number of items that meet a condition.' },
]

const DETAILED_OPS_OPTIONS: OpsOption[] = [
  {
    value: 'Retrieve Value',
    label: 'Retrieve Value',
    tip: 'Get a specific value from the chart\n\nExamples:\n• GDP of USA in 2020\n• Sunny days in July\n• Sales for Product A in Q2',
  },
  {
    value: 'Filter',
    label: 'Filter',
    tip: 'Select data meeting conditions\n\nExamples:\n• By X-axis: Countries in Asia\n• By Y-axis: Values > 100\n• By Group: Only Group A\n• By Time: Years after 2015',
  },
  {
    value: 'Find Extremum',
    label: 'Find Extremum',
    tip: 'Find maximum or minimum value\n\nExamples:\n• Country with highest GDP\n• Month with lowest rainfall\n• Product with min sales',
  },
  {
    value: 'Determine Range',
    label: 'Determine Range',
    tip: 'Difference between max and min\n\nExamples:\n• Range of GDP values\n• Temperature range\n• Price variation',
  },
  {
    value: 'Compare',
    label: 'Compare',
    tip: 'Compare values between items\n\nExamples:\n• USA vs China GDP\n• Q1 vs Q2 sales\n• Group A vs Group B average',
  },
  {
    value: 'Sort',
    label: 'Sort',
    tip: 'Arrange data in order\n\nExamples:\n• Sort by GDP (descending)\n• Order by rainfall (ascending)\n• Rank products by sales',
  },
  {
    value: 'Sum',
    label: 'Sum',
    tip: 'Add multiple values together\n\nExamples:\n• Total GDP of Asian countries\n• Combined product sales\n• Total summer rainfall',
  },
  {
    value: 'Average',
    label: 'Average',
    tip: 'Calculate the mean of values\n\nExamples:\n• Average GDP across countries\n• Mean temperature in January\n• Average sales per quarter',
  },
  {
    value: 'Difference',
    label: 'Difference',
    tip: 'Subtract one value from another\n\nExamples:\n• USA GDP - China GDP\n• Q4 sales - Q1 sales\n• Max value - Min value',
  },
  {
    value: 'Nth',
    label: 'Nth',
    tip: 'Select the nth item after sorting\n\nExamples:\n• 3rd highest GDP country\n• 2nd lowest temp month\n• 5th ranked product',
  },
  {
    value: 'Count',
    label: 'Count',
    tip: 'Count items meeting a condition\n\nExamples:\n• Countries with GDP > 1000\n• Months with rain > 50mm\n• Products with sales < avg',
  },
]

function applyTooltipConfig(spec: VegaLiteSpec) {
  const clone: VegaLiteSpec = JSON.parse(JSON.stringify(spec))
  const config = (clone.config || {}) as Record<string, JsonValue>

  const patchMarkConfig = (key: 'mark' | 'bar' | 'line' | 'area' | 'point') => {
    const base = (config[key] || {}) as Record<string, JsonValue>
    if (base.tooltip === undefined) {
      base.tooltip = true
    }
    config[key] = base
  }

  patchMarkConfig('mark')
  patchMarkConfig('bar')
  patchMarkConfig('line')
  patchMarkConfig('area')
  patchMarkConfig('point')

  const patchNode = (node: Record<string, JsonValue>) => {
    const encoding = (node.encoding || {}) as Record<string, JsonValue>
    if (encoding.tooltip === undefined) {
      encoding.tooltip = { content: 'data' } as unknown as JsonValue
      node.encoding = encoding as unknown as JsonValue
    }
    const rawMark = node.mark
    if (typeof rawMark === 'string') {
      node.mark = { type: rawMark, tooltip: true } as unknown as JsonValue
    } else if (rawMark && typeof rawMark === 'object' && !Array.isArray(rawMark)) {
      const markObj = rawMark as Record<string, JsonValue>
      if (markObj.tooltip === undefined) {
        markObj.tooltip = true
      }
      node.mark = markObj as unknown as JsonValue
    }
  }

  patchNode(clone as unknown as Record<string, JsonValue>)
  if (Array.isArray(clone.layer)) {
    clone.layer = clone.layer.map((layer) => {
      const next = { ...(layer as Record<string, JsonValue>) }
      patchNode(next)
      return next
    })
  }

  clone.config = config
  return clone
}

function fitChartToContainer(container: HTMLElement) {
  if (!container) return
  const target = container.querySelector<SVGElement | HTMLCanvasElement>('svg, canvas')
  if (!target) return
  target.style.width = '100%'
  target.style.height = '100%'
  target.style.maxWidth = '100%'
  target.style.maxHeight = '100%'
}

function dataCollectionAssetPath(path: string) {
  const trimmed = (path || '').trim()
  if (!trimmed) return DATA_COLLECTION_BASE
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (trimmed.startsWith('/')) return trimmed
  return `${DATA_COLLECTION_BASE}/${trimmed.replace(/^\/+/, '')}`
}

function normalizeCode(code: string) {
  return code.replace(/[^0-9a-z]/gi, '').toUpperCase()
}

function normalizeTaskResponse(input?: Partial<TaskResponse> | null): TaskResponse {
  const selected = Array.isArray(input?.ops?.selected)
    ? input?.ops?.selected.filter((value): value is string => typeof value === 'string')
    : []
  const others = Array.isArray(input?.ops?.others)
    ? input?.ops?.others.filter((value): value is string => typeof value === 'string')
    : []
  return {
    question: typeof input?.question === 'string' ? input.question : '',
    explanation: typeof input?.explanation === 'string' ? input.explanation : '',
    ops: { selected, others },
  }
}

function parseChartId(chartId: string) {
  const parts = chartId.split('_')
  if (parts.length !== 3) return null
  return { type: parts[0], subtype: parts[1], file: parts[2] }
}

function chartSpecPathByChartId(chartId: string) {
  const parsed = parseChartId(chartId)
  if (!parsed) return null
  return `/ChartQA/data/vlSpec/${parsed.type}/${parsed.subtype}/${parsed.file}.json`
}

function normalizeSpecDataUrl(rawUrl: string | undefined) {
  if (!rawUrl || typeof rawUrl !== 'string') return rawUrl
  if (/^https?:\/\//i.test(rawUrl)) return rawUrl
  if (rawUrl.startsWith('/')) return rawUrl
  if (rawUrl.startsWith('ChartQA/')) return `/${rawUrl}`
  if (rawUrl.startsWith('pages/')) return dataCollectionAssetPath(rawUrl)
  if (rawUrl.startsWith('data/')) return `/ChartQA/${rawUrl}`
  return rawUrl
}

function patchSpecDataUrls(spec: VegaLiteSpec) {
  const clone: VegaLiteSpec = applyTooltipConfig(JSON.parse(JSON.stringify(spec)))
  if (clone.data && typeof clone.data.url === 'string') {
    clone.data.url = normalizeSpecDataUrl(clone.data.url)
  }
  if (Array.isArray(clone.layer)) {
    clone.layer = clone.layer.map((layer) => {
      const nextLayer = { ...(layer as Record<string, JsonValue>) }
      const layerData = nextLayer.data as { url?: string } | undefined
      if (layerData && typeof layerData.url === 'string') {
        nextLayer.data = { ...layerData, url: normalizeSpecDataUrl(layerData.url) } as unknown as JsonValue
      }
      return nextLayer
    })
  }
  return clone
}

function clampPageIndex(pageIndex: number, descriptorLength: number) {
  const max = Math.max(0, descriptorLength - 1)
  if (!Number.isFinite(pageIndex)) return 0
  return Math.max(0, Math.min(max, pageIndex))
}

function writePageToUrl(pageIndex: number, pushHistory: boolean) {
  const url = new URL(window.location.href)
  url.searchParams.set(PAGE_QUERY_KEY, String(pageIndex))
  const target = `${url.pathname}${url.search}${url.hash}`
  const state = { pageIndex }
  if (pushHistory) {
    window.history.pushState(state, '', target)
  } else {
    window.history.replaceState(state, '', target)
  }
}

function readStoredSession() {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredSessionState
    if (!Number.isFinite(parsed?.expiresAt) || parsed.expiresAt < Date.now()) {
      localStorage.removeItem(SESSION_STORAGE_KEY)
      return null
    }
    return parsed
  } catch {
    return null
  }
}

function persistSessionState(state: StoredSessionState) {
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Ignore persistence failure and keep in-memory flow.
  }
}

async function fetchParticipantResponses(code: string) {
  try {
    const doc = await getDocument([FIRESTORE_COLLECTION, code])
    const questions = doc?.fields?.questions
    if (!questions || typeof questions !== 'object' || Array.isArray(questions)) return {}
    const normalized: TaskResponseMap = {}
    Object.entries(questions as Record<string, unknown>).forEach(([chartId, value]) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return
      normalized[chartId] = normalizeTaskResponse(value as Partial<TaskResponse>)
    })
    return normalized
  } catch (error) {
    console.warn('Failed to fetch participant data', error)
    return {}
  }
}

async function saveParticipantResponses(code: string, responses: TaskResponseMap) {
  if (!code || OFFLINE_MODE) return
  await patchDocument([FIRESTORE_COLLECTION, code], {
    questions: responses as unknown as JsonValue,
    updatedAt: new Date().toISOString(),
  })
}

interface StaticPageProps {
  path: string
}

function StaticPage({ path }: StaticPageProps) {
  const [html, setHtml] = useState('')
  const [error, setError] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const text = await fetchSurveyText(`data_collection/${path}`, false)
        if (cancelled) return
        setHtml(text)
        setError(null)
      } catch (loadError) {
        if (cancelled) return
        const message = loadError instanceof Error ? loadError.message : String(loadError)
        setError(message)
        setHtml('')
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [path])

  useEffect(() => {
    let cancelled = false
    const renderPreviewChart = async () => {
      if (!rootRef.current) return
      const host = rootRef.current.querySelector<HTMLElement>('.tutorial-example-chart')
      const chartElement = rootRef.current.querySelector<HTMLElement>('#tutorial-chart-view')
      if (!host || !chartElement) return
      const rawSpecPath = host.dataset.specPath || 'pages/tutorial/tutorial_chart.json'
      try {
        const spec = await fetchSurveyJson<VegaLiteSpec>(`data_collection/${rawSpecPath}`, false)
        if (cancelled || !chartElement) return
        await renderVegaLiteChart(chartElement, patchSpecDataUrls(spec))
        fitChartToContainer(chartElement)
      } catch (chartError) {
        if (!cancelled && chartElement) {
          const message = chartError instanceof Error ? chartError.message : String(chartError)
          chartElement.innerHTML = `<div class="dc-error">Failed to load chart: ${message}</div>`
        }
      }
    }
    void renderPreviewChart()
    return () => {
      cancelled = true
    }
  }, [html])

  if (error) {
    return <div className="dc-error">Failed to load page: {error}</div>
  }

  return <div ref={rootRef} dangerouslySetInnerHTML={{ __html: html }} />
}

interface TutorialExamplePageProps {
  exampleId: string
}

function TutorialExamplePage({ exampleId }: TutorialExamplePageProps) {
  const example = tutorialExamplesData[exampleId]
  const chartRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (!chartRef.current || !example) return
      try {
        const spec = await fetchSurveyJson<VegaLiteSpec>(`data_collection/${example.specPath}`, false)
        if (cancelled || !chartRef.current) return
        await renderVegaLiteChart(chartRef.current, patchSpecDataUrls(spec))
        fitChartToContainer(chartRef.current)
      } catch (error) {
        if (!cancelled && chartRef.current) {
          const message = error instanceof Error ? error.message : String(error)
          chartRef.current.innerHTML = `<div class="dc-error">Failed to load chart: ${message}</div>`
        }
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [example])

  if (!example) {
    return <div className="dc-error">Missing tutorial example: {exampleId}</div>
  }

  return (
    <div className="page-content tutorial-page tutorial-page--example">
      <header className="tutorial-header">
        <p className="eyebrow">{`Tutorial Example ${example.order} of ${example.total}`}</p>
        <h1>{example.title}</h1>
        <div className="steps-box">
          <p>To successfully complete the study, please follow this steps:</p>
          <ol className="steps">
            <li><strong>Read</strong> the given chart carefully.</li>
            <li><strong>Create</strong> one compositional question whose answer can be obtained from the chart.</li>
            <li><strong>Explain</strong> the steps you would follow to get the answer, in order.</li>
            <li><strong>Mark</strong> which arithmetic operations you use.</li>
            <li><strong>Repeat</strong> these steps until you have created 20 questions in total.</li>
          </ol>
        </div>
        <div className="reminder">
          <strong>Important:</strong> Use tools to calculate the answer, but <strong>do not use LLMs to generate the question itself.</strong>
        </div>
      </header>

      <div className="example-grid">
        <section className="card chart-card">
          <div className="card-header">
            <h3>Chart</h3>
          </div>
          <div className="chart-host" ref={chartRef} />
        </section>

        <section className="card form-card">
          <div className="card-header">
            <h3>Example Question & Steps</h3>
          </div>
          <div className="form-body">
            <div className="example-answer">
              <div className="answer-section">
                <strong>1. Question:</strong>
                <div className="answer-text">{example.question}</div>
              </div>
              <div className="answer-section">
                <strong>2. Answer:</strong>
                <div className="answer-text">{example.answer}</div>
              </div>
              <div className="answer-section">
                <strong>3. Explanation (Step-by-step):</strong>
                <div className="answer-text explanation">{example.explanation}</div>
              </div>
              <div className="answer-section">
                <strong>4. Operations Used:</strong>
                <div className="ops-display">
                  {example.operations.map((operation) => (
                    <span key={operation} className="op-tag">{operation}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

interface TaskPageProps {
  chartId: string
  mode: 'tutorial' | 'main'
  response: TaskResponse
  opsOptions: OpsOption[]
  participantCode: string | null
  chartSheetMap: ChartSheetMap | null
  assignedCharts: string[]
  onSelectChart: (chartId: string) => void
  onChange: (next: TaskResponse) => void
}

function TaskPage({
  chartId,
  mode,
  response,
  opsOptions,
  participantCode,
  chartSheetMap,
  assignedCharts,
  onSelectChart,
  onChange,
}: TaskPageProps) {
  const chartRef = useRef<HTMLDivElement | null>(null)
  const [customOpInput, setCustomOpInput] = useState('')

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (!chartRef.current) return
      const specPath = chartSpecPathByChartId(chartId)
      if (!specPath) {
        chartRef.current.innerHTML = `<div class="dc-error">Invalid chart id: ${chartId}</div>`
        return
      }
      try {
        const res = await fetch(specPath, { cache: 'no-store' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const spec = (await res.json()) as VegaLiteSpec
        if (cancelled || !chartRef.current) return
        await renderVegaLiteChart(chartRef.current, patchSpecDataUrls(spec))
        fitChartToContainer(chartRef.current)
      } catch (error) {
        if (!cancelled && chartRef.current) {
          const message = error instanceof Error ? error.message : String(error)
          chartRef.current.innerHTML = `<div class="dc-error">Failed to load chart: ${message}</div>`
        }
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [chartId])

  useEffect(() => {
    if (!chartRef.current) return
    const host = chartRef.current
    const observer = new ResizeObserver(() => {
      fitChartToContainer(host)
    })
    observer.observe(host)
    return () => observer.disconnect()
  }, [])

  const selectedSet = useMemo(() => new Set(response.ops.selected), [response.ops.selected])
  const currentSheetUrl = useMemo(() => {
    if (!participantCode || !chartSheetMap || mode !== 'main') return ''
    return chartSheetMap[participantCode]?.[chartId] || ''
  }, [chartId, chartSheetMap, mode, participantCode])

  const onToggleOp = (value: string, checked: boolean) => {
    const nextSelected = checked
      ? Array.from(new Set([...response.ops.selected, value]))
      : response.ops.selected.filter((item) => item !== value)
    onChange({ ...response, ops: { ...response.ops, selected: nextSelected } })
  }

  const addCustomOp = () => {
    const normalized = customOpInput.trim()
    if (!normalized) return
    const exists = response.ops.others.some((value) => value.toLowerCase() === normalized.toLowerCase())
    if (exists) {
      setCustomOpInput('')
      return
    }
    onChange({
      ...response,
      ops: {
        ...response.ops,
        others: [...response.ops.others, normalized],
      },
    })
    setCustomOpInput('')
  }

  return (
    <div className={`page-content ${mode === 'tutorial' ? 'tutorial-task-page' : 'main-task-page'}`}>
      <div className="task-header">
        <h2>{mode === 'tutorial' ? 'Tutorial Practice' : 'Compositional Chart Question Generation'}</h2>
        {mode === 'main' && (
          <select className="chart-dropdown" value={chartId} onChange={(event) => onSelectChart(event.target.value)}>
            {assignedCharts.map((id, index) => (
              <option key={id} value={id}>{`${index + 1} / ${assignedCharts.length}: ${id}`}</option>
            ))}
          </select>
        )}
      </div>

      {mode === 'tutorial' && (
        <div className="tutorial-task-note">
          <p>This is a <strong>tutorial</strong>. Your input here will <strong>not be saved to the study responses</strong>.</p>
        </div>
      )}

      <div className="chart-input-grid">
        <section className="chart-container">
          <h3>Chart</h3>
          <div className="chart-host" ref={chartRef} />
        </section>

        <section className="input-container">
          <div className="response-header">
            <h3>{mode === 'tutorial' ? 'Your Response (Practice)' : 'Your Response'}</h3>
            <div className="help-btn-wrapper">
              <button type="button" className="help-btn" aria-label="Show examples">?</button>
              <div className="help-tooltip">
                <div className="tooltip-header">Examples: Good Questions</div>
                <div className="tooltip-example">
                  <div className="ex-title">Example 1</div>
                  <div className="ex-row"><span className="ex-label">Q:</span><span>What is the average of the top 3 countries by damage?</span></div>
                  <div className="ex-row"><span className="ex-label">Ops:</span><span className="ex-ops">Sort • Nth • Average</span></div>
                </div>
                <div className="tooltip-example">
                  <div className="ex-title">Example 2</div>
                  <div className="ex-row"><span className="ex-label">Q:</span><span>How many years are above the average?</span></div>
                  <div className="ex-row"><span className="ex-label">Ops:</span><span className="ex-ops">Average • Filter • Count</span></div>
                </div>
                <div className="tooltip-example">
                  <div className="ex-title">Example 3</div>
                  <div className="ex-row"><span className="ex-label">Q:</span><span>Difference between max in Group A and min in Group B?</span></div>
                  <div className="ex-row"><span className="ex-label">Ops:</span><span className="ex-ops">Filter • Find Extremum • Difference</span></div>
                </div>
              </div>
            </div>
          </div>

          <OpenEndedInput
            id={`q-question-${mode}`}
            labelText="1. Your Question"
            placeholder="Enter your question here..."
            multiline
            required
            value={response.question}
            onChange={(value) => onChange({ ...response, question: value })}
          />

          <OpenEndedInput
            id={`q-explanation-${mode}`}
            labelText="2. Step-by-Step Explanation to Get the Answer"
            placeholder={'1. ...\n2. ...\n3. ...'}
            multiline
            required
            value={response.explanation}
            onChange={(value) => onChange({ ...response, explanation: value })}
          />

          <div className="ops-reference">
            <div className="ops-reference__title">Available operations (for reference)</div>
            <div className="ops-reference__tags">
              {opsOptions.map((option) => (
                <span key={`ref_${option.value}`} className="op-tag" data-tip={option.tip || ''}>
                  {option.label || option.value}
                </span>
              ))}
            </div>
          </div>

          <div className="qa-review">
            <div className="qa-review-item">
              <div className="qa-review-label">1. Your Question</div>
              <div className="qa-review-text">{response.question.trim() || 'No question yet.'}</div>
            </div>
            <div className="qa-review-item">
              <div className="qa-review-label">2. Explanation (Step-by-step)</div>
              <div className="qa-review-text">{response.explanation.trim() || 'No explanation yet.'}</div>
            </div>
          </div>

          <div className="ops-checklist">
            <label className="question">3. Operations Used (multiple)</label>
            <div className="ops-checklist-body">
              {opsOptions.map((option) => (
                <label key={option.value} className="ops-check" data-tip={option.tip || ''}>
                  <input
                    type="checkbox"
                    value={option.value}
                    checked={selectedSet.has(option.value)}
                    onChange={(event) => onToggleOp(option.value, event.target.checked)}
                  />
                  <span>{option.label || option.value}</span>
                </label>
              ))}
            </div>
            <div className="ops-custom">
              <label className="question optional-question" htmlFor={`ops-custom-input-${mode}`}>Add/Remove custom operations</label>
              <div className="ops-custom-input-row">
                <input
                  id={`ops-custom-input-${mode}`}
                  type="text"
                  placeholder="Add an operation and press + or Enter"
                  value={customOpInput}
                  onChange={(event) => setCustomOpInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      addCustomOp()
                    }
                  }}
                />
                <button type="button" className="ops-custom-add" aria-label="Add custom operation" onClick={addCustomOp}>+</button>
              </div>
              <div className="ops-custom-list">
                {response.ops.others.map((value) => (
                  <div key={value} className="ops-chip" data-value={value}>
                    <span className="ops-chip__label">{value}</span>
                    <button
                      type="button"
                      className="ops-chip__remove"
                      aria-label={`Remove ${value}`}
                      onClick={() => {
                        onChange({
                          ...response,
                          ops: { ...response.ops, others: response.ops.others.filter((item) => item !== value) },
                        })
                      }}
                    >
                      -
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="data-link-row">
            <button
              type="button"
              className="data-link-btn"
              disabled={!currentSheetUrl}
              onClick={() => {
                if (!currentSheetUrl) return
                window.open(currentSheetUrl, '_blank', 'noopener,noreferrer')
              }}
            >
              data link
            </button>
            <span className="data-link-hint">{currentSheetUrl ? '(opens in a new tab)' : '(not available)'}</span>
          </div>
        </section>
      </div>
    </div>
  )
}

export default function DataCollectionPage() {
  const [initializing, setInitializing] = useState(true)
  const [loadingError, setLoadingError] = useState<string | null>(null)

  const [assignments, setAssignments] = useState<AssignmentMap | null>(null)
  const [chartSheetMap, setChartSheetMap] = useState<ChartSheetMap | null>(null)
  const [opsOptions, setOpsOptions] = useState<OpsOption[]>(DEFAULT_OPS_OPTIONS)

  const [participantCode, setParticipantCode] = useState<string | null>(null)
  const [draftParticipantCode, setDraftParticipantCode] = useState('')
  const [assignedCharts, setAssignedCharts] = useState<string[]>([])
  const [tutorialCharts, setTutorialCharts] = useState<string[]>([])
  const [mainResponses, setMainResponses] = useState<TaskResponseMap>({})
  const [tutorialResponses, setTutorialResponses] = useState<TaskResponseMap>({})

  const descriptors = useMemo(
    () => buildDataCollectionPageDescriptors(assignedCharts, tutorialCharts),
    [assignedCharts, tutorialCharts],
  )
  const [pageIndex, setPageIndex] = useState(0)
  const [navigationLocked, setNavigationLocked] = useState(false)

  const currentDescriptor = descriptors[pageIndex]

  const persistSession = useCallback(
    (targetPageIndex: number = pageIndex) => {
      const snapshot: StoredSessionState = {
        version: 1,
        idx: targetPageIndex,
        participantCode,
        draftParticipantCode,
        assignedCharts,
        tutorialCharts,
        allResponses: mainResponses,
        tutorialResponses,
        lastUpdated: Date.now(),
        expiresAt: Date.now() + SESSION_TTL_MS,
      }
      persistSessionState(snapshot)
    },
    [assignedCharts, draftParticipantCode, mainResponses, pageIndex, participantCode, tutorialCharts, tutorialResponses],
  )

  const initializeFromParticipant = useCallback(
    async (code: string, sourcePageIndex: number | null = null) => {
      const normalized = normalizeCode(code)
      if (!normalized || !assignments?.[normalized]) return false

      const assigned = assignments[normalized] || []
      const tutorialList = Array.isArray(assignments.TUTORIAL) ? assignments.TUTORIAL : []
      const remote = await fetchParticipantResponses(normalized)
      const descriptorsForCode = buildDataCollectionPageDescriptors(assigned, tutorialList)
      const nextPage = clampPageIndex(sourcePageIndex ?? 1, descriptorsForCode.length)

      setParticipantCode(normalized)
      setDraftParticipantCode(normalized)
      setAssignedCharts(assigned)
      setTutorialCharts(tutorialList)
      setMainResponses(remote)
      setTutorialResponses({})
      setPageIndex(nextPage)
      writePageToUrl(nextPage, false)
      return true
    },
    [assignments],
  )

  useEffect(() => {
    let cancelled = false
    const init = async () => {
      try {
        const [assignmentJson, chartSheetJson, opsJson] = await Promise.all([
          fetchSurveyJson<AssignmentMap>('data_collection/participant_assignments.json', false),
          fetchSurveyJson<ChartSheetMap>('data_collection/chart_sheet_map.json', false),
          fetchSurveyJson<JsonValue>('data_collection/ops_options.json', false),
        ])
        if (cancelled) return

        setAssignments(assignmentJson)
        setChartSheetMap(chartSheetJson)
        const opsObject =
          opsJson && typeof opsJson === 'object' && !Array.isArray(opsJson)
            ? (opsJson as { ops?: JsonValue })
            : null
          const parsedOps =
            opsObject && Array.isArray(opsObject.ops)
              ? opsObject.ops
                .filter((option): option is JsonValue => !!option && typeof option === 'object' && !Array.isArray(option))
                .map((option) => {
                  const raw = option as Record<string, JsonValue>
                  return {
                    value: typeof raw.value === 'string' ? raw.value : '',
                    label: typeof raw.label === 'string' ? raw.label : undefined,
                    tip: typeof raw.tip === 'string' ? raw.tip : undefined,
                  } satisfies OpsOption
                })
                .filter((option) => option.value)
            : []
        setOpsOptions(parsedOps.length > 0 ? parsedOps : DETAILED_OPS_OPTIONS)

        const urlParams = new URLSearchParams(window.location.search)
        const codeFromQuery = normalizeCode(urlParams.get('code') || '')
        const pageFromQuery = Number(urlParams.get(PAGE_QUERY_KEY))

        if (codeFromQuery && assignmentJson?.[codeFromQuery]) {
          const assigned = assignmentJson[codeFromQuery] || []
          const tutorialList = Array.isArray(assignmentJson.TUTORIAL) ? assignmentJson.TUTORIAL : []
          const remote = await fetchParticipantResponses(codeFromQuery)
          if (cancelled) return
          const nextDescriptors = buildDataCollectionPageDescriptors(assigned, tutorialList)
          const initialPage = clampPageIndex(pageFromQuery, nextDescriptors.length)
          setParticipantCode(codeFromQuery)
          setDraftParticipantCode(codeFromQuery)
          setAssignedCharts(assigned)
          setTutorialCharts(tutorialList)
          setMainResponses(remote)
          setTutorialResponses({})
          setPageIndex(initialPage)
          writePageToUrl(initialPage, false)
          setInitializing(false)
          return
        }

        const stored = readStoredSession()
        if (stored && stored.participantCode && assignmentJson?.[stored.participantCode]) {
          const assigned = assignmentJson[stored.participantCode] || []
          const tutorialList = Array.isArray(assignmentJson.TUTORIAL)
            ? assignmentJson.TUTORIAL
            : Array.isArray(stored.tutorialCharts)
              ? stored.tutorialCharts
              : []
          const remote = await fetchParticipantResponses(stored.participantCode)
          if (cancelled) return
          const mergedResponses = { ...remote, ...(stored.allResponses || {}) }
          const nextDescriptors = buildDataCollectionPageDescriptors(assigned, tutorialList)
          const initialPage = clampPageIndex(stored.idx, nextDescriptors.length)
          setParticipantCode(stored.participantCode)
          setDraftParticipantCode(stored.draftParticipantCode || stored.participantCode)
          setAssignedCharts(assigned)
          setTutorialCharts(tutorialList)
          setMainResponses(mergedResponses)
          setTutorialResponses(stored.tutorialResponses || {})
          setPageIndex(initialPage)
          writePageToUrl(initialPage, false)
          setInitializing(false)
          return
        }

        const tutorialList = Array.isArray(assignmentJson.TUTORIAL) ? assignmentJson.TUTORIAL : []
        setTutorialCharts(tutorialList)
        const initialPage = clampPageIndex(pageFromQuery, 1)
        setPageIndex(initialPage)
        writePageToUrl(initialPage, false)
        setInitializing(false)
      } catch (error) {
        if (cancelled) return
        const message = error instanceof Error ? error.message : String(error)
        setLoadingError(message)
        setInitializing(false)
      }
    }
    void init()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      const target = typeof event.state?.pageIndex === 'number' ? event.state.pageIndex : Number(new URLSearchParams(window.location.search).get(PAGE_QUERY_KEY))
      setPageIndex(clampPageIndex(target, descriptors.length))
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [descriptors.length])

  useEffect(() => {
    if (initializing) return
    persistSession(pageIndex)
  }, [assignedCharts, draftParticipantCode, initializing, mainResponses, pageIndex, participantCode, persistSession, tutorialCharts, tutorialResponses])

  useEffect(() => {
    const onUnload = () => persistSession(pageIndex)
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [pageIndex, persistSession])

  const previewTotalPages = useMemo(() => {
    const code = normalizeCode(draftParticipantCode)
    if (!assignments?.[code]) {
      return computeProgressTotal(buildDataCollectionPageDescriptors([], tutorialCharts))
    }
    return computeProgressTotal(buildDataCollectionPageDescriptors(assignments[code], tutorialCharts))
  }, [assignments, draftParticipantCode, tutorialCharts])

  const currentTaskResponse = useMemo(() => {
    if (currentDescriptor?.kind !== 'task') return normalizeTaskResponse()
    const sourceMap = currentDescriptor.mode === 'main' ? mainResponses : tutorialResponses
    return normalizeTaskResponse(sourceMap[currentDescriptor.chartId])
  }, [currentDescriptor, mainResponses, tutorialResponses])

  const updateCurrentTaskResponse = (next: TaskResponse) => {
    if (!currentDescriptor || currentDescriptor.kind !== 'task') return
    if (currentDescriptor.mode === 'main') {
      setMainResponses((previous) => ({ ...previous, [currentDescriptor.chartId]: normalizeTaskResponse(next) }))
      return
    }
    setTutorialResponses((previous) => ({ ...previous, [currentDescriptor.chartId]: normalizeTaskResponse(next) }))
  }

  const persistMainResponses = useCallback(async () => {
    if (!participantCode || OFFLINE_MODE) return
    try {
      await saveParticipantResponses(participantCode, mainResponses)
    } catch (error) {
      console.error('Failed to save responses', error)
      alert('Error saving progress. Please check your connection and try again.')
    }
  }, [mainResponses, participantCode])

  const validateTaskPage = useCallback(() => {
    if (!currentDescriptor || currentDescriptor.kind !== 'task') return true
    const current = currentTaskResponse
    if (!current.question.trim()) {
      alert('Please enter your question.')
      return false
    }
    if (!current.explanation.trim()) {
      alert('Please enter the explanation.')
      return false
    }
    return true
  }, [currentDescriptor, currentTaskResponse])

  const navigateToPage = useCallback(
    async (targetIndex: number, pushHistory = true) => {
      if (navigationLocked) return
      const nextIndex = clampPageIndex(targetIndex, descriptors.length)
      if (nextIndex === pageIndex) return
      setNavigationLocked(true)
      try {
        if (currentDescriptor?.kind === 'task' && currentDescriptor.mode === 'main') {
          await persistMainResponses()
        }
        persistSession(nextIndex)
        setPageIndex(nextIndex)
        writePageToUrl(nextIndex, pushHistory)
      } finally {
        setNavigationLocked(false)
      }
    },
    [currentDescriptor, descriptors.length, navigationLocked, pageIndex, persistMainResponses, persistSession],
  )

  const handleNext = useCallback(async () => {
    if (!currentDescriptor || navigationLocked) return

    if (currentDescriptor.kind === 'login') {
      const code = normalizeCode(draftParticipantCode)
      if (!code) {
        alert('Please enter a code.')
        return
      }
      if (code.length !== 6) {
        alert('Please enter a 6-character participant code.')
        return
      }
      if (!assignments?.[code]) {
        alert('Invalid participant code.')
        return
      }
      setNavigationLocked(true)
      try {
        const initialized = await initializeFromParticipant(code, pageIndex + 1)
        if (!initialized) {
          alert('Failed to initialize participant session.')
        }
      } finally {
        setNavigationLocked(false)
      }
      return
    }

    if (currentDescriptor.kind === 'task' && !validateTaskPage()) {
      return
    }

    if (currentDescriptor.kind === 'complete') {
      setParticipantCode(null)
      setAssignedCharts([])
      setMainResponses({})
      setTutorialResponses({})
      setPageIndex(0)
      writePageToUrl(0, false)
      return
    }

    await navigateToPage(pageIndex + 1, true)
  }, [
    assignments,
    currentDescriptor,
    draftParticipantCode,
    initializeFromParticipant,
    navigateToPage,
    navigationLocked,
    pageIndex,
    validateTaskPage,
  ])

  const handlePrev = useCallback(async () => {
    await navigateToPage(pageIndex - 1, true)
  }, [navigateToPage, pageIndex])

  if (initializing) {
    return <div className="dc-loading">Loading data collection flow...</div>
  }

  if (loadingError) {
    return <div className="dc-error">Failed to initialize data collection flow: {loadingError}</div>
  }

  const progressTotal = computeProgressTotal(descriptors)
  const progressCurrent = computeProgressCurrent(descriptors, pageIndex)
  const hidePrev = currentDescriptor?.id === 'login'
  const showNav = currentDescriptor?.kind !== 'complete'

  return (
    <div className="dc-shell">
      <div className="dc-content">
        {currentDescriptor?.kind === 'login' && (
          <div className="page-content">
            <h1>Compositional Chart Question Generation</h1>
            <p>Thank you for your interest in our study.</p>
            <h3>Enter Your Participant Code</h3>
            <OpenEndedInput
              id="participant-code"
              labelText="Participant Code"
              placeholder="e.g., ABCDEF"
              value={draftParticipantCode}
              required
              onChange={(value) => setDraftParticipantCode(normalizeCode(value))}
            />
            <p className="subtle-note">After entering your code, click <strong>Next</strong> to continue.</p>
            <p className="subtle-note">{`Estimated pages after login: ${previewTotalPages}`}</p>
          </div>
        )}

        {currentDescriptor?.kind === 'static' && <StaticPage path={currentDescriptor.path} />}

        {currentDescriptor?.kind === 'tutorial-example' && <TutorialExamplePage exampleId={currentDescriptor.exampleId} />}

        {currentDescriptor?.kind === 'task' && (
          <TaskPage
            chartId={currentDescriptor.chartId}
            mode={currentDescriptor.mode}
            response={currentTaskResponse}
            opsOptions={opsOptions}
            participantCode={participantCode}
            chartSheetMap={chartSheetMap}
            assignedCharts={assignedCharts}
            onSelectChart={(chartId) => {
              if (currentDescriptor.mode !== 'main') return
              const targetIndex = descriptors.findIndex(
                (descriptor) =>
                  descriptor.kind === 'task' && descriptor.mode === 'main' && descriptor.chartId === chartId,
              )
              if (targetIndex >= 0) {
                void navigateToPage(targetIndex, true)
              }
            }}
            onChange={updateCurrentTaskResponse}
          />
        )}

        {currentDescriptor?.kind === 'complete' && (
          <div className="page-content">
            <h1>Thank You!</h1>
            <p>Thank you for your participation. All your responses have been successfully saved.</p>
            <p>You may now close this window.</p>
            <div className="completion-actions">
              <button type="button" className="button" onClick={() => void handleNext()}>Back to the main page</button>
            </div>
          </div>
        )}
      </div>

      {showNav && (
        <SurveyNav
          align={currentDescriptor?.id === 'login' ? 'start' : 'center'}
          hidePrev={hidePrev}
          onPrev={() => void handlePrev()}
          onNext={() => void handleNext()}
          prevDisabled={navigationLocked || pageIndex === 0}
          nextDisabled={navigationLocked}
          nextLabel="Next"
          totalPages={currentDescriptor?.id === 'login' ? null : progressTotal}
          currentPage={currentDescriptor?.id === 'login' ? null : progressCurrent}
          showProgress={currentDescriptor?.id !== 'login'}
        />
      )}
    </div>
  )
}

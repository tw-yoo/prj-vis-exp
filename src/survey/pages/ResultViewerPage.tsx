import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { JsonValue } from '../../types'
import type { VegaLiteSpec } from '../../utils/chartRenderer'
import { listDocuments } from '../services'
import { renderChart } from '../../renderer/renderChart'
import './resultViewer.css'

type SubmissionRecord = {
  id: string
  fields: Record<string, JsonValue>
}

type QuestionPayload = {
  question?: string
  answer?: string
  explanation?: string
}

function parseQuestions(fields: Record<string, JsonValue>): Record<string, QuestionPayload> {
  const raw = fields.questions
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Record<string, QuestionPayload> = {}
  Object.entries(raw as Record<string, JsonValue>).forEach(([chartId, value]) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return
    const item = value as Record<string, JsonValue>
    out[chartId] = {
      question: typeof item.question === 'string' ? item.question : '',
      answer: typeof item.answer === 'string' ? item.answer : '',
      explanation: typeof item.explanation === 'string' ? item.explanation : '',
    }
  })
  return out
}

async function loadChartSpecById(chartId: string): Promise<VegaLiteSpec> {
  const candidates = [
    `/survey/data/vlSpec/${chartId}.json`,
    `/survey/data/vlSpec/ch_${chartId}.json`,
    `/survey/data/vlSpec/ch_${chartId.replace(/^op_/, '')}.json`,
  ]

  let lastError: Error | null = null
  for (const url of candidates) {
    try {
      const res = await fetch(url, { cache: 'no-store' })
      if (res.status === 404) continue
      if (!res.ok) {
        lastError = new Error(`Failed to load spec ${url} (HTTP ${res.status})`)
        continue
      }
      return (await res.json()) as VegaLiteSpec
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
    }
  }
  throw lastError || new Error(`Chart spec not found for chartId="${chartId}"`)
}

export default function ResultViewerPage() {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [renderError, setRenderError] = useState<string | null>(null)
  const [submissions, setSubmissions] = useState<SubmissionRecord[]>([])
  const [selectedChartId, setSelectedChartId] = useState<string | null>(null)
  const chartRef = useRef<HTMLDivElement | null>(null)

  const chartIds = useMemo(() => {
    const set = new Set<string>()
    submissions.forEach((submission) => {
      Object.keys(parseQuestions(submission.fields)).forEach((chartId) => set.add(chartId))
    })
    return Array.from(set).sort()
  }, [submissions])

  const selectedSubmissions = useMemo(() => {
    if (!selectedChartId) return []
    return submissions.filter((submission) => {
      const q = parseQuestions(submission.fields)[selectedChartId]
      return !!(q && (q.question || q.answer || q.explanation))
    })
  }, [selectedChartId, submissions])

  const loadViewerData = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const docs = (await listDocuments(['data_collection'])) as Array<{
        id: string
        fields: Record<string, JsonValue>
      }>
      const normalized = docs.map((doc) => ({
        id: doc.id,
        fields: (doc.fields || {}) as Record<string, JsonValue>,
      }))
      setSubmissions(normalized)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setLoadError(message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadViewerData()
  }, [loadViewerData])

  useEffect(() => {
    const hashValue = window.location.hash.replace('#', '')
    if (hashValue) {
      setSelectedChartId(hashValue)
      return
    }
    if (!selectedChartId && chartIds.length > 0) {
      setSelectedChartId(chartIds[0])
    }
  }, [chartIds, selectedChartId])

  useEffect(() => {
    const onHashChange = () => {
      const hashValue = window.location.hash.replace('#', '')
      setSelectedChartId(hashValue || null)
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  useEffect(() => {
    const run = async () => {
      setRenderError(null)
      if (!chartRef.current || !selectedChartId) return
      try {
        const spec = await loadChartSpecById(selectedChartId)
        await renderChart(chartRef.current, spec)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        setRenderError(message)
        if (chartRef.current) chartRef.current.innerHTML = ''
      }
    }
    void run()
  }, [selectedChartId])

  return (
    <div className="viewer-shell">
      <aside className="viewer-sidebar">
        <h3>Collected Charts</h3>
        {loading && <p>Loading chart list...</p>}
        {loadError && <p className="viewer-error">{loadError}</p>}
        {!loading && !loadError && chartIds.length === 0 && <p>No submissions found yet.</p>}
        {!loading && !loadError && chartIds.length > 0 && (
          <div className="viewer-links">
            {chartIds.map((chartId) => (
              <a
                key={chartId}
                href={`#${chartId}`}
                className={chartId === selectedChartId ? 'selected' : ''}
                onClick={() => setSelectedChartId(chartId)}
              >
                {chartId}
              </a>
            ))}
          </div>
        )}
      </aside>

      <section className="viewer-content">
        <div className="viewer-chart" ref={chartRef}>
          {!selectedChartId && <p>Select a chart from the list on the left.</p>}
        </div>
        {renderError && <p className="viewer-error">{renderError}</p>}
        <hr />
        <h3>Submissions</h3>
        {selectedChartId && selectedSubmissions.length === 0 && <p>No submissions found for this chart yet.</p>}
        <div className="viewer-submissions">
          {selectedSubmissions.map((submission) => {
            const item = parseQuestions(submission.fields)[selectedChartId!]
            return (
              <article key={submission.id} className="viewer-submission">
                <h4>
                  Participant: <span>{submission.id}</span>
                </h4>
                <strong>Question:</strong>
                <pre>{item?.question || '(No submission)'}</pre>
                <strong>Answer:</strong>
                <pre>{item?.answer || '(No submission)'}</pre>
                <strong>Explanation:</strong>
                <pre>{item?.explanation || '(No submission)'}</pre>
              </article>
            )
          })}
        </div>
      </section>
    </div>
  )
}

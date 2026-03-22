import { useEffect, useRef, useState } from 'react'
import '../../App.css'
import type { VegaLiteSpec } from '../../../src/api/types'
import { browserEngine } from '../../engine/createBrowserEngine'
import { csvParse } from 'd3'

// ── Spec map built once at module level ────────────────────────────────────
const CHART_SPEC_MODULES = import.meta.glob('../../../ChartQA/data/vlSpec/**/*.json', {
  as: 'raw',
}) as Record<string, () => Promise<string>>

const SPEC_MAP = new Map<string, () => Promise<string>>()
for (const [key, loader] of Object.entries(CHART_SPEC_MODULES)) {
  const id = key.split('/').pop()?.replace('.json', '')
  if (id) SPEC_MAP.set(id, loader)
}

// ── URL normalisation helpers (mirrored from SpecTestPage) ─────────────────
function normalizeSpecDataUrl(rawUrl: string | undefined): string | undefined {
  if (!rawUrl || typeof rawUrl !== 'string') return rawUrl
  if (/^https?:\/\//i.test(rawUrl)) return rawUrl
  if (rawUrl.startsWith('/')) return rawUrl
  if (rawUrl.startsWith('ChartQA/')) return `/${rawUrl}`
  if (rawUrl.startsWith('data/test/')) return `/${rawUrl}`
  if (rawUrl.startsWith('data/')) return `/ChartQA/${rawUrl}`
  return rawUrl
}

function patchSpecDataUrls(spec: VegaLiteSpec): VegaLiteSpec {
  const clone: VegaLiteSpec = JSON.parse(JSON.stringify(spec)) as VegaLiteSpec
  if (clone.data && typeof (clone.data as { url?: unknown }).url === 'string') {
    ;(clone.data as { url?: string }).url = normalizeSpecDataUrl(
      (clone.data as { url?: string }).url,
    )
  }
  if (Array.isArray(clone.layer)) {
    clone.layer = clone.layer.map((layer) => {
      const nextLayer = { ...(layer as Record<string, unknown>) }
      const layerData = nextLayer.data as { url?: unknown } | undefined
      if (layerData && typeof layerData.url === 'string') {
        nextLayer.data = {
          ...layerData,
          url: normalizeSpecDataUrl(layerData.url),
        } as unknown as VegaLiteSpec['data']
      }
      return nextLayer
    }) as unknown as VegaLiteSpec['layer']
  }
  return clone
}

// ── State types ────────────────────────────────────────────────────────────
type PageState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'loaded'
      chartId: string
      spec: VegaLiteSpec
      specRaw: string
      csvRows: Record<string, string>[]
      csvColumns: string[]
    }

// ── CSV table sub-component ────────────────────────────────────────────────
function CsvTable({
  rows,
  columns,
}: {
  rows: Record<string, string>[]
  columns: string[]
}) {
  if (!rows.length) {
    return <p style={{ color: '#94a3b8', fontSize: 13, margin: 0 }}>No data</p>
  }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: 13,
          color: '#e2e8f0',
        }}
      >
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col}
                style={{
                  textAlign: 'left',
                  padding: '6px 10px',
                  borderBottom: '1px solid #1f2937',
                  color: '#94a3b8',
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                }}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              style={{
                borderBottom: '1px solid #1f2937',
                background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
              }}
            >
              {columns.map((col) => (
                <td key={col} style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}>
                  {row[col] ?? ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Main page component ────────────────────────────────────────────────────
export default function DataPage() {
  const [inputId, setInputId] = useState('')
  const [pageState, setPageState] = useState<PageState>({ status: 'idle' })
  const [specOpen, setSpecOpen] = useState(true)
  const [showAllRows, setShowAllRows] = useState(false)
  const chartRef = useRef<HTMLDivElement | null>(null)

  async function handleSearch() {
    const id = inputId.trim()
    if (!id) return
    setPageState({ status: 'loading' })
    setSpecOpen(false)
    setShowAllRows(false)

    const loader = SPEC_MAP.get(id)
    if (!loader) {
      setPageState({ status: 'error', message: `Chart ID not found: "${id}"` })
      return
    }

    try {
      const raw = await loader()
      const parsed = JSON.parse(raw) as VegaLiteSpec
      const patched = patchSpecDataUrls(parsed)

      // Derive CSV URL from patched spec
      const csvUrl =
        normalizeSpecDataUrl((patched.data as { url?: string } | undefined)?.url) ?? ''
      const csvText = await fetch(csvUrl).then((r) => r.text())
      const csvData = csvParse(csvText)

      setPageState({
        status: 'loaded',
        chartId: id,
        spec: patched,
        specRaw: JSON.stringify(parsed, null, 2),
        csvRows: csvData as unknown as Record<string, string>[],
        csvColumns: csvData.columns,
      })
    } catch (err) {
      setPageState({
        status: 'error',
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }

  // Render chart whenever loaded state changes
  useEffect(() => {
    if (pageState.status !== 'loaded' || !chartRef.current) return
    void browserEngine.renderVegaLiteChart(chartRef.current, pageState.spec)
  }, [pageState])

  const loaded = pageState.status === 'loaded' ? pageState : null
  const visibleRows = loaded
    ? showAllRows
      ? loaded.csvRows
      : loaded.csvRows.slice(0, 10)
    : []

  return (
    <div className="app-shell">
      <div className="layout-body">
        {/* ── Input card ── */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Data Explorer</span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              className="plan-input"
              placeholder="Enter chart ID (e.g. 0a5npu4o61dz4r5f)..."
              value={inputId}
              onChange={(e) => setInputId(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSearch()
              }}
            />
            <button
              className="pill-btn"
              onClick={() => void handleSearch()}
              disabled={pageState.status === 'loading'}
            >
              {pageState.status === 'loading' ? 'Loading…' : 'Search'}
            </button>
          </div>
          {pageState.status === 'error' && (
            <div className="plan-error" style={{ marginTop: 10 }}>
              {pageState.message}
            </div>
          )}
        </div>

        {/* ── Results (shown only when loaded) ── */}
        {loaded && (
          <>
            {/* Chart card */}
            <div className="card">
              <div className="card-header">
                <span className="card-title">Chart — {loaded.chartId}</span>
              </div>
              <div className="chart-host" ref={chartRef} />
            </div>

            {/* CSV table card */}
            <div className="card">
              <div className="card-header">
                <span className="card-title">
                  CSV Data ({loaded.csvRows.length} rows)
                </span>
                <div className="card-actions">
                  {loaded.csvRows.length > 10 && (
                    <button
                      className="pill-btn section-toggle-btn"
                      onClick={() => setShowAllRows((v) => !v)}
                    >
                      {showAllRows ? 'Show less' : `Show all (${loaded.csvRows.length})`}
                    </button>
                  )}
                </div>
              </div>
              <CsvTable rows={visibleRows} columns={loaded.csvColumns} />
            </div>

            {/* Vega-Lite spec card */}
            <div className="card">
              <div className="card-header">
                <span className="card-title">Vega-Lite Spec</span>
                <div className="card-actions">
                  <button
                    className="pill-btn section-toggle-btn"
                    onClick={() => setSpecOpen((v) => !v)}
                  >
                    {specOpen ? 'Collapse' : 'Expand'}
                  </button>
                </div>
              </div>
              {specOpen ? (
                <textarea readOnly value={loaded.specRaw} style={{ minHeight: 320 }} />
              ) : (
                <div className="section-collapsed-line">
                  {loaded.specRaw.slice(0, 120)}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

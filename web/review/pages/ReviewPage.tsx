// Dev-only researcher tool. Edits round-trip through the Vite dev plugin
// (`/api/review/csv`); the production bundle of this page will fail to save.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import '../../App.css'
import '../review.css'
import type { ChartSpec, OpsSpecInput } from '../../../src/api/types'
import { browserEngine } from '../../engine/createBrowserEngine'
import ReviewToolbar from '../components/ReviewToolbar'
import ReviewTable, { type EditingCell } from '../components/ReviewTable'
import ReviewChartPane, { type ChartPaneStatus } from '../components/ReviewChartPane'
import {
  createEmptyRow,
  fetchAll,
  fetchFileList,
  rowsEqual,
  saveAll,
  type ReviewChartType,
  type ReviewRow,
  type ReviewStatus,
} from '../services/reviewCasesService'
import { resolveSpec } from '../services/chartSpecResolver'

type CellField = NonNullable<EditingCell>['field']

export default function ReviewPage() {
  const [rows, setRows] = useState<ReviewRow[]>([])
  const [savedSnapshot, setSavedSnapshot] = useState<ReviewRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null)
  const [editingCell, setEditingCell] = useState<EditingCell>(null)
  const [stale, setStale] = useState(false)
  const [chartStatus, setChartStatus] = useState<ChartPaneStatus>({ kind: 'idle' })
  const [searchText, setSearchText] = useState('')
  const [statusFilter, setStatusFilter] = useState<ReviewStatus | 'all'>('all')
  const [chartTypeFilter, setChartTypeFilter] = useState<ReviewChartType | 'all'>('all')
  const [feedbackOnly, setFeedbackOnly] = useState(false)
  const [availableFiles, setAvailableFiles] = useState<string[]>([])
  const [currentFile, setCurrentFile] = useState<string>('')

  const chartHostRef = useRef<HTMLDivElement | null>(null)

  // Load the file list and the default file's contents on mount.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void (async () => {
      try {
        const listing = await fetchFileList()
        if (cancelled) return
        setAvailableFiles(listing.files)
        const chosen = listing.default || listing.files[0] || ''
        setCurrentFile(chosen)
        const loaded = await fetchAll(chosen || undefined)
        if (cancelled) return
        setRows(loaded)
        setSavedSnapshot(loaded)
        setSelectedRowIndex(null)
        setLoadError(null)
      } catch (error: unknown) {
        if (cancelled) return
        setLoadError(error instanceof Error ? error.message : String(error))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const handleFileChange = useCallback(
    (nextFile: string) => {
      if (!nextFile || nextFile === currentFile) return
      // Warn about unsaved changes before switching.
      const hasUnsavedNow =
        rows.length !== savedSnapshot.length ||
        rows.some((row, i) => {
          const snap = savedSnapshot[i]
          return !snap || !rowsEqual(row, snap)
        })
      if (hasUnsavedNow) {
        const proceed = window.confirm(
          `You have unsaved changes in "${currentFile}". Switch to "${nextFile}" and discard them?`,
        )
        if (!proceed) return
      }
      setCurrentFile(nextFile)
      setLoading(true)
      setLoadError(null)
      setSaveError(null)
      setSelectedRowIndex(null)
      setEditingCell(null)
      setChartStatus({ kind: 'idle' })
      void fetchAll(nextFile)
        .then((loaded) => {
          setRows(loaded)
          setSavedSnapshot(loaded)
        })
        .catch((error: unknown) => {
          setLoadError(error instanceof Error ? error.message : String(error))
        })
        .finally(() => setLoading(false))
    },
    [currentFile, rows, savedSnapshot],
  )

  // Warn before navigating away with unsaved changes.
  const dirtyIndexes = useMemo(() => {
    const dirty = new Set<number>()
    rows.forEach((row, i) => {
      const snap = savedSnapshot[i]
      if (!snap || !rowsEqual(row, snap)) dirty.add(i)
    })
    return dirty
  }, [rows, savedSnapshot])

  const hasUnsaved = dirtyIndexes.size > 0 || rows.length !== savedSnapshot.length

  useEffect(() => {
    if (!hasUnsaved) return
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [hasUnsaved])

  const handleSaveAll = useCallback(async () => {
    if (!hasUnsaved) return
    const now = new Date().toISOString()
    const stamped = rows.map((row, i) =>
      dirtyIndexes.has(i) ? { ...row, updated_at: now } : row,
    )
    setSaving(true)
    setSaveError(null)
    try {
      await saveAll(stamped, currentFile || undefined)
      setRows(stamped)
      setSavedSnapshot(stamped)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }, [currentFile, dirtyIndexes, hasUnsaved, rows])

  const handleAddRow = useCallback(() => {
    const chartId = window.prompt('chart_id for the new row (immutable once set):')?.trim() ?? ''
    if (!chartId) return
    const fresh = { ...createEmptyRow(), chart_id: chartId }
    const next = [...rows, fresh]
    setRows(next)
    setSelectedRowIndex(next.length - 1)
    setEditingCell({ rowIndex: next.length - 1, field: 'question' })
  }, [rows])

  const handleStatusChange = useCallback(
    (rowIndex: number, status: ReviewStatus) => {
      setRows((prev) => prev.map((row, i) => (i === rowIndex ? { ...row, status } : row)))
    },
    [],
  )

  const handleCommitEdit = useCallback(
    (rowIndex: number, field: CellField, value: string) => {
      setRows((prev) => prev.map((row, i) => (i === rowIndex ? { ...row, [field]: value } : row)))
      setEditingCell(null)
      if (selectedRowIndex === rowIndex && field === 'operation_spec') {
        setStale(true)
      }
    },
    [selectedRowIndex],
  )

  const handleCancelEdit = useCallback(() => setEditingCell(null), [])

  const renderRowChart = useCallback(
    async (rowIndex: number): Promise<ChartSpec | null> => {
      const row = rows[rowIndex]
      if (!row || !chartHostRef.current) return null
      setChartStatus({ kind: 'loading' })
      const resolution = await resolveSpec(row.chart_id)
      if (!resolution.ok) {
        setChartStatus({ kind: 'error', message: resolution.error })
        return null
      }
      try {
        await browserEngine.renderChart(chartHostRef.current, resolution.spec)
        setStale(false)
        setChartStatus({ kind: 'rendered' })
        return resolution.spec
      } catch (error) {
        setChartStatus({
          kind: 'error',
          message: error instanceof Error ? error.message : String(error),
        })
        return null
      }
    },
    [rows],
  )

  const handleSelectRow = useCallback(
    (rowIndex: number) => {
      setSelectedRowIndex(rowIndex)
      void renderRowChart(rowIndex)
    },
    [renderRowChart],
  )

  const handleRerender = useCallback(() => {
    if (selectedRowIndex === null) return
    void renderRowChart(selectedRowIndex)
  }, [renderRowChart, selectedRowIndex])

  const handleResetChart = useCallback(() => {
    if (selectedRowIndex === null) return
    void renderRowChart(selectedRowIndex)
  }, [renderRowChart, selectedRowIndex])

  const handleRunOps = useCallback(
    async (rowIndex: number) => {
      const row = rows[rowIndex]
      if (!row || !chartHostRef.current) return
      const opsRaw = row.operation_spec.trim()
      if (!opsRaw) {
        setChartStatus({ kind: 'error', message: 'operation_spec is empty.' })
        return
      }
      let parsed: OpsSpecInput
      try {
        parsed = JSON.parse(opsRaw) as OpsSpecInput
      } catch (error) {
        setChartStatus({
          kind: 'error',
          message: `operation_spec is invalid JSON: ${
            error instanceof Error ? error.message : String(error)
          }`,
        })
        return
      }
      setSelectedRowIndex(rowIndex)
      const freshSpec = await renderRowChart(rowIndex)
      if (!freshSpec) return
      try {
        await browserEngine.runChartOps(chartHostRef.current, freshSpec, parsed, {
          initialRenderMode: 'reuse-existing',
        })
        setChartStatus({ kind: 'ran-ops' })
      } catch (error) {
        setChartStatus({
          kind: 'error',
          message: error instanceof Error ? error.message : String(error),
        })
      }
    },
    [renderRowChart, rows],
  )

  const visibleIndexes = useMemo(() => {
    const needle = searchText.trim().toLowerCase()
    return rows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => {
        if (statusFilter !== 'all' && row.status !== statusFilter) return false
        if (chartTypeFilter !== 'all' && row.chart_type !== chartTypeFilter) return false
        if (feedbackOnly && !row.feedback.trim()) return false
        if (needle) {
          const hay = `${row.chart_id} ${row.question}`.toLowerCase()
          if (!hay.includes(needle)) return false
        }
        return true
      })
      .map(({ index }) => index)
  }, [chartTypeFilter, feedbackOnly, rows, searchText, statusFilter])

  const feedbackRows = useMemo(
    () => rows.reduce((acc, row) => acc + (row.feedback.trim() ? 1 : 0), 0),
    [rows],
  )

  const selectedRow = selectedRowIndex !== null ? rows[selectedRowIndex] : null
  const canRender = selectedRowIndex !== null
  const canRunOps = canRender && !!selectedRow?.operation_spec.trim()

  return (
    <div className="app-shell review-shell">
      <div className="review-header">
        <div className="review-title">QA Review</div>
        <div className="review-subtitle">
          {loading ? 'Loading…' : null}
          {loadError ? `Load error: ${loadError}` : null}
        </div>
      </div>
      <div className="review-layout">
        <div className="review-left">
          <ReviewToolbar
            totalRows={rows.length}
            visibleRows={visibleIndexes.length}
            feedbackRows={feedbackRows}
            unsavedRows={dirtyIndexes.size}
            searchText={searchText}
            onSearchChange={setSearchText}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            chartTypeFilter={chartTypeFilter}
            onChartTypeFilterChange={setChartTypeFilter}
            feedbackOnly={feedbackOnly}
            onFeedbackOnlyChange={setFeedbackOnly}
            saving={saving}
            saveError={saveError}
            onAddRow={handleAddRow}
            onSaveAll={() => void handleSaveAll()}
            availableFiles={availableFiles}
            currentFile={currentFile}
            onFileChange={handleFileChange}
          />
          <ReviewTable
            rows={rows}
            visibleIndexes={visibleIndexes}
            dirtyIndexes={dirtyIndexes}
            selectedRowIndex={selectedRowIndex}
            editingCell={editingCell}
            onSelectRow={handleSelectRow}
            onStartEdit={setEditingCell}
            onCancelEdit={handleCancelEdit}
            onCommitEdit={handleCommitEdit}
            onStatusChange={handleStatusChange}
          />
        </div>
        <div className="review-right">
          <ReviewChartPane
            ref={chartHostRef}
            status={chartStatus}
            stale={stale}
            selectedChartId={selectedRow?.chart_id ?? null}
            canRender={canRender}
            canRunOps={canRunOps}
            onRerender={handleRerender}
            onResetChart={handleResetChart}
            onRunOps={() => {
              if (selectedRowIndex !== null) void handleRunOps(selectedRowIndex)
            }}
          />
        </div>
      </div>
    </div>
  )
}

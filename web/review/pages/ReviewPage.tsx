// Dev-only researcher tool. Edits round-trip through the Vite dev plugin
// (`/api/review/csv`); the production bundle of this page will fail to save.

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import '../../App.css'
import '../review.css'
import { getChartType, type ChartSpec, type OperationSpec, type OpsSpecInput, type RawRow } from '../../../src/api/types'
import { browserEngine } from '../../engine/createBrowserEngine'
import { consumeDerivedChartState } from '../../../src/api/rendering'
import type {
  OperationRuntimeSnapshot,
  RunChartOpsOptions,
} from '../../../src/api/review-runtime'
import {
  buildDatumValuesForSpec,
  collectReferencedResultIds,
  isOperationNextRunOutcome,
} from '../../../src/api/review-runtime'
import {
  clearSentenceSummaryOverlay,
  renderSentenceSummaryOverlay,
  type SentenceSummaryOverlayItem,
  type SentenceSummaryOverlayRenderInput,
} from '../../../src/api/sentence-summary-overlay'
import { analyzeSplitPlan, splitPlanRoleFor, type SplitPlan } from '../../../src/api/splitPlan'
import { SurfaceManager } from '../../../src/api/surface-manager'
import { applySplitSharedYAxisPolicy } from '../../../src/api/split-surface-visuals'
import ReviewToolbar from '../components/ReviewToolbar'
import ReviewTable, { type EditingCell } from '../components/ReviewTable'
import ReviewChartPane, { type ChartPaneStatus } from '../components/ReviewChartPane'
import ReviewFeedbackPanel from '../components/ReviewFeedbackPanel'
import {
  CHART_TYPE_VALUES,
  createEmptyRow,
  fetchAll,
  fetchFileList,
  rowHasFeedback,
  rowsEqual,
  saveAll,
  type ReviewChartType,
  type ReviewRow,
  type ReviewStatus,
  type ReviewStatusKind,
} from '../services/reviewCasesService'
import { resolveSpec } from '../services/chartSpecResolver'

type CellField = NonNullable<EditingCell>['field']

/**
 * Idle delay between the user's last edit and the autosave PUT. Long enough
 * that rapid edits (typing in a cell, toggling several statuses) get batched
 * into a single network call; short enough that a save lands soon after the
 * user finishes a row. The "Save" toolbar button still triggers an immediate
 * save for users who want to flush right away.
 */
const AUTOSAVE_DEBOUNCE_MS = 1500

// ── Ops session state ────────────────────────────────────────────────────────
// Mirrors the workbench's sentence-walkthrough UX: when the user clicks the
// per-row "Run ops" button, we parse the operation_spec into chunk groups
// (ops / ops2 / …), align each group to a chunk of explanation text, and
// render a sentence-summary overlay (the same overlay element the workbench
// uses) above the chart. Clicking a sentence runs ops[0..thatIndex] in one
// shot after a fresh re-render — a simpler model than the workbench's
// checkpoint replay, but sufficient for review-side inspection.

type OpsRecord = Record<string, unknown[]>
type OpsGroupsParse = { groups: unknown[][]; keys: string[] }

/**
 * Pull the inline `data.values` array out of a ChartSpec as `RawRow[]`. The
 * review page only deals with specs whose data is bundled inline (CSV-sourced
 * chart fixtures), so we can extract synchronously. Returns `[]` for specs
 * without inline values — the caller treats that as "no rows", which makes
 * downstream `buildDatumValuesForSpec` return `[]` and split fall back to
 * not splitting.
 */
function extractSpecRows(spec: ChartSpec | null | undefined): RawRow[] {
  if (!spec) return []
  const data = (spec as { data?: { values?: unknown } }).data
  if (!data || !Array.isArray((data as { values?: unknown }).values)) return []
  return ((data as { values: unknown[] }).values).filter(
    (row): row is RawRow => !!row && typeof row === 'object' && !Array.isArray(row),
  )
}

function parseOpsGroups(opsRaw: string): OpsGroupsParse {
  const trimmed = opsRaw.trim()
  if (!trimmed) return { groups: [], keys: [] }
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return { groups: [], keys: [] }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { groups: [], keys: [] }
  }
  const opsObj = parsed as OpsRecord
  const opsKeys = Object.keys(opsObj)
    .filter((k) => /^ops(\d+)?$/.test(k))
    .sort((a, b) => {
      const numA = a === 'ops' ? 1 : Number(a.slice(3))
      const numB = b === 'ops' ? 1 : Number(b.slice(3))
      return numA - numB
    })
  const groups: unknown[][] = []
  const keys: string[] = []
  for (const key of opsKeys) {
    const value = opsObj[key]
    if (!Array.isArray(value) || value.length === 0) continue
    groups.push(value)
    keys.push(key)
  }
  return { groups, keys }
}


// ── localStorage persistence for toolbar selections ────────────────────────
//
// What we persist (keyed under `review-page:v1:*`):
//   • currentFile          — which CSV the page is reading/writing.
//   • opStatusFilter       — toolbar chip group (Op axis).
//   • vizStatusFilter      — toolbar chip group (Viz axis).
//   • chartTypeFilter      — toolbar chart-type chip group.
//   • feedbackOnly         — toolbar "Has feedback" checkbox.
//
// What we do NOT persist:
//   • selectedRowIndex     — meaningless across files / re-orderings; the
//                            user re-picks a row each session.
//   • editingCell, opsSession state, ChartPaneStatus, dirtyIndexes — all
//                            transient UI state tied to the live render.
//   • availableFiles       — re-fetched on every mount via /api/review/files.
//
// Version prefix `v1:` lets us evict old shapes without parsing logic if we
// ever change the persisted value format.
const PERSIST_KEY = {
  currentFile: 'review-page:v1:currentFile',
  opStatusFilter: 'review-page:v1:opStatusFilter',
  vizStatusFilter: 'review-page:v1:vizStatusFilter',
  chartTypeFilter: 'review-page:v1:chartTypeFilter',
  feedbackOnly: 'review-page:v1:feedbackOnly',
} as const

function readPersistedRaw(key: string): unknown {
  if (typeof window === 'undefined') return undefined
  try {
    const raw = window.localStorage.getItem(key)
    if (raw == null) return undefined
    return JSON.parse(raw) as unknown
  } catch {
    return undefined
  }
}

function writePersistedRaw(key: string, value: unknown): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Quota exceeded / Safari private-mode disables setItem. Silently no-op:
    // the page still works, persistence just degrades to session-only.
  }
}

/**
 * `useState` paired with localStorage. The initial value is loaded from
 * storage (validated via `validate`, falling back to `fallback` on miss /
 * corrupted JSON / shape mismatch). Every subsequent change writes back.
 *
 * Single-tab usage — we do not listen to the `storage` event because the
 * review page has only one active tab in practice and cross-tab sync would
 * fight with debounced autosaves.
 */
function usePersistedState<T>(
  key: string,
  fallback: T,
  validate: (value: unknown) => value is T,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    const raw = readPersistedRaw(key)
    return validate(raw) ? raw : fallback
  })
  useEffect(() => {
    writePersistedRaw(key, value)
  }, [key, value])
  return [value, setValue]
}

const STATUS_FILTER_VALUES = ['all', 'pending', 'verified', 'bug', 'wontfix'] as const
function isStatusFilterValue(value: unknown): value is ReviewStatus | 'all' {
  return typeof value === 'string' && (STATUS_FILTER_VALUES as readonly string[]).includes(value)
}

const CHART_TYPE_FILTER_VALUES: readonly string[] = ['all', ...CHART_TYPE_VALUES]
function isChartTypeFilterValue(value: unknown): value is ReviewChartType | 'all' {
  return typeof value === 'string' && CHART_TYPE_FILTER_VALUES.includes(value)
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean'
}

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
  // Toolbar filter selections persist across reloads / dev-server restarts
  // via `usePersistedState` (localStorage). The validators (passed third arg)
  // both narrow the type and guard against stale / corrupted persisted shapes
  // — e.g. an `op_status` value that was removed in a future refactor falls
  // back to `'all'` cleanly instead of breaking the chip group.
  const [opStatusFilter, setOpStatusFilter] = usePersistedState<ReviewStatus | 'all'>(
    PERSIST_KEY.opStatusFilter,
    'all',
    isStatusFilterValue,
  )
  const [vizStatusFilter, setVizStatusFilter] = usePersistedState<ReviewStatus | 'all'>(
    PERSIST_KEY.vizStatusFilter,
    'all',
    isStatusFilterValue,
  )
  const [chartTypeFilter, setChartTypeFilter] = usePersistedState<ReviewChartType | 'all'>(
    PERSIST_KEY.chartTypeFilter,
    'all',
    isChartTypeFilterValue,
  )
  const [feedbackOnly, setFeedbackOnly] = usePersistedState<boolean>(
    PERSIST_KEY.feedbackOnly,
    false,
    isBoolean,
  )
  const [availableFiles, setAvailableFiles] = useState<string[]>([])
  const [currentFile, setCurrentFile] = useState<string>('')

  // Ops-session state for the sentence-summary walkthrough.
  // The sentence-text label rendered for each group is simply its group key
  // (`ops`, `ops2`, `ops3`, ...) — no derivation from explanation.
  const [opsSessionRowIndex, setOpsSessionRowIndex] = useState<number | null>(null)
  const [opsGroups, setOpsGroups] = useState<unknown[][]>([])
  const [opsGroupKeys, setOpsGroupKeys] = useState<string[]>([])
  const [opsCurrentGroupIndex, setOpsCurrentGroupIndex] = useState(-1)
  const [opsCurrentPhase, setOpsCurrentPhase] = useState<'pre-run' | 'post-run'>('pre-run')
  const [opsRunning, setOpsRunning] = useState(false)

  // Detached feedback panel: only one row's panel is open at a time. `null`
  // means the panel is closed. Clicking the trigger in another row swaps
  // the open row; clicking the same trigger again closes it.
  const [feedbackPanelRowIndex, setFeedbackPanelRowIndex] = useState<number | null>(null)

  const chartHostRef = useRef<HTMLDivElement | null>(null)
  // The resolved ChartSpec for the active ops session — captured once at
  // session start so subsequent incremental steps can reuse it without
  // hitting the spec resolver again.
  const opsSessionSpecRef = useRef<ChartSpec | null>(null)
  // Per-group SVG snapshots: key=groupIndex → outerHTML of the chart's <svg>
  // *after* that group's ops finished running. Used to restore prior chart
  // state when the user re-clicks an already-completed earlier sentence
  // (workbench-style checkpoint replay, without the full runtime serialization).
  const opsSnapshotsRef = useRef<Map<number, string>>(new Map())
  // Per-group runtime cache snapshots. `runChartOps` clears its internal
  // runtime cache on every call by default (via `resetRuntimeResults()`),
  // so the next group's `"ref:nN"` references would resolve to empty arrays
  // and the op would silently no-op. We capture each group's post-run
  // snapshot here and pass it back as `runtimeSnapshot` (with
  // `resetRuntime: false`) on the next incremental call to keep `ref:nN`
  // lookups alive — same pattern the workbench uses for chunked replay.
  const opsRuntimeSnapshotsRef = useRef<Map<number, OperationRuntimeSnapshot>>(new Map())
  // Split orchestration. When the ops spec contains a convergent DAG (two
  // parallel sentences feeding a downstream merging sentence), the analyzer
  // returns a non-null SplitPlan and the session manages a SurfaceManager
  // that materializes left/right surfaces inside the chart-host. `runOpsUpToGroup`
  // branches by `splitPlanRoleFor(plan, groupIndex)` to route each sentence's
  // ops to the appropriate surface and to draw the cross-surface diff arrow
  // when the merging sentence runs.
  const splitPlanRef = useRef<SplitPlan | null>(null)
  const surfaceManagerRef = useRef<SurfaceManager | null>(null)

  // Load the file list and the chosen file's contents on mount.
  //
  // Resolution order for which CSV to open:
  //   1. Persisted choice from a previous session (localStorage) — ONLY when
  //      that file still exists in the server-reported listing. Stale
  //      persisted names (file renamed / deleted) gracefully fall through.
  //   2. Server-advertised default — when it exists in `listing.files`.
  //   3. First available file.
  //   4. Empty string (no files at all → toolbar disables the picker).
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void (async () => {
      try {
        const listing = await fetchFileList()
        if (cancelled) return
        setAvailableFiles(listing.files)
        const persistedRaw = readPersistedRaw(PERSIST_KEY.currentFile)
        const persistedFile =
          typeof persistedRaw === 'string' && listing.files.includes(persistedRaw)
            ? persistedRaw
            : null
        const defaultIsListed =
          !!listing.default && listing.files.includes(listing.default)
        const chosen =
          persistedFile ??
          (defaultIsListed ? listing.default : listing.files[0] || '')
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

  // Persist `currentFile` after every successful change (initial load + user
  // file-picker swap). Skip empty strings so a "no files available" boot
  // doesn't overwrite a valid prior choice.
  useEffect(() => {
    if (currentFile) writePersistedRaw(PERSIST_KEY.currentFile, currentFile)
  }, [currentFile])

  const resetOpsSession = useCallback(() => {
    setOpsSessionRowIndex(null)
    setOpsGroups([])
    setOpsGroupKeys([])
    setOpsCurrentGroupIndex(-1)
    setOpsCurrentPhase('pre-run')
    setOpsRunning(false)
    opsSessionSpecRef.current = null
    opsSnapshotsRef.current = new Map()
    opsRuntimeSnapshotsRef.current = new Map()
    splitPlanRef.current = null
    surfaceManagerRef.current = null
    if (chartHostRef.current) {
      clearSentenceSummaryOverlay(chartHostRef.current)
    }
  }, [])

  /** Captures the current chart `<svg>` element as a serializable string. */
  const captureCurrentSvg = useCallback((): string | null => {
    const svg = chartHostRef.current?.querySelector('svg')
    return svg ? svg.outerHTML : null
  }, [])

  /**
   * Restores a previously captured SVG snapshot in-place. Replaces the chart
   * host's current `<svg>` (if any) with the snapshot HTML so subsequent
   * `runChartOps` calls (with `initialRenderMode: 'reuse-existing'`) layer
   * new annotations on top of the restored scene rather than starting from
   * a fresh render.
   */
  const restoreSvgSnapshot = useCallback((svgHtml: string): boolean => {
    if (!chartHostRef.current) return false
    const existingSvg = chartHostRef.current.querySelector('svg')
    if (existingSvg) {
      existingSvg.outerHTML = svgHtml
    } else {
      chartHostRef.current.innerHTML = svgHtml
    }
    return true
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
      resetOpsSession()
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
    [currentFile, resetOpsSession, rows, savedSnapshot],
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

  // Debounced autosave: persist changes ~1.5s after the user's last edit
  // settles. The effect re-runs every time `handleSaveAll` is regenerated
  // (i.e. every time `rows` / `dirtyIndexes` / `currentFile` change), so
  // each new edit cancels the in-flight timer and starts a new one. While
  // a save is already in flight, the effect bails out — `saveAll`'s own
  // pending queue handles edits that land mid-flight, and a fresh debounce
  // window kicks in once `saving` falls back to false.
  useEffect(() => {
    if (!hasUnsaved || saving) return
    const timer = window.setTimeout(() => {
      void handleSaveAll()
    }, AUTOSAVE_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [hasUnsaved, saving, handleSaveAll])

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
    (rowIndex: number, kind: ReviewStatusKind, status: ReviewStatus) => {
      const field: 'op_status' | 'viz_status' = kind === 'op' ? 'op_status' : 'viz_status'
      setRows((prev) => prev.map((row, i) => (i === rowIndex ? { ...row, [field]: status } : row)))
    },
    [],
  )

  const handleCommitEdit = useCallback(
    (rowIndex: number, field: CellField, value: string) => {
      setRows((prev) => prev.map((row, i) => (i === rowIndex ? { ...row, [field]: value } : row)))
      setEditingCell(null)
      if (selectedRowIndex === rowIndex && field === 'operation_spec') {
        setStale(true)
        // Ops/explanation edits invalidate the active session — drop it.
        if (opsSessionRowIndex === rowIndex) resetOpsSession()
      }
    },
    [opsSessionRowIndex, resetOpsSession, selectedRowIndex],
  )

  const handleCancelEdit = useCallback(() => setEditingCell(null), [])

  // ── Feedback panel: open/close + field updates ──────────────────────────
  const handleToggleFeedbackPanel = useCallback((rowIndex: number) => {
    setFeedbackPanelRowIndex((prev) => (prev === rowIndex ? null : rowIndex))
  }, [])

  const handleCloseFeedbackPanel = useCallback(() => {
    setFeedbackPanelRowIndex(null)
  }, [])

  const handleOpFeedbackChange = useCallback((rowIndex: number, value: string) => {
    setRows((prev) =>
      prev.map((row, i) => (i === rowIndex ? { ...row, op_feedback: value } : row)),
    )
  }, [])

  const handleVizFeedbackChange = useCallback((rowIndex: number, value: string) => {
    setRows((prev) =>
      prev.map((row, i) => (i === rowIndex ? { ...row, viz_feedback: value } : row)),
    )
  }, [])

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
      // Selecting a different row drops the prior ops walkthrough.
      if (opsSessionRowIndex !== null && opsSessionRowIndex !== rowIndex) {
        resetOpsSession()
      }
      void renderRowChart(rowIndex)
    },
    [opsSessionRowIndex, renderRowChart, resetOpsSession],
  )

  // Both Re-render and Reset chart need to *force* a fresh build of the chart
  // skeleton, not just clear session state. The render pipeline is idempotent
  // (CLAUDE.md #3) — re-rendering the same spec on the same host normally
  // short-circuits inside `ChartInstance.ensureRendered` and leaves the prior
  // annotations, axis rescales, and persisted instance state (`activeTargets`,
  // `outOfScopeOpacity`) alone. `browserEngine.resetChartHost(host)` detaches
  // the cached instance and clears the SVG so the very next `renderChart`
  // builds from a clean baseline.
  const handleRerender = useCallback(() => {
    if (selectedRowIndex === null) return
    resetOpsSession()
    if (chartHostRef.current) {
      browserEngine.resetChartHost(chartHostRef.current)
    }
    void renderRowChart(selectedRowIndex)
  }, [renderRowChart, resetOpsSession, selectedRowIndex])

  const handleResetChart = useCallback(() => {
    if (selectedRowIndex === null) return
    resetOpsSession()
    if (chartHostRef.current) {
      browserEngine.resetChartHost(chartHostRef.current)
    }
    void renderRowChart(selectedRowIndex)
  }, [renderRowChart, resetOpsSession, selectedRowIndex])

  /**
   * Workbench-parity walkthrough with SVG snapshot checkpoints.
   *
   *   • **Active click** (the only `active` sentence in `overlayRenderInput`)
   *     — linear progression. The chart already shows the post-run scene of
   *     the previous group; we run *only* the clicked group's ops on top.
   *     No re-render, no flicker. The post-run scene is captured into
   *     `opsSnapshotsRef.current[targetIndex]` for later replay.
   *
   *   • **Completed click** — user is replaying an earlier step. We restore
   *     the chart from the snapshot taken *before* this group ran
   *     (= snapshot[targetIndex - 1]) and then run only the target group's
   *     ops. If no usable snapshot exists, we fall back to a fresh re-render
   *     followed by cumulative replay of ops[0..targetIndex - 1].
   *
   * After either path, snapshots beyond `targetIndex` are invalidated — the
   * walkthrough state has rolled back so the downstream scenes are stale.
   * The user will rebuild them by clicking through again.
   *
   * `pending` sentences are filtered out as non-clickable in
   * `overlayRenderInput`, so `targetIndex` reaching here is always either a
   * valid active or a valid completed.
   */
  const runOpsUpToGroup = useCallback(
    async (targetIndex: number) => {
      if (opsRunning) return
      if (opsSessionRowIndex === null) return
      if (targetIndex < 0 || targetIndex >= opsGroups.length) return
      const row = rows[opsSessionRowIndex]
      if (!row || !chartHostRef.current) return

      // The "active" sentence is the one that hasn't run yet in this session:
      // either `currentIndex` while still pre-run, or `currentIndex + 1` once
      // `currentIndex` is post-run. Anything else is a replay of an earlier
      // completed group.
      const isActiveClick =
        (opsCurrentPhase === 'pre-run' && targetIndex === opsCurrentGroupIndex) ||
        (opsCurrentPhase === 'post-run' && targetIndex === opsCurrentGroupIndex + 1)

      setOpsRunning(true)
      try {
        // ChartSpec is fixed for the session; resolved once at session start.
        let freshSpec = opsSessionSpecRef.current
        if (!freshSpec) {
          const res = await resolveSpec(row.chart_id)
          if (!res.ok || !chartHostRef.current) return
          freshSpec = res.spec
          opsSessionSpecRef.current = freshSpec
        }

        // Compute referencedResultIds across the WHOLE ops spec (every group),
        // not just the group we're about to run. ReviewPage executes each
        // sentence in its own `runChartOps` call, so the per-call collector
        // inside `runChartOps` only sees the current group — and prior
        // annotations that the CURRENT group doesn't reference get fadeRemove'd
        // even when a FUTURE group still needs them. Case 4pi1e6ev8e0zobww:
        // ops:n2 (Male avg) line is dropped when ops2:n4 runs because ops2
        // alone only references n3; but ops3:n5 still consumes n2.
        // Passing the cross-group set keeps the n2 line alive until ops3 runs.
        const fullReferencedResultIds = collectReferencedResultIds(opsGroups as OperationSpec[][])
        // Refs consumed by groups STRICTLY AFTER the target group. The simple-bar
        // / simple-line runners union this with their intra-call live refs to
        // build a per-op "still-live" keep set, so a consumed annotation is
        // removed once no current-or-later op needs it (case 1hlsoeyqlr1r1n41 —
        // the extremum / average lingered dimmed). `fullReferencedResultIds`
        // stays as the back-compat field other chart types still read.
        const futureReferencedResultIds = collectReferencedResultIds(
          opsGroups.slice(targetIndex + 1) as OperationSpec[][],
        )
        console.info(
          '[review] runOpsUpToGroup: cross-group referencedResultIds ' +
            JSON.stringify({
              targetIndex,
              groupName: opsGroupKeys[targetIndex],
              fullReferencedResultIds,
              opsGroupCount: opsGroups.length,
            }),
        )

        // The runtime snapshot taken just *before* `targetIndex` ran is what
        // lets the chart engine resolve this group's `"ref:nN"` references
        // against prior nodes. We pass it via `runtimeSnapshot` (with
        // `resetRuntime: false`) to `runChartOps`. Tracked alongside the SVG
        // snapshot map.
        const priorIndex = targetIndex - 1
        let priorRuntimeSnapshot: OperationRuntimeSnapshot | undefined =
          priorIndex >= 0 ? opsRuntimeSnapshotsRef.current.get(priorIndex) : undefined

        if (!isActiveClick) {
          // ── Replay path ──────────────────────────────────────────────────
          // Restore the chart to its state just before `targetIndex` ran.
          const priorSnapshot =
            priorIndex >= 0 ? opsSnapshotsRef.current.get(priorIndex) : null
          if (priorSnapshot) {
            // Fast path: SVG snapshot replay, no chart-engine round-trip.
            // Runtime snapshot (if present) is already captured above and will
            // be passed to the target-group call below.
            restoreSvgSnapshot(priorSnapshot)
          } else {
            // Slow path: snapshot missing (e.g. priorIndex === -1, or
            // invalidated earlier). Re-render the chart from the original
            // spec, then cumulatively replay all prior groups in one call —
            // ChainState propagation inside that single call resolves any
            // `ref:nN`. Capture the resulting runtime snapshot so the target
            // group's call below can keep the chain going.
            //
            // `renderRowChart` re-renders from the ORIGINAL spec (always
            // resolveSpec(row.chart_id)), so reset `freshSpec` to that — the
            // cumulative replay below must dispatch through the original
            // chart-type runner (e.g. STACKED_BAR), not whatever derived spec
            // a previous run had cached on `opsSessionSpecRef.current`.
            const reRendered = await renderRowChart(opsSessionRowIndex)
            if (reRendered) {
              freshSpec = reRendered
              opsSessionSpecRef.current = reRendered
            }
            if (priorIndex >= 0 && chartHostRef.current) {
              const replayOps: Record<string, unknown[]> = {}
              for (let i = 0; i <= priorIndex; i++) {
                replayOps[opsGroupKeys[i]] = opsGroups[i]
              }
              const replayResult = await browserEngine.runChartOps(
                chartHostRef.current,
                freshSpec,
                replayOps as OpsSpecInput,
                {
                  initialRenderMode: 'reuse-existing',
                  resetRuntime: true,
                  // Same cross-group reference set on the replay call so the
                  // cumulative replay (which can include the same chart-type
                  // transition + averages) preserves annotations that future
                  // groups will need (e.g. n2 line for ops3:n5).
                  referencedResultIds: fullReferencedResultIds,
                  // Future groups relative to the replayed range (priorIndex):
                  // the target group + beyond, so the simple-bar/line per-op
                  // keep set keeps what the target group still needs.
                  futureReferencedResultIds: collectReferencedResultIds(
                    opsGroups.slice(priorIndex + 1) as OperationSpec[][],
                  ),
                } as RunChartOpsOptions,
              )
              // If the cumulative replay transitioned chart type (e.g.
              // stacked → grouped via pairDiff), pick up the derived spec
              // so the TARGET group's call below dispatches through the
              // correct chart-type runner and adopts the post-transition SVG.
              const derivedAfterReplay = consumeDerivedChartState(chartHostRef.current)
              if (derivedAfterReplay) {
                freshSpec = derivedAfterReplay.spec
                opsSessionSpecRef.current = derivedAfterReplay.spec
                console.info(
                  '[review] runOpsUpToGroup: replay chart-type transition ' +
                    JSON.stringify({
                      toChartType: derivedAfterReplay.chartType,
                      priorIndex,
                      targetIndex,
                    }),
                )
              }
              if (isOperationNextRunOutcome(replayResult)) {
                priorRuntimeSnapshot = replayResult.runtimeSnapshot
                // Backfill the per-step snapshots optimistically: only the
                // *final* state is known after a cumulative replay, so we
                // store it at priorIndex. Earlier indices stay empty and
                // will be rebuilt as the user steps through.
                opsRuntimeSnapshotsRef.current.set(priorIndex, replayResult.runtimeSnapshot)
                const replaySvg = captureCurrentSvg()
                if (replaySvg !== null) {
                  opsSnapshotsRef.current.set(priorIndex, replaySvg)
                }
              }
            }
          }
        }

        // ── Run only the target group's ops on top of the current scene ────
        if (!chartHostRef.current) return
        const opsSubset: Record<string, unknown[]> = {
          [opsGroupKeys[targetIndex]]: opsGroups[targetIndex],
        }
        // Split orchestration: route this sentence to the correct surface
        // (left, right, or merged-root) based on the analyzed plan. Materialize
        // the split here (lazily, when the LEFT sentence first fires) and let
        // the diff applier's existing `tryDrawSplitScalarDiffAnnotation` draw
        // the cross-surface arrow when the MERGE sentence runs.
        const plan = splitPlanRef.current
        const surfaceManager = surfaceManagerRef.current
        const role = splitPlanRoleFor(plan, targetIndex)
        let runHost: HTMLElement = chartHostRef.current
        if (plan && surfaceManager) {
          if (role === 'left') {
            // Lazy split materialization. Idempotent: a second click on the
            // LEFT sentence is a no-op (already split-horizontal).
            const layoutType = surfaceManager.getLayout()?.type
            if (layoutType !== 'split-horizontal') {
              const rawRows = extractSpecRows(freshSpec)
              const datumValues = buildDatumValuesForSpec(freshSpec, rawRows)
              surfaceManager.splitSurface('horizontal', {
                idA: plan.leftSurfaceId,
                idB: plan.rightSurfaceId,
                specA: freshSpec,
                specB: freshSpec,
                dataA: datumValues,
                dataB: datumValues,
              })
              // Render the source chart into each new surface so the user
              // sees both panels before the LEFT ops run on top.
              const leftHost = surfaceManager.getSurface(plan.leftSurfaceId)?.hostElement as HTMLElement | null
              const rightHost = surfaceManager.getSurface(plan.rightSurfaceId)?.hostElement as HTMLElement | null
              if (leftHost) await browserEngine.renderChart(leftHost, freshSpec)
              if (rightHost) await browserEngine.renderChart(rightHost, freshSpec)
              applySplitSharedYAxisPolicy(surfaceManager)
              // Wait for the split entrance animation to fully settle, then
              // pause ~0.7s so the next animation (left-surface filter/avg
              // ops) doesn't blend visually into the split's tail.
              await surfaceManager.waitForSplitAnimation()
              await new Promise((resolve) => setTimeout(resolve, 700))
            }
            const leftHost = surfaceManager.getSurface(plan.leftSurfaceId)?.hostElement as HTMLElement | null
            if (leftHost) runHost = leftHost
          } else if (role === 'right') {
            const rightHost = surfaceManager.getSurface(plan.rightSurfaceId)?.hostElement as HTMLElement | null
            if (rightHost) runHost = rightHost
          }
          // role === 'merge' or null: keep runHost as the root chart-host.
          // The diff applier's tryDrawSplitScalarDiffAnnotation will look up
          // the active split layout via the passed-in surfaceManager and draw
          // the cross-surface arrow over both panels.
        }
        const targetOptions: RunChartOpsOptions = {
          initialRenderMode: 'reuse-existing',
          // Pass prior runtime if we have one; otherwise reset from scratch.
          // Note: passing `runtimeSnapshot` makes `initializeOperationRuntime`
          // restore from it (its `runtimeSnapshot` branch takes precedence
          // over `resetRuntime`), so any "ref:nN" lookups in this group's ops
          // succeed.
          resetRuntime: priorRuntimeSnapshot == null,
          ...(priorRuntimeSnapshot ? { runtimeSnapshot: priorRuntimeSnapshot } : {}),
          // Cross-group referencedResultIds (every "ref:nX" any FUTURE group
          // will read). Without this, the average applier inside this single-
          // group call would see only n3 as referenced when ops2 runs and
          // fadeRemove the n2 line — even though ops3:n5 still needs it
          // (case 4pi1e6ev8e0zobww).
          referencedResultIds: fullReferencedResultIds,
          // Strictly-future groups (after the target). The simple-bar/line
          // runners union this with intra-call live refs for a per-op keep set,
          // so a consumed annotation (e.g. an upstream extremum/average) is
          // removed once no current-or-later op needs it (case 1hlsoeyqlr1r1n41).
          futureReferencedResultIds,
          // Surface manager is required for split-aware appliers (diff arrow,
          // filter y-axis lock). Always pass it when active; passing it when
          // single-layout is harmless (appliers fall back to non-split paths).
          ...(surfaceManager ? { surfaceManager } : {}),
        }
        const outcome = await browserEngine.runChartOps(
          runHost,
          freshSpec,
          opsSubset as OpsSpecInput,
          targetOptions,
        )

        // If this group's run transitioned chart type (e.g. stacked→grouped
        // via pairDiff), persist the derived spec on the session ref so the
        // NEXT runOpsUpToGroup picks up the right chart-type runner from the
        // dispatcher. Without this, the next op dispatches based on the
        // original stacked spec and re-renders the original chart from
        // scratch — wiping the pairDiff arrows the user is supposed to
        // filter on (case 11e148qcs7x70t8v: ops:n1 pairDiff → ops2:n2 filter).
        const derivedAfterTarget = consumeDerivedChartState(runHost)
        if (derivedAfterTarget) {
          opsSessionSpecRef.current = derivedAfterTarget.spec
          console.info(
            '[review] runOpsUpToGroup: target chart-type transition ' +
              JSON.stringify({
                toChartType: derivedAfterTarget.chartType,
                targetIndex,
                groupName: opsGroupKeys[targetIndex],
              }),
          )
        }

        // Capture the post-run snapshot for this group; invalidate everything
        // past it (downstream scenes are now stale).
        const svgSnapshot = captureCurrentSvg()
        if (svgSnapshot !== null) {
          opsSnapshotsRef.current.set(targetIndex, svgSnapshot)
        }
        if (isOperationNextRunOutcome(outcome)) {
          opsRuntimeSnapshotsRef.current.set(targetIndex, outcome.runtimeSnapshot)
        }
        // Invalidate any snapshot maps beyond the target — SVG + runtime must
        // stay aligned so the next replay can find both halves of the
        // checkpoint or fall back cleanly.
        for (const idx of Array.from(opsSnapshotsRef.current.keys())) {
          if (idx > targetIndex) opsSnapshotsRef.current.delete(idx)
        }
        for (const idx of Array.from(opsRuntimeSnapshotsRef.current.keys())) {
          if (idx > targetIndex) opsRuntimeSnapshotsRef.current.delete(idx)
        }
        // Silence the unused-var warning when destructuring isn't used.
        void outcome

        setChartStatus({ kind: 'ran-ops' })
        // Workbench-parity advance: once a group finishes, the walkthrough
        // moves to the next group as the new `active` step. Only the final
        // group lingers as `selected` (terminal post-run). Without this
        // advance the just-finished group would stay 'selected' and the
        // following 'pending' group would never unlock — leaving the user
        // unable to step forward.
        const nextIndex = targetIndex + 1
        if (nextIndex < opsGroups.length) {
          setOpsCurrentGroupIndex(nextIndex)
          setOpsCurrentPhase('pre-run')
        } else {
          setOpsCurrentGroupIndex(targetIndex)
          setOpsCurrentPhase('post-run')
        }
      } catch (error) {
        setChartStatus({
          kind: 'error',
          message: error instanceof Error ? error.message : String(error),
        })
      } finally {
        setOpsRunning(false)
      }
    },
    [
      captureCurrentSvg,
      opsCurrentGroupIndex,
      opsCurrentPhase,
      opsGroupKeys,
      opsGroups,
      opsRunning,
      opsSessionRowIndex,
      renderRowChart,
      restoreSvgSnapshot,
      rows,
    ],
  )

  /**
   * Starts a per-row sentence-summary walkthrough.
   *
   * The first sentence (`ops`) becomes "active" → the user clicks it to run
   * the first group. Ops execution is always user-driven via the overlay;
   * this handler only sets up the session and produces a clean chart canvas.
   *
   * `browserEngine.resetChartHost(host)` forces the next `renderChart` to
   * rebuild from scratch instead of hitting the idempotent NO-OP path in
   * `ChartInstance.ensureRendered`. Without it, two cases would look like
   * "nothing happens" to the user:
   *   (a) Re-clicking Run Ops on the *same* row leaves the prior session's
   *       annotations on the SVG (specKey unchanged → NO-OP).
   *   (b) Clicking Run Ops on a different row that happens to share the
   *       same `chart_id` (same fixture, different question/explanation)
   *       hits the same NO-OP and never repaints the chart.
   */
  const handleStartOpsSession = useCallback(
    async (rowIndex: number) => {
      const row = rows[rowIndex]
      if (!row) return
      const { groups, keys } = parseOpsGroups(row.operation_spec)
      if (groups.length === 0) {
        setChartStatus({
          kind: 'error',
          message: 'operation_spec has no executable ops groups.',
        })
        return
      }
      setSelectedRowIndex(rowIndex)
      setOpsSessionRowIndex(rowIndex)
      setOpsGroups(groups)
      setOpsGroupKeys(keys)
      setOpsCurrentGroupIndex(0)
      setOpsCurrentPhase('pre-run')
      // Clear any prior session snapshots; this session will build its own
      // checkpoint map as the user steps through groups.
      opsSnapshotsRef.current = new Map()
      opsRuntimeSnapshotsRef.current = new Map()
      // Force a fresh chart build (see jsdoc above). The host's DOM is
      // emptied and its ChartInstance detached so the next `renderRowChart`
      // sees a clean slate.
      if (chartHostRef.current) {
        browserEngine.resetChartHost(chartHostRef.current)
      }
      // Render a clean chart immediately so the overlay sits over the right
      // scene. The resolved ChartSpec is captured for later incremental clicks.
      const freshSpec = await renderRowChart(rowIndex)
      opsSessionSpecRef.current = freshSpec

      // Convergent-DAG split detection. If the ops spec needs split (two
      // parallel sentences feeding a downstream merging sentence), spin up a
      // SurfaceManager bound to the chart-host. `runOpsUpToGroup` later
      // branches by role (left/right/merge) to route per-sentence runChartOps
      // to the correct surface.
      //
      // Pass `chartType` to the analyzer so chart families whose appliers
      // mutate opacity/annotations only (multipleLine — case 4pi1e6ev8e0zobww)
      // skip the split entirely. The convergent narrative still plays out, but
      // in-place on the single chart instead of across two surfaces.
      splitPlanRef.current = null
      surfaceManagerRef.current = null
      if (freshSpec && chartHostRef.current) {
        const chartType = getChartType(freshSpec)
        const plan = analyzeSplitPlan(groups as OperationSpec[][], { chartType: chartType ?? null })
        if (plan && chartType) {
          const surfaceManager = new SurfaceManager(chartHostRef.current)
          const rawRows = extractSpecRows(freshSpec)
          const datumValues = buildDatumValuesForSpec(freshSpec, rawRows)
          surfaceManager.createRootSurface(freshSpec, chartType, datumValues)
          splitPlanRef.current = plan
          surfaceManagerRef.current = surfaceManager
        }
      }
    },
    [renderRowChart, rows],
  )

  // Build sentence-summary overlay input from ops session state.
  // Workbench parity: only the current "active" sentence and any already
  // "completed" earlier sentence are clickable. Pending sentences (n+1 onward
  // when the current group has not run yet) stay disabled so the user is
  // forced to walk through the sequence step-by-step. 'selected' (the just-
  // finished step) is locked to prevent re-running the same step in place.
  const overlayRenderInput = useMemo<SentenceSummaryOverlayRenderInput | null>(() => {
    if (opsSessionRowIndex === null) return null
    if (opsGroups.length === 0) return null
    if (opsCurrentGroupIndex < 0) return null
    return {
      items: opsGroups.map((_, index): SentenceSummaryOverlayItem => {
        const state =
          index < opsCurrentGroupIndex
            ? 'completed'
            : index === opsCurrentGroupIndex
              ? opsCurrentPhase === 'post-run'
                ? 'selected'
                : 'active'
              : 'pending'
        const actionable = state === 'active' || state === 'completed'
        return {
          // The label for each chunk is the group key itself ("ops", "ops2",
          // "ops3", ...) — not a slice of the explanation. This keeps the
          // overlay deterministic and tied to the operation_spec structure.
          text: opsGroupKeys[index] ?? `ops${index + 1}`,
          state,
          disabled: !actionable || opsRunning,
          onClick: actionable ? () => runOpsUpToGroup(index) : null,
        }
      }),
    }
  }, [
    opsCurrentGroupIndex,
    opsCurrentPhase,
    opsGroupKeys,
    opsGroups,
    opsRunning,
    opsSessionRowIndex,
    runOpsUpToGroup,
  ])

  // Mount/refresh sentence-summary overlay on the chart host.
  useEffect(() => {
    if (!chartHostRef.current) return
    if (!overlayRenderInput) {
      clearSentenceSummaryOverlay(chartHostRef.current)
      return
    }
    renderSentenceSummaryOverlay(chartHostRef.current, overlayRenderInput)
  }, [overlayRenderInput])

  const visibleIndexes = useMemo(() => {
    return rows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => {
        if (opStatusFilter !== 'all' && row.op_status !== opStatusFilter) return false
        if (vizStatusFilter !== 'all' && row.viz_status !== vizStatusFilter) return false
        if (chartTypeFilter !== 'all' && row.chart_type !== chartTypeFilter) return false
        if (feedbackOnly && !rowHasFeedback(row)) return false
        return true
      })
      .map(({ index }) => index)
  }, [chartTypeFilter, feedbackOnly, opStatusFilter, rows, vizStatusFilter])

  const feedbackRows = useMemo(
    () => rows.reduce((acc, row) => acc + (rowHasFeedback(row) ? 1 : 0), 0),
    [rows],
  )

  const selectedRow = selectedRowIndex !== null ? rows[selectedRowIndex] : null
  const canRender = selectedRowIndex !== null

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
            opStatusFilter={opStatusFilter}
            onOpStatusFilterChange={setOpStatusFilter}
            vizStatusFilter={vizStatusFilter}
            onVizStatusFilterChange={setVizStatusFilter}
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
            onRunOps={(rowIndex) => void handleStartOpsSession(rowIndex)}
            opsRunning={opsRunning}
            onToggleFeedbackPanel={handleToggleFeedbackPanel}
            feedbackPanelRowIndex={feedbackPanelRowIndex}
          />
        </div>
        <div className="review-right">
          {feedbackPanelRowIndex !== null && rows[feedbackPanelRowIndex] ? (
            <ReviewFeedbackPanel
              row={rows[feedbackPanelRowIndex]}
              rowIndex={feedbackPanelRowIndex}
              onClose={handleCloseFeedbackPanel}
              onOpFeedbackChange={handleOpFeedbackChange}
              onVizFeedbackChange={handleVizFeedbackChange}
            />
          ) : null}
          <ReviewChartPane
            ref={chartHostRef}
            status={chartStatus}
            stale={stale}
            selectedChartId={selectedRow?.chart_id ?? null}
            canRender={canRender}
            onRerender={handleRerender}
            onResetChart={handleResetChart}
          />
        </div>
      </div>
    </div>
  )
}

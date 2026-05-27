import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { ReviewRow } from '../services/reviewCasesService'
import { resolveSpec } from '../services/chartSpecResolver'
import {
  parseOpsSpec,
  summarizeChartContext,
  summarizeParams,
  inputsOf,
  toneOf,
  type ChartContext,
  type ParsedOpsSpec,
  type RawOp,
} from '../services/opsSpecLayout'
import OpsDagPopover from './OpsDagPopover'

type Props = {
  spec: string
  row: ReviewRow
  /**
   * When true, the body of the spec view is replaced with the `editorSlot`
   * (a JSON editor) while the header (Tree/JSON toggle + ⤢) remains visible.
   * Clicking the Tree tab in this mode calls `onExitEdit` so the user can
   * leave the editor and return to the tree view without losing the toggle.
   */
  editing?: boolean
  editorSlot?: ReactNode
  onExitEdit?: () => void
  /**
   * Optional callback that starts the per-row ops session (rendered as a
   * "Run" button next to the JSON tab). Disabled when there are no ops or
   * the spec is invalid.
   */
  onRunOps?: () => void
  runDisabled?: boolean
}

type ViewMode = 'tree' | 'json'

const MARK_EMOJI: Record<string, string> = {
  line: '📈',
  bar: '📊',
  point: '⚬',
  area: '🟦',
  rule: '┃',
  tick: '┃',
  arc: '◔',
}

function previewJson(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return '(empty — click to edit)'
  try {
    const compact = JSON.stringify(JSON.parse(trimmed))
    return compact.length > 160 ? `${compact.slice(0, 157)}…` : compact
  } catch {
    return `${trimmed.slice(0, 157)}${trimmed.length > 157 ? '…' : ''} (invalid JSON)`
  }
}

export default function OperationSpecView({
  spec,
  row,
  editing = false,
  editorSlot = null,
  onExitEdit,
  onRunOps,
  runDisabled,
}: Props) {
  const [mode, setMode] = useState<ViewMode>('tree')
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [chartCtx, setChartCtx] = useState<ChartContext | null>(null)
  const expandBtnRef = useRef<HTMLButtonElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  // While the user is editing, the active tab in the header is forced to
  // JSON (the editor is a JSON editor). When they leave editing mode we
  // restore whatever mode they were last viewing.
  const activeMode: ViewMode = editing ? 'json' : mode

  const handleTreeClick = useCallback(() => {
    if (editing) {
      // Leaving the editor; restore tree view afterwards.
      setMode('tree')
      onExitEdit?.()
      return
    }
    setMode('tree')
  }, [editing, onExitEdit])

  const handleJsonClick = useCallback(() => {
    // In editing mode the editor is already a JSON editor; clicking JSON
    // is a no-op aside from keeping the visual selection clear.
    if (editing) return
    setMode('json')
  }, [editing])

  // Lazy-load chart context once per chart_id. resolveSpec hits a glob map so
  // this is essentially free after first call.
  useEffect(() => {
    let cancelled = false
    if (!row.chart_id) {
      setChartCtx(null)
      return () => {
        cancelled = true
      }
    }
    void resolveSpec(row.chart_id).then((res) => {
      if (cancelled) return
      if (res.ok) setChartCtx(summarizeChartContext(res.spec))
      else setChartCtx(null)
    })
    return () => {
      cancelled = true
    }
  }, [row.chart_id])

  const parsed = useMemo(() => parseOpsSpec(spec), [spec])

  const stop = (e: React.MouseEvent | React.KeyboardEvent) => e.stopPropagation()

  return (
    <div className="ops-view" ref={containerRef}>
      <div className="ops-view-header" onClick={stop} onMouseDown={stop}>
        <div className="ops-view-toggle" role="tablist" aria-label="Operation spec view">
          <button
            type="button"
            role="tab"
            aria-selected={activeMode === 'tree'}
            className={`ops-view-toggle-btn ${activeMode === 'tree' ? 'is-active' : ''}`}
            onClick={handleTreeClick}
            title={editing ? 'Exit editor and return to tree view' : 'Show tree view'}
          >
            Tree
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeMode === 'json'}
            className={`ops-view-toggle-btn ${activeMode === 'json' ? 'is-active' : ''}`}
            onClick={handleJsonClick}
            title={editing ? 'JSON editor (active)' : 'Show JSON preview'}
          >
            JSON
          </button>
        </div>
        {onRunOps ? (
          <button
            type="button"
            className="ops-view-run-btn"
            onClick={() => onRunOps()}
            disabled={runDisabled || !parsed.ok || !parsed.spec.flat.length}
            title={
              runDisabled
                ? 'Already running'
                : !parsed.ok || !parsed.spec.flat.length
                ? 'No ops to run'
                : 'Render chart and start the ops walkthrough for this row'
            }
          >
            ▶ Run ops
          </button>
        ) : null}
        <button
          type="button"
          ref={expandBtnRef}
          className="ops-view-expand"
          onClick={() => parsed.ok && setPopoverOpen((prev) => !prev)}
          disabled={!parsed.ok || !parsed.spec.flat.length}
          title={parsed.ok && parsed.spec.flat.length ? 'Open DAG popover' : 'No ops to graph'}
        >
          ⤢
        </button>
      </div>

      {chartCtx ? <ChartContextStrip ctx={chartCtx} /> : null}

      {editing ? (
        <div className="ops-view-editor-slot" onClick={stop} onMouseDown={stop}>
          {editorSlot}
        </div>
      ) : mode === 'json' ? (
        <span className={`review-cell-preview ${spec.trim() ? '' : 'is-empty'}`}>
          {previewJson(spec)}
        </span>
      ) : parsed.ok ? (
        <TreeView spec={parsed.spec} />
      ) : (
        <span className="review-cell-preview is-empty">
          {spec.trim() ? `(invalid JSON — ${parsed.error})` : '(empty — click to edit)'}
        </span>
      )}

      {popoverOpen && parsed.ok && parsed.spec.flat.length ? (
        <OpsDagPopover
          spec={parsed.spec}
          anchorEl={expandBtnRef.current}
          onClose={() => setPopoverOpen(false)}
        />
      ) : null}
    </div>
  )
}

// ── Chart context strip ────────────────────────────────────────────────────

function ChartContextStrip({ ctx }: { ctx: ChartContext }) {
  if (!ctx.markType && !ctx.xField && !ctx.yField) return null
  const emoji = ctx.markType ? MARK_EMOJI[ctx.markType] ?? '📊' : '📊'
  const parts: string[] = []
  if (ctx.markType) parts.push(ctx.markType)
  if (ctx.xField) parts.push(`X: ${ctx.xField}`)
  if (ctx.yField) parts.push(`Y: ${ctx.yField}`)
  if (ctx.colorField) parts.push(`color: ${ctx.colorField}`)
  return (
    <div className="ops-view-context" title={parts.join(' · ')}>
      <span className="ops-view-context-emoji">{emoji}</span>
      <span className="ops-view-context-text">{parts.join(' · ')}</span>
    </div>
  )
}

// ── Tree (group cards + SVG edge overlay) ────────────────────────────────

type NodeRect = { x: number; y: number; w: number; h: number }
type Edge = { from: string; to: string; isCrossGroup: boolean }

function TreeView({ spec }: { spec: ParsedOpsSpec }) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const nodeRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const [positions, setPositions] = useState<Map<string, NodeRect>>(new Map())
  const [containerSize, setContainerSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 })

  // Build edge list from meta.inputs (and ref:n* in params, via inputsOf).
  // Only keep edges where both endpoints exist in the parsed spec.
  const edges = useMemo<Edge[]>(() => {
    const sentenceByOpId = new Map<string, number>()
    for (const g of spec.groups) {
      for (const op of g.ops) {
        if (typeof op.id === 'string') sentenceByOpId.set(op.id, g.sentenceIndex)
      }
    }
    const out: Edge[] = []
    for (const op of spec.flat) {
      if (typeof op.id !== 'string') continue
      const toSentence = sentenceByOpId.get(op.id)
      for (const fromId of inputsOf(op)) {
        if (!sentenceByOpId.has(fromId)) continue
        const fromSentence = sentenceByOpId.get(fromId)
        out.push({ from: fromId, to: op.id, isCrossGroup: fromSentence !== toSentence })
      }
    }
    return out
  }, [spec])

  const registerNode = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) nodeRefs.current.set(id, el)
    else nodeRefs.current.delete(id)
  }, [])

  const measurePositions = useCallback(() => {
    const container = containerRef.current
    if (!container) return
    const containerRect = container.getBoundingClientRect()
    const next = new Map<string, NodeRect>()
    nodeRefs.current.forEach((el, id) => {
      const r = el.getBoundingClientRect()
      next.set(id, {
        x: r.left - containerRect.left,
        y: r.top - containerRect.top,
        w: r.width,
        h: r.height,
      })
    })
    setPositions(next)
    setContainerSize({ w: containerRect.width, h: containerRect.height })
  }, [])

  useLayoutEffect(() => {
    // DOM measurement after layout: setState here is the intended pattern.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    measurePositions()
  }, [spec, measurePositions])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => measurePositions())
    ro.observe(el)
    return () => ro.disconnect()
  }, [measurePositions])

  if (!spec.flat.length) {
    return (
      <div className="ops-view-empty">
        <em>(no ops — judge marked as no-op fallback)</em>
      </div>
    )
  }

  return (
    <div className="ops-view-tree" ref={containerRef}>
      {spec.groups.map((group) => (
        <GroupCard key={group.key} group={group} registerNode={registerNode} />
      ))}
      <EdgeOverlay edges={edges} positions={positions} width={containerSize.w} height={containerSize.h} />
    </div>
  )
}

function GroupCard({
  group,
  registerNode,
}: {
  group: ParsedOpsSpec['groups'][number]
  registerNode: (id: string, el: HTMLDivElement | null) => void
}) {
  return (
    <div className="ops-group-card">
      <div className="ops-group-card-header">
        <span className="ops-view-sentence-tag">S{group.sentenceIndex}</span>
        <span className="ops-group-card-key">{group.key}</span>
        <span className="ops-group-card-rule" />
        <span className="ops-group-card-count">
          {group.ops.length} op{group.ops.length === 1 ? '' : 's'}
        </span>
      </div>
      <div className="ops-group-card-body">
        {group.ops.map((op) => (
          <OpNode key={`${group.key}-${op.id}`} op={op} registerNode={registerNode} />
        ))}
      </div>
    </div>
  )
}

function OpNode({
  op,
  registerNode,
}: {
  op: RawOp
  registerNode: (id: string, el: HTMLDivElement | null) => void
}) {
  const tone = toneOf(op.op)
  const params = summarizeParams(op)
  const tooltip = JSON.stringify(op, null, 2)
  const setRef = useCallback(
    (el: HTMLDivElement | null) => {
      registerNode(op.id, el)
    },
    [op.id, registerNode],
  )
  return (
    <div className="ops-op-node" title={tooltip} ref={setRef}>
      <span className={`ops-view-dot tone-${tone}`} aria-hidden="true" />
      <span className="ops-view-op-name">{op.op}</span>
      <span className="ops-view-op-params">{params}</span>
      <span className="ops-view-op-id">{op.id}</span>
    </div>
  )
}

function EdgeOverlay({
  edges,
  positions,
  width,
  height,
}: {
  edges: Edge[]
  positions: Map<string, NodeRect>
  width: number
  height: number
}) {
  if (!width || !height || !edges.length || !positions.size) return null
  return (
    <svg
      className="ops-edge-overlay"
      width={width}
      height={height}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <marker
          id="ops-tree-arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
        </marker>
      </defs>
      {edges.map((edge, i) => {
        const from = positions.get(edge.from)
        const to = positions.get(edge.to)
        if (!from || !to) return null
        const x1 = from.x + from.w / 2
        const y1 = from.y + from.h
        const x2 = to.x + to.w / 2
        const y2 = to.y
        const midY = (y1 + y2) / 2
        const path = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`
        return (
          <path
            key={`${edge.from}->${edge.to}-${i}`}
            d={path}
            className={`ops-edge-path ${edge.isCrossGroup ? 'is-cross-group' : ''}`}
            markerEnd="url(#ops-tree-arrow)"
          />
        )
      })}
    </svg>
  )
}

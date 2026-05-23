import { useEffect, useMemo, useRef, useState } from 'react'
import {
  inputsOf,
  layoutDag,
  summarizeParams,
  toneOf,
  type ParsedOpsSpec,
} from '../services/opsSpecLayout'

type Props = {
  spec: ParsedOpsSpec
  anchorEl: HTMLElement | null
  onClose: () => void
}

const PANEL_MAX_WIDTH = 720
const PANEL_MIN_WIDTH = 360
const PANEL_PADDING = 16

export default function OpsDagPopover({ spec, anchorEl, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [placement, setPlacement] = useState<{ top: number; left: number; width: number } | null>(null)

  // Position the panel relative to the anchor cell. Flip above if it would
  // overflow the viewport bottom.
  useEffect(() => {
    if (!anchorEl) return
    const updatePlacement = () => {
      const rect = anchorEl.getBoundingClientRect()
      const innerWidth = window.innerWidth
      const innerHeight = window.innerHeight
      const width = Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, rect.width + 48))
      const left = Math.max(
        PANEL_PADDING,
        Math.min(innerWidth - width - PANEL_PADDING, rect.left + (rect.width - width) / 2),
      )
      const desiredHeight = 360
      const spaceBelow = innerHeight - rect.bottom
      const spaceAbove = rect.top
      const top =
        spaceBelow >= desiredHeight || spaceBelow >= spaceAbove
          ? rect.bottom + 6
          : Math.max(PANEL_PADDING, rect.top - desiredHeight - 6)
      setPlacement({ top, left, width })
    }
    updatePlacement()
    window.addEventListener('resize', updatePlacement)
    window.addEventListener('scroll', updatePlacement, true)
    return () => {
      window.removeEventListener('resize', updatePlacement)
      window.removeEventListener('scroll', updatePlacement, true)
    }
  }, [anchorEl])

  // Outside click + Esc to close.
  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      const panel = panelRef.current
      if (!panel) return
      if (panel.contains(event.target as Node)) return
      if (anchorEl && anchorEl.contains(event.target as Node)) return
      onClose()
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [anchorEl, onClose])

  const layout = useMemo(
    () => layoutDag(spec, { minWidth: (placement?.width ?? PANEL_MIN_WIDTH) - 32 }),
    [spec, placement?.width],
  )

  if (!placement) return null
  if (!spec.flat.length) {
    return (
      <div
        ref={panelRef}
        className="ops-dag-popover"
        style={{ top: placement.top, left: placement.left, width: placement.width }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ops-dag-popover-header">
          <span>Operation DAG</span>
          <button type="button" className="ops-dag-close" onClick={onClose} title="Close">✕</button>
        </div>
        <div className="ops-dag-empty">No ops in this spec.</div>
      </div>
    )
  }

  const hoveredOp = hoverId ? spec.flat.find((o) => o.id === hoverId) : null

  return (
    <div
      ref={panelRef}
      className="ops-dag-popover"
      style={{ top: placement.top, left: placement.left, width: placement.width }}
      onClick={(e) => e.stopPropagation()}
      role="dialog"
      aria-label="Operation spec DAG"
    >
      <div className="ops-dag-popover-header">
        <span>Operation DAG · {spec.flat.length} ops · {spec.groups.length} sentence{spec.groups.length === 1 ? '' : 's'}</span>
        <button type="button" className="ops-dag-close" onClick={onClose} title="Close (Esc)">✕</button>
      </div>
      <div className="ops-dag-scroll">
        <svg
          width={layout.width}
          height={layout.height}
          className="ops-dag-svg"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <marker
              id="ops-dag-arrow"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
            </marker>
          </defs>
          {/* Edges first so nodes draw on top */}
          <g className="ops-dag-edges">
            {layout.edges.map((edge, i) => {
              const from = layout.nodes.find((n) => n.id === edge.from)
              const to = layout.nodes.find((n) => n.id === edge.to)
              if (!from || !to) return null
              const x1 = from.x + layout.nodeWidth / 2
              const y1 = from.y + layout.nodeHeight
              const x2 = to.x + layout.nodeWidth / 2
              const y2 = to.y
              const midY = (y1 + y2) / 2
              const path = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`
              const isHot = hoverId && (edge.from === hoverId || edge.to === hoverId)
              return (
                <path
                  key={i}
                  d={path}
                  className={`ops-dag-edge ${isHot ? 'is-hot' : ''}`}
                  markerEnd="url(#ops-dag-arrow)"
                  fill="none"
                />
              )
            })}
          </g>
          {/* Nodes */}
          <g className="ops-dag-nodes">
            {layout.nodes.map((node) => {
              const tone = toneOf(node.op.op)
              const isHot = node.id === hoverId
              const isUpstream =
                hoverId &&
                layout.edges.some((e) => e.to === hoverId && e.from === node.id)
              const isDownstream =
                hoverId &&
                layout.edges.some((e) => e.from === hoverId && e.to === node.id)
              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x},${node.y})`}
                  className={`ops-dag-node tone-${tone} ${isHot ? 'is-hot' : ''} ${
                    isUpstream || isDownstream ? 'is-linked' : ''
                  }`}
                  onMouseEnter={() => setHoverId(node.id)}
                  onMouseLeave={() => setHoverId((prev) => (prev === node.id ? null : prev))}
                >
                  <rect
                    width={layout.nodeWidth}
                    height={layout.nodeHeight}
                    rx={8}
                    className="ops-dag-node-bg"
                  />
                  <rect width={4} height={layout.nodeHeight} className="ops-dag-node-stripe" />
                  <text x={14} y={18} className="ops-dag-node-op">
                    {node.op.op}
                  </text>
                  <text x={14} y={34} className="ops-dag-node-params">
                    {truncate(summarizeParams(node.op), 22)}
                  </text>
                  <text
                    x={layout.nodeWidth - 8}
                    y={layout.nodeHeight - 8}
                    className="ops-dag-node-id"
                    textAnchor="end"
                  >
                    {node.id} · S{node.op.meta?.sentenceIndex ?? '?'}
                  </text>
                </g>
              )
            })}
          </g>
        </svg>
      </div>
      {hoveredOp ? (
        <div className="ops-dag-tooltip">
          <pre>{JSON.stringify(hoveredOp, null, 2)}</pre>
        </div>
      ) : (
        <div className="ops-dag-hint">
          Hover a node to inspect its full JSON. Drag horizontally to scroll if cropped.
          {(() => {
            const refOnly = spec.flat.filter((op) => inputsOf(op).length === 0).length
            return refOnly === spec.flat.length ? ' (No edges — all roots.)' : ''
          })()}
        </div>
      )}
    </div>
  )
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`
}

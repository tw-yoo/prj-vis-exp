// Pure helpers for laying out operation_spec as a sentence-grouped DAG.
// No React, no DOM — so the same module backs both the compact tree view
// and the SVG popover. The Kahn topological sort + level assignment is
// adapted from web/specTest/pages/SpecTestPage.tsx graphLayout.

export type OpFamily = 'aggregate' | 'selection' | 'reduce' | 'diff' | 'boolean' | 'math' | 'render' | 'other'

export type ChipTone = 'blue' | 'purple' | 'teal' | 'red' | 'amber' | 'slate'

/**
 * Single source of truth: op name → family.
 * 17 known ops mapped explicitly; anything unknown falls through to 'other'
 * (rendered with the slate chip) so the view never crashes on new op types.
 */
const FAMILY_BY_OP: Record<string, OpFamily> = {
  average: 'aggregate',
  sum: 'aggregate',
  count: 'aggregate',
  nth: 'aggregate',
  retrieveValue: 'selection',
  findExtremum: 'selection',
  filter: 'reduce',
  sort: 'reduce',
  diff: 'diff',
  diffByValue: 'diff',
  pairDiff: 'diff',
  lagDiff: 'diff',
  compareBool: 'boolean',
  add: 'math',
  scale: 'math',
  draw: 'render',
}

const TONE_BY_FAMILY: Record<OpFamily, ChipTone> = {
  aggregate: 'blue',
  selection: 'teal',
  reduce: 'purple',
  diff: 'red',
  boolean: 'amber',
  math: 'slate',
  render: 'slate',
  other: 'slate',
}

export function familyOf(opName: string): OpFamily {
  return FAMILY_BY_OP[opName] ?? 'other'
}

export function toneOf(opName: string): ChipTone {
  return TONE_BY_FAMILY[familyOf(opName)]
}

// ── Parsed shapes ─────────────────────────────────────────────────────────

export type RawOp = {
  op: string
  id: string
  meta?: { nodeId?: string; inputs?: string[]; sentenceIndex?: number }
  [key: string]: unknown
}

export type ParsedOpsSpec = {
  /** ordered groups; key is the original ops/ops2/... string */
  groups: Array<{ key: string; sentenceIndex: number; ops: RawOp[] }>
  /** flat list across all groups, in declaration order */
  flat: RawOp[]
}

const GROUP_KEY_RE = /^ops(\d*)$/

export function parseOpsSpec(raw: string): { ok: true; spec: ParsedOpsSpec } | { ok: false; error: string } {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return { ok: false, error: 'empty' }
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'not an object' }
  }
  const obj = parsed as Record<string, unknown>
  const sentenceFor = (k: string) => {
    const m = k.match(GROUP_KEY_RE)
    if (!m) return null
    const idx = m[1] === '' ? 1 : Number(m[1])
    return Number.isFinite(idx) ? idx : null
  }
  const entries = Object.entries(obj).filter(([k]) => sentenceFor(k) !== null)
  entries.sort((a, b) => (sentenceFor(a[0]) ?? 0) - (sentenceFor(b[0]) ?? 0))
  const groups: ParsedOpsSpec['groups'] = []
  const flat: RawOp[] = []
  for (const [key, value] of entries) {
    if (!Array.isArray(value)) continue
    const sentence = sentenceFor(key) ?? 1
    const ops = value.filter((o): o is RawOp => !!o && typeof o === 'object' && typeof (o as RawOp).op === 'string')
    groups.push({ key, sentenceIndex: sentence, ops })
    flat.push(...ops)
  }
  return { ok: true, spec: { groups, flat } }
}

// ── Param summary (compact text) ──────────────────────────────────────────

/**
 * Pick 1-2 most-informative params for inline display. Long arrays and
 * `meta` are folded down to short blurbs; full details belong in the hover
 * tooltip or the popover.
 */
export function summarizeParams(op: RawOp): string {
  const skip = new Set(['op', 'id', 'meta'])
  const bits: string[] = []
  for (const [key, value] of Object.entries(op)) {
    if (skip.has(key)) continue
    bits.push(`${key}=${formatValue(value)}`)
    if (bits.length >= 4) break
  }
  return bits.join(' · ')
}

function formatValue(v: unknown): string {
  if (typeof v === 'string') {
    if (v.startsWith('ref:')) return v
    return `"${truncate(v, 30)}"`
  }
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (v === null) return 'null'
  if (Array.isArray(v)) {
    if (v.length <= 3) return `[${v.map((x) => formatValue(x)).join(',')}]`
    return `[${formatValue(v[0])},…+${v.length - 1}]`
  }
  if (typeof v === 'object') {
    const keys = Object.keys(v as object)
    return `{${keys.slice(0, 2).join(',')}${keys.length > 2 ? ',…' : ''}}`
  }
  return String(v)
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`
}

// ── References (inputs + ref: strings in params) ──────────────────────────

/** Return the unique upstream node ids this op consumes (deduped). */
export function inputsOf(op: RawOp): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  const push = (id: string) => {
    if (!seen.has(id)) {
      seen.add(id)
      out.push(id)
    }
  }
  for (const id of op.meta?.inputs ?? []) {
    if (typeof id === 'string') push(id)
  }
  // Also catch ref:n* embedded in param values
  for (const [key, value] of Object.entries(op)) {
    if (key === 'meta') continue
    if (typeof value === 'string' && value.startsWith('ref:')) {
      push(value.slice(4))
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string' && item.startsWith('ref:')) push(item.slice(4))
      }
    }
  }
  return out
}

// ── Chart context strip (read vega-lite spec → 1-line summary) ────────────

export type ChartContext = {
  markType: string | null
  xField: string | null
  yField: string | null
  colorField: string | null
}

export function summarizeChartContext(spec: unknown): ChartContext | null {
  if (!spec || typeof spec !== 'object') return null
  const root = spec as Record<string, unknown>
  // Mark can be on root or inside the first layer.
  let markType: string | null = null
  const rawMark = root.mark
  if (typeof rawMark === 'string') markType = rawMark
  else if (rawMark && typeof rawMark === 'object') markType = (rawMark as { type?: string }).type ?? null
  let encoding = root.encoding as Record<string, unknown> | undefined
  if ((!encoding || !markType) && Array.isArray(root.layer)) {
    const firstLayer = root.layer.find((l): l is Record<string, unknown> => !!l && typeof l === 'object')
    if (firstLayer) {
      const lm = firstLayer.mark
      if (!markType) {
        if (typeof lm === 'string') markType = lm
        else if (lm && typeof lm === 'object') markType = (lm as { type?: string }).type ?? null
      }
      if (!encoding && firstLayer.encoding && typeof firstLayer.encoding === 'object') {
        encoding = firstLayer.encoding as Record<string, unknown>
      }
    }
  }
  const fieldFromChannel = (channel: unknown): string | null => {
    if (!channel || typeof channel !== 'object') return null
    const f = (channel as { field?: unknown }).field
    return typeof f === 'string' ? f : null
  }
  return {
    markType,
    xField: fieldFromChannel(encoding?.x),
    yField: fieldFromChannel(encoding?.y),
    colorField: fieldFromChannel(encoding?.color),
  }
}

// ── DAG layout (Kahn + level assignment) for SVG popover ──────────────────

export type LayoutNode = {
  id: string
  op: RawOp
  level: number
  index: number
  x: number
  y: number
}

export type LayoutEdge = { from: string; to: string }

export type DagLayout = {
  nodes: LayoutNode[]
  edges: LayoutEdge[]
  width: number
  height: number
  nodeWidth: number
  nodeHeight: number
}

/**
 * Adapted from SpecTestPage's graphLayout. Pure function: no React state.
 * Caller may pass a width hint (e.g. popover viewport width).
 */
export function layoutDag(spec: ParsedOpsSpec, opts?: { minWidth?: number }): DagLayout {
  const nodeWidth = 160
  const nodeHeight = 56
  const gapX = 24
  const gapY = 56
  const pad = 16
  const minWidth = opts?.minWidth ?? 320

  const nodes = spec.flat
  const ids: string[] = nodes.map((op) => op.id).filter((id): id is string => typeof id === 'string')
  const byId = new Map<string, RawOp>()
  nodes.forEach((op) => {
    if (typeof op.id === 'string') byId.set(op.id, op)
  })

  const indeg = new Map<string, number>(ids.map((id) => [id, 0]))
  const edges: LayoutEdge[] = []
  for (const op of nodes) {
    const to = op.id
    for (const from of inputsOf(op)) {
      if (!byId.has(from)) continue
      edges.push({ from, to })
      indeg.set(to, (indeg.get(to) ?? 0) + 1)
    }
  }

  // Kahn topo + level (= max(parent level)+1)
  const level = new Map<string, number>()
  const queue: string[] = ids.filter((id) => (indeg.get(id) ?? 0) === 0)
  queue.sort()
  queue.forEach((id) => level.set(id, 0))
  while (queue.length) {
    const cur = queue.shift()
    if (!cur) break
    for (const edge of edges) {
      if (edge.from !== cur) continue
      const next = edge.to
      indeg.set(next, (indeg.get(next) ?? 0) - 1)
      level.set(next, Math.max(level.get(next) ?? 0, (level.get(cur) ?? 0) + 1))
      if ((indeg.get(next) ?? 0) === 0) queue.push(next)
    }
    queue.sort()
  }
  ids.forEach((id) => {
    if (!level.has(id)) level.set(id, 0)
  })

  const maxLevel = Math.max(0, ...ids.map((id) => level.get(id) ?? 0))
  const byLevel: Record<number, string[]> = {}
  for (let l = 0; l <= maxLevel; l += 1) byLevel[l] = []
  ids.forEach((id) => byLevel[level.get(id) ?? 0].push(id))

  const sentenceOf = (id: string) => byId.get(id)?.meta?.sentenceIndex ?? 999
  const numOf = (id: string) => {
    const m = id.match(/^n(\d+)$/)
    return m ? Number(m[1]) : 999_999
  }
  Object.values(byLevel).forEach((list) => {
    list.sort((a, b) => {
      const sa = sentenceOf(a)
      const sb = sentenceOf(b)
      if (sa !== sb) return sa - sb
      return numOf(a) - numOf(b)
    })
  })

  const maxCount = Math.max(1, ...Object.values(byLevel).map((list) => list.length))
  const requiredWidth = pad * 2 + maxCount * nodeWidth + (maxCount - 1) * gapX
  const width = Math.max(minWidth, requiredWidth)
  const height = pad * 2 + (maxLevel + 1) * nodeHeight + maxLevel * gapY

  const layoutNodes: LayoutNode[] = []
  for (const [k, list] of Object.entries(byLevel)) {
    const l = Number(k)
    const rowWidth = list.length * nodeWidth + Math.max(0, list.length - 1) * gapX
    const startX = Math.max(pad, Math.floor((width - rowWidth) / 2))
    list.forEach((id, idx) => {
      const op = byId.get(id)
      if (!op) return
      layoutNodes.push({
        id,
        op,
        level: l,
        index: idx,
        x: startX + idx * (nodeWidth + gapX),
        y: pad + l * (nodeHeight + gapY),
      })
    })
  }
  return { nodes: layoutNodes, edges, width, height, nodeWidth, nodeHeight }
}

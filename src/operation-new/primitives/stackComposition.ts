import type * as d3 from 'd3'
import type { DatumValue } from '../../domain/operation/types'
import { DataAttributes } from '../../rendering/interfaces'

/**
 * Per-rect recomposition output. One entry per existing `<rect.main-bar>` in
 * the chart, regardless of whether it remains in scope. Out-of-scope segments
 * are emitted with `y0 === y1` (zero-height collapse at the current cumulative
 * top) so the bar can transition to opacity 0 in place without leaving a hole
 * in the stack.
 */
export interface StackedRectLayout {
  node: SVGRectElement
  target: string
  series: string
  value: number
  inScope: boolean
  /** Data-space y0 (running cumulative sum BEFORE this segment). */
  y0: number
  /** Data-space y1 (running cumulative sum AFTER this segment; equals y0 for out-of-scope). */
  y1: number
}

export interface StackedRecomposition {
  /** One entry per current `<rect.main-bar>` node, in DOM order. */
  layouts: StackedRectLayout[]
  /** Sum of in-scope segment values per target (after recomposition). */
  perTargetTotal: Map<string, number>
  /** Max of `perTargetTotal` values — drives the new yScale max. */
  maxStackTotal: number
}

/**
 * Reads every `<rect.main-bar>` from the given d3 selection and recomputes the
 * stack layout assuming only segments where `isInScope(target, series)` returns
 * true contribute to the stack. Out-of-scope segments collapse to zero height
 * at the current cumulative top, ready for a smooth opacity → 0 transition.
 *
 * The returned `layouts` are aligned 1:1 with the input selection's DOM nodes,
 * so a caller can build a `Map<SVGRectElement, StackedRectLayout>` for lookup
 * inside a d3 `.transition()` callback.
 *
 * Notes:
 *   - DOM order within a target group is preserved. The base renderer emits
 *     rects in `seriesDomain` order per target, so the stack reads bottom→top
 *     in the same order the legend lists series.
 *   - Bar values are read from `data-value` attributes set by the base
 *     renderer. We avoid `__data__` because the legacy renderer's bound datum
 *     shape varies by renderer and isn't part of the rendering-new contract.
 */
export function recomposeStackedBarsFromDom(args: {
  bars: d3.Selection<SVGRectElement, unknown, d3.BaseType, unknown>
  isInScope: (target: string, series: string) => boolean
}): StackedRecomposition {
  const { bars, isInScope } = args

  type Row = { node: SVGRectElement; target: string; series: string; value: number }
  const rows: Row[] = []
  // Group bars by target preserving DOM order. We use a Map<target, Row[]>
  // built from the iteration order so the stack-up order is deterministic
  // and matches the legend.
  const byTarget = new Map<string, Row[]>()

  bars.each(function () {
    const node = this as SVGRectElement
    const target = node.getAttribute(DataAttributes.Target) ?? ''
    const series =
      node.getAttribute(DataAttributes.Series) ??
      node.getAttribute(DataAttributes.GroupValue) ??
      ''
    const valueRaw = node.getAttribute(DataAttributes.Value)
    const value = Number(valueRaw)
    const row: Row = { node, target, series, value: Number.isFinite(value) ? value : 0 }
    rows.push(row)
    if (!byTarget.has(target)) byTarget.set(target, [])
    byTarget.get(target)!.push(row)
  })

  const layoutsByNode = new Map<SVGRectElement, StackedRectLayout>()
  const perTargetTotal = new Map<string, number>()
  let maxStackTotal = 0

  byTarget.forEach((segments, target) => {
    let cumY = 0
    segments.forEach((seg) => {
      const inScope = isInScope(seg.target, seg.series)
      if (inScope) {
        const y0 = cumY
        const y1 = cumY + seg.value
        layoutsByNode.set(seg.node, {
          node: seg.node,
          target: seg.target,
          series: seg.series,
          value: seg.value,
          inScope: true,
          y0,
          y1,
        })
        cumY = y1
      } else {
        layoutsByNode.set(seg.node, {
          node: seg.node,
          target: seg.target,
          series: seg.series,
          value: seg.value,
          inScope: false,
          y0: cumY,
          y1: cumY,
        })
      }
    })
    perTargetTotal.set(target, cumY)
    if (cumY > maxStackTotal) maxStackTotal = cumY
  })

  // Preserve the input DOM order in the returned layouts array.
  const layouts: StackedRectLayout[] = rows
    .map((r) => layoutsByNode.get(r.node))
    .filter((l): l is StackedRectLayout => l != null)

  return { layouts, perTargetTotal, maxStackTotal }
}

/**
 * Per-rect recomposition output for grouped bars. Out-of-scope bars keep their
 * current x/width so they can fade out in place without affecting the
 * surviving bars' positions.
 */
export interface GroupedRectLayout {
  node: SVGRectElement
  panel: string
  target: string
  series: string
  value: number
  inScope: boolean
  /** Target x (pixels). For out-of-scope bars, equals current `x` attr. */
  newX: number
  /** Target width (pixels). For out-of-scope bars, equals current `width` attr. */
  newWidth: number
}

export interface GroupedRecomposition {
  layouts: GroupedRectLayout[]
}

/**
 * Recomputes grouped-bar layout for a `<rect.main-bar>` selection given an
 * `isInScope(panel, target, series)` predicate. Survivors within each
 * (panel, target) group spread evenly across the group's original span; the
 * padding ratio between bars is preserved from the current DOM state. Out-of-
 * scope bars keep their current x/width but get `inScope: false` so the
 * caller can fade them to opacity 0.
 *
 * If a (panel, target) group has zero survivors, all its bars stay in place
 * and fade out (no division-by-zero in the redistribute math).
 */
export function recomposeGroupedBarsFromDom(args: {
  bars: d3.Selection<SVGRectElement, unknown, d3.BaseType, unknown>
  isInScope: (panel: string, target: string, series: string) => boolean
  defaultPaddingRatio?: number
}): GroupedRecomposition {
  const { bars, isInScope } = args
  const defaultPadding = args.defaultPaddingRatio ?? 0.1

  type Row = {
    node: SVGRectElement
    panel: string
    target: string
    series: string
    value: number
    currentX: number
    currentWidth: number
  }

  const rows: Row[] = []
  const byGroup = new Map<string, Row[]>()
  const groupSpans = new Map<string, { minX: number; maxX: number }>()

  bars.each(function () {
    const node = this as SVGRectElement
    const panel = node.getAttribute(DataAttributes.ChartId) ?? 'root'
    const target = node.getAttribute(DataAttributes.Target) ?? ''
    const series =
      node.getAttribute(DataAttributes.Series) ??
      node.getAttribute(DataAttributes.GroupValue) ??
      ''
    const currentX = Number(node.getAttribute('x') ?? 0)
    const currentWidth = Number(node.getAttribute('width') ?? 0)
    const valueRaw = node.getAttribute(DataAttributes.Value)
    const value = Number(valueRaw)
    const row: Row = {
      node,
      panel,
      target,
      series,
      value: Number.isFinite(value) ? value : 0,
      currentX,
      currentWidth,
    }
    rows.push(row)
    const groupKey = `${panel}|${target}`
    if (!byGroup.has(groupKey)) byGroup.set(groupKey, [])
    byGroup.get(groupKey)!.push(row)
    const span = groupSpans.get(groupKey) ?? { minX: Infinity, maxX: -Infinity }
    span.minX = Math.min(span.minX, currentX)
    span.maxX = Math.max(span.maxX, currentX + currentWidth)
    groupSpans.set(groupKey, span)
  })

  const layoutByNode = new Map<SVGRectElement, GroupedRectLayout>()

  byGroup.forEach((groupBars, groupKey) => {
    const span = groupSpans.get(groupKey)!
    const groupSpan = span.maxX - span.minX
    const inScopeBars = groupBars.filter((b) => isInScope(b.panel, b.target, b.series))

    // Infer the original padding ratio from current DOM state. cellWidth in
    // the original layout = groupSpan / groupBars.length; barWidth =
    // cellWidth * (1 - padding) ⇒ padding = 1 - barWidth/cellWidth.
    let paddingRatio = defaultPadding
    if (groupBars.length > 0 && groupSpan > 0) {
      const originalCellWidth = groupSpan / groupBars.length
      const sample = groupBars[0]
      const inferred = 1 - sample.currentWidth / originalCellWidth
      if (Number.isFinite(inferred) && inferred >= 0 && inferred < 1) {
        paddingRatio = inferred
      }
    }

    if (inScopeBars.length === 0 || groupSpan <= 0) {
      // Keep current x/width; mark all out-of-scope (or no-op for empty group).
      groupBars.forEach((b) => {
        layoutByNode.set(b.node, {
          node: b.node,
          panel: b.panel,
          target: b.target,
          series: b.series,
          value: b.value,
          inScope: false,
          newX: b.currentX,
          newWidth: b.currentWidth,
        })
      })
      return
    }

    const newCellWidth = groupSpan / inScopeBars.length
    const newBarWidth = newCellWidth * (1 - paddingRatio)
    const padOffset = (newCellWidth - newBarWidth) / 2

    inScopeBars.forEach((bar, i) => {
      layoutByNode.set(bar.node, {
        node: bar.node,
        panel: bar.panel,
        target: bar.target,
        series: bar.series,
        value: bar.value,
        inScope: true,
        newX: span.minX + i * newCellWidth + padOffset,
        newWidth: newBarWidth,
      })
    })

    groupBars
      .filter((b) => !isInScope(b.panel, b.target, b.series))
      .forEach((b) => {
        layoutByNode.set(b.node, {
          node: b.node,
          panel: b.panel,
          target: b.target,
          series: b.series,
          value: b.value,
          inScope: false,
          newX: b.currentX,
          newWidth: b.currentWidth,
        })
      })
  })

  const layouts: GroupedRectLayout[] = rows
    .map((r) => layoutByNode.get(r.node))
    .filter((l): l is GroupedRectLayout => l != null)

  return { layouts }
}

// ---------------------------------------------------------------------------
// Data-based stack composition (no DOM dependency)
// ---------------------------------------------------------------------------

/**
 * Pure stack-segment record produced by data-based recomposition. No DOM
 * pointers — these are coordinates for drawing fresh `<rect>` elements via
 * `.data().join()` rather than mutating existing ones.
 */
export interface StackSegment {
  target: string
  series: string
  value: number
  /** Data-space y0 (running cumulative sum BEFORE this segment). */
  y0: number
  /** Data-space y1 (running cumulative sum AFTER this segment). */
  y1: number
  /** Stable mark key matching the renderer's `composeStackedMarkKey`. */
  markKey: string
}

export interface StackCompositionResult {
  segments: StackSegment[]
  perTargetTotal: Map<string, number>
  maxStackTotal: number
}

/**
 * Computes a fresh stack layout from a working `DatumValue[]` array — no DOM
 * required. Useful for D3 `.data(segments, d => d.markKey).join()` patterns
 * where the operation rebuilds the chart's marks from scratch (e.g. a future
 * "transform stacked → grouped" applier, or an annotation overlay that draws
 * its own stacked summary).
 *
 * Algorithm:
 *   1. Resolve `targetOrder` and `seriesOrder` (use provided order if given;
 *      otherwise derive from `workingData` insertion order).
 *   2. For each target, walk seriesOrder; for each `(target, series)` cell,
 *      look up the matching row in `workingData`. If found and in scope,
 *      contribute `value` to the cumulative stack; otherwise skip (no
 *      collapsed-segment emission — out-of-scope cells simply don't appear in
 *      the output).
 *   3. Track per-target totals and global max.
 *
 * The `inScopeSeriesPredicate` defaults to "all in scope" so callers passing
 * a pre-filtered `workingData` get a clean stack without specifying it
 * twice.
 *
 * NB: this is the "fresh layout" counterpart to `recomposeStackedBarsFromDom`
 * (which preserves existing DOM rects via collapsed segments). Use this when
 * you're appending new rects; use the DOM variant when transitioning
 * existing ones.
 */
export function computeStackSegmentsFromData(args: {
  workingData: DatumValue[]
  targetOrder?: string[]
  seriesOrder?: string[]
  inScopeSeriesPredicate?: (target: string, series: string) => boolean
}): StackCompositionResult {
  const { workingData } = args
  const inScope = args.inScopeSeriesPredicate ?? (() => true)

  const targets = args.targetOrder ?? deriveOrder(workingData, (d) => String(d.target))
  const series = args.seriesOrder ?? deriveOrder(workingData, (d) => String(d.group ?? d.series ?? ''))

  // Index workingData by (target|series) for O(1) lookup inside the inner loop.
  const cellIndex = new Map<string, number>()
  workingData.forEach((row) => {
    const key = `${String(row.target)}|${String(row.group ?? row.series ?? '')}`
    if (!cellIndex.has(key)) {
      const value = Number(row.value)
      cellIndex.set(key, Number.isFinite(value) ? value : 0)
    }
  })

  const segments: StackSegment[] = []
  const perTargetTotal = new Map<string, number>()
  let maxStackTotal = 0

  targets.forEach((target) => {
    let cumY = 0
    series.forEach((seriesKey) => {
      if (!inScope(target, seriesKey)) return
      const cellKey = `${target}|${seriesKey}`
      const value = cellIndex.get(cellKey)
      if (value == null || !Number.isFinite(value) || value === 0) return
      const y0 = cumY
      const y1 = cumY + value
      segments.push({
        target,
        series: seriesKey,
        value,
        y0,
        y1,
        markKey: `${target}|${seriesKey}`,
      })
      cumY = y1
    })
    perTargetTotal.set(target, cumY)
    if (cumY > maxStackTotal) maxStackTotal = cumY
  })

  return { segments, perTargetTotal, maxStackTotal }
}

function deriveOrder(rows: DatumValue[], keyFn: (row: DatumValue) => string): string[] {
  const seen = new Set<string>()
  const order: string[] = []
  for (const row of rows) {
    const key = keyFn(row)
    if (seen.has(key)) continue
    seen.add(key)
    order.push(key)
  }
  return order
}

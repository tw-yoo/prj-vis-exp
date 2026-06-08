/**
 * Shared split-layout diff overlay helpers — used by BOTH the simple-bar and
 * simple-line `diff` appliers so the cross-surface Δ arrow is positioned and
 * revealed identically regardless of chart type or endpoint op.
 *
 * Background. When an ops spec forms a convergent DAG (two parallel sentences
 * feeding a downstream `diff`), the orchestrator splits the chart into
 * `split-left` / `split-right` surfaces and runs each parallel sentence on its
 * own surface. The merging `diff` then runs on the ROOT surface, whose SVG was
 * hidden (`display:none`, often inside a `data-split-source-pivot` wrapper)
 * during the split. Two things then have to happen for the diff to be visible
 * AND correct:
 *
 *   1. {@link computeSplitDiffGeometry} — locate each endpoint on its surface
 *      and compute the Δ-arrow geometry (topY/bottomY + arrowX in the gap) in
 *      the root SVG's viewBox coordinate space.
 *   2. {@link mountRootDiffOverlay} — restore the root SVG as a click-through
 *      overlay on top of the two panels and hide its skeleton/axis titles so
 *      only the diff annotation shows.
 *
 * Endpoint resolution is op-agnostic: it matches `data-operation-result-ref`
 * (stamped by average lines, findExtremum / nth point marks, …) and falls back
 * to the surface's single average reference line. So the same helper works
 * whether each surface's endpoint is an average line or a highlighted point.
 */

import { RESULT_REF_ATTRIBUTE } from '../../operation-next/diffEndpoint'
import { ANNOTATION_LAYER_CLASS } from '../../operation-next/primitives/annotationLayer'

const SPLIT_LEFT_ID = 'split-left'
const SPLIT_RIGHT_ID = 'split-right'

/**
 * Average reference-line classes across chart types. Used as a fallback when an
 * endpoint carries no `data-operation-result-ref` tag — in the convergent-diff
 * scenario there is exactly one average line per surface, so it is unambiguous.
 */
const AVERAGE_LINE_SELECTOR = 'line.operation-next-average, line.operation-next-line-average'

function escapeRef(refKey: string): string {
  return typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(refKey) : refKey
}

function usableRect(rect: DOMRect | null | undefined): DOMRect | null {
  if (!rect) return null
  return rect.width > 0 || rect.height > 0 ? rect : null
}

/**
 * Screen-space bounding rect of the diff endpoint on `surfaceId`. Prefers an
 * element tagged with one of the merge's result-refs (the precise endpoint —
 * an average LINE, a findExtremum / nth point CIRCLE, …); falls back to the
 * surface's average reference line.
 */
function endpointRectOnSurface(
  host: HTMLElement,
  surfaceId: string,
  refKeys: string[],
): DOMRect | null {
  const surface = host.querySelector<HTMLElement>(`[data-surface-id="${surfaceId}"]`)
  if (!surface) return null
  for (const refKey of refKeys) {
    if (!refKey) continue
    const el = surface.querySelector<SVGGraphicsElement>(`[${RESULT_REF_ATTRIBUTE}="${escapeRef(refKey)}"]`)
    const rect = usableRect(el?.getBoundingClientRect())
    if (rect) return rect
  }
  const avg = surface.querySelector<SVGGraphicsElement>(AVERAGE_LINE_SELECTOR)
  return usableRect(avg?.getBoundingClientRect())
}

export interface SplitDiffGeometry {
  /** Higher endpoint y (root viewBox space). */
  topY: number
  /** Lower endpoint y (root viewBox space). */
  bottomY: number
  /** Δ-arrow x: the midpoint of the gap between the two split surfaces. */
  arrowX: number
}

/**
 * Resolve the two diff endpoints (one per split surface) and return the Δ-arrow
 * geometry in the root SVG's viewBox coordinate space, or `null` if the chart
 * is not split or an endpoint cannot be found on a surface.
 *
 * `refKeys` are the merge diff's referenced result ids (e.g. `['n4','n2']`).
 * Left/right is NOT assumed from A/B order — each surface is searched for any
 * of the refs, so an endpoint may live on either side.
 *
 * The root SVG may still be `display:none` here (the caller typically mounts
 * the overlay AFTER computing geometry); in that case its rect is 0×0 and we
 * fall back to the chart-host rect (the always-laid-out flex container). Since
 * {@link mountRootDiffOverlay} then overlays the SVG at 100%×100% of that host,
 * the viewBox↔rect ratio derived here stays consistent.
 */
export function computeSplitDiffGeometry(args: {
  host: HTMLElement
  svgNode: SVGSVGElement
  refKeys: string[]
}): SplitDiffGeometry | null {
  const { host, svgNode, refKeys } = args
  const leftRect = endpointRectOnSurface(host, SPLIT_LEFT_ID, refKeys)
  const rightRect = endpointRectOnSurface(host, SPLIT_RIGHT_ID, refKeys)
  if (!leftRect || !rightRect) return null

  const rootRectRaw = svgNode.getBoundingClientRect()
  const hostRect = host.getBoundingClientRect()
  const rootZeroed = !(rootRectRaw.width > 0 && rootRectRaw.height > 0)
  const effRect = rootZeroed ? hostRect : rootRectRaw

  const vbW = svgNode.viewBox?.baseVal?.width || effRect.width || 1
  const vbH = svgNode.viewBox?.baseVal?.height || effRect.height || 1
  const xRatio = vbW / Math.max(effRect.width, 1)
  const yRatio = vbH / Math.max(effRect.height, 1)

  const yLeftVB = (leftRect.top + leftRect.height / 2 - effRect.top) * yRatio
  const yRightVB = (rightRect.top + rightRect.height / 2 - effRect.top) * yRatio

  const leftSurfaceRect = host
    .querySelector<HTMLElement>(`[data-surface-id="${SPLIT_LEFT_ID}"]`)
    ?.getBoundingClientRect()
  const rightSurfaceRect = host
    .querySelector<HTMLElement>(`[data-surface-id="${SPLIT_RIGHT_ID}"]`)
    ?.getBoundingClientRect()
  const arrowScreenX =
    leftSurfaceRect && rightSurfaceRect
      ? (leftSurfaceRect.right + rightSurfaceRect.left) / 2
      : effRect.left + effRect.width / 2
  const arrowX = (arrowScreenX - effRect.left) * xRatio

  return {
    topY: Math.min(yLeftVB, yRightVB),
    bottomY: Math.max(yLeftVB, yRightVB),
    arrowX,
  }
}

export interface MountRootDiffOverlayOptions {
  /**
   * `true` (default) — **arrow mode**: the merge `diff`'s endpoints are anchored
   * on the two panels (average lines, extremum points). The root overlay
   * contributes only the Δ arrow, so its skeleton + axis titles are hidden and
   * the panels stay visible (they show the endpoint values).
   *
   * `false` — **rebind mode**: the endpoints are abstract scalars (e.g. a
   * diff-of-diffs) with no anchor on either panel, so the diff rebound NEW bars
   * onto the root SVG. The root skeleton IS the new chart, so keep it visible
   * and hide the now-superseded split panels so the new bar chart stands alone.
   */
  hideSkeleton?: boolean
}

/**
 * Restore the (hidden) root SVG as an absolutely-positioned, click-through
 * overlay on top of the two split surfaces. Idempotent.
 *
 * Handles all three host topologies seen in the wild:
 *   (a) the root SVG's parent IS the `surface-layout--split` flex container
 *       (the two split surfaces are its siblings) — absolutize the SVG only, so
 *       the flex container stays in normal flow and the panels keep their size;
 *   (b) the root SVG sits in a separate `data-surface-id="root"` child of the
 *       split wrapper — absolutize that host;
 *   (c) the root SVG lives inside the `data-split-source-pivot` wrapper that
 *       surfaceManager created during the split animation and hid via
 *       `display:none` — unhide the wrapper and overlay it at `inset:0`.
 *
 * `pointer-events:none` keeps hover behaviour on the split surfaces intact. The
 * skeleton/panel visibility then follows `hideSkeleton` (see options) — using
 * `display:none` (not `opacity:0`) so no in-flight transition can animate the
 * hidden elements back into view.
 */
export function mountRootDiffOverlay(
  svgNode: SVGSVGElement,
  opts?: MountRootDiffOverlayOptions,
): void {
  const hideSkeleton = opts?.hideSkeleton ?? true
  const rootHost = svgNode.parentElement as HTMLElement | null
  const splitWrapper = rootHost?.parentElement as HTMLElement | null
  const rootHostIsSplitWrapper = !!rootHost?.classList.contains('surface-layout--split')
  const rootHostIsSourcePivot = rootHost?.dataset?.splitSourcePivot === 'true'

  if (rootHostIsSplitWrapper && rootHost) {
    // (a) host is the flex container — absolutize the SVG only.
    if (!rootHost.style.position) rootHost.style.position = 'relative'
    svgNode.style.display = ''
    svgNode.style.position = 'absolute'
    svgNode.style.top = '0'
    svgNode.style.left = '0'
    svgNode.style.width = '100%'
    svgNode.style.height = '100%'
    svgNode.style.pointerEvents = 'none'
    svgNode.style.zIndex = '5'
  } else if (rootHostIsSourcePivot && rootHost && splitWrapper) {
    // (c) host is the source-pivot wrapper surfaceManager hid during cleanup.
    if (!splitWrapper.style.position) splitWrapper.style.position = 'relative'
    rootHost.style.display = ''
    rootHost.style.opacity = '1'
    rootHost.style.position = 'absolute'
    rootHost.style.top = '0'
    rootHost.style.left = '0'
    rootHost.style.right = ''
    rootHost.style.bottom = ''
    rootHost.style.width = '100%'
    rootHost.style.height = '100%'
    rootHost.style.overflow = 'visible'
    rootHost.style.pointerEvents = 'none'
    rootHost.style.zIndex = '5'
    svgNode.style.display = ''
    svgNode.style.width = '100%'
    svgNode.style.height = '100%'
    svgNode.style.pointerEvents = 'none'
  } else {
    // (b) host is a separate child — absolutize the host.
    svgNode.style.display = ''
    svgNode.style.pointerEvents = 'none'
    if (rootHost && rootHost.dataset.surfaceId === 'root') {
      rootHost.style.display = ''
      rootHost.style.position = 'absolute'
      rootHost.style.inset = '0'
      rootHost.style.pointerEvents = 'none'
      rootHost.style.zIndex = '5'
    }
    if (splitWrapper && splitWrapper.classList.contains('surface-layout--split')) {
      if (!splitWrapper.style.position) splitWrapper.style.position = 'relative'
    }
  }

  const skeletons = svgNode.querySelectorAll<SVGElement>('g.chart-skeleton')
  const splitRoot = svgNode.closest('.surface-layout--split') as HTMLElement | null
  const panels = splitRoot
    ? Array.from(
        splitRoot.querySelectorAll<HTMLElement>('[data-surface-id="split-left"], [data-surface-id="split-right"]'),
      )
    : []

  if (hideSkeleton) {
    // Arrow mode: hide EVERYTHING in the root SVG except the annotation layer
    // (which carries the Δ arrow), then show the two panels (they carry the
    // endpoint values the arrow connects). Chart-type-agnostic — grouped /
    // stacked / multipleLine emit no `g.chart-skeleton`, so the old
    // skeleton-only hide was a no-op and the full root chart showed through
    // the source-pivot overlay. Hiding every non-annotation child (plot group,
    // axes, axis titles, color legend) subsumes the old skeleton + title hide
    // and works for every chart type. `defs` is harmless to keep.
    Array.from(svgNode.children).forEach((child) => {
      if (child.classList?.contains(ANNOTATION_LAYER_CLASS)) return
      if (child.tagName.toLowerCase() === 'defs') return
      ;(child as SVGElement).style.display = 'none'
    })
    panels.forEach((p) => { p.style.display = '' })
  } else {
    // Rebind mode: the root skeleton holds the freshly rebound bars — show it,
    // and hide the now-superseded panels so the new bar chart stands alone.
    skeletons.forEach((g) => { g.style.display = '' })
    panels.forEach((p) => { p.style.display = 'none' })
  }
}

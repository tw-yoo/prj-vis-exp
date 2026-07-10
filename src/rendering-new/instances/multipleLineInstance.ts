import * as d3 from 'd3'
import { type ChartSpec } from '../../domain/chart'
import { DataAttributes, SvgAttributes, SvgClassNames, SvgElements } from '../../rendering/interfaces'
import { DURATIONS, EASINGS, OPACITIES } from '../../rendering/common/d3Helpers'
import {
  renderMultipleLineChart,
  type MultiLineSpec,
} from '../../rendering/line/multipleLineRenderer'
import {
  attachInstance,
  getAttachedInstance,
  type ChartInstance,
  type ChartInstanceLayout,
  type ChartInstanceSnapshot,
  type TransitionChartScaleOptions,
} from '../chartInstance'

/**
 * Identity key matching the legacy runner's `pointKey(target, series)` so
 * applier-side scope sets line up with what the renderer's circles carry.
 * Format mirrors operation-next/runners/multipleLine.ts:585.
 */
export function multiLinePointKey(target: string, series: string | null | undefined): string {
  return `${series ?? ''}::${target}`
}

export interface MultiLineFilterScopeOptions {
  /** Set of `multiLinePointKey(target|id, series)` values that remain in scope. */
  activePointKeys: Set<string>
  outOfScopeOpacity?: number
  duration?: number
  ease?: (t: number) => number
}

function computeSpecKey(spec: ChartSpec): string {
  const data = spec.data as { url?: string; values?: unknown[]; name?: string } | undefined
  if (data?.url) return `url:${data.url}`
  if (Array.isArray(data?.values)) {
    const sample = data.values.slice(0, 3)
    try {
      return `vals:${data.values.length}:${JSON.stringify(sample)}`
    } catch {
      return `vals:${data.values.length}`
    }
  }
  if (data?.name) return `name:${data.name}`
  return 'no-data'
}

/**
 * Stateful instance wrapping the existing multi-line renderer.
 *
 * Phase 3d scope: idempotent `ensureRendered` — same spec across substeps
 * skips the rebuild and reuses the SVG. Operation runner stays on the
 * existing `runMultipleLineOperations`, which already handles per-series
 * paths + circles + color-stable filter / diff / average / findExtremum /
 * lagDiff / pairDiff.
 *
 * Future work: split per-series paths into the instance and add a true
 * shared-transition `transitionChartScale` that animates every series's
 * path + circles + axes in lockstep (matching simple-line's d3 idiom).
 */
export class MultipleLineChartInstance implements ChartInstance {
  readonly chartTypeKey = 'multi-line' as const
  readonly host: HTMLElement

  svg!: d3.Selection<SVGSVGElement, unknown, null, undefined>
  annotationLayer!: d3.Selection<SVGGElement, unknown, null, undefined>
  layout: ChartInstanceLayout = { marginLeft: 0, marginTop: 0, plotWidth: 0, plotHeight: 0 }

  activeTargets: Set<string> | null = null
  outOfScopeOpacity: number = OPACITIES.DIM

  private specKey = ''
  private buildPromise: Promise<void> | null = null

  constructor(host: HTMLElement) {
    this.host = host
  }

  ensureRendered(spec: ChartSpec): boolean {
    const nextKey = computeSpecKey(spec)
    if (nextKey === this.specKey && this.specKey !== '') {
      // Spec hasn't changed. Even if our cached `svg` selection was detached
      // by some internal flow (e.g. multipleLine pairDiff focus replacing the
      // chart surface), we don't want to rebuild — re-acquire whatever svg
      // is currently in the host and reuse it. This preserves any
      // annotations the legacy runner drew across substeps.
      const currentSvg = this.host.querySelector('svg') as SVGSVGElement | null
      if (currentSvg) {
        if (!this.svg || !this.host.contains(this.svg.node())) {
          this.svg = d3.select(currentSvg) as d3.Selection<SVGSVGElement, unknown, null, undefined>
          this.layout = {
            marginLeft: Number(currentSvg.getAttribute('data-m-left') ?? 0),
            marginTop: Number(currentSvg.getAttribute('data-m-top') ?? 0),
            plotWidth: Number(currentSvg.getAttribute('data-plot-w') ?? 0),
            plotHeight: Number(currentSvg.getAttribute('data-plot-h') ?? 0),
          }
          let layerNode = currentSvg.querySelector<SVGGElement>('g.operation-next-annotation-layer')
          if (!layerNode) {
            const layer = this.svg
              .append(SvgElements.Group)
              .attr(
                SvgAttributes.Class,
                `${SvgClassNames.AnnotationLayer} operation-next-annotation-layer`,
              )
            layerNode = layer.node()
          }
          this.annotationLayer = d3.select(layerNode!) as d3.Selection<SVGGElement, unknown, null, undefined>
          console.info('[operation-new] MultipleLineChartInstance.ensureRendered: NO-OP (re-acquired SVG)', {
            specKeyHash: nextKey.length,
          })
        } else {
          console.info('[operation-new] MultipleLineChartInstance.ensureRendered: NO-OP (specKey match)', {
            specKeyHash: nextKey.length,
          })
        }
        return false
      }
    }
    console.info('[operation-new] MultipleLineChartInstance.ensureRendered: rebuilding', {
      reason: this.specKey === '' ? 'first-build' : nextKey !== this.specKey ? 'spec-changed' : 'no-svg-in-host',
    })
    this.specKey = nextKey
    this.buildPromise = this.buildFromSpec(spec)
    return true
  }

  async waitForBuild(): Promise<void> {
    if (this.buildPromise) await this.buildPromise
  }

  snapshot(): ChartInstanceSnapshot {
    return {
      specKey: this.specKey,
      yDomain: [0, 1],
    }
  }

  /**
   * X-domain recompose for multi-line charts (ported from the simple-line
   * instance): narrow the x axis to `opts.activeTargets`, slide every
   * in-scope point/line to the new positions, rescale the y axis to the
   * surviving values, and drop the filtered-out ticks — all under ONE shared
   * transition so nothing flickers.
   *
   * DOM-driven: the legacy renderer doesn't expose its scales, so geometry is
   * re-derived from the circles' cx/cy + data-* attributes. The x axis is NOT
   * re-`.call`ed — surviving tick <g>s are translated to their new slot and
   * removed ticks fade out, which preserves the original label formatting,
   * wrapping and rotation exactly.
   */
  async transitionChartScale(opts: TransitionChartScaleOptions): Promise<void> {
    if (!this.svg || this.svg.empty()) return
    const activeTargets = opts.activeTargets
    if (!activeTargets || activeTargets.size === 0) return
    const duration = opts.duration ?? DURATIONS.AXIS_RESCALE
    const ease = opts.ease ?? EASINGS.SMOOTH
    const outOpacity = opts.outOfScopeOpacity ?? OPACITIES.HIDDEN

    type Pt = {
      node: SVGCircleElement
      target: string
      id: string
      series: string
      value: number
      cx: number
      cy: number
    }
    const pts: Pt[] = []
    this.pointMarks().each(function () {
      const node = this as SVGCircleElement
      const cx = Number(node.getAttribute(SvgAttributes.CX))
      const cy = Number(node.getAttribute(SvgAttributes.CY))
      if (!Number.isFinite(cx) || !Number.isFinite(cy)) return
      pts.push({
        node,
        target: node.getAttribute(DataAttributes.Target) ?? '',
        id: node.getAttribute(DataAttributes.Id) ?? '',
        series: node.getAttribute(DataAttributes.Series) ?? '',
        value: Number(node.getAttribute(DataAttributes.Value)),
        cx,
        cy,
      })
    })
    if (pts.length === 0) return

    const isInScope = (p: Pt) => activeTargets.has(p.target) || activeTargets.has(p.id)
    const inScope = pts.filter(isInScope)
    if (inScope.length === 0) return

    // Surviving x slots ordered by their CURRENT position; new positions from
    // the same scalePoint(padding 0.5) shape the base renderer uses.
    const slotByTarget = new Map<string, number>()
    pts.forEach((p) => {
      if (!slotByTarget.has(p.target)) slotByTarget.set(p.target, p.cx)
    })
    const survivingTargets = [...new Set(inScope.map((p) => p.target))].sort(
      (a, b) => (slotByTarget.get(a) ?? 0) - (slotByTarget.get(b) ?? 0),
    )
    const xPoint = d3
      .scalePoint<string>()
      .domain(survivingTargets)
      .range([0, this.layout.plotWidth])
      .padding(0.5)

    const values = inScope.map((p) => p.value).filter(Number.isFinite)
    let yDomain = opts.yDomain
    if (!yDomain && values.length > 0) {
      const min = Math.min(...values)
      const max = Math.max(...values)
      yDomain = min === max ? [min, max + 1] : [min, max]
    }
    const yScale = yDomain
      ? d3.scaleLinear().domain(yDomain).nice().range([this.layout.plotHeight, 0])
      : null

    console.info('[operation-new] MultipleLineChartInstance.transitionChartScale', {
      pointCount: pts.length,
      inScopeCount: inScope.length,
      survivingSlots: survivingTargets.length,
      yDomainTo: yScale ? yScale.domain() : null,
    })

    const parent = this.svg.transition().duration(duration).ease(ease)
    const inheritT = parent as never

    const newCX = (p: Pt) => xPoint(p.target) ?? p.cx
    const newCY = (p: Pt) => (yScale && Number.isFinite(p.value) ? yScale(p.value) : p.cy)

    // Points: in-scope slide to the new slots; out-of-scope fade out in place.
    pts.forEach((p) => {
      const sel = d3.select(p.node)
      if (isInScope(p)) {
        sel
          .interrupt('filter-scope')
          .transition(inheritT)
          .attr(SvgAttributes.CX, newCX(p))
          .attr(SvgAttributes.CY, newCY(p))
          .style(SvgAttributes.Opacity, OPACITIES.FULL)
      } else {
        sel.interrupt('filter-scope').transition(inheritT).style(SvgAttributes.Opacity, outOpacity)
      }
    })

    // Series paths: re-datum to the in-scope subset AT CURRENT coordinates
    // (instant truncation — the excluded points were already dimmed by the
    // filter's phase 1), then tween to the new coordinates. Same point count
    // on both ends → clean interpolation, no rise-from-the-bottom morph.
    const bySeries = d3.group(inScope, (p) => p.series)
    this.mainLinePaths().each(function () {
      const path = this as SVGPathElement
      const series = path.getAttribute(DataAttributes.Series) ?? ''
      const seriesPts = (bySeries.get(series) ?? []).slice().sort((a, b) => a.cx - b.cx)
      const sel = d3.select(path)
      if (seriesPts.length < 2) {
        sel.interrupt('filter-scope').transition(inheritT).style(SvgAttributes.Opacity, outOpacity)
        return
      }
      const toPathD = (coords: Array<[number, number]>) =>
        coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join('')
      sel
        .interrupt('filter-scope')
        .attr(SvgAttributes.D, toPathD(seriesPts.map((p) => [p.cx, p.cy])))
        .transition(inheritT)
        .attr(SvgAttributes.D, toPathD(seriesPts.map((p) => [newCX(p), newCY(p)])))
        .style(SvgAttributes.Opacity, OPACITIES.FULL)
    })

    // X axis: translate surviving ticks to their new slot; fade out the rest.
    // Ticks sit exactly at their slot's scalePoint position, so a tick maps to
    // its target by x-coincidence with a point slot (±1px tolerance).
    const xAxisGroup = this.svg.select<SVGGElement>(`g.${SvgClassNames.XAxis}`)
    if (!xAxisGroup.empty()) {
      const slotEntries = [...slotByTarget.entries()]
      xAxisGroup.selectAll<SVGGElement, unknown>('g.tick').each(function () {
        const tick = this as SVGGElement
        const m = (tick.getAttribute('transform') ?? '').match(/translate\(\s*([^,)]+)/)
        const tx = m ? Number(m[1]) : NaN
        if (!Number.isFinite(tx)) return
        let tickTarget: string | null = null
        for (const [target, cx] of slotEntries) {
          if (Math.abs(cx - tx) <= 1) {
            tickTarget = target
            break
          }
        }
        const sel = d3.select(tick)
        const nextX = tickTarget != null ? xPoint(tickTarget) : undefined
        if (tickTarget != null && nextX !== undefined && activeTargets.has(tickTarget)) {
          sel
            .transition(inheritT)
            .attr('transform', `translate(${nextX},0)`)
            .style(SvgAttributes.Opacity, 1)
        } else {
          sel.transition(inheritT).style(SvgAttributes.Opacity, 0).remove()
        }
      })
    }

    // Y axis: numeric labels only — safe to re-.call under the same parent.
    if (yScale) {
      const yAxisGroup = this.svg.select<SVGGElement>(`g.${SvgClassNames.YAxis}`)
      if (!yAxisGroup.empty()) {
        yAxisGroup.transition(inheritT).call(d3.axisLeft(yScale).ticks(6) as never)
      }
    }

    this.activeTargets = new Set(activeTargets)
    this.outOfScopeOpacity = outOpacity

    try {
      await parent.end()
    } catch {
      /* interrupted */
    }
  }

  /** All `<circle data-target>` points in this chart (across all series). */
  pointMarks(): d3.Selection<SVGCircleElement, unknown, d3.BaseType, unknown> {
    return this.svg.selectAll<SVGCircleElement, unknown>(`${SvgElements.Circle}[${DataAttributes.Target}]`)
  }

  /**
   * Main series `<path>`s — the colored lines, excluding annotation paths,
   * filter-overlay segments, and axis `.domain` paths. Matches the legacy
   * `mainLinePath()` helper so applier-side selectors agree with the renderer.
   */
  mainLinePaths(): d3.Selection<SVGPathElement, unknown, d3.BaseType, unknown> {
    return this.svg.selectAll<SVGPathElement, unknown>(SvgElements.Path).filter(function () {
      const path = this as SVGPathElement
      if (path.classList.contains(SvgClassNames.Annotation) || path.classList.contains(SvgClassNames.LineAnnotation)) return false
      if (path.classList.contains('domain')) return false
      if (path.closest(`.${SvgClassNames.XAxis}, .${SvgClassNames.YAxis}`)) return false
      if (path.closest(`.${SvgClassNames.AnnotationLayer}`)) return false
      return path.getAttribute(SvgAttributes.Fill) === 'none' && path.hasAttribute(SvgAttributes.Stroke)
    })
  }

  /**
   * Shared-parent transition for filter scope changes — all points fade to
   * their new opacity in lockstep so frame timing stays aligned. Out-of-scope
   * points hit `outOfScopeOpacity` (DIM by default); in-scope points return to
   * FULL. The applier can hang additional `.transition(parent)` calls off the
   * returned parent — line-segment overlays, ref lines, etc. — so they all
   * share the same scheduler.
   *
   * Returns the parent transition so callers can chain child transitions.
   * Resolves when the parent transition settles.
   */
  async transitionFilterScope(opts: MultiLineFilterScopeOptions): Promise<void> {
    if (!this.svg || this.svg.empty()) return
    const duration = opts.duration ?? DURATIONS.DIM
    const ease = opts.ease ?? EASINGS.SMOOTH
    const outOpacity = opts.outOfScopeOpacity ?? OPACITIES.DIM
    const activeKeys = opts.activePointKeys

    this.activeTargets = activeKeys.size > 0 ? new Set([...activeKeys]) : null
    this.outOfScopeOpacity = outOpacity

    console.info('[operation-new] MultipleLineChartInstance.transitionFilterScope', {
      activeKeyCount: activeKeys.size,
      outOpacity,
    })

    const parent = this.svg.transition().duration(duration).ease(ease) as unknown as d3.Transition<
      d3.BaseType,
      unknown,
      d3.BaseType,
      unknown
    >
    const inheritT = parent as never

    const points = this.pointMarks()
    if (!points.empty()) {
      points
        .interrupt('filter-scope')
        .transition(inheritT)
        .style(SvgAttributes.Opacity, function () {
          const node = this as SVGCircleElement
          const target = node.getAttribute(DataAttributes.Target) ?? ''
          const id = node.getAttribute(DataAttributes.Id) ?? ''
          const series = node.getAttribute(DataAttributes.Series) ?? ''
          const inScope = activeKeys.has(multiLinePointKey(target, series))
            || activeKeys.has(multiLinePointKey(id, series))
          return inScope ? OPACITIES.FULL : outOpacity
        })
    }

    try {
      await parent.end()
    } catch {
      /* interrupted */
    }
  }

  private async buildFromSpec(spec: ChartSpec) {
    await renderMultipleLineChart(this.host, spec as MultiLineSpec)
    const svgNode = this.host.querySelector('svg') as SVGSVGElement | null
    if (!svgNode) return
    this.svg = d3.select(svgNode) as d3.Selection<SVGSVGElement, unknown, null, undefined>
    this.layout = {
      marginLeft: Number(svgNode.getAttribute('data-m-left') ?? 0),
      marginTop: Number(svgNode.getAttribute('data-m-top') ?? 0),
      plotWidth: Number(svgNode.getAttribute('data-plot-w') ?? 0),
      plotHeight: Number(svgNode.getAttribute('data-plot-h') ?? 0),
    }
    let layerNode = svgNode.querySelector<SVGGElement>('g.operation-next-annotation-layer')
    if (!layerNode) {
      const layer = this.svg
        .append(SvgElements.Group)
        .attr(
          SvgAttributes.Class,
          `${SvgClassNames.AnnotationLayer} operation-next-annotation-layer`,
        )
      layerNode = layer.node()
    }
    this.annotationLayer = d3.select(layerNode!) as d3.Selection<SVGGElement, unknown, null, undefined>
  }
}

export function ensureMultipleLineChartInstance(host: HTMLElement, spec: ChartSpec): MultipleLineChartInstance {
  const existing = getAttachedInstance(host)
  if (existing && existing.chartTypeKey === 'multi-line') {
    const instance = existing as MultipleLineChartInstance
    instance.ensureRendered(spec)
    return instance
  }
  const instance = new MultipleLineChartInstance(host)
  attachInstance(host, instance)
  instance.ensureRendered(spec)
  return instance
}

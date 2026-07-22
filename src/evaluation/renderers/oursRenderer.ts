import * as d3 from 'd3'
import { consumeDerivedChartState, renderChart, resetChartHost, type ChartSpec } from '../../api/rendering'
import { normalizeOpsGroups, type OpsSpecInput } from '../../api/types'
import { isOperationNextRunOutcome, type OperationNextRunOutcome } from '../../operation-next/executionState'
import { collectReferencedResultIds } from '../../operation-next/diffEndpoint'
import { runChartOps } from '../../operation-next/runChartOps'
import { analyzeSplitPlan, splitPlanRoleFor, type SplitPlan } from '../../api/splitPlan'
import { SurfaceManager } from '../../runtime/surfaceManager'
import { applySplitSharedYAxisPolicy } from '../../operation-next/splitSurfaceVisuals'
import { getChartType } from '../../domain/chart/chartType'
import { resolveEncodingFields } from '../../rendering/ops/common/resolveEncodingFields'
import { toDatumValuesFromRaw, type RawRow } from '../../domain/data/datum'
import type { DatumValue, OperationSpec } from '../../domain/operation/types'
import type { ExplanationMethod, ExplanationRenderer, RendererContext } from './types'
import { buildCalculationSummaryText, drawSummaryTextBox } from '../../api/operation-summary-text'
import { applyChartValueLabels, clearChartValueLabels } from '../../rendering/common/chartValueLabels'

type StepManifest = {
  id: string
  text: string
  opsSpec?: OpsSpecInput
}

type ChartManifest = {
  chart_id: string
  question?: string
  description?: string
  spec?: ChartSpec
  specPath?: string
  opsSpec?: OpsSpecInput
  opsPath?: string
  steps: StepManifest[]
}

type ResolvedStep = {
  id: string
  text: string
  opsSpec: OpsSpecInput
}

type ResolvedChart = {
  chart_id: string
  spec: ChartSpec
  steps: ResolvedStep[]
}

type StepRecord = {
  runtimeSnapshot: OperationNextRunOutcome['runtimeSnapshot']
  continuation: OperationNextRunOutcome['continuation']
}

type D3MotionController = {
  disabledDepth: number
  isDisabled: () => boolean
  withMotionDisabled: <T>(callback: () => Promise<T>) => Promise<T>
  forceZeroTiming: <T>(transition: T) => T
}

let replayMotionController: D3MotionController | null = null

function installD3ReplayMotionController(): D3MotionController | null {
  if (replayMotionController) return replayMotionController
  const transitionPrototype = d3.transition?.prototype
  const selectionPrototype = d3.selection?.prototype
  if (!transitionPrototype || !selectionPrototype) return null

  const originalDuration = transitionPrototype.duration
  const originalDelay = transitionPrototype.delay
  const originalSelectionTransition = selectionPrototype.transition
  const originalTransitionTransition = transitionPrototype.transition
  if (typeof originalDuration !== 'function' || typeof originalDelay !== 'function' || typeof originalSelectionTransition !== 'function') {
    return null
  }

  const controller: D3MotionController = {
    disabledDepth: 0,
    isDisabled() { return this.disabledDepth > 0 },
    async withMotionDisabled(callback) {
      this.disabledDepth += 1
      try { return await callback() } finally { this.disabledDepth -= 1 }
    },
    forceZeroTiming(transition) {
      if (!this.isDisabled() || !transition) return transition
      originalDelay.call(transition, 0)
      originalDuration.call(transition, 0)
      return transition
    },
  }

  transitionPrototype.duration = function (this: unknown, ...args: unknown[]) {
    if (controller.isDisabled() && args.length > 0) return originalDuration.call(this, 0)
    return originalDuration.apply(this, args)
  }
  transitionPrototype.delay = function (this: unknown, ...args: unknown[]) {
    if (controller.isDisabled() && args.length > 0) return originalDelay.call(this, 0)
    return originalDelay.apply(this, args)
  }
  selectionPrototype.transition = function (this: unknown, ...args: unknown[]) {
    const transition = originalSelectionTransition.apply(this, args)
    return controller.forceZeroTiming(transition)
  }
  if (typeof originalTransitionTransition === 'function') {
    transitionPrototype.transition = function (this: unknown, ...args: unknown[]) {
      const transition = originalTransitionTransition.apply(this, args)
      return controller.forceZeroTiming(transition)
    }
  }

  replayMotionController = controller
  return replayMotionController
}

function nextFrame() {
  // Two rAFs let pending style/layout commit before we read geometry. But the
  // browser PAUSES requestAnimationFrame while the page is hidden (a
  // backgrounded tab), which would hang this await — and with it the whole
  // step pipeline — until the tab is refocused. Race a setTimeout fallback so
  // a hidden page still advances. On a visible page the rAF pair (~32ms) wins,
  // so behaviour is unchanged.
  return new Promise<void>((resolve) => {
    let settled = false
    const done = () => {
      if (settled) return
      settled = true
      resolve()
    }
    requestAnimationFrame(() => requestAnimationFrame(done))
    setTimeout(done, 100)
  })
}

async function waitForD3Transitions(container: HTMLElement) {
  const hasPending = () => Array.from(container.querySelectorAll<HTMLElement | SVGElement>('*')).some((node) => {
    return (node as unknown as { __transition?: Record<string, unknown> }).__transition
  })
  const timeoutAt = performance.now() + 5000
  while (hasPending() && performance.now() < timeoutAt) {
    d3.timerFlush()
    await new Promise((resolve) => setTimeout(resolve, 16))
  }
  d3.timerFlush()
  await nextFrame()
}

function parseSvgViewBox(svgNode: SVGSVGElement) {
  const values = (svgNode.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number).filter(Number.isFinite)
  if (values.length === 4) {
    const [x, y, width, height] = values
    if (width > 0 && height > 0) return { x, y, width, height }
  }
  const width = Number(svgNode.getAttribute('width')) || 640
  const height = Number(svgNode.getAttribute('height')) || 360
  return { x: 0, y: 0, width, height }
}

function formatSvgNumber(value: number) {
  const rounded = Math.round(value * 1000) / 1000
  return String(rounded)
}

function fitSvgViewBoxToContent(container: HTMLElement) {
  const svgNode = container.querySelector<SVGSVGElement>('svg')
  if (!svgNode || typeof svgNode.getBBox !== 'function') return
  // getBBox() includes the geometry of opacity:0 elements. Filtered-out marks
  // are left in the DOM at opacity:0 and can be wildly off-scale (e.g. a bar
  // whose value dwarfs the rescaled axis), which would blow up the fitted
  // viewBox and add huge empty space. Hide fully-transparent elements while
  // measuring so only visible content drives the viewBox.
  const measureHidden: SVGElement[] = []
  svgNode.querySelectorAll<SVGElement>('*').forEach((el) => {
    if (el.style.display === 'none') return
    const opacity = el.style.opacity !== '' ? el.style.opacity : getComputedStyle(el).opacity
    if (opacity === '0') {
      measureHidden.push(el)
      el.style.display = 'none'
    }
  })
  let contentBox: DOMRect | SVGRect | null = null
  try { contentBox = svgNode.getBBox() } catch { contentBox = null }
  measureHidden.forEach((el) => el.style.removeProperty('display'))
  if (!contentBox || contentBox.width <= 0 || contentBox.height <= 0) return
  const padding = 16
  const current = parseSvgViewBox(svgNode)
  const nextX = Math.min(current.x, contentBox.x - padding)
  const nextY = Math.min(current.y, contentBox.y - padding)
  const nextRight = Math.max(current.x + current.width, contentBox.x + contentBox.width + padding)
  const nextBottom = Math.max(current.y + current.height, contentBox.y + contentBox.height + padding)
  svgNode.setAttribute('viewBox', [
    formatSvgNumber(nextX),
    formatSvgNumber(nextY),
    formatSvgNumber(nextRight - nextX),
    formatSvgNumber(nextBottom - nextY),
  ].join(' '))
}

function normalizeEvaluationDataUrl(rawUrl: string) {
  const trimmed = rawUrl.trim()
  if (!trimmed) return trimmed
  if (/^[a-z][a-z0-9+\-.]*:/i.test(trimmed)) return trimmed
  if (trimmed.startsWith('/')) return trimmed
  // Prefix the deploy base (import.meta.env.BASE_URL ends with '/'; it is '/' in
  // dev and '/prj-vis-exp/' on GitHub Pages) so the CSV/spec URLs resolve under
  // the project-pages subpath instead of the domain root.
  if (trimmed.startsWith('ChartQA/')) return `${import.meta.env.BASE_URL}${trimmed}`
  if (trimmed.startsWith('data/test/')) return `${import.meta.env.BASE_URL}${trimmed}`
  if (trimmed.startsWith('data/')) return `${import.meta.env.BASE_URL}ChartQA/${trimmed}`
  return trimmed
}

function normalizeSpecDataUrls<T>(value: T): T {
  const clone = JSON.parse(JSON.stringify(value)) as unknown
  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) { node.forEach(visit); return }
    const record = node as Record<string, unknown>
    const data = record.data
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const dataRecord = data as Record<string, unknown>
      if (typeof dataRecord.url === 'string') dataRecord.url = normalizeEvaluationDataUrl(dataRecord.url)
    }
    Object.values(record).forEach(visit)
  }
  visit(clone)
  return clone as T
}

function buildStepOpsSpec(fullOpsSpec: OpsSpecInput, stepId: string): OpsSpecInput {
  if (Array.isArray(fullOpsSpec)) {
    if (stepId === 'ops') return { ops: fullOpsSpec } as OpsSpecInput
    throw new Error(`Operation group "${stepId}" is missing from ops spec.`)
  }
  if (fullOpsSpec && typeof fullOpsSpec === 'object') {
    const record = fullOpsSpec as Record<string, unknown>
    if (Object.prototype.hasOwnProperty.call(record, stepId)) {
      return { [stepId]: record[stepId] } as OpsSpecInput
    }
  }
  const group = normalizeOpsGroups(fullOpsSpec).find((c) => c.name === stepId)
  if (!group) throw new Error(`Operation group "${stepId}" is missing from ops spec.`)
  return { [group.name]: group.ops } as OpsSpecInput
}

function validateOpsSpec(opsSpec: OpsSpecInput) {
  const groups = normalizeOpsGroups(opsSpec)
  if (!groups.length || groups.every((g) => g.ops.length === 0)) {
    throw new Error('Invalid operation spec: no executable operations found.')
  }
}

function collectReferencedIdsForSteps(steps: ResolvedStep[]) {
  const ids = new Set<string>()
  steps.forEach((step) => {
    collectReferencedResultIds(normalizeOpsGroups(step.opsSpec)).forEach((id) => ids.add(id))
  })
  return Array.from(ids)
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error(`Failed to load ${url} (${response.status})`)
  return response.json() as Promise<T>
}

function resolveAssetPath(oursBase: string, chartId: string, relPath: string) {
  const trimmed = relPath.trim()
  if (!trimmed) return trimmed
  if (trimmed.startsWith('/') || /^[a-z][a-z0-9+\-.]*:/i.test(trimmed)) return trimmed
  const normalized = trimmed.replace(/^\.?\//, '')
  void chartId
  return `${oursBase}/${normalized}`
}

/**
 * Extract inline `data.values` rows from a Vega-Lite spec for SurfaceManager
 * bookkeeping. Returns `[]` for URL-based specs — that's fine, the renderer
 * loads CSV/JSON from the URL independently; the data we hand to
 * `createRootSurface` is only used as a fallback when no per-side `dataA`/
 * `dataB` is supplied to `splitSurface`. Mirrors ReviewPage's helper.
 */
function extractSpecRows(spec: ChartSpec | null | undefined): RawRow[] {
  if (!spec) return []
  const data = (spec as { data?: { values?: unknown } }).data
  if (!data || !Array.isArray((data as { values?: unknown }).values)) return []
  return ((data as { values: unknown[] }).values).filter(
    (row): row is RawRow => !!row && typeof row === 'object' && !Array.isArray(row),
  )
}

function buildDatumValuesForSpec(spec: ChartSpec, rows: RawRow[]) {
  const resolved = resolveEncodingFields(spec)
  if (!resolved) return []
  return toDatumValuesFromRaw(rows, {
    xField: resolved.xField,
    yField: resolved.yField,
    groupField: resolved.groupField ?? undefined,
  }, {
    panelField: resolved.panelField,
  })
}

async function hydrateManifest(manifest: ChartManifest, oursBase: string): Promise<ResolvedChart> {
  const rawSpec = manifest.spec ?? (
    manifest.specPath
      ? await fetchJson<ChartSpec>(resolveAssetPath(oursBase, manifest.chart_id, manifest.specPath))
      : null
  )
  if (!rawSpec) throw new Error(`Chart "${manifest.chart_id}" is missing spec or specPath.`)

  const fullOpsSpec = manifest.opsSpec ?? (
    manifest.opsPath
      ? await fetchJson<OpsSpecInput>(resolveAssetPath(oursBase, manifest.chart_id, manifest.opsPath))
      : null
  )

  const steps = manifest.steps.map((step) => {
    if (step.opsSpec) return { id: step.id, text: step.text, opsSpec: step.opsSpec }
    if (!fullOpsSpec) throw new Error(`Chart "${manifest.chart_id}" step "${step.id}" missing opsSpec and opsPath.`)
    return { id: step.id, text: step.text, opsSpec: buildStepOpsSpec(fullOpsSpec, step.id) }
  })

  return { chart_id: manifest.chart_id, spec: normalizeSpecDataUrls(rawSpec), steps }
}

export class OursRenderer implements ExplanationRenderer {
  readonly method: ExplanationMethod = 'ours'
  private chart: ResolvedChart | null = null
  private context: RendererContext
  private stepRecords: Array<StepRecord | null> = []
  private overrideSteps: StepManifest[] | null

  // Session state persisted across step clicks. The previous implementation
  // ran `resetChartHost` + `renderChart` at the top of every `renderStep`
  // call, which wiped the SVG and rebuilt it from scratch on every text-
  // chunk click — that empty frame between wipe and rebuild is the chart-
  // card flicker. ReviewPage's `runOpsUpToGroup` (web/review/pages/
  // ReviewPage.tsx:634) avoids this by running only the target group's ops
  // on top of the existing chart for the common forward-click case. We
  // mirror that here: the base render and split-plan setup happen once on
  // `renderStep(-1)`, and forward clicks run incrementally.
  private lastRenderedStepIndex = -1
  private activeSpec: ChartSpec | null = null
  private surfaceManager: SurfaceManager | null = null
  private splitPlan: SplitPlan | null = null
  private referencedResultIds: string[] = []
  // Per-split-surface derived specs. A split child's chart-type conversion
  // (e.g. sort turning the line into a sorted bar via storeDerivedChartState)
  // must stay LOCAL to that surface: promoting it to `activeSpec` made the
  // MERGE step re-run the ROOT with the derived spec, which rebuilt the root
  // chart as the derived type and visually collapsed the split back into one
  // chart (case 25gpdzxh8nu0c0vf).
  private splitSurfaceSpecs = new Map<string, ChartSpec>()

  constructor(context: RendererContext, overrideSteps?: StepManifest[]) {
    this.context = context
    this.overrideSteps = overrideSteps ?? null
  }

  async loadChart(chartId: string): Promise<void> {
    const manifestUrl = `${this.context.oursBase}/steps/${chartId}.step.json`
    const manifest = await fetchJson<ChartManifest>(manifestUrl)
    if (this.overrideSteps && this.overrideSteps.length > 0) {
      manifest.steps = this.overrideSteps
    }
    this.chart = await hydrateManifest(manifest, this.context.oursBase)
    this.stepRecords = new Array(this.chart.steps.length).fill(null)
  }

  getStepCount(): number {
    return this.chart?.steps.length ?? 0
  }

  getStepTexts(): string[] {
    return this.chart?.steps.map((s) => s.text) ?? []
  }

  async renderStep(index: number): Promise<void> {
    if (!this.chart) throw new Error('OursRenderer: chart not loaded.')

    // index < 0 → base render (no steps applied). Called once by
    // activateItem on item load and on item change. Full chart rebuild +
    // session-state reset happens here, NOT on every step click.
    if (index < 0) {
      resetChartHost(this.context.container)
      // Empty text removes any summary caption left over from the previous
      // item — the box lives next to the container, so resetChartHost alone
      // doesn't clear it.
      drawSummaryTextBox(this.context.container, '', { placement: 'bottom' })
      await renderChart(this.context.container, this.chart.spec)
      applyChartValueLabels(this.context.container)
      fitSvgViewBoxToContent(this.context.container)
      this.resetSession()
      return
    }

    // Already showing this step → no-op (avoids re-clicking causing flicker).
    if (index === this.lastRenderedStepIndex) return

    // Active forward click (index === lastRenderedStepIndex + 1 with a saved
    // continuation for the previous step): run only this step's ops on top
    // of the existing chart. No DOM wipe, no rebuild, no flicker.
    const previousIndex = this.lastRenderedStepIndex
    const previousRecord = previousIndex >= 0 ? this.stepRecords[previousIndex] : null
    const isActiveForward =
      index === previousIndex + 1 &&
      (previousIndex === -1 || previousRecord != null)

    if (isActiveForward) {
      // Drop stale labels while marks animate to new positions, re-place them
      // once the step's ops have settled.
      clearChartValueLabels(this.context.container)
      await this.executeStep(index, previousRecord, /* isReplay */ false)
      applyChartValueLabels(this.context.container, { fade: true })
      this.lastRenderedStepIndex = index
      return
    }

    // Replay path: backward jump or non-contiguous click. The chart's current
    // annotations don't match the target step's prefix, so we wipe + rebuild
    // + replay steps 0..index. Motion is suppressed on the replays via the
    // d3 controller; only the final target step animates normally.
    clearChartValueLabels(this.context.container)
    resetChartHost(this.context.container)
    await renderChart(this.context.container, this.chart.spec)
    fitSvgViewBoxToContent(this.context.container)
    this.resetSession()

    const controller = installD3ReplayMotionController()
    let previous: StepRecord | null = null
    for (let i = 0; i <= index; i += 1) {
      const isReplay = i < index
      const exec = () => this.executeStep(i, previous, isReplay)
      if (isReplay && controller) await controller.withMotionDisabled(exec)
      else await exec()
      previous = this.stepRecords[i]
    }
    applyChartValueLabels(this.context.container, { fade: true })
    this.lastRenderedStepIndex = index
  }

  /**
   * Reset all per-session state. Called after the chart skeleton is rebuilt
   * (renderStep(-1) or the replay path), so the split plan / surface manager
   * / step records start from a clean slate aligned with the fresh DOM.
   */
  private resetSession(): void {
    if (!this.chart) return
    this.stepRecords = new Array(this.chart.steps.length).fill(null)
    this.lastRenderedStepIndex = -1
    this.activeSpec = this.chart.spec
    this.surfaceManager = null
    this.splitPlan = null
    this.splitSurfaceSpecs = new Map()
    this.referencedResultIds = collectReferencedIdsForSteps(this.chart.steps)

    // Mirror ReviewPage's convergent-DAG split orchestration so the same
    // visual appears here. When the ops form a convergent DAG (two parallel
    // branches + a downstream merge — case 0s6zi9dyw22qo4rp), each step
    // routes to the matching surface (left/right/merge) instead of all
    // running on one chart and overwriting each other's annotations.
    const groups = this.chart.steps.map((s) => normalizeOpsGroups(s.opsSpec).flatMap((g) => g.ops)) as OperationSpec[][]
    const chartType = getChartType(this.chart.spec)
    this.splitPlan = (chartType ? analyzeSplitPlan(groups, { chartType }) : null) as SplitPlan | null
    if (this.splitPlan && chartType) {
      this.surfaceManager = new SurfaceManager(this.context.container)
      const rawRows = extractSpecRows(this.chart.spec)
      const datumValues = buildDatumValuesForSpec(this.chart.spec, rawRows)
      this.surfaceManager.createRootSurface(this.chart.spec, chartType, datumValues)
    }
  }

  /**
   * Run a single step's ops on top of the current chart, threading the chain
   * state through `previous`. Handles split-DAG routing (left/right/merge
   * surface) and fades in the split layout when the LEFT step first fires.
   * Updates `this.activeSpec` if the step's run transitioned chart type.
   */
  private async executeStep(i: number, previous: StepRecord | null, isReplay: boolean): Promise<void> {
    if (!this.chart || !this.activeSpec) return
    const step = this.chart.steps[i]
    if (!step) throw new Error(`Step ${i + 1} is missing.`)
    validateOpsSpec(step.opsSpec)

    const role = splitPlanRoleFor(this.splitPlan, i)
    let runHost: HTMLElement = this.context.container
    if (this.splitPlan && this.surfaceManager) {
      if (role === 'left') {
        const layoutType = this.surfaceManager.getLayout()?.type
        if (layoutType !== 'split-horizontal') {
          const rawRows = extractSpecRows(this.activeSpec)
          const datumValues = buildDatumValuesForSpec(this.activeSpec, rawRows)
          // deferEntrance: the panels stay invisible (opacity 0) while both
          // charts render and the shared-y-axis policy finalizes their axes/
          // viewBox — THEN the entrance fires. Without this the viewer
          // watched empty panels slide in, charts pop mid-animation, and the
          // right axis vanish/rescale (axis "왔다갔다" on 0wflwm4jebx7n12y).
          this.surfaceManager.splitSurface('horizontal', {
            idA: this.splitPlan.leftSurfaceId,
            idB: this.splitPlan.rightSurfaceId,
            specA: this.activeSpec,
            specB: this.activeSpec,
            dataA: datumValues,
            dataB: datumValues,
            deferEntrance: true,
          })
          const leftHost = this.surfaceManager.getSurface(this.splitPlan.leftSurfaceId)?.hostElement as HTMLElement | null
          const rightHost = this.surfaceManager.getSurface(this.splitPlan.rightSurfaceId)?.hostElement as HTMLElement | null
          if (leftHost) await renderChart(leftHost, this.activeSpec)
          if (rightHost) await renderChart(rightHost, this.activeSpec)
          applySplitSharedYAxisPolicy(this.surfaceManager)
          this.surfaceManager.triggerSplitEntrance()
          // Active step only: wait for the split entrance animation to
          // fully settle, then pause ~0.7s so the next animation (left-
          // surface filter/avg ops) doesn't blend visually into the
          // split's tail. Replays fast-forward through motion via the
          // d3 controller, so we skip the wait there.
          if (!isReplay) {
            await this.surfaceManager.waitForSplitAnimation()
            await new Promise((resolve) => setTimeout(resolve, 700))
          }
        }
        const leftHost = this.surfaceManager.getSurface(this.splitPlan.leftSurfaceId)?.hostElement as HTMLElement | null
        if (leftHost) runHost = leftHost
      } else if (role === 'right') {
        const rightHost = this.surfaceManager.getSurface(this.splitPlan.rightSurfaceId)?.hostElement as HTMLElement | null
        if (rightHost) runHost = rightHost
      }
      // role === 'merge' or null: keep runHost as the root container.
      // simpleBar's diff applier looks up the active split layout via the
      // passed-in surfaceManager and draws the cross-surface arrow over
      // both panels (see splitSurfaceVisuals.ts).
    }

    const groups = normalizeOpsGroups(step.opsSpec)
    const allOps = groups.flatMap((g) => g.ops)
    // Pre-run paint: label only (empty results map). The post-run repaint
    // below swaps in the same labels enriched with the computed numbers.
    const summaryText = buildCalculationSummaryText({ operations: allOps, resultsByNodeId: new Map() })
    drawSummaryTextBox(this.context.container, summaryText, { placement: 'bottom' })

    // Split children run with THEIR OWN derived spec (a prior step on that
    // surface may have converted its chart type, e.g. sort line→bar); the
    // root/merge step always keeps the pre-split `activeSpec` so the merge
    // never rebuilds the hidden root chart as a child's derived type.
    const surfaceKey =
      role === 'left' && this.splitPlan
        ? this.splitPlan.leftSurfaceId
        : role === 'right' && this.splitPlan
          ? this.splitPlan.rightSurfaceId
          : null
    const runSpec = (surfaceKey ? this.splitSurfaceSpecs.get(surfaceKey) : null) ?? this.activeSpec

    const result = await runChartOps(runHost, runSpec, step.opsSpec, {
      initialRenderMode: 'reuse-existing',
      resetRuntime: previous == null,
      runtimeSnapshot: previous?.runtimeSnapshot,
      initialChainState: previous?.continuation ?? null,
      referencedResultIds: this.referencedResultIds,
      ...(this.surfaceManager ? { surfaceManager: this.surfaceManager } : {}),
    })
    if (!isOperationNextRunOutcome(result)) {
      throw new Error('Operation runner did not return a continuation snapshot.')
    }
    await nextFrame()
    // Skip fitSvgViewBoxToContent in split mode: it always picks the first
    // <svg> under the container (= the root pivot SVG, which is hidden
    // until the merge step), and expanding its viewBox shifts the diff
    // overlay coordinates that the simpleBar diff applier just drew. Each
    // surface SVG sizes itself correctly via the chart-layout pass.
    const isSplitNow = this.surfaceManager?.getLayout()?.type === 'split-horizontal' ||
      this.surfaceManager?.getLayout()?.type === 'split-vertical'
    if (!isSplitNow) fitSvgViewBoxToContent(this.context.container)
    await waitForD3Transitions(this.context.container)
    if (!isSplitNow) fitSvgViewBoxToContent(this.context.container)
    const derived = consumeDerivedChartState(runHost)
    if (derived) {
      if (surfaceKey) this.splitSurfaceSpecs.set(surfaceKey, derived.spec)
      else this.activeSpec = derived.spec
    }

    this.stepRecords[i] = {
      runtimeSnapshot: result.runtimeSnapshot,
      continuation: result.continuation,
    }

    // Post-run repaint: same labels, now with computed numbers. Snapshots are
    // cumulative across steps, but merging every executed step's record keeps
    // cross-step refs (e.g. a diff over two earlier averages) resolvable under
    // any replay ordering.
    const resultsByNodeId = new Map<string, DatumValue[]>()
    for (const record of this.stepRecords.slice(0, i + 1)) {
      if (record) Object.entries(record.runtimeSnapshot).forEach(([key, rows]) => resultsByNodeId.set(key, rows))
    }
    const enriched = buildCalculationSummaryText({ operations: allOps, resultsByNodeId, lastResult: result.result })
    if (enriched) drawSummaryTextBox(this.context.container, enriched, { placement: 'bottom' })
  }

  teardown(): void {
    clearChartValueLabels(this.context.container)
    drawSummaryTextBox(this.context.container, '', { placement: 'bottom' })
    this.context.container.innerHTML = ''
    this.chart = null
    this.stepRecords = []
    this.lastRenderedStepIndex = -1
    this.activeSpec = null
    this.surfaceManager = null
    this.splitPlan = null
    this.splitSurfaceSpecs = new Map()
    this.referencedResultIds = []
  }
}

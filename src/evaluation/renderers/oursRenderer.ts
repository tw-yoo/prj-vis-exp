import * as d3 from 'd3'
import { consumeDerivedChartState, renderChart, resetChartHost, type ChartSpec } from '../../api/rendering'
import { normalizeOpsGroups, type OpsSpecInput } from '../../api/types'
import { isOperationNextRunOutcome, type OperationNextRunOutcome } from '../../operation-next/executionState'
import { collectReferencedResultIds } from '../../operation-next/diffEndpoint'
import { runChartOps } from '../../operation-next/runChartOps'
import type { ExplanationMethod, ExplanationRenderer, RendererContext } from './types'

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
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
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
  let contentBox: DOMRect | SVGRect
  try { contentBox = svgNode.getBBox() } catch { return }
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
  if (trimmed.startsWith('ChartQA/')) return `/${trimmed}`
  if (trimmed.startsWith('data/test/')) return `/${trimmed}`
  if (trimmed.startsWith('data/')) return `/ChartQA/${trimmed}`
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

  constructor(context: RendererContext, overrideSteps?: StepManifest[]) {
    this.context = context
    this.overrideSteps = overrideSteps ?? null
  }

  async loadChart(chartId: string): Promise<void> {
    const manifestUrl = `${this.context.oursBase}/${chartId}.json`
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
    resetChartHost(this.context.container)
    await renderChart(this.context.container, this.chart.spec)
    fitSvgViewBoxToContent(this.context.container)

    if (index < 0) {
      this.stepRecords = new Array(this.chart.steps.length).fill(null)
      return
    }

    let previous: StepRecord | null = null
    let activeSpec = this.chart.spec
    const controller = installD3ReplayMotionController()
    const referencedResultIds = collectReferencedIdsForSteps(this.chart.steps)

    for (let i = 0; i <= index; i += 1) {
      const step = this.chart.steps[i]
      if (!step) throw new Error(`Step ${i + 1} is missing.`)
      validateOpsSpec(step.opsSpec)

      const isReplay = i < index
      const run = async () => {
        const result = await runChartOps(this.context.container, activeSpec, step.opsSpec, {
          initialRenderMode: 'reuse-existing',
          resetRuntime: previous == null,
          runtimeSnapshot: previous?.runtimeSnapshot,
          initialChainState: previous?.continuation ?? null,
          referencedResultIds,
        })
        if (!isOperationNextRunOutcome(result)) {
          throw new Error('Operation runner did not return a continuation snapshot.')
        }
        return result
      }

      const outcome = isReplay && controller ? await controller.withMotionDisabled(run) : await run()
      await nextFrame()
      fitSvgViewBoxToContent(this.context.container)
      await waitForD3Transitions(this.context.container)
      fitSvgViewBoxToContent(this.context.container)
      const derived = consumeDerivedChartState(this.context.container)
      if (derived) activeSpec = derived.spec

      previous = {
        runtimeSnapshot: outcome.runtimeSnapshot,
        continuation: outcome.continuation,
      }
      this.stepRecords[i] = previous
    }
  }

  teardown(): void {
    this.context.container.innerHTML = ''
    this.chart = null
    this.stepRecords = []
  }
}

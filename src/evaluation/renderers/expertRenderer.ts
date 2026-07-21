import * as d3 from 'd3'
import { drawSummaryTextBox } from '../../api/operation-summary-text'
import type { ExplanationMethod, ExplanationRenderer, RendererContext } from './types'

type ExpertStep = { fn: string; text: string }
type ExpertEntry = { expertId?: string; module: string; steps: ExpertStep[] }
type ExpertManifest = Record<string, ExpertEntry>
type ExpertFn = (args: { d3: typeof d3; container: HTMLElement }) => void
type ExpertModule = Record<string, unknown>

let manifestCache: ExpertManifest | null = null
const moduleCache = new Map<string, ExpertModule>()
let d3Installed = false

// The validation expert modules (and their chartUtils.js) reference a bare
// global `d3`. The evaluation app imports d3 as an ES module, so expose that
// same instance on window for the dynamically-imported expert modules.
function installGlobalD3() {
  if (d3Installed) return
  ;(window as unknown as { d3?: typeof d3 }).d3 = d3
  d3Installed = true
}

async function loadManifest(baselineBase: string): Promise<ExpertManifest> {
  if (!manifestCache) {
    const response = await fetch(`${baselineBase}/B3/baseline3_manifest.json`, { cache: 'no-store' })
    if (!response.ok) throw new Error(`Failed to load baseline3_manifest.json (${response.status})`)
    manifestCache = (await response.json()) as ExpertManifest
  }
  return manifestCache
}

// Mirrors the validation viewer: the base chart is drawn by the module's
// renderValidation*Chart export (the only export whose name starts with
// "render").
function findRenderFn(mod: ExpertModule): ExpertFn | null {
  const fn = Object.values(mod).find(
    (v) => typeof v === 'function' && ((v as { name?: string }).name ?? '').toLowerCase().startsWith('render'),
  )
  return (fn as ExpertFn) ?? null
}

// B3 — the expert-explanation baseline. Reuses the validation/ expert modules
// (copied verbatim to baselines/B3/expert/<id>.js, with chartUtils.js alongside
// so their relative import resolves). Each module exports a base renderer plus
// functionN step animations; baseline3_manifest.json lists, per chart, which
// functionN to run for each step and its label. Step replay mirrors the
// validation viewer: a forward click runs only the newly-revealed functions on
// the existing chart; a backward click or jump resets to the base chart and
// replays steps 0..target.
export class ExpertRenderer implements ExplanationRenderer {
  readonly method: ExplanationMethod = 'b3'
  private context: RendererContext
  private mod: ExpertModule | null = null
  private steps: ExpertStep[] = []
  private currentStep = -1

  constructor(context: RendererContext) {
    this.context = context
  }

  async loadChart(chartId: string): Promise<void> {
    installGlobalD3()
    this.mod = null
    this.steps = []
    this.currentStep = -1
    const manifest = await loadManifest(this.context.baselineBase)
    const entry = manifest?.[chartId]
    if (!entry) {
      console.warn(`[expertRenderer] no manifest entry for chart "${chartId}".`)
      return
    }
    this.steps = entry.steps ?? []
    let mod = moduleCache.get(chartId)
    if (!mod) {
      const url = `${this.context.baselineBase}/B3/${entry.module}`
      try {
        mod = (await import(/* @vite-ignore */ url)) as ExpertModule
        moduleCache.set(chartId, mod)
      } catch (error) {
        // Missing / corrupt expert module: degrade gracefully (no steps, the
        // 'unavailable' message in renderStep) instead of crashing the study.
        console.error(`[expertRenderer] failed to load expert module for "${chartId}".`, error)
        this.steps = []
        return
      }
    }
    this.mod = mod
  }

  getStepCount(): number {
    return this.steps.length
  }

  getStepTexts(): string[] {
    return this.steps.map((s) => s.text)
  }

  private renderBase() {
    const renderFn = this.mod ? findRenderFn(this.mod) : null
    if (!renderFn) {
      this.context.container.innerHTML = '<div class="renderer-empty">Expert chart unavailable.</div>'
      this.currentStep = -1
      return
    }
    this.context.container.innerHTML = ''
    renderFn({ d3, container: this.context.container })
    this.currentStep = -1
  }

  private runStepFn(i: number) {
    const step = this.steps[i]
    const fn = step && this.mod ? this.mod[step.fn] : null
    // A missing step function would silently leave the chart on the previous
    // step while the participant reads this step's text — a visual/narrative
    // desync. Throw so the viewer's runStep records a visible step error.
    if (typeof fn !== 'function') {
      throw new Error(`Expert step function "${step?.fn}" is missing for this chart.`)
    }
    ;(fn as ExpertFn)({ d3, container: this.context.container })
  }

  async renderStep(index: number): Promise<void> {
    installGlobalD3()
    if (!this.mod) {
      this.context.container.innerHTML = '<div class="renderer-empty">Expert explanation unavailable.</div>'
      drawSummaryTextBox(this.context.container, '', { placement: 'bottom' })
      return
    }
    if (index < 0) {
      this.renderBase()
      drawSummaryTextBox(this.context.container, '', { placement: 'bottom' })
      return
    }
    const hasBase = !!this.context.container.querySelector('svg')
    if (index <= this.currentStep || !hasBase) {
      // backward / jump / missing base: reset to base, then replay 0..index.
      this.renderBase()
      for (let i = 0; i <= index; i += 1) this.runStepFn(i)
    } else {
      // forward: the chart already carries steps 0..currentStep; run the rest.
      for (let i = this.currentStep + 1; i <= index; i += 1) this.runStepFn(i)
    }
    this.currentStep = index
    // B3 has no ops spec to derive a calculation caption from; the authored
    // step text (which already carries the numbers) doubles as the caption.
    drawSummaryTextBox(this.context.container, this.steps[index]?.text ?? '', { placement: 'bottom' })
  }

  teardown(): void {
    drawSummaryTextBox(this.context.container, '', { placement: 'bottom' })
    this.context.container.innerHTML = ''
    this.currentStep = -1
  }
}

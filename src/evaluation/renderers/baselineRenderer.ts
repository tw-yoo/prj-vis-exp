import * as d3 from 'd3'
import type { ExplanationMethod, ExplanationRenderer, RendererContext } from './types'

// Renders a study baseline (B1 or B2). Both share the same scene shape and base
// SVG (baselines/baseline_input.json); they differ only in the result file and
// whether scenes carry `d3_code`:
//   B1 (baseline1_result.json) — svg_code + d3_code (animated, executed here)
//   B2 (baseline2_result.json) — svg_code only (static)
// The d3_code path is a no-op for B2 since its scenes have no d3_code.
type BaselineKind = 'b1' | 'b2'

type BaselineScene = {
  scene_number?: number
  text_chunk: string
  svg_code: string
  d3_code?: string
}

type BaselineResult = Record<string, Record<string, BaselineScene[]>>
type BaselineInput = Record<string, { question?: string; explanation?: string; svg?: string }>

const RESULT_FILE: Record<BaselineKind, string> = {
  b1: 'B1/baseline1_result.json',
  b2: 'B2/baseline2_result.json',
}

const resultCache = new Map<string, BaselineResult>()
let inputCache: BaselineInput | null = null

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error(`Failed to load ${url} (${response.status})`)
  return response.json() as Promise<T>
}

async function loadResult(baselineBase: string, kind: BaselineKind): Promise<BaselineResult> {
  const url = `${baselineBase}/${RESULT_FILE[kind]}`
  let cached = resultCache.get(url)
  if (!cached) {
    cached = await fetchJson<BaselineResult>(url)
    resultCache.set(url, cached)
  }
  return cached
}

async function loadInput(baselineBase: string): Promise<BaselineInput> {
  if (!inputCache) {
    inputCache = await fetchJson<BaselineInput>(`${baselineBase}/baseline_input.json`)
  }
  return inputCache
}

// Mirror d3Renderer: rebind data attributes the baseline d3_code expects.
function hydrateD3DataBindings(container: HTMLElement) {
  const svg = d3.select(container).select<SVGSVGElement>('svg')
  if (svg.empty()) return
  svg.selectAll<SVGRectElement, unknown>('rect.main-bar').each(function () {
    const el = d3.select(this)
    const year = el.attr('data-x-value') || el.attr('data-target')
    const company = el.attr('data-series') || el.attr('data-group-value')
    const value = el.attr('data-y-value') || el.attr('data-value')
    if (year == null || company == null || value == null) return
    el.datum({ Year: String(year), key: String(company), value: +value })
  })
}

async function executeD3Code(container: HTMLElement, d3Code: string) {
  if (!d3Code || !d3Code.trim()) return
  const svgElement = container.querySelector('svg')
  if (!svgElement) throw new Error('No SVG element found for D3 rendering.')
  hydrateD3DataBindings(container)
  const runD3 = new Function('d3', 'container', 'svgElement', `"use strict";\n${d3Code}`)
  const result = runD3(d3, container, svgElement)
  if (result && typeof result.then === 'function') {
    await result
  }
}

export class BaselineRenderer implements ExplanationRenderer {
  readonly method: ExplanationMethod
  private kind: BaselineKind
  private scenes: BaselineScene[] = []
  private baseSvg = ''
  private context: RendererContext

  constructor(context: RendererContext, kind: BaselineKind) {
    this.context = context
    this.kind = kind
    this.method = kind
  }

  async loadChart(chartId: string): Promise<void> {
    const model = this.context.baselineModel
    const result = await loadResult(this.context.baselineBase, this.kind)
    const input = await loadInput(this.context.baselineBase)
    const scenes = result?.[model]?.[chartId]
    if (!Array.isArray(scenes)) {
      throw new Error(`No ${this.kind} baseline scenes for chart "${chartId}" under model "${model}".`)
    }
    this.scenes = scenes
    this.baseSvg = input?.[chartId]?.svg ?? ''
  }

  getStepCount(): number {
    return this.scenes.length
  }

  getStepTexts(): string[] {
    return this.scenes.map((s) => s.text_chunk ?? '')
  }

  async renderStep(index: number): Promise<void> {
    if (index < 0) {
      this.context.container.innerHTML = this.baseSvg || '<div class="renderer-empty">No base SVG.</div>'
      return
    }
    const scene = this.scenes[index]
    this.context.container.innerHTML = scene?.svg_code || this.baseSvg || '<div class="renderer-empty">No SVG code.</div>'
    if (scene?.d3_code && scene.d3_code.trim()) {
      try {
        await executeD3Code(this.context.container, scene.d3_code)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('[baselineRenderer] d3_code execution failed', error)
        const errEl = document.createElement('div')
        errEl.className = 'renderer-error'
        errEl.textContent = `Baseline execution error: ${message}`
        this.context.container.appendChild(errEl)
      }
    }
  }

  teardown(): void {
    this.context.container.innerHTML = ''
  }
}

import * as d3 from 'd3'
import type { ExplanationMethod, ExplanationRenderer, RendererContext } from './types'

type D3Scene = {
  scene_number?: number
  text_chunk: string
  svg_code: string
  d3_code?: string
}

type D3Result = Record<string, Record<string, D3Scene[]>>
type D3Input = Record<string, { question?: string; svg?: string }>

let cachedResult: D3Result | null = null
let cachedInput: D3Input | null = null

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error(`Failed to load ${url} (${response.status})`)
  return response.json() as Promise<T>
}

async function loadResult(baselineBase: string): Promise<D3Result> {
  if (!cachedResult) {
    cachedResult = await fetchJson<D3Result>(`${baselineBase}/d3_result.json`)
  }
  return cachedResult
}

async function loadInput(baselineBase: string): Promise<D3Input> {
  if (!cachedInput) {
    cachedInput = await fetchJson<D3Input>(`${baselineBase}/d3_input.json`)
  }
  return cachedInput
}

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

export class D3Renderer implements ExplanationRenderer {
  readonly method: ExplanationMethod = 'd3'
  private scenes: D3Scene[] = []
  private baseSvg = ''
  private context: RendererContext

  constructor(context: RendererContext) {
    this.context = context
  }

  async loadChart(chartId: string): Promise<void> {
    const model = this.context.defaultD3Model
    const result = await loadResult(this.context.baselineBase)
    const input = await loadInput(this.context.baselineBase)
    const scenes = result?.[model]?.[chartId]
    if (!Array.isArray(scenes)) {
      throw new Error(`No d3 baseline scenes for chart "${chartId}" under model "${model}".`)
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
        console.error('[d3Renderer] d3_code execution failed', error)
        const errEl = document.createElement('div')
        errEl.className = 'renderer-error'
        errEl.textContent = `D3 execution error: ${message}`
        this.context.container.appendChild(errEl)
      }
    }
  }

  teardown(): void {
    this.context.container.innerHTML = ''
  }
}

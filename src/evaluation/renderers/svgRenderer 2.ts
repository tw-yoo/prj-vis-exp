import type { ExplanationMethod, ExplanationRenderer, RendererContext } from './types'

type SvgScene = {
  scene_number?: number
  text_chunk: string
  svg_code: string
}

type SvgResult = Record<string, Record<string, SvgScene[]>>
type SvgInput = Record<string, { question?: string; svg?: string }>

let cachedResult: SvgResult | null = null
let cachedInput: SvgInput | null = null

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error(`Failed to load ${url} (${response.status})`)
  return response.json() as Promise<T>
}

async function loadResult(baselineBase: string): Promise<SvgResult> {
  if (!cachedResult) {
    cachedResult = await fetchJson<SvgResult>(`${baselineBase}/svg_result.json`)
  }
  return cachedResult
}

async function loadInput(baselineBase: string): Promise<SvgInput> {
  if (!cachedInput) {
    cachedInput = await fetchJson<SvgInput>(`${baselineBase}/svg_input.json`)
  }
  return cachedInput
}

export class SvgRenderer implements ExplanationRenderer {
  readonly method: ExplanationMethod = 'svg'
  private scenes: SvgScene[] = []
  private baseSvg = ''
  private context: RendererContext

  constructor(context: RendererContext) {
    this.context = context
  }

  async loadChart(chartId: string): Promise<void> {
    const model = this.context.defaultSvgModel
    const result = await loadResult(this.context.baselineBase)
    const input = await loadInput(this.context.baselineBase)
    const scenes = result?.[model]?.[chartId]
    if (!Array.isArray(scenes)) {
      throw new Error(`No svg baseline scenes for chart "${chartId}" under model "${model}".`)
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
    const code = scene?.svg_code?.trim()
    if (code) {
      this.context.container.innerHTML = code
    } else if (this.baseSvg) {
      this.context.container.innerHTML = this.baseSvg
    } else {
      this.context.container.innerHTML = '<div class="renderer-empty">No SVG code.</div>'
    }
  }

  teardown(): void {
    this.context.container.innerHTML = ''
  }
}

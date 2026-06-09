import { attachChartHoverTooltip } from '../../rendering/common/chartHoverTooltip'
import type { ExplanationMethod, ExplanationRenderer, RendererContext } from './types'

type BaselineInput = Record<string, { question?: string; explanation?: string; svg?: string }>

let inputCache: BaselineInput | null = null

async function loadInput(baselineBase: string): Promise<BaselineInput> {
  if (!inputCache) {
    const response = await fetch(`${baselineBase}/baseline_input.json`, { cache: 'no-store' })
    if (!response.ok) throw new Error(`Failed to load baseline_input.json (${response.status})`)
    inputCache = (await response.json()) as BaselineInput
  }
  return inputCache
}

// B1 — the simple-text baseline. It shows the base chart SVG (the same
// baselines/baseline_input.json chart B2 uses) plus the explanation prose as a
// single static text block. There is NO step-by-step visual annotation: the
// chart never changes, so clicking the explanation is a no-op. This is the
// "chart + question + text only" condition.
export class TextRenderer implements ExplanationRenderer {
  readonly method: ExplanationMethod = 'b1'
  private context: RendererContext
  private svg = ''
  private explanation = ''

  constructor(context: RendererContext) {
    this.context = context
  }

  async loadChart(chartId: string): Promise<void> {
    const input = await loadInput(this.context.baselineBase)
    const entry = input?.[chartId]
    this.svg = entry?.svg ?? ''
    this.explanation = (entry?.explanation ?? '').trim()
    if (!this.svg) {
      console.warn(`[textRenderer] no base SVG for chart "${chartId}"; showing text only.`)
    }
  }

  // The whole explanation is shown at once as a single block (no stepping).
  getStepCount(): number {
    return this.explanation ? 1 : 0
  }

  getStepTexts(): string[] {
    return this.explanation ? [this.explanation] : []
  }

  // The chart is identical for every index — there is no visual explanation.
  async renderStep(_index: number): Promise<void> {
    this.context.container.innerHTML = this.svg || '<div class="renderer-empty">No chart.</div>'
    attachChartHoverTooltip(this.context.container)
  }

  teardown(): void {
    this.context.container.innerHTML = ''
  }
}

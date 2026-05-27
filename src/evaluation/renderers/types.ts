export type ExplanationMethod = 'ours' | 'd3' | 'svg'

export interface ExplanationRenderer {
  readonly method: ExplanationMethod
  loadChart(chartId: string): Promise<void>
  getStepCount(): number
  getStepTexts(): string[]
  renderStep(index: number): Promise<void>
  teardown(): void
}

export interface RendererContext {
  container: HTMLElement
  baselineBase: string
  oursBase: string
  defaultD3Model: string
  defaultSvgModel: string
}

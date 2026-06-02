// 'ours' = our explanation visualizer (data/ours). 'b1'/'b2' = the two study
// baselines (baselines/B1, baselines/B2). 'd3'/'svg' are legacy method tags kept
// only for the tutorial demo's SvgRenderer; the participant sequence never uses them.
export type ExplanationMethod = 'ours' | 'b1' | 'b2' | 'd3' | 'svg'

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
  baselineModel: string
}

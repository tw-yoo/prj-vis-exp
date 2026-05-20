// Phase 4: chart-explanation-layer (the top banner with bold summary text)
// was removed entirely. These functions remain as no-op stubs so existing
// callers compile without changes; nothing is appended to the SVG.

export type ChartExplanationContent = {
  text: string
}

export function clearChartExplanation(_container: HTMLElement): void {
  // intentionally empty — no explanation layer is created anymore
}

export function renderChartExplanation(
  _container: HTMLElement,
  _content: ChartExplanationContent | null,
): void {
  // intentionally empty — no explanation layer is created anymore
}

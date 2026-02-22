import { RenderChartUseCase } from '../application/usecases/renderChartUseCase'
import { BrowserChartRenderPort, BrowserVegaLiteRenderPort } from '../adapters/out/chart-renderer/browserChartRenderPort'
import { getChartType, normalizeSpec, type VegaLiteSpec, type ChartTypeValue, ChartType } from '../domain/chart'
import {
  renderChart as renderChartLegacy,
} from '../rendering/renderChart'
import { renderVegaLiteChart as renderVegaLiteChartLegacy } from '../rendering/chartRenderer'
import type { ChartSurfaceRef } from '../application/ports/outbound'

export function toDomSurface(container: HTMLElement): ChartSurfaceRef {
  return { kind: 'dom', handle: container }
}

export async function renderChart(command: { surface: ChartSurfaceRef; spec: VegaLiteSpec }): Promise<void>
export async function renderChart(container: HTMLElement, spec: VegaLiteSpec): Promise<unknown>
export async function renderChart(
  arg1: HTMLElement | { surface: ChartSurfaceRef; spec: VegaLiteSpec },
  arg2?: VegaLiteSpec,
): Promise<unknown> {
  if (arg1 instanceof HTMLElement) {
    return renderChartLegacy(arg1, arg2 as VegaLiteSpec)
  }
  const useCase = new RenderChartUseCase(new BrowserChartRenderPort())
  await useCase.execute(arg1)
  return undefined
}

export async function renderVegaLiteChart(command: { surface: ChartSurfaceRef; spec: VegaLiteSpec }): Promise<void>
export async function renderVegaLiteChart(container: HTMLElement, spec: VegaLiteSpec): Promise<unknown>
export async function renderVegaLiteChart(
  arg1: HTMLElement | { surface: ChartSurfaceRef; spec: VegaLiteSpec },
  arg2?: VegaLiteSpec,
): Promise<unknown> {
  if (arg1 instanceof HTMLElement) {
    return renderVegaLiteChartLegacy(arg1, arg2 as VegaLiteSpec)
  }
  const useCase = new RenderChartUseCase(new BrowserVegaLiteRenderPort())
  await useCase.execute(arg1)
  return undefined
}

export { getChartType, normalizeSpec, ChartType }
export type { VegaLiteSpec, ChartTypeValue }

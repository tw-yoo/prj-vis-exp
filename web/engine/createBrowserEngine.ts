import {
  renderChart as renderChartApi,
  renderVegaLiteChart as renderVegaLiteChartApi,
  toDomSurface,
  type VegaLiteSpec,
} from '../../src/api/rendering'
import { runChartOps as runChartOpsApi } from '../../src/api/operation-run'
import { buildOps } from '../../src/api/operation-build'
import { draw, ops } from '../../src/api/authoring'
import type { OpsSpecInput } from '../../src/api/types'

export type BrowserEngine = {
  renderChart: (container: HTMLElement, spec: VegaLiteSpec) => Promise<unknown>
  renderVegaLiteChart: (container: HTMLElement, spec: VegaLiteSpec) => Promise<unknown>
  runChartOps: (container: HTMLElement, spec: VegaLiteSpec, opsSpec: OpsSpecInput) => Promise<unknown>
  buildOps: typeof buildOps
  draw: typeof draw
  ops: typeof ops
}

export function createBrowserEngine(): BrowserEngine {
  return {
    async renderChart(container, spec) {
      return renderChartApi({ surface: toDomSurface(container), spec })
    },
    async renderVegaLiteChart(container, spec) {
      return renderVegaLiteChartApi({ surface: toDomSurface(container), spec })
    },
    async runChartOps(container, spec, opsSpec) {
      return runChartOpsApi({ container, spec, opsSpec })
    },
    buildOps,
    draw,
    ops,
  }
}

export const browserEngine = createBrowserEngine()

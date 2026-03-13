import {
  renderChart as renderChartApi,
  renderVegaLiteChart as renderVegaLiteChartApi,
  toDomSurface,
  type VegaLiteSpec,
} from '../../src/api/rendering'
import { runChartOps as runChartOpsApi } from '../../src/api/operation-run'
import { buildOps } from '../../src/api/operation-build'
import { draw, ops } from '../../src/api/authoring'
import { compileOpsPlan as compileOpsPlanApi, parseToOperationSpec as parseToOperationSpecApi } from '../../src/api/nlp-ops'
import type { OpsSpecInput, ParseToOpsResult } from '../../src/api/types'
import type { RunChartOpsOptions } from '../../src/api/operation-run'
import type { CompileOpsPlanCommand, CompileOpsPlanResult, ParseToOperationSpecCommand } from '../../src/api/nlp-ops'
import { buildDemoSentenceBindings as buildDemoSentenceBindingsApi } from '../../src/api/demo-binding'
import type { DemoSentenceBinding } from '../../src/api/demo-binding'
import { runPythonPlan as runPythonPlanApi } from '../../src/api/python-plan'
import type { RunPythonPlanCommand, RunPythonPlanResult } from '../../src/api/python-plan'

export type BrowserEngine = {
  renderChart: (container: HTMLElement, spec: VegaLiteSpec) => Promise<unknown>
  renderVegaLiteChart: (container: HTMLElement, spec: VegaLiteSpec) => Promise<unknown>
  runChartOps: (
    container: HTMLElement,
    spec: VegaLiteSpec,
    opsSpec: OpsSpecInput,
    options?: RunChartOpsOptions,
  ) => Promise<unknown>
  buildDemoSentenceBindings: (sentences: string[], opsSpec: OpsSpecInput) => DemoSentenceBinding[]
  parseToOperationSpec: (command: ParseToOperationSpecCommand) => Promise<ParseToOpsResult>
  compileOpsPlan: (command: CompileOpsPlanCommand) => Promise<CompileOpsPlanResult>
  runPythonPlan: (command: RunPythonPlanCommand) => Promise<RunPythonPlanResult>
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
    async runChartOps(container, spec, opsSpec, options) {
      return runChartOpsApi({ container, spec, opsSpec, options })
    },
    buildDemoSentenceBindings(sentences, opsSpec) {
      return buildDemoSentenceBindingsApi(sentences, opsSpec)
    },
    async parseToOperationSpec(command) {
      return parseToOperationSpecApi(command)
    },
    async compileOpsPlan(command) {
      return compileOpsPlanApi(command)
    },
    async runPythonPlan(command) {
      return runPythonPlanApi(command)
    },
    buildOps,
    draw,
    ops,
  }
}

export const browserEngine = createBrowserEngine()

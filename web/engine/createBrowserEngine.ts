import {
  renderChart as renderChartApi,
  resetChartHost as resetChartHostApi,
  toDomSurface,
  type ChartSpec,
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
  renderChart: (container: HTMLElement, spec: ChartSpec) => Promise<unknown>
  /**
   * Forces the next `renderChart` call on `container` to rebuild from scratch.
   * Detaches the cached ChartInstance and clears the host DOM, defeating the
   * idempotent NO-OP path inside `ChartInstance.ensureRendered` (which would
   * otherwise leave prior annotations and persisted instance state — e.g.
   * `activeTargets`, `outOfScopeOpacity` — intact when the spec is unchanged).
   * Used by the review page's "Reset chart" button.
   */
  resetChartHost: (container: HTMLElement) => void
  runChartOps: (
    container: HTMLElement,
    spec: ChartSpec,
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
    resetChartHost(container) {
      resetChartHostApi(container)
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

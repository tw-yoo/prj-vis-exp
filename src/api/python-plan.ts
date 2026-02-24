import type { VegaLiteSpec } from '../domain/chart'
import type { OpsSpecGroupMap } from '../domain/operation/opsSpec'
import { normalizeOpsGroups } from '../domain/operation/opsSpec'

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

type RunPythonPlanServerResponse = {
  scenario_path?: unknown
  vega_lite_spec?: unknown
  draw_plan?: unknown
  warnings?: unknown
}

export type RunPythonPlanCommand = {
  scenarioPath: string
  debug?: boolean
  endpoint?: string
  fetcher?: FetchLike
}

export type RunPythonPlanResult = {
  scenarioPath: string
  vegaLiteSpec: VegaLiteSpec
  drawPlan: OpsSpecGroupMap
  warnings: string[]
}

function resolveDefaultEndpoint(): string {
  const env =
    typeof import.meta !== 'undefined' ? ((import.meta as { env?: Record<string, unknown> }).env ?? {}) : {}
  const fromEnv = typeof env.VITE_NLP_SERVER_URL === 'string' ? env.VITE_NLP_SERVER_URL : ''
  const normalized = fromEnv.trim()
  if (normalized) return normalized.replace(/\/+$/, '')
  return 'http://localhost:3000'
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function normalizeWarnings(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
}

function normalizeDrawPlan(raw: unknown): OpsSpecGroupMap {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Python plan response is invalid: "draw_plan" must be an object.')
  }
  const groups = normalizeOpsGroups(raw as OpsSpecGroupMap)
  const out: OpsSpecGroupMap = {}
  for (const group of groups) {
    out[group.name] = group.ops
  }
  if (!Array.isArray(out.ops)) out.ops = []
  return out
}

export async function runPythonPlan(command: RunPythonPlanCommand): Promise<RunPythonPlanResult> {
  const scenarioPath = command.scenarioPath.trim()
  if (!scenarioPath) {
    throw new Error('scenarioPath is empty.')
  }

  const endpoint = (command.endpoint ?? resolveDefaultEndpoint()).replace(/\/+$/, '')
  const fetcher = command.fetcher ?? fetch.bind(globalThis)

  const response = await fetcher(`${endpoint}/run_python_plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      scenario_path: scenarioPath,
      debug: Boolean(command.debug),
    }),
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`Python plan request failed (${response.status}): ${detail || response.statusText}`)
  }

  const body = (await response.json()) as RunPythonPlanServerResponse
  if (!isPlainObject(body.vega_lite_spec)) {
    throw new Error('Python plan response is invalid: "vega_lite_spec" must be an object.')
  }

  const normalizedScenarioPath = typeof body.scenario_path === 'string' && body.scenario_path.trim().length > 0
    ? body.scenario_path
    : scenarioPath

  return {
    scenarioPath: normalizedScenarioPath,
    vegaLiteSpec: body.vega_lite_spec as VegaLiteSpec,
    drawPlan: normalizeDrawPlan(body.draw_plan),
    warnings: normalizeWarnings(body.warnings),
  }
}


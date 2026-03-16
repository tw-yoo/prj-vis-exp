import { csvParse, tsvParse } from 'd3'
import type { VegaLiteSpec } from '../domain/chart'
import type { NormalizedOpsGroup, OpsSpecGroupMap } from '../domain/operation/opsSpec'
import { normalizeOpsGroups } from '../domain/operation/opsSpec'

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
type UnknownRecord = Record<string, unknown>

export type ParseToOperationSpecCommand = {
  text: string
  question?: string
  explanation?: string
  spec: VegaLiteSpec
  container?: HTMLElement | null
  endpoint?: string
  fetcher?: FetchLike
  debug?: boolean
}

export type ParseToOpsResult = {
  resolvedText: string
  opsSpec: OpsSpecGroupMap
  drawPlan?: OpsSpecGroupMap
  executionPlan?: ExecutionPlan
  visualExecutionPlan?: VisualExecutionPlan
  warnings: string[]
}

export type ExecutionPlanStep = {
  id: string
  sentenceIndex: number
  groupNames: string[]
  drawGroupNames: string[]
  parallel?: boolean
}

export type ExecutionPlan = {
  mode: 'sentence-step'
  steps: ExecutionPlanStep[]
}

export type VisualExecutionSubstep = {
  id: string
  kind: 'prefilter' | 'materialize-surface' | 'run-op' | 'fallback'
  groupName: string
  nodeId?: string
  opName?: string
  label?: string
  visible?: boolean
  sourceNodeIds?: string[]
  scope?: {
    groups?: string[]
    role?: 'shared' | 'left' | 'right'
  }
  surface?: {
    surfaceType?: 'source-chart' | 'derived-chart' | 'scalar-panel' | 'text-only'
    templateType?: string
    sourceNodeIds?: string[]
    syntheticLabels?: 'semantic' | 'node'
    layout?: 'full-canvas'
    keepOnComplete?: boolean
  }
}

export type VisualExecutionStep = {
  id: string
  sentenceIndex: number
  groupNames: string[]
  navigationUnit?: 'sentence'
  surfacePolicy?: 'keep-final-derived-chart'
  substeps: VisualExecutionSubstep[]
}

export type VisualExecutionPlan = {
  mode: 'linear-derived-chart-flow'
  steps: VisualExecutionStep[]
  reusePolicy?: 'result-only'
}

export type MaterializedExecutionGroups = {
  groups: NormalizedOpsGroup[]
  mode: 'group' | 'sentence-step'
}

export type CompileOpsPlanCommand = {
  spec: VegaLiteSpec
  dataRows: UnknownRecord[]
  opsSpec: OpsSpecGroupMap
  endpoint?: string
  fetcher?: FetchLike
}

export type CompileOpsPlanResult = {
  opsSpec: OpsSpecGroupMap
  drawPlan?: OpsSpecGroupMap
  executionPlan?: ExecutionPlan
  visualExecutionPlan?: VisualExecutionPlan
  warnings: string[]
}

type GenerateGrammarRequest = {
  question: string
  explanation: string
  vega_lite_spec: VegaLiteSpec
  data_rows: UnknownRecord[]
  debug: boolean
}

type GenerateGrammarResponse = Record<string, unknown> & {
  ops1?: unknown
  draw_plan?: unknown
  execution_plan?: unknown
  visual_execution_plan?: unknown
  resolvedText?: unknown
  resolved_text?: unknown
  warnings?: unknown
}

function resolveDefaultEndpoint(): string {
  const env =
    typeof import.meta !== 'undefined' ? ((import.meta as { env?: Record<string, unknown> }).env ?? {}) : {}
  const fromEnv = typeof env.VITE_NLP_SERVER_URL === 'string' ? env.VITE_NLP_SERVER_URL : ''
  const normalized = fromEnv.trim()
  if (normalized) return normalized.replace(/\/+$/, '')
  return 'http://localhost:3000'
}

function asRecord(value: unknown): UnknownRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as UnknownRecord
}

function toSpecDataUrl(spec: UnknownRecord): string | null {
  const data = asRecord(spec.data)
  if (!data) return null
  const url = data.url
  if (typeof url !== 'string') return null
  const normalized = url.trim()
  return normalized || null
}

function normalizeRow(value: unknown): UnknownRecord | null {
  const row = asRecord(value)
  if (!row) return null
  const out: UnknownRecord = {}
  for (const [key, entry] of Object.entries(row)) {
    if (entry === null || entry === undefined) {
      out[key] = null
      continue
    }
    if (typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'boolean') {
      out[key] = entry
      continue
    }
    out[key] = String(entry)
  }
  return out
}

async function loadDataRows(spec: VegaLiteSpec, fetcher: FetchLike): Promise<UnknownRecord[]> {
  const specRecord = spec as unknown as UnknownRecord
  const valuesRaw = asRecord(specRecord.data)?.values
  if (Array.isArray(valuesRaw)) {
    return valuesRaw.map((row) => normalizeRow(row)).filter((row): row is UnknownRecord => !!row)
  }

  const url = toSpecDataUrl(specRecord)
  if (!url) return []

  const response = await fetcher(url, { method: 'GET' })
  if (!response.ok) return []

  const contentType = (response.headers.get('content-type') ?? '').toLowerCase()
  if (contentType.includes('application/json') || url.toLowerCase().endsWith('.json')) {
    const payload = await response.json()
    if (Array.isArray(payload)) {
      return payload.map((row) => normalizeRow(row)).filter((row): row is UnknownRecord => !!row)
    }
    const obj = asRecord(payload)
    if (obj && Array.isArray(obj.values)) {
      return obj.values.map((row) => normalizeRow(row)).filter((row): row is UnknownRecord => !!row)
    }
    return []
  }

  const text = await response.text()
  const lowerUrl = url.toLowerCase()
  const parsed =
    lowerUrl.endsWith('.tsv') || contentType.includes('text/tab-separated-values') ? tsvParse(text) : csvParse(text)
  return parsed.map((row) => normalizeRow(row)).filter((row): row is UnknownRecord => !!row)
}

function normalizeWarnings(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
}

function normalizeGroupMap(raw: unknown): OpsSpecGroupMap {
  if (!raw || typeof raw !== 'object') {
    throw new Error('NLP server response is invalid: response must be an opsSpec groups object.')
  }
  const groups = normalizeOpsGroups(raw as OpsSpecGroupMap)
  if (!groups.length) {
    return { ops: [] }
  }

  const out: OpsSpecGroupMap = {}
  for (const group of groups) {
    out[group.name] = group.ops
  }
  if (!Array.isArray(out.ops)) out.ops = []
  return out
}

function normalizeOptionalDrawPlan(raw: unknown): OpsSpecGroupMap | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const groups = normalizeOpsGroups(raw as OpsSpecGroupMap)
  if (!groups.length) return undefined
  const out: OpsSpecGroupMap = {}
  for (const group of groups) {
    out[group.name] = group.ops
  }
  if (!Array.isArray(out.ops)) out.ops = []
  return out
}

export function normalizeExecutionPlan(raw: unknown): ExecutionPlan | undefined {
  const record = asRecord(raw)
  if (!record) return undefined
  const mode = record.mode
  if (mode !== 'sentence-step') return undefined
  const stepsRaw = record.steps
  if (!Array.isArray(stepsRaw)) return undefined

  const steps: ExecutionPlanStep[] = []
  stepsRaw.forEach((value, index) => {
    const step = asRecord(value)
    if (!step) return
    const sentenceIndex = Number(step.sentenceIndex)
    if (!Number.isFinite(sentenceIndex) || sentenceIndex < 1) return
    const groupNames = Array.isArray(step.groupNames)
      ? step.groupNames.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
      : []
    const drawGroupNames = Array.isArray(step.drawGroupNames)
      ? step.drawGroupNames.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
      : []
    const id = typeof step.id === 'string' && step.id.trim().length > 0 ? step.id : `s${index + 1}`
    const out: ExecutionPlanStep = {
      id,
      sentenceIndex: Math.floor(sentenceIndex),
      groupNames,
      drawGroupNames,
      parallel: step.parallel !== false,
    }
    steps.push(out)
  })

  return {
    mode: 'sentence-step',
    steps,
  }
}

export function normalizeVisualExecutionPlan(raw: unknown): VisualExecutionPlan | undefined {
  const record = asRecord(raw)
  if (!record) return undefined
  if (record.mode !== 'linear-derived-chart-flow') return undefined
  if (!Array.isArray(record.steps)) return undefined

  const steps: VisualExecutionStep[] = []
  record.steps.forEach((entry, index) => {
    const step = asRecord(entry)
    if (!step) return
    const sentenceIndex = Number(step.sentenceIndex)
    if (!Number.isFinite(sentenceIndex) || sentenceIndex < 1) return
    const groupNames = Array.isArray(step.groupNames)
      ? step.groupNames.filter((token): token is string => typeof token === 'string' && token.trim().length > 0)
      : []
    const substepsRaw = Array.isArray(step.substeps) ? step.substeps : []
    const substeps: VisualExecutionSubstep[] = []
    substepsRaw.forEach((value, substepIndex) => {
      const substep = asRecord(value)
      if (!substep) return
      const id = typeof substep.id === 'string' && substep.id.trim().length > 0 ? substep.id : `ss${index + 1}_${substepIndex + 1}`
      const kind = substep.kind
      if (kind !== 'prefilter' && kind !== 'materialize-surface' && kind !== 'run-op' && kind !== 'fallback') {
        return
      }
      const out: VisualExecutionSubstep = {
        id,
        kind,
        groupName:
          typeof substep.groupName === 'string' && substep.groupName.trim().length > 0 ? substep.groupName.trim() : 'ops',
      }
      if (typeof substep.nodeId === 'string' && substep.nodeId.trim().length > 0) out.nodeId = substep.nodeId.trim()
      if (typeof substep.opName === 'string' && substep.opName.trim().length > 0) out.opName = substep.opName.trim()
      if (typeof substep.label === 'string' && substep.label.trim().length > 0) out.label = substep.label.trim()
      if (typeof substep.visible === 'boolean') out.visible = substep.visible
      if (Array.isArray(substep.sourceNodeIds)) {
        out.sourceNodeIds = substep.sourceNodeIds.filter(
          (token): token is string => typeof token === 'string' && token.trim().length > 0,
        )
      }
      const scope = asRecord(substep.scope)
      if (scope) {
        const groups = Array.isArray(scope.groups)
          ? scope.groups.filter((token): token is string => typeof token === 'string' && token.trim().length > 0)
          : undefined
        const role =
          scope.role === 'shared' || scope.role === 'left' || scope.role === 'right' ? scope.role : undefined
        if ((groups && groups.length > 0) || role) {
          out.scope = {}
          if (groups && groups.length > 0) out.scope.groups = groups
          if (role) out.scope.role = role
        }
      }
      const surface = asRecord(substep.surface)
      if (surface) {
        const normalizedSurface: VisualExecutionSubstep['surface'] = {}
        if (
          surface.surfaceType === 'source-chart' ||
          surface.surfaceType === 'derived-chart' ||
          surface.surfaceType === 'scalar-panel' ||
          surface.surfaceType === 'text-only'
        ) {
          normalizedSurface.surfaceType = surface.surfaceType
        }
        if (typeof surface.templateType === 'string' && surface.templateType.trim().length > 0) {
          normalizedSurface.templateType = surface.templateType.trim()
        }
        if (Array.isArray(surface.sourceNodeIds)) {
          normalizedSurface.sourceNodeIds = surface.sourceNodeIds.filter(
            (token): token is string => typeof token === 'string' && token.trim().length > 0,
          )
        }
        if (surface.syntheticLabels === 'semantic' || surface.syntheticLabels === 'node') {
          normalizedSurface.syntheticLabels = surface.syntheticLabels
        }
        if (surface.layout === 'full-canvas') normalizedSurface.layout = 'full-canvas'
        if (typeof surface.keepOnComplete === 'boolean') normalizedSurface.keepOnComplete = surface.keepOnComplete
        if (Object.keys(normalizedSurface).length > 0) out.surface = normalizedSurface
      }
      substeps.push(out)
    })

    const id = typeof step.id === 'string' && step.id.trim().length > 0 ? step.id : `s${index + 1}`
    const out: VisualExecutionStep = {
      id,
      sentenceIndex: Math.floor(sentenceIndex),
      groupNames,
      substeps,
    }
    if (step.navigationUnit === 'sentence') out.navigationUnit = 'sentence'
    if (step.surfacePolicy === 'keep-final-derived-chart') out.surfacePolicy = 'keep-final-derived-chart'
    steps.push(out)
  })

  const plan: VisualExecutionPlan = {
    mode: 'linear-derived-chart-flow',
    steps,
  }
  if (record.reusePolicy === 'result-only') plan.reusePolicy = 'result-only'
  return plan
}

export function summarizeExecutionPlan(plan: ExecutionPlan | undefined): string[] {
  if (!plan || plan.mode !== 'sentence-step' || !plan.steps.length) return []
  return plan.steps.map((step) => {
    const parts: string[] = [`s${step.sentenceIndex}`]
    const groupLabel = step.drawGroupNames.length > 0 ? step.drawGroupNames.join(', ') : step.groupNames.join(', ')
    if (groupLabel) parts.push(`groups:${groupLabel}`)
    return parts.join(' · ')
  })
}

export function summarizeVisualExecutionPlan(plan: VisualExecutionPlan | undefined): string[] {
  if (!plan || plan.mode !== 'linear-derived-chart-flow' || !plan.steps.length) return []
  return plan.steps.map((step) => {
    const parts: string[] = [`s${step.sentenceIndex}`]
    if (step.groupNames.length > 0) {
      parts.push(`groups:${step.groupNames.join(', ')}`)
    }
    const runOps = step.substeps
      .filter((substep) => substep.kind === 'run-op' && typeof substep.opName === 'string' && substep.opName.length > 0)
      .map((substep) => substep.opName as string)
    if (runOps.length > 0) {
      parts.push(`ops:${runOps.join(' -> ')}`)
    }
    const templates = Array.from(
      new Set(
        step.substeps
          .filter(
            (substep) => substep.kind === 'materialize-surface' && typeof substep.surface?.templateType === 'string' && substep.surface.templateType.length > 0,
          )
          .map((substep) => substep.surface?.templateType as string),
      ),
    )
    if (templates.length > 0) {
      parts.push(`surface:${templates.join(', ')}`)
    }
    const prefilterCount = step.substeps.filter((substep) => substep.kind === 'prefilter').length
    if (prefilterCount > 0) {
      parts.push(`prefilter:${prefilterCount}`)
    }
    return parts.join(' · ')
  })
}

function materializeSentenceGroups(
  groups: NormalizedOpsGroup[],
  stepSource: Array<{ id: string; sentenceIndex: number; groupNames: string[] }>,
): MaterializedExecutionGroups {
  const map = new Map(groups.map((group) => [group.name, group.ops] as const))
  const materialized: NormalizedOpsGroup[] = []
  stepSource.forEach((step, index) => {
    const selectedNames = step.groupNames.filter((name) => map.has(name))
    if (!selectedNames.length) return
    const merged = selectedNames.flatMap((name) => map.get(name) ?? [])
    if (!merged.length) return
    materialized.push({
      name: `sentence:${step.sentenceIndex}:${step.id || `s${index + 1}`}`,
      ops: merged,
    })
  })
  if (!materialized.length) {
    return {
      groups,
      mode: 'group',
    }
  }
  return {
    groups: materialized,
    mode: 'sentence-step',
  }
}

export function materializeExecutionGroups(args: {
  opsSpec: OpsSpecGroupMap | undefined
  executionPlan?: ExecutionPlan
  visualExecutionPlan?: VisualExecutionPlan
  preferDrawGroupNames?: boolean
}): MaterializedExecutionGroups {
  const groups = normalizeOpsGroups(args.opsSpec)
  if (!groups.length) {
    return {
      groups: [],
      mode: 'group',
    }
  }

  const { executionPlan, visualExecutionPlan, preferDrawGroupNames = false } = args
  if (visualExecutionPlan?.steps?.length) {
    return materializeSentenceGroups(
      groups,
      visualExecutionPlan.steps.map((step) => ({
        id: step.id,
        sentenceIndex: step.sentenceIndex,
        groupNames: step.groupNames,
      })),
    )
  }

  if (executionPlan?.steps?.length) {
    return materializeSentenceGroups(
      groups,
      executionPlan.steps.map((step) => ({
        id: step.id,
        sentenceIndex: step.sentenceIndex,
        groupNames:
          preferDrawGroupNames && step.drawGroupNames.length > 0
            ? step.drawGroupNames
            : step.groupNames.length > 0
              ? step.groupNames
              : step.drawGroupNames,
      })),
    )
  }

  return {
    groups,
    mode: 'group',
  }
}

export async function parseToOperationSpec(command: ParseToOperationSpecCommand): Promise<ParseToOpsResult> {
  const endpoint = (command.endpoint ?? resolveDefaultEndpoint()).replace(/\/+$/, '')
  const fetcher = command.fetcher ?? fetch.bind(globalThis)
  const text = command.text.trim()
  const question = (command.question ?? '').trim()
  const explanation = (command.explanation ?? '').trim()
  if (!text) {
    return { resolvedText: '', opsSpec: { ops: [] }, warnings: ['Input text is empty.'] }
  }

  const dataRows = await loadDataRows(command.spec, fetcher)
  const payload: GenerateGrammarRequest = {
    question: question || text,
    explanation: explanation || text,
    vega_lite_spec: command.spec,
    data_rows: dataRows,
    debug: Boolean(command.debug),
  }

  const response = await fetcher(`${endpoint}/generate_grammar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`NLP server request failed (${response.status}): ${detail || response.statusText}`)
  }

  const body = (await response.json()) as GenerateGrammarResponse
  // Backward-compatible: older servers wrap the group map under "ops1".
  const maybeWrapped = asRecord(body.ops1)
  const groupSource = maybeWrapped ?? body
  const opsSpec = normalizeGroupMap(groupSource)
  const drawPlan = normalizeOptionalDrawPlan((body as UnknownRecord).draw_plan)
  const executionPlan = normalizeExecutionPlan((body as UnknownRecord).execution_plan)
  const visualExecutionPlan = normalizeVisualExecutionPlan((body as UnknownRecord).visual_execution_plan)
  const resolvedTextRaw = typeof body.resolvedText === 'string' ? body.resolvedText : body.resolved_text

  return {
    resolvedText: typeof resolvedTextRaw === 'string' && resolvedTextRaw.trim().length > 0 ? resolvedTextRaw : text,
    opsSpec,
    drawPlan,
    executionPlan,
    visualExecutionPlan,
    warnings: normalizeWarnings(body.warnings),
  }
}

export async function compileOpsPlan(command: CompileOpsPlanCommand): Promise<CompileOpsPlanResult> {
  const endpoint = (command.endpoint ?? resolveDefaultEndpoint()).replace(/\/+$/, '')
  const fetcher = command.fetcher ?? fetch.bind(globalThis)
  const response = await fetcher(`${endpoint}/compile_ops_plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      vega_lite_spec: command.spec,
      data_rows: command.dataRows,
      ops_spec: command.opsSpec,
    }),
  })
  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`Ops plan compile failed (${response.status}): ${detail || response.statusText}`)
  }

  const body = (await response.json()) as Record<string, unknown>
  const opsSpec = normalizeGroupMap(body.ops_spec ?? {})
  const drawPlan = normalizeOptionalDrawPlan(body.draw_plan)
  const executionPlan = normalizeExecutionPlan(body.execution_plan)
  const visualExecutionPlan = normalizeVisualExecutionPlan(body.visual_execution_plan)
  return {
    opsSpec,
    drawPlan,
    executionPlan,
    visualExecutionPlan,
    warnings: normalizeWarnings(body.warnings),
  }
}

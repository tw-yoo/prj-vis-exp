import type { VegaLiteSpec } from '../../domain/chart'
import type {
  ChartContext,
  GenerateLambdaResponse,
  OpsGroupSpec,
  ParseToOpsResult,
} from '../../domain/nlp'
import type { OperationSpec } from '../../domain/operation/types'
import { convertLambdaToOpsSpec } from '../services/lambdaToOpsSpec'
import { resolveChartContext } from '../services/chartContextResolver'

export type ParseNaturalLanguageCommand = {
  text: string
  spec: VegaLiteSpec
  container?: HTMLElement | null
}

export type ParseNaturalLanguageDeps = {
  requestLambda: (text: string) => Promise<GenerateLambdaResponse>
  resolveContext?: (spec: VegaLiteSpec, container?: HTMLElement | null) => ChartContext
}

export class ParseNaturalLanguageToOpsUseCase {
  private readonly deps: ParseNaturalLanguageDeps

  constructor(deps: ParseNaturalLanguageDeps) {
    this.deps = deps
  }

  async execute(command: ParseNaturalLanguageCommand): Promise<ParseToOpsResult> {
    const text = command.text.trim()
    if (!text) {
      return {
        resolvedText: '',
        lambdaExpression: [],
        opsSpec: { ops: [] },
        trace: {},
        warnings: ['Input text is empty.'],
      }
    }

    const lambda = await this.deps.requestLambda(text)
    const resolveContext = this.deps.resolveContext ?? resolveChartContext
    const context = resolveContext(command.spec, command.container ?? null)
    const converted = convertLambdaToOpsSpec(lambda.lambda_expression ?? [], context)
    const llmOpsSpec = normalizeLlmOpsSpec(lambda)
    const finalOpsSpec = llmOpsSpec ?? converted.opsSpec
    const warnings = [...(lambda.warnings ?? [])]
    if (!llmOpsSpec) {
      warnings.push(...converted.warnings)
    } else if (converted.warnings.length > 0) {
      warnings.push(`Local converter warnings ignored because server ops_spec is available (${converted.warnings.length}).`)
    }

    return {
      resolvedText: lambda.resolved_text ?? text,
      lambdaExpression: lambda.lambda_expression ?? [],
      opsSpec: finalOpsSpec,
      trace: {
        syntax_features: lambda.syntax_features,
        mark_terms: lambda.mark_terms,
        visual_terms: lambda.visual_terms,
        rewrite_trace: lambda.rewrite_trace,
      },
      warnings,
    }
  }
}

function isOperationSpec(value: unknown): value is OperationSpec {
  return !!value && typeof value === 'object' && typeof (value as { op?: unknown }).op === 'string'
}

type UnknownRecord = Record<string, unknown>

function isPlainObject(value: unknown): value is UnknownRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function stripNullToUndefined(value: unknown): unknown {
  if (value === null) return undefined
  if (Array.isArray(value)) return value.map(stripNullToUndefined).filter((entry) => entry !== undefined)
  if (isPlainObject(value)) {
    const out: UnknownRecord = {}
    Object.entries(value).forEach(([key, entry]) => {
      const next = stripNullToUndefined(entry)
      if (next !== undefined) out[key] = next
    })
    return out
  }
  return value
}

function normalizeOperationSpec(op: OperationSpec): OperationSpec {
  const cleaned = stripNullToUndefined(op)
  return (cleaned && typeof cleaned === 'object' ? (cleaned as OperationSpec) : op)
}

function normalizeLlmOpsSpec(lambda: GenerateLambdaResponse): OpsGroupSpec | null {
  const raw = lambda.ops_spec
  if (!raw || typeof raw !== 'object') return null
  const out: OpsGroupSpec = { ops: [] }
  Object.entries(raw).forEach(([groupName, ops]) => {
    if (!Array.isArray(ops)) return
    const clean = ops
      .filter((op): op is OperationSpec => isOperationSpec(op))
      .map((op) => normalizeOperationSpec(op))
    out[groupName] = clean
  })
  if (!Array.isArray(out.ops)) return null
  return out
}

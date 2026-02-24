import {
  type OperationSpec,
  type TargetSelector,
  OperationOp,
} from '../../domain/operation/types'
import {
  assertAverageSpec,
  assertCompareBoolSpec,
  assertCompareSpec,
  assertCountSpec,
  assertDetermineRangeSpec,
  assertDiffSpec,
  assertFilterSpec,
  assertFindExtremumSpec,
  assertLagDiffSpec,
  assertNthSpec,
  assertRetrieveValueSpec,
  assertSortSpec,
  assertSumSpec,
} from '../../domain/operation/types/operationValidators'
import {
  type ChartContext,
  type LambdaStep,
  type OpsGroupSpec,
} from '../../domain/nlp'
import {
  isArgExtremumOperation,
  mapNlpOperationToOperationOp,
  toCanonicalNlpOperation,
} from '../../domain/nlp'

type ConditionParseResult = {
  field?: string
  operator?: string
  value?: unknown
  include?: Array<string | number>
  exclude?: Array<string | number>
}

type LambdaToOpsResult = {
  opsSpec: OpsGroupSpec
  warnings: string[]
}

type VariableRegistry = {
  variableToRuntimeKey: Record<string, string>
  variableToGroup: Record<string, string>
}

function sanitizeGroupName(raw: string | null | undefined) {
  const text = String(raw ?? '').trim()
  if (!text) return ''
  const normalized = text.replace(/[^\w]/g, '')
  if (!normalized) return ''
  if (normalized === 'last') return normalized
  if (/^ops\d*$/.test(normalized)) return normalized
  return normalized
}

function uniquePush<T>(bucket: T[], value: T) {
  if (!bucket.includes(value)) bucket.push(value)
}

function splitTokens(raw: string | null | undefined) {
  if (!raw) return []
  return raw
    .split(/[|,]/g)
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
}

function parseScalarLiteral(raw: string): unknown {
  const text = raw.trim()
  if (!text) return ''
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1)
  }
  const lower = text.toLowerCase()
  if (lower === 'true') return true
  if (lower === 'false') return false
  if (lower === 'null') return null
  const numeric = Number(text)
  if (Number.isFinite(numeric)) return numeric
  return text
}

function parseListLiteral(raw: string): Array<string | number> {
  const text = raw.trim()
  const stripped = text.startsWith('[') && text.endsWith(']') ? text.slice(1, -1) : text
  return stripped
    .split(',')
    .map((token) => parseScalarLiteral(token))
    .filter((value): value is string | number => typeof value === 'string' || typeof value === 'number')
}

function resolveFieldCandidate(candidate: string | null | undefined, context: ChartContext) {
  const text = String(candidate ?? '').trim()
  if (!text) return undefined
  if (context.fields.includes(text)) return text
  const lower = text.toLowerCase()
  const matched = context.fields.find((field) => field.toLowerCase() === lower)
  return matched
}

function defaultMeasureField(context: ChartContext) {
  return context.yField ?? context.fields.find((field) => field.toLowerCase() === 'value') ?? 'value'
}

function defaultCategoryField(context: ChartContext) {
  return context.xField ?? context.fields.find((field) => field.toLowerCase() === 'target') ?? 'target'
}

function extractGroupNameFromOutputVariable(raw: string | null | undefined) {
  const text = String(raw ?? '').trim()
  if (!text) return null
  const match = text.match(/^([A-Za-z][A-Za-z0-9]*)_\d+$/)
  if (!match) return null
  const group = sanitizeGroupName(match[1])
  if (!group) return null
  return group
}

function parseCondition(condition: string | null | undefined): ConditionParseResult {
  const text = String(condition ?? '').trim()
  if (!text) return {}

  const between = text.match(/^(.+?)\s+between\s+(.+?)\s+and\s+(.+)$/i)
  if (between) {
    const field = between[1].trim()
    const start = parseScalarLiteral(between[2])
    const end = parseScalarLiteral(between[3])
    return { field, operator: 'between', value: [start, end] }
  }

  const inMatch = text.match(/^(.+?)\s+(in|not[\s-]?in)\s+(.+)$/i)
  if (inMatch) {
    const field = inMatch[1].trim()
    const opRaw = inMatch[2].toLowerCase().replace(/\s+/g, '-')
    const parsed = parseListLiteral(inMatch[3])
    if (opRaw === 'in') return { field, include: parsed }
    return { field, exclude: parsed }
  }

  const comparison = text.match(/^(.+?)\s*(>=|<=|==|!=|>|<|eq)\s*(.+)$/i)
  if (comparison) {
    const field = comparison[1].trim()
    const operator = comparison[2]
    const value = parseScalarLiteral(comparison[3])
    return { field, operator, value }
  }

  return {}
}

function parseTwoTargets(raw: string | null | undefined) {
  const text = String(raw ?? '').trim()
  if (!text) return []
  const split = text.split(/\s+(?:vs|versus)\s+/i).map((token) => token.trim()).filter(Boolean)
  if (split.length >= 2) return [split[0], split[1]]
  return []
}

function parseTargetSelector(
  raw: string | null | undefined,
  context: ChartContext,
  vars: VariableRegistry,
): TargetSelector | null {
  const text = String(raw ?? '').trim()
  if (!text) return null

  const runtimeRef = vars.variableToRuntimeKey[text]
  if (runtimeRef) return runtimeRef

  if (context.seriesField) {
    const pair = text.split('/').map((token) => token.trim()).filter(Boolean)
    if (pair.length === 2) {
      return { category: pair[0], series: pair[1] }
    }
  }

  return text
}

function parseInputVariables(raw: string | null | undefined) {
  return splitTokens(raw)
}

function resolveOperationGroup(
  step: LambdaStep,
  vars: VariableRegistry,
  warnings: string[],
): string {
  const fromBranch = sanitizeGroupName(step.branch)
  if (fromBranch) return fromBranch

  const fromOutput = extractGroupNameFromOutputVariable(step.output_variable)
  if (fromOutput) return fromOutput

  const inputVars = parseInputVariables(step.input_variable)
  const inputGroups = inputVars
    .map((name) => vars.variableToGroup[name])
    .filter((group): group is string => typeof group === 'string' && group.length > 0)
  const uniqueInputGroups: string[] = []
  inputGroups.forEach((group) => uniquePush(uniqueInputGroups, group))

  if (uniqueInputGroups.length > 1) return 'last'
  if (uniqueInputGroups.length === 1) return uniqueInputGroups[0]

  if (inputVars.length > 0) {
    warnings.push(`step ${step.step}: input variable is unresolved (${inputVars.join(', ')})`)
  }
  return 'ops'
}

function validateOperation(op: OperationSpec) {
  switch (op.op) {
    case OperationOp.RetrieveValue:
      assertRetrieveValueSpec(op)
      return
    case OperationOp.Filter:
      assertFilterSpec(op)
      return
    case OperationOp.FindExtremum:
      assertFindExtremumSpec(op)
      return
    case OperationOp.DetermineRange:
      assertDetermineRangeSpec(op)
      return
    case OperationOp.Compare:
      assertCompareSpec(op)
      return
    case OperationOp.CompareBool:
      assertCompareBoolSpec(op)
      return
    case OperationOp.Sort:
      assertSortSpec(op)
      return
    case OperationOp.Sum:
      assertSumSpec(op)
      return
    case OperationOp.Average:
      assertAverageSpec(op)
      return
    case OperationOp.Diff:
      assertDiffSpec(op)
      return
    case OperationOp.LagDiff:
      assertLagDiffSpec(op)
      return
    case OperationOp.Nth:
      assertNthSpec(op)
      return
    case OperationOp.Count:
      assertCountSpec(op)
      return
    default:
      return
  }
}

function normalizeTargetFromStep(
  step: LambdaStep,
  context: ChartContext,
  vars: VariableRegistry,
  warnings: string[],
) {
  const single = parseTargetSelector(step.target, context, vars)
  if (single) return single
  if (step.target) warnings.push(`step ${step.step}: unable to parse target (${step.target})`)
  return null
}

function buildOperationFromStep(
  step: LambdaStep,
  context: ChartContext,
  vars: VariableRegistry,
  warnings: string[],
): OperationSpec | null {
  const canonical = toCanonicalNlpOperation(String(step.operation))
  const mapped = mapNlpOperationToOperationOp(String(step.operation))
  if (!canonical || !mapped) {
    warnings.push(`step ${step.step}: unsupported operation "${step.operation}"`)
    return null
  }

  const field = resolveFieldCandidate(step.field, context)
  const condition = parseCondition(step.condition)
  const resolvedConditionField = resolveFieldCandidate(condition.field, context)
  const group =
    (step.group ? String(step.group).trim() : '') ||
    (step.group_by ? String(step.group_by).trim() : '') ||
    undefined

  if (mapped === OperationOp.RetrieveValue) {
    const target = normalizeTargetFromStep(step, context, vars, warnings)
    if (target == null) {
      warnings.push(`step ${step.step}: retrieveValue requires target`)
      return null
    }
    return {
      op: OperationOp.RetrieveValue,
      field: field ?? resolvedConditionField ?? defaultMeasureField(context),
      target,
      group,
    }
  }

  if (mapped === OperationOp.Filter) {
    const fromTarget = normalizeTargetFromStep(step, context, vars, warnings)
    const op: OperationSpec = {
      op: OperationOp.Filter,
      field: field ?? resolvedConditionField ?? defaultCategoryField(context),
      group,
    }
    if (condition.include && condition.include.length > 0) op.include = condition.include
    if (condition.exclude && condition.exclude.length > 0) op.exclude = condition.exclude
    if (condition.operator) op.operator = condition.operator
    if (condition.value !== undefined) op.value = condition.value as OperationSpec['value']
    if (!op.include && !op.exclude && !op.operator && fromTarget != null) {
      op.include = [fromTarget as string | number]
    }
    return op
  }

  if (mapped === OperationOp.FindExtremum) {
    const explicitWhich = String(step.which ?? '').trim().toLowerCase()
    const which =
      explicitWhich === 'max' || explicitWhich === 'min'
        ? explicitWhich
        : isArgExtremumOperation(String(step.operation))
          ? canonical === 'ARGMIN'
            ? 'min'
            : 'max'
          : 'max'
    return {
      op: OperationOp.FindExtremum,
      which,
      field: field ?? defaultMeasureField(context),
      group,
    }
  }

  if (mapped === OperationOp.Sum) {
    return {
      op: OperationOp.Sum,
      field: field ?? defaultMeasureField(context),
      group,
    }
  }

  if (mapped === OperationOp.Average) {
    return {
      op: OperationOp.Average,
      field: field ?? defaultMeasureField(context),
      group,
    }
  }

  if (mapped === OperationOp.DetermineRange) {
    return {
      op: OperationOp.DetermineRange,
      field: field ?? defaultMeasureField(context),
      group,
    }
  }

  if (mapped === OperationOp.Sort) {
    const orderRaw = String(step.order ?? '').trim().toLowerCase()
    const order = orderRaw === 'desc' ? 'desc' : orderRaw === 'asc' ? 'asc' : undefined
    return {
      op: OperationOp.Sort,
      field: field ?? defaultCategoryField(context),
      order,
      group,
    }
  }

  if (mapped === OperationOp.LagDiff) {
    const orderRaw = String(step.order ?? '').trim().toLowerCase()
    const order = orderRaw === 'desc' ? 'desc' : orderRaw === 'asc' ? 'asc' : undefined
    return {
      op: OperationOp.LagDiff,
      field: field ?? defaultMeasureField(context),
      orderField: step.order_field ?? context.xField ?? defaultCategoryField(context),
      order,
      group,
    }
  }

  if (mapped === OperationOp.Nth) {
    const parsedN = Number(step.n ?? 1)
    const fromRaw = String(step.from ?? step.from_ ?? '').trim().toLowerCase()
    const from = fromRaw === 'right' ? 'right' : fromRaw === 'left' ? 'left' : undefined
    return {
      op: OperationOp.Nth,
      n: Number.isFinite(parsedN) && parsedN > 0 ? Math.floor(parsedN) : 1,
      from,
      orderField: step.order_field ?? context.xField ?? undefined,
      group,
    }
  }

  if (mapped === OperationOp.Count) {
    return {
      op: OperationOp.Count,
      field: field ?? context.xField ?? undefined,
      group,
    }
  }

  if (mapped === OperationOp.Compare || mapped === OperationOp.CompareBool || mapped === OperationOp.Diff) {
    const inputVars = parseInputVariables(step.input_variable)
    const pairFromTarget = parseTwoTargets(step.target)
    const targetA = parseTargetSelector(step.target_a ?? pairFromTarget[0] ?? inputVars[0] ?? null, context, vars)
    const targetB = parseTargetSelector(step.target_b ?? pairFromTarget[1] ?? inputVars[1] ?? null, context, vars)
    if (targetA == null || targetB == null) {
      warnings.push(`step ${step.step}: ${mapped} requires two targets`)
      return null
    }

    if (mapped === OperationOp.Compare) {
      const whichRaw = String(step.which ?? '').trim().toLowerCase()
      const which = whichRaw === 'min' ? 'min' : whichRaw === 'max' ? 'max' : undefined
      return {
        op: OperationOp.Compare,
        field: field ?? defaultMeasureField(context),
        targetA,
        targetB,
        which,
      }
    }

    if (mapped === OperationOp.CompareBool) {
      const operator = step.operator ?? condition.operator ?? undefined
      return {
        op: OperationOp.CompareBool,
        field: field ?? defaultMeasureField(context),
        targetA,
        targetB,
        operator,
      }
    }

    const signed = typeof step.signed === 'boolean' ? step.signed : undefined
    const precision = Number.isFinite(Number(step.precision)) ? Number(step.precision) : undefined
    const modeRaw = String(step.mode ?? '').trim().toLowerCase()
    const mode = modeRaw === 'ratio' ? 'ratio' : modeRaw === 'difference' ? 'difference' : undefined
    return {
      op: OperationOp.Diff,
      field: field ?? defaultMeasureField(context),
      targetA,
      targetB,
      signed,
      precision,
      mode,
      aggregate: step.aggregate ?? undefined,
    }
  }

  warnings.push(`step ${step.step}: unmapped operation "${step.operation}"`)
  return null
}

function buildOrderedGroups(groups: Record<string, OperationSpec[]>) {
  const orderedKeys: string[] = []
  if (groups.ops) orderedKeys.push('ops')

  Object.keys(groups)
    .filter((name) => /^ops\d+$/.test(name))
    .sort((a, b) => Number(a.slice(3)) - Number(b.slice(3)))
    .forEach((name) => uniquePush(orderedKeys, name))

  Object.keys(groups)
    .filter((name) => name !== 'ops' && name !== 'last' && !/^ops\d+$/.test(name))
    .sort((a, b) => a.localeCompare(b))
    .forEach((name) => uniquePush(orderedKeys, name))

  if (groups.last) orderedKeys.push('last')

  Object.keys(groups).forEach((name) => uniquePush(orderedKeys, name))

  const out: OpsGroupSpec = { ops: groups.ops ?? [] }
  orderedKeys.forEach((name) => {
    out[name] = groups[name] ?? []
  })
  if (!out.ops) out.ops = []
  return out
}

export function convertLambdaToOpsSpec(lambdaSteps: LambdaStep[], context: ChartContext): LambdaToOpsResult {
  const warnings: string[] = []
  const groups: Record<string, OperationSpec[]> = { ops: [] }
  const vars: VariableRegistry = {
    variableToRuntimeKey: {},
    variableToGroup: {},
  }

  lambdaSteps
    .slice()
    .sort((a, b) => a.step - b.step)
    .forEach((step) => {
      const groupName = sanitizeGroupName(resolveOperationGroup(step, vars, warnings)) || 'ops'
      if (!groups[groupName]) groups[groupName] = []

      const op = buildOperationFromStep(step, context, vars, warnings)
      if (!op) return

      try {
        validateOperation(op)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'invalid operation'
        warnings.push(`step ${step.step}: ${message}`)
        return
      }

      const groupIndex = groups[groupName].length
      groups[groupName].push(op)
      const runtimeKey = `${groupName}_${groupIndex}`

      const outputVariable = String(step.output_variable ?? '').trim()
      if (outputVariable) {
        vars.variableToRuntimeKey[outputVariable] = runtimeKey
        vars.variableToGroup[outputVariable] = groupName
      }
      vars.variableToRuntimeKey[runtimeKey] = runtimeKey
      vars.variableToGroup[runtimeKey] = groupName
    })

  return {
    opsSpec: buildOrderedGroups(groups),
    warnings,
  }
}

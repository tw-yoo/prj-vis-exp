import type { ChartTypeValue } from '../../../domain/chart'
import type { OpsBuilderState } from './types'
import { OperationOp } from '../../../types'
import {
  assertAddSpec,
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
  assertPairDiffSpec,
  assertRetrieveValueSpec,
  assertScaleSpec,
  assertSetOpSpec,
  assertSortSpec,
  assertSumSpec,
} from '../../../types/operationValidators'
import { buildRunnableOpFromBlock } from './serialize'
import { operationRegistry } from './registry'

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isAllowedForChart(allowedCharts: ChartTypeValue[] | undefined, chartType: ChartTypeValue | null) {
  if (!allowedCharts || allowedCharts.length === 0) return true
  if (!chartType) return true
  return allowedCharts.includes(chartType)
}

function validateRequiredFields(
  fieldsSchema: Array<{ key: string; kind: string; optional?: boolean; fields?: any[]; valueSchema?: any }>,
  scope: Record<string, unknown>,
  prefix = '',
): string | null {
  for (const field of fieldsSchema) {
    const required = field.optional !== true
    const value = scope[field.key]
    if (required && value === undefined) {
      return `${prefix}${field.key} is required`
    }
    if (value === undefined) continue
    if (field.kind === 'object') {
      if (!isPlainObject(value)) return `${prefix}${field.key} must be an object`
      const nested = validateRequiredFields(field.fields ?? [], value, `${prefix}${field.key}.`)
      if (nested) return nested
    }
    if (field.kind === 'map') {
      if (!isPlainObject(value)) return `${prefix}${field.key} must be a map/object`
      if (required && Object.keys(value).length === 0) return `${prefix}${field.key} must have at least one key`
    }
  }
  return null
}

export function validateOps(state: OpsBuilderState, chartType: ChartTypeValue | null) {
  const errors: Record<string, string> = {}

  state.groups.forEach((group) => {
    if (group.disabled) return
    group.blocks.forEach((block) => {
      if (block.disabled) return
      try {
        if (block.op === OperationOp.Draw) {
          const drawSchema = operationRegistry.operations.find((op) => op.op === OperationOp.Draw)
          if (!drawSchema) return
          const action = block.fields.action as string | undefined
          if (!action) throw new Error('draw.action is required')
          const actionSchema = drawSchema.actions?.find((entry) => entry.value === action)
          if (!actionSchema) throw new Error(`Unknown draw.action "${action}"`)
          if (!isAllowedForChart(actionSchema.allowedCharts, chartType)) {
            throw new Error(`draw.action "${action}" is not supported for this chart`)
          }
          const mergedFields = [...(drawSchema.fields ?? []), ...(actionSchema.fields ?? [])].filter((f) => f.key !== 'action')
          const reqErr = validateRequiredFields(mergedFields as any, block.fields as any)
          if (reqErr) throw new Error(reqErr)
          return
        }

        const op = buildRunnableOpFromBlock(block, chartType)
        if (!op) return
        switch (op.op) {
          case OperationOp.RetrieveValue:
            assertRetrieveValueSpec(op)
            break
          case OperationOp.Filter:
            assertFilterSpec(op)
            break
          case OperationOp.FindExtremum:
            assertFindExtremumSpec(op)
            break
          case OperationOp.DetermineRange:
            assertDetermineRangeSpec(op)
            break
          case OperationOp.Compare:
            assertCompareSpec(op)
            break
          case OperationOp.CompareBool:
            assertCompareBoolSpec(op)
            break
          case OperationOp.Sort:
            assertSortSpec(op)
            break
          case OperationOp.Sum:
            assertSumSpec(op)
            break
          case OperationOp.Average:
            assertAverageSpec(op)
            break
          case OperationOp.Diff:
            assertDiffSpec(op)
            break
          case OperationOp.LagDiff:
            assertLagDiffSpec(op)
            break
          case OperationOp.PairDiff:
            assertPairDiffSpec(op)
            break
          case OperationOp.Nth:
            assertNthSpec(op)
            break
          case OperationOp.Count:
            assertCountSpec(op)
            break
          case OperationOp.Add:
            assertAddSpec(op)
            break
          case OperationOp.Scale:
            assertScaleSpec(op)
            break
          case OperationOp.SetOp:
            assertSetOpSpec(op)
            break
          case OperationOp.Sleep:
          case OperationOp.Draw:
          default:
            break
        }
      } catch (error) {
        errors[block.id] = error instanceof Error ? error.message : 'Invalid operation'
      }
    })
  })

  return errors
}

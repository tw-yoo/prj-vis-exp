import type { OperationSpec } from '../types'
import { OperationOp } from '../types'
import type { IR, IRStep } from './irTypes'

type CompileCtx = {
  // If you want to enforce a default sleep after each major step.
  defaultSleepSeconds?: number
}

/**
 * Example-only compiler showing how to turn a constrained IR into an ops spec.
 *
 * Notes:
 * - This repo's runtime currently expects numeric thresholds for some draw ops.
 *   If you want "threshold = average result", you either:
 *   (a) allow "$var:*" placeholders and resolve them at runtime, or
 *   (b) make ops execution return values and splice them into subsequent steps.
 */
export function compileIrToOpsExample(ir: IR, ctx: CompileCtx = {}): OperationSpec[] {
  const out: OperationSpec[] = []
  const defaultSleep = ctx.defaultSleepSeconds

  for (const step of ir.steps) {
    out.push(...compileStep(step))

    // Optional policy: add sleep after "major" steps, but never after an explicit sleep.
    if (defaultSleep && step.type !== 'sleep') {
      out.push({ op: OperationOp.Sleep, seconds: defaultSleep })
    }
  }

  return out
}

function compileStep(step: IRStep): OperationSpec[] {
  const chartId = step.scope?.chartId

  switch (step.type) {
    case 'sleep': {
      const seconds = Number(step.params.seconds ?? 1)
      return [{ op: OperationOp.Sleep, seconds }]
    }

    case 'filter': {
      return [
        {
          op: OperationOp.Filter,
          chartId,
          field: String(step.params.field ?? ''),
          operator: String(step.params.operator ?? ''),
          value: step.params.value,
        },
      ]
    }

    case 'average': {
      return [{ op: OperationOp.Average, chartId, field: step.params.field }]
    }

    case 'sum': {
      return [{ op: OperationOp.Sum, chartId, field: step.params.field }]
    }

    case 'count': {
      return [{ op: OperationOp.Count, chartId }]
    }

    case 'findExtremum': {
      return [
        { op: OperationOp.FindExtremum, chartId, field: step.params.field, which: step.params.which },
      ]
    }

    case 'diff': {
      return [
        {
          op: OperationOp.Diff,
          chartId,
          field: step.params.field,
          targetA: step.params.targetA,
          targetB: step.params.targetB,
          mode: step.params.mode,
        },
      ]
    }

    case 'nth': {
      return [{ op: OperationOp.Nth, chartId, n: step.params.n, from: step.params.from }]
    }

    case 'draw': {
      const { action, ...rest } = step.params as any
      return [{ op: OperationOp.Draw, chartId, action, ...rest } as any]
    }

    default:
      return [{ op: 'unknown', chartId, value: { step } } as any]
  }
}

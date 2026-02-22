import type { DataOpResult, DatumValue, OperationSpec } from '../../domain/operation/types'
import { OperationOp } from '../../domain/operation/types'
import { makeRuntimeKey, resetRuntimeResults, storeRuntimeResult } from '../../domain/operation/dataOps'

export type DataOpHandler = (data: DatumValue[], op: OperationSpec) => DataOpResult

export function isDrawOp(op: OperationSpec): boolean {
  return op.op === OperationOp.Draw || (op as { action?: unknown }).action !== undefined
}

export function splitOps(ops: OperationSpec[]) {
  const dataOps: OperationSpec[] = []
  const drawOps: OperationSpec[] = []
  ops.forEach((op) => {
    if (isDrawOp(op)) drawOps.push(op)
    else dataOps.push(op)
  })
  return { dataOps, drawOps }
}

function runtimeKeyFor(op: OperationSpec, index: number) {
  const opKey =
    (op as { key?: string | number; id?: string | number })?.key ??
    (op as { id?: string | number })?.id ??
    op.op ??
    'step'
  return makeRuntimeKey(opKey, index)
}

export function runDataOps(
  baseData: DatumValue[],
  ops: OperationSpec[],
  handlers: Record<string, DataOpHandler>,
  options: { resetRuntime?: boolean; storeRuntime?: boolean } = {},
) {
  if (options.resetRuntime) resetRuntimeResults()
  let working: DatumValue[] = baseData
  ops.forEach((op, index) => {
    const handler = handlers[op.op ?? '']
    if (!handler) return
    const result = handler(working, op)
    if (options.storeRuntime) {
      storeRuntimeResult(runtimeKeyFor(op, index), result)
    }
    working = result
  })
  return working
}

export async function runDrawOps(ops: OperationSpec[], run: (op: OperationSpec) => void | Promise<void>) {
  for (const op of ops) {
    await run(op)
  }
}

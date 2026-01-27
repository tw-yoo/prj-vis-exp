import type { DataOpResult, DatumValue, OperationSpec } from '../../types'
import { OperationOp } from '../../types'
import type { DrawOp } from '../draw/types'
import { makeRuntimeKey, resetRuntimeResults, storeRuntimeResult } from '../../logic/dataOps'

export type DataOpHandler = (data: DatumValue[], op: OperationSpec) => DataOpResult

export function isDrawOp(op: OperationSpec): op is DrawOp {
  return op.op === OperationOp.Draw || (op as DrawOp).action !== undefined
}

export function splitOps(ops: OperationSpec[]) {
  const dataOps: OperationSpec[] = []
  const drawOps: DrawOp[] = []
  ops.forEach((op) => {
    if (isDrawOp(op)) drawOps.push(op)
    else dataOps.push(op)
  })
  return { dataOps, drawOps }
}

function runtimeKeyFor(op: OperationSpec, index: number) {
  const opKey = (op as { key?: string | number; id?: string | number })?.key ?? (op as { id?: string | number })?.id ?? op.op ?? 'step'
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
    if (!handler) {
      console.warn(`Unsupported operation: ${op.op}`)
      return
    }
    const result = handler(working, op)
    if (options.storeRuntime) {
      storeRuntimeResult(runtimeKeyFor(op, index), result)
    }
    working = result
  })
  return working
}

export async function runDrawOps(ops: DrawOp[], run: (op: DrawOp) => void | Promise<void>) {
  for (const op of ops) {
    await run(op)
  }
}

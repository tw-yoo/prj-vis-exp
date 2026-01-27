import type { OperationSpec } from '../../../types'
import { makeRuntimeKey } from '../../../logic/dataOps'

export function runtimeKeyFor(op: OperationSpec, index: number) {
  const opKey = (op as any)?.key ?? (op as any)?.id ?? op.op ?? 'step'
  return makeRuntimeKey(opKey, index)
}


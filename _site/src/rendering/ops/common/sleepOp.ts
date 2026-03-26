import type { OperationSpec } from '../../../types'

export async function runSleepOp(op?: OperationSpec) {
  const seconds = Number(op?.seconds ?? op?.duration ?? 0)
  if (!Number.isFinite(seconds) || seconds <= 0) return
  await new Promise((resolve) => setTimeout(resolve, seconds * 1000))
}

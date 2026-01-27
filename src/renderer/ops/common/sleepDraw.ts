import type { DrawSleepSpec } from '../../draw/types'

export async function runSleepDraw(spec?: DrawSleepSpec) {
  const seconds = spec?.seconds ?? spec?.duration ?? 0
  const durationMs = Number(seconds) * 1000
  if (!Number.isFinite(durationMs) || durationMs <= 0) return
  await new Promise((resolve) => setTimeout(resolve, durationMs))
}

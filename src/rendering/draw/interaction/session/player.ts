import { TimelineStepKind, type TimelineRunResult, type TimelineStep } from './types'

type TimelinePlayerOptions = {
  signal?: AbortSignal
  onStepStart?: (step: TimelineStep, index: number) => void
  onStepDone?: (step: TimelineStep, index: number) => void
  onStepError?: (step: TimelineStep, index: number, error: unknown) => void
}

type TimelineExecutor = (step: TimelineStep, index: number) => Promise<void>

const sleepMs = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const timer = window.setTimeout(() => {
      cleanup()
      resolve()
    }, ms)
    const onAbort = () => {
      window.clearTimeout(timer)
      cleanup()
      reject(new DOMException('Aborted', 'AbortError'))
    }
    const cleanup = () => signal?.removeEventListener('abort', onAbort)
    signal?.addEventListener('abort', onAbort, { once: true })
  })

export async function runTimeline(
  steps: TimelineStep[],
  executor: TimelineExecutor,
  options: TimelinePlayerOptions = {},
): Promise<TimelineRunResult> {
  const enabledSteps = steps.filter((step) => step.enabled)
  const result: TimelineRunResult = {
    total: enabledSteps.length,
    executed: 0,
    skipped: steps.length - enabledSteps.length,
    failed: [],
  }

  for (let index = 0; index < enabledSteps.length; index += 1) {
    if (options.signal?.aborted) {
      break
    }
    const step = enabledSteps[index]
    options.onStepStart?.(step, index)
    try {
      if (step.kind === TimelineStepKind.Sleep) {
        await sleepMs(step.durationMs, options.signal)
      } else if (step.kind === TimelineStepKind.Group) {
        await runTimeline(step.children, executor, options)
      } else {
        await executor(step, index)
      }
      result.executed += 1
      options.onStepDone?.(step, index)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      result.failed.push({ stepId: step.id, error: message })
      options.onStepError?.(step, index, error)
      if (error instanceof DOMException && error.name === 'AbortError') {
        break
      }
    }
  }

  return result
}

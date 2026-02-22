import { useEffect, useRef } from 'react'

type RenderFn<TSpec, TOps, TResult> = (container: HTMLElement, vlSpec: TSpec, opsSpec: TOps) => Promise<TResult> | TResult

export function useChartRunner<TSpec, TOps, TResult = void>(
  vlSpec: TSpec,
  opsSpec: TOps,
  renderFunction: RenderFn<TSpec, TOps, TResult>,
) {
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    let cancelled = false
    const run = async () => {
      try {
        await renderFunction(el, vlSpec, opsSpec)
      } catch (err) {
        if (!cancelled) {
          console.error('useChartRunner render error', err)
        }
      }
    }
    run()

    return () => {
      cancelled = true
      if (el) {
        el.innerHTML = ''
      }
    }
  }, [vlSpec, opsSpec, renderFunction])

  return containerRef
}

export default useChartRunner

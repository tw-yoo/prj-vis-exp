import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type UndoState<T> = {
  past: T[]
  present: T
  future: T[]
}

export function useUndoState<T>(initial: T, opts?: { debounceMs?: number }) {
  const debounceMs = opts?.debounceMs ?? 300
  const [state, setState] = useState<UndoState<T>>({ past: [], present: initial, future: [] })
  const pendingRef = useRef<{
    base: T
    timer: number | null
  } | null>(null)

  const cancelPending = useCallback(() => {
    const pending = pendingRef.current
    if (pending?.timer != null) {
      window.clearTimeout(pending.timer)
    }
    pendingRef.current = null
  }, [])

  const commitPendingIfAny = useCallback(() => {
    const pending = pendingRef.current
    if (!pending) return
    if (pending.timer != null) window.clearTimeout(pending.timer)
    pendingRef.current = null
    setState((prev) => ({ past: [...prev.past, pending.base], present: prev.present, future: [] }))
  }, [])

  const applyImmediate = useCallback(
    (updater: (current: T) => T) => {
      commitPendingIfAny()
      setState((prev) => ({
        past: [...prev.past, prev.present],
        present: updater(prev.present),
        future: [],
      }))
    },
    [commitPendingIfAny],
  )

  const applyDebounced = useCallback(
    (updater: (current: T) => T) => {
      setState((prev) => {
        if (!pendingRef.current) {
          pendingRef.current = { base: prev.present, timer: null }
        }
        return { ...prev, present: updater(prev.present) }
      })
      const pending = pendingRef.current
      if (!pending) return
      if (pending.timer != null) window.clearTimeout(pending.timer)
      pending.timer = window.setTimeout(() => {
        commitPendingIfAny()
      }, debounceMs) as unknown as number
    },
    [commitPendingIfAny, debounceMs],
  )

  const canUndo = state.past.length > 0
  const canRedo = state.future.length > 0

  const undo = useCallback(() => {
    cancelPending()
    setState((prev) => {
      if (prev.past.length === 0) return prev
      const past = prev.past.slice()
      const previous = past.pop() as T
      return { past, present: previous, future: [prev.present, ...prev.future] }
    })
  }, [cancelPending])

  const redo = useCallback(() => {
    cancelPending()
    setState((prev) => {
      if (prev.future.length === 0) return prev
      const [next, ...rest] = prev.future
      return { past: [...prev.past, prev.present], present: next, future: rest }
    })
  }, [cancelPending])

  // Cmd+Z / Cmd+Shift+Z / Ctrl+Z / Ctrl+Y
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isMac = navigator.platform.toLowerCase().includes('mac')
      const mod = isMac ? event.metaKey : event.ctrlKey
      if (!mod) return
      const key = event.key.toLowerCase()
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault()
        undo()
      } else if ((key === 'z' && event.shiftKey) || key === 'y') {
        event.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [redo, undo])

  const api = useMemo(
    () => ({
      present: state.present,
      setPresentImmediate: applyImmediate,
      setPresentDebounced: applyDebounced,
      undo,
      redo,
      canUndo,
      canRedo,
      commitPendingIfAny,
      cancelPending,
    }),
    [applyDebounced, applyImmediate, canRedo, canUndo, cancelPending, commitPendingIfAny, redo, state.present, undo],
  )

  return api
}


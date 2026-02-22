const isDev =
  typeof import.meta !== 'undefined' &&
  Boolean((import.meta as { env?: { DEV?: boolean } }).env?.DEV)

if (isDev && typeof window !== 'undefined') {
  const globalKey = '__engine_legacy_root_api_warned__'
  const runtime = window as unknown as Record<string, boolean>
  if (!runtime[globalKey]) {
    console.warn('[engine] Importing from `src/index.ts` is deprecated. Prefer `src/api/*` modules.')
    runtime[globalKey] = true
  }
}

export * from './api'

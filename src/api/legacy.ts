const isDev =
  typeof import.meta !== 'undefined' &&
  Boolean((import.meta as { env?: { DEV?: boolean } }).env?.DEV)

if (isDev && typeof window !== 'undefined') {
  const globalKey = '__engine_legacy_api_warned__'
  const runtime = window as unknown as Record<string, boolean>
  if (!runtime[globalKey]) {
    console.warn('[engine] `src/api/legacy` is deprecated. Migrate to focused modules under `src/api/*`.')
    runtime[globalKey] = true
  }
}

export * from '../types'
export * from '../types/operationSpecs'
export * from '../types/operationOptions'
export * from '../types/operationValidators'
export * from '../rendering'
export * from '../operation/build'
export * from '../operation/run'
export { group, plan } from '../rendering/ops/opsPlans/helpers'

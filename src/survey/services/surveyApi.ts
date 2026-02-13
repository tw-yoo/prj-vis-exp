import type { JsonValue } from '../../types'

type FetchMode = 'json' | 'text'

const responseCache = new Map<string, Promise<unknown>>()

function isAbsoluteUrl(path: string) {
  return /^https?:\/\//i.test(path)
}

/**
 * Normalize survey asset path for Vite static serving.
 * - `pages/a.html` -> `/survey/pages/a.html`
 * - `survey/pages/a.html` -> `/survey/pages/a.html`
 * - `/survey/pages/a.html` -> `/survey/pages/a.html`
 */
export function resolveSurveyAssetPath(rawPath: string) {
  if (!rawPath) return '/survey'
  if (isAbsoluteUrl(rawPath)) return rawPath

  let path = rawPath.trim()
  if (!path) return '/survey'

  if (!path.startsWith('/')) {
    path = `/${path}`
  }
  if (!path.startsWith('/survey/')) {
    path = path.startsWith('/survey') ? path : `/survey${path}`
  }
  return path
}

async function fetchResource<T = unknown>(path: string, mode: FetchMode, useCache = true): Promise<T> {
  const url = resolveSurveyAssetPath(path)
  const cacheKey = `${mode}:${url}`
  if (useCache && responseCache.has(cacheKey)) {
    return responseCache.get(cacheKey) as Promise<T>
  }

  const task = (async () => {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) {
      throw new Error(`Failed to load survey resource: ${url} (HTTP ${res.status})`)
    }
    return (mode === 'json' ? res.json() : res.text()) as Promise<T>
  })()

  if (useCache) {
    responseCache.set(cacheKey, task)
  }
  return task
}

/** Fetch JSON from `public/survey/**` with memoization by default. */
export async function fetchSurveyJson<T = JsonValue>(path: string, useCache = true) {
  return fetchResource<T>(path, 'json', useCache)
}

/** Fetch raw text/html from `public/survey/**` with memoization by default. */
export async function fetchSurveyText(path: string, useCache = true) {
  return fetchResource<string>(path, 'text', useCache)
}

/** Clear all cached survey resource promises. */
export function clearSurveyApiCache() {
  responseCache.clear()
}

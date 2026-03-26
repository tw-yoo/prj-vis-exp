import type { JsonValue } from '../../../src/api/legacy'
import type { SurveyDraftSnapshot } from '../types'

const STORAGE_PREFIX = 'survey:new:'

function makeKey(key: string) {
  return `${STORAGE_PREFIX}${key}`
}

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

/** Write JSON value to localStorage under survey namespace. */
export function setSurveyLocal(key: string, value: JsonValue) {
  localStorage.setItem(makeKey(key), JSON.stringify(value))
}

/** Read JSON value from localStorage under survey namespace. */
export function getSurveyLocal<T = JsonValue>(key: string): T | null {
  return safeParse<T>(localStorage.getItem(makeKey(key)))
}

/** Remove namespaced localStorage key. */
export function removeSurveyLocal(key: string) {
  localStorage.removeItem(makeKey(key))
}

/** Write JSON value to sessionStorage under survey namespace. */
export function setSurveySession(key: string, value: JsonValue) {
  sessionStorage.setItem(makeKey(key), JSON.stringify(value))
}

/** Read JSON value from sessionStorage under survey namespace. */
export function getSurveySession<T = JsonValue>(key: string): T | null {
  return safeParse<T>(sessionStorage.getItem(makeKey(key)))
}

/** Remove namespaced sessionStorage key. */
export function removeSurveySession(key: string) {
  sessionStorage.removeItem(makeKey(key))
}

/** Persist autosave draft snapshot. */
export function saveSurveyDraft(snapshot: SurveyDraftSnapshot) {
  setSurveyLocal('draft', snapshot as unknown as JsonValue)
}

/** Load autosave draft snapshot if present and valid. */
export function loadSurveyDraft(): SurveyDraftSnapshot | null {
  return getSurveyLocal<SurveyDraftSnapshot>('draft')
}

/** Clear autosave draft snapshot. */
export function clearSurveyDraft() {
  removeSurveyLocal('draft')
}

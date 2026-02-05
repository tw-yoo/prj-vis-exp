import type { JsonValue } from '../../types'
import type { FirestoreDocument, FirestoreSettings, PreRegistrationPayload } from '../types'

const FIRESTORE_HOST = 'https://firestore.googleapis.com/v1'
const DEFAULT_DATABASE_ID = '(default)'
const CONFIG_FILE = 'config.json'

let cachedSettings: FirestoreSettings | null = null
let configTask: Promise<FirestoreSettings> | null = null

function getBaseUrl() {
  const base = typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL ? import.meta.env.BASE_URL : '/'
  return base.endsWith('/') ? base : `${base}/`
}

function configUrl() {
  return `${getBaseUrl()}${CONFIG_FILE}`
}

function encodeValue(value: JsonValue): Record<string, unknown> {
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map((item) => encodeValue(item as JsonValue)) } }
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value }
  }
  if (typeof value === 'boolean') return { booleanValue: value }
  if (value && typeof value === 'object') {
    return { mapValue: { fields: encodeFields(value as Record<string, JsonValue>) } }
  }
  return { stringValue: value == null ? '' : String(value) }
}

function encodeFields(fields: Record<string, JsonValue>) {
  const out: Record<string, unknown> = {}
  Object.entries(fields).forEach(([key, value]) => {
    out[key] = encodeValue(value)
  })
  return out
}

function decodeValue(value: any): JsonValue {
  if (!value) return null
  if ('stringValue' in value) return value.stringValue as string
  if ('integerValue' in value) return Number(value.integerValue)
  if ('doubleValue' in value) return value.doubleValue as number
  if ('booleanValue' in value) return value.booleanValue as boolean
  if ('timestampValue' in value) return String(value.timestampValue)
  if ('mapValue' in value) return decodeFields(value.mapValue?.fields || {})
  if ('arrayValue' in value) return (value.arrayValue?.values || []).map((v: any) => decodeValue(v))
  return null
}

function decodeFields(fields: Record<string, any>) {
  const out: Record<string, JsonValue> = {}
  Object.entries(fields || {}).forEach(([key, value]) => {
    out[key] = decodeValue(value)
  })
  return out
}

/** Load Firestore settings from public/config.json. */
export async function getSettings(): Promise<FirestoreSettings> {
  if (cachedSettings) return cachedSettings
  if (!configTask) {
    configTask = (async () => {
      const res = await fetch(configUrl(), { cache: 'no-store' })
      if (!res.ok) {
        throw new Error(`Failed to load config.json (HTTP ${res.status})`)
      }
      const raw = await res.json()
      const apiKey = raw.API_KEY || raw.apiKey || ''
      const projectId = raw.PROJECT_ID || raw.projectId || ''
      const databaseId = raw.DATABASE_ID || raw.databaseId || DEFAULT_DATABASE_ID
      if (!apiKey || !projectId) {
        throw new Error('Missing API_KEY or PROJECT_ID in config.json')
      }
      return { apiKey, projectId, databaseId }
    })()
  }
  cachedSettings = await configTask
  return cachedSettings
}

async function requestFirestore(
  pathSegments: string[],
  options: { method?: 'GET' | 'PATCH'; body?: Record<string, unknown> | null } = {},
) {
  const { method = 'GET', body = null } = options
  const { apiKey, projectId, databaseId } = await getSettings()
  const basePath = `${FIRESTORE_HOST}/projects/${projectId}/databases/${databaseId}/documents`
  const path = pathSegments.map((s) => encodeURIComponent(s)).join('/')
  const url = `${basePath}/${path}?key=${encodeURIComponent(apiKey)}`
  const headers: Record<string, string> = { Accept: 'application/json' }
  const init: RequestInit = { method, headers }
  if (body) {
    headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(body)
  }
  const res = await fetch(url, init)
  if (res.status === 404) return null
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Firestore ${method} ${url} failed: ${res.status} ${text}`)
  }
  if (res.status === 204) return null
  return res.json()
}

/** Read a Firestore document and decode fields. */
export async function getDocument(pathSegments: string[]): Promise<FirestoreDocument | null> {
  const doc = await requestFirestore(pathSegments)
  if (!doc) return null
  return { name: doc.name, fields: decodeFields(doc.fields || {}) }
}

/** Patch Firestore document fields with merge semantics. */
export async function patchDocument(pathSegments: string[], fields: Record<string, JsonValue>) {
  await requestFirestore(pathSegments, { method: 'PATCH', body: { fields: encodeFields(fields) } })
}

/**
 * Store or update a pre-registration entry keyed by normalized email.
 * Document path: `pre-registration/{sanitizedEmail}`.
 */
export async function recordPreRegistration(payload: PreRegistrationPayload) {
  const email = payload.email?.trim().toLowerCase()
  if (!email) {
    throw new Error('Email is required for pre-registration')
  }

  const docId = email.replace(/[^a-z0-9]/gi, '_')
  const path = ['pre-registration', docId]
  const existing = await getDocument(path)
  const fields: Record<string, JsonValue> = {
    email,
    updatedAt: new Date().toISOString(),
  }

  Object.entries(payload).forEach(([key, value]) => {
    if (key === 'email') return
    fields[key] = value
  })

  if (!existing) {
    fields.createdAt = new Date().toISOString()
  }

  await patchDocument(path, fields)
}

export async function validateSurveyCode(code: string) {
  const doc = await getDocument(['survey', code])
  return doc !== null
}

export async function ensureSurveyDocument(code: string) {
  const exists = await getDocument(['survey', code])
  if (!exists) {
    await patchDocument(['survey', code], { code, createdAt: new Date().toISOString() })
  } else {
    await patchDocument(['survey', code], { lastAccessedAt: new Date().toISOString() })
  }
}

export async function saveSurveyResponse(code: string, questionKey: string, value: JsonValue) {
  await patchDocument(['survey', code, questionKey, 'response'], {
    value,
    updatedAt: new Date().toISOString(),
  })
}

export async function saveSurveyTiming(
  code: string,
  pageKey: string,
  seconds: number,
  extra: Record<string, JsonValue> = {},
) {
  await patchDocument(['survey', code, pageKey, 'time'], {
    seconds: Number.isFinite(seconds) ? Number(seconds) : 0,
    updatedAt: new Date().toISOString(),
    ...extra,
  })
}

export async function fetchSurveyState(code: string) {
  const stateDoc = await getDocument(['survey', code, 'state', 'snapshot'])
  const fields = stateDoc?.fields || {}
  return {
    responses: (fields.responses as Record<string, JsonValue>) || {},
    timings: (fields.timings as Record<string, JsonValue>) || {},
    pageAnswers: (fields.pageAnswers as Record<string, JsonValue>) || {},
  }
}

export async function listDocuments(pathSegments: string[]) {
  const result = await requestFirestore(pathSegments, { method: 'GET', body: null })
  if (!result || !Array.isArray(result.documents)) return []
  return result.documents.map((doc: any) => ({
    id: String(doc.name || '').split('/').pop() || '',
    name: doc.name as string,
    fields: decodeFields(doc.fields || {}),
  }))
}

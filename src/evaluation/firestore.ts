// Minimal Firestore REST client (no SDK dependency). Mirrors the approach in
// web/survey/services/surveyFirestore.ts but standalone for the evaluation app
// (so src/ doesn't import web/). Auth is the public Firestore API key from
// config.json; access is governed by the project's Firestore security rules.

export type FirestoreSettings = { apiKey: string; projectId: string; databaseId: string }
export type FsJson = string | number | boolean | null | FsJson[] | { [key: string]: FsJson }

const HOST = 'https://firestore.googleapis.com/v1'

function encodeValue(value: FsJson): Record<string, unknown> {
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value }
  }
  if (typeof value === 'boolean') return { booleanValue: value }
  if (value && typeof value === 'object') return { mapValue: { fields: encodeFields(value as Record<string, FsJson>) } }
  return { stringValue: value == null ? '' : String(value) }
}

function encodeFields(fields: Record<string, FsJson>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  Object.entries(fields).forEach(([key, value]) => { out[key] = encodeValue(value) })
  return out
}

function decodeValue(value: any): FsJson {
  if (!value) return null
  if ('stringValue' in value) return value.stringValue as string
  if ('integerValue' in value) return Number(value.integerValue)
  if ('doubleValue' in value) return value.doubleValue as number
  if ('booleanValue' in value) return value.booleanValue as boolean
  if ('timestampValue' in value) return String(value.timestampValue)
  if ('mapValue' in value) return decodeFields(value.mapValue?.fields || {})
  if ('arrayValue' in value) return (value.arrayValue?.values || []).map(decodeValue)
  return null
}

function decodeFields(fields: Record<string, any>): Record<string, FsJson> {
  const out: Record<string, FsJson> = {}
  Object.entries(fields || {}).forEach(([key, value]) => { out[key] = decodeValue(value) })
  return out
}

async function request(
  settings: FirestoreSettings,
  pathSegments: string[],
  method: 'GET' | 'PATCH',
  body: Record<string, unknown> | null,
  keepalive = false,
) {
  const basePath = `${HOST}/projects/${settings.projectId}/databases/${settings.databaseId}/documents`
  const path = pathSegments.map((s) => encodeURIComponent(s)).join('/')
  const url = `${basePath}/${path}?key=${encodeURIComponent(settings.apiKey)}`
  const headers: Record<string, string> = { Accept: 'application/json' }
  const init: RequestInit = { method, headers, keepalive }
  if (body) {
    headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(body)
  }
  const res = await fetch(url, init)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Firestore ${method} ${path} failed: ${res.status}`)
  if (res.status === 204) return null
  return res.json()
}

export async function loadFirestoreSettings(configUrl: string): Promise<FirestoreSettings> {
  const res = await fetch(configUrl, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Failed to load config.json (HTTP ${res.status})`)
  const raw = await res.json()
  const apiKey = raw.API_KEY || raw.apiKey || ''
  const projectId = raw.PROJECT_ID || raw.projectId || ''
  const databaseId = raw.DATABASE_ID || raw.databaseId || '(default)'
  if (!apiKey || !projectId) throw new Error('Missing API_KEY or PROJECT_ID in config.json')
  return { apiKey, projectId, databaseId }
}

/** Read a document's decoded fields, or null if it does not exist (404). */
export async function getDocumentFields(
  settings: FirestoreSettings,
  pathSegments: string[],
): Promise<Record<string, FsJson> | null> {
  const doc = await request(settings, pathSegments, 'GET', null)
  if (!doc) return null
  return decodeFields(doc.fields || {})
}

/** Write a document's fields (full set sent each call → consistent overwrite). */
export async function patchDocumentFields(
  settings: FirestoreSettings,
  pathSegments: string[],
  fields: Record<string, FsJson>,
  keepalive = false,
): Promise<void> {
  await request(settings, pathSegments, 'PATCH', { fields: encodeFields(fields) }, keepalive)
}

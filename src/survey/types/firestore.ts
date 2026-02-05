import type { JsonValue } from '../../types'

export interface FirestoreSettings {
  apiKey: string
  projectId: string
  databaseId: string
}

export interface FirestoreDocument<T extends Record<string, JsonValue> = Record<string, JsonValue>> {
  name: string
  fields: T
}

export interface SurveyResponsePayload {
  value: JsonValue
  updatedAt?: string
}

export interface PreRegistrationPayload extends Record<string, JsonValue> {
  email: string
}

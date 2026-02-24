import { normalizeOpsGroups, type OpsSpecInput } from '../domain/operation/opsSpec'
import type { OperationSpec } from '../domain/operation/types'

export type DemoSentenceBinding = {
  sentence: string
  groupName: string
  ops: OperationSpec[]
}

export function buildDemoSentenceBindings(sentences: string[], opsSpec: OpsSpecInput): DemoSentenceBinding[] {
  const groups = normalizeOpsGroups(opsSpec)
  if (groups.length === 0) {
    throw new Error('opsSpec has no executable groups.')
  }
  if (sentences.length !== groups.length) {
    throw new Error(
      `Sentence count (${sentences.length}) must match opsSpec group count (${groups.length}).`,
    )
  }

  return groups.map((group, index) => ({
    sentence: sentences[index],
    groupName: group.name,
    ops: group.ops,
  }))
}

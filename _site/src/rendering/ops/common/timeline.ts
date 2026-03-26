import type { OperationSpec } from '../../../types'

/**
 * Build execution phases from a DAG described by meta.inputs.
 * - Each phase contains ops whose inputs are all satisfied by previous phases.
 * - If no meta/inputs are provided, falls back to deterministic sequential phases (one op per phase).
 */
export function buildExecutionPhases(ops: OperationSpec[]): OperationSpec[][] {
  if (!Array.isArray(ops) || ops.length === 0) return []

  const idFor = (op: OperationSpec) => (op.meta?.nodeId as string | undefined) || (op as any).id || ''
  const inputsFor = (op: OperationSpec) => (Array.isArray(op.meta?.inputs) ? op.meta!.inputs! : []) as string[]
  const hasExplicitDeps = ops.some((op) => {
    const id = idFor(op)
    const inputs = inputsFor(op)
    return Boolean(id) || inputs.length > 0
  })

  // Without explicit DAG metadata, default to deterministic sequential execution.
  if (!hasExplicitDeps) {
    return ops.map((op) => [op])
  }

  type PendingEntry = {
    key: string
    op: OperationSpec
    nodeId: string
    inputs: string[]
  }
  const remaining = new Map<string, PendingEntry>()
  ops.forEach((op, index) => {
    const nodeId = idFor(op)
    const inputs = inputsFor(op)
    const keyBase = nodeId || `__idx_${index}`
    const key = `${keyBase}#${index}`
    remaining.set(key, { key, op, nodeId, inputs })
  })

  const phases: OperationSpec[][] = []
  const satisfiedNodeIds = new Set<string>()

  while (remaining.size) {
    const phase: OperationSpec[] = []
    for (const [key, entry] of Array.from(remaining.entries())) {
      const ready = entry.inputs.every((dep) => satisfiedNodeIds.has(dep))
      if (ready) {
        phase.push(entry.op)
        remaining.delete(key)
      }
    }
    if (phase.length === 0) {
      // Cycle or missing deps; emit all remaining in one phase to avoid deadlock.
      phases.push(Array.from(remaining.values()).map((entry) => entry.op))
      break
    }
    phases.push(phase)
    phase.forEach((op) => {
      const nodeId = idFor(op)
      if (nodeId) satisfiedNodeIds.add(nodeId)
    })
  }

  return phases
}

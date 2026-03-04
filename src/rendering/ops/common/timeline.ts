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

  const remaining = new Map<string, OperationSpec>()
  ops.forEach((op) => {
    const id = idFor(op)
    remaining.set(id || `__idx_${remaining.size}`, op)
  })

  const phases: OperationSpec[][] = []
  const satisfied = new Set<string>()

  while (remaining.size) {
    const phase: OperationSpec[] = []
    for (const [id, op] of Array.from(remaining.entries())) {
      const inputs = inputsFor(op)
      const ready = inputs.every((dep) => satisfied.has(dep))
      if (ready) {
        phase.push(op)
        remaining.delete(id)
      }
    }
    if (phase.length === 0) {
      // Cycle or missing deps; emit all remaining in one phase to avoid deadlock.
      phases.push(Array.from(remaining.values()))
      break
    }
    phases.push(phase)
    phase.forEach((op) => satisfied.add(idFor(op)))
  }

  return phases
}

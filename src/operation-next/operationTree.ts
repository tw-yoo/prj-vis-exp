import { getOperationCategory, type OperationCategory } from '../domain/operation/operationCategory'
import type { OperationSpec, TargetSelector } from '../domain/operation/types'

export interface NodeRef {
  nodeId: string
}

export interface OperationNode {
  id: string
  op: OperationSpec
  inputs: NodeRef[]
  pure: boolean
  category: OperationCategory
}

/** Converts the legacy operation list into explicit dependency nodes. */
export function buildTreeFromList(ops: OperationSpec[]): OperationNode[] {
  return ops.map((op, index) => {
    const id = operationNodeId(op, index)
    const category = getOperationCategory(op.op)
    return {
      id,
      op,
      inputs: collectInputRefs(op),
      pure: isPureOperation(category, op),
      category,
    }
  })
}

export function listFromTree(tree: OperationNode[]): OperationSpec[] {
  return topologicalLinearize(tree).map((node) => node.op)
}

export function topologicalLinearize(tree: OperationNode[]): OperationNode[] {
  const nodesById = new Map(tree.map((node) => [node.id, node]))
  const visited = new Set<string>()
  const visiting = new Set<string>()
  const ordered: OperationNode[] = []

  const visit = (node: OperationNode) => {
    if (visited.has(node.id)) return
    if (visiting.has(node.id)) {
      throw new Error(`operation tree contains a dependency cycle at "${node.id}"`)
    }
    visiting.add(node.id)
    node.inputs.forEach((input) => {
      const dependency = nodesById.get(input.nodeId)
      if (dependency) visit(dependency)
    })
    visiting.delete(node.id)
    visited.add(node.id)
    ordered.push(node)
  }

  tree.forEach(visit)
  return ordered
}

export function operationNodeId(op: OperationSpec, index: number): string {
  const metaNodeId = op.meta?.nodeId
  if (typeof metaNodeId === 'string' || typeof metaNodeId === 'number') return String(metaNodeId)
  const raw = op as OperationSpec & { id?: unknown; key?: unknown }
  if (typeof raw.id === 'string' || typeof raw.id === 'number') return String(raw.id)
  if (typeof raw.key === 'string' || typeof raw.key === 'number') return String(raw.key)
  return `n${index}`
}

function collectInputRefs(op: OperationSpec): NodeRef[] {
  const refs = new Set<string>()
  const metaInputs = Array.isArray(op.meta?.inputs) ? op.meta.inputs : []
  metaInputs.forEach((input) => {
    if (typeof input === 'string' || typeof input === 'number') refs.add(normalizeRefId(input))
  })
  collectSelectorRefs(op.target).forEach((ref) => refs.add(ref))
  collectSelectorRefs(op.targetA).forEach((ref) => refs.add(ref))
  collectSelectorRefs(op.targetB).forEach((ref) => refs.add(ref))
  if (typeof op.value === 'string' && op.value.startsWith('ref:')) refs.add(normalizeRefId(op.value))
  return Array.from(refs).map((nodeId) => ({ nodeId }))
}

function collectSelectorRefs(selector: TargetSelector | TargetSelector[] | undefined): string[] {
  if (selector == null) return []
  if (Array.isArray(selector)) return selector.flatMap(collectSelectorRefs)
  if (typeof selector === 'string') return selector.startsWith('ref:') ? [normalizeRefId(selector)] : []
  if (typeof selector === 'object') {
    const id = selector.id
    if (typeof id === 'string' || typeof id === 'number') return [normalizeRefId(id)]
  }
  return []
}

function normalizeRefId(value: string | number) {
  const text = String(value).trim()
  return text.startsWith('ref:') ? text.slice('ref:'.length).trim() : text
}

function isPureOperation(category: OperationCategory, op: OperationSpec) {
  if (op.op === 'filter' || op.op === 'sort') return false
  return category !== 'passthrough'
}

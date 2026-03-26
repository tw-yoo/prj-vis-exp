import type { JsonValue } from '../../types'

type SpecNode = Record<string, unknown>

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function toTransformList(transform: unknown): JsonValue[] {
  if (transform == null) return []
  if (Array.isArray(transform)) return transform as JsonValue[]
  return [transform as JsonValue]
}

export type VegaLiteWalkContext = {
  inheritedData: unknown | undefined
  inheritedTransforms: JsonValue[]
}

export type VegaLiteWalkVisitArgs = {
  node: SpecNode
  effectiveData: unknown | undefined
  effectiveTransforms: JsonValue[]
}

/**
 * Walk a Vega-Lite spec and call `visit` for each node that has an `encoding` object.
 * The walk carries down "effective" data + transforms so callers can evaluate transforms
 * that are attached at container scopes (e.g., facet container or layer root).
 */
export async function walkVegaLiteSpec(
  spec: unknown,
  visit: (args: VegaLiteWalkVisitArgs) => Promise<void> | void,
  ctx: VegaLiteWalkContext = { inheritedData: undefined, inheritedTransforms: [] },
): Promise<void> {
  if (!isRecord(spec)) return

  const node = spec as SpecNode
  const effectiveData = isRecord(node.data) ? node.data : ctx.inheritedData
  const nodeTransforms = toTransformList(node.transform)
  const effectiveTransforms = [...ctx.inheritedTransforms, ...nodeTransforms]

  if (isRecord(node.encoding)) {
    await visit({ node, effectiveData, effectiveTransforms })
  }

  if (isRecord(node.spec)) {
    await walkVegaLiteSpec(node.spec, visit, { inheritedData: effectiveData, inheritedTransforms: effectiveTransforms })
    return
  }

  if (Array.isArray(node.layer)) {
    for (const layerItem of node.layer) {
      await walkVegaLiteSpec(layerItem, visit, { inheritedData: effectiveData, inheritedTransforms: effectiveTransforms })
    }
    return
  }

  for (const key of ['hconcat', 'vconcat', 'concat'] as const) {
    if (Array.isArray(node[key])) {
      for (const child of node[key] as unknown[]) {
        await walkVegaLiteSpec(child, visit, { inheritedData: effectiveData, inheritedTransforms: effectiveTransforms })
      }
      return
    }
  }
}


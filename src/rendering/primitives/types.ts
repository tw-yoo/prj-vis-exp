import type * as d3 from 'd3'
import type { ChartContext } from '../common/d3Helpers'

/** Shared primitive contract used by declarative visualization frames. */
export interface PrimitiveCall<TParams = unknown> {
  semanticKey: string
  params: TParams
}

export type DiffStatus = 'identical' | 'updated' | 'replaced'

export type SvgSelection = d3.Selection<SVGSVGElement, unknown, null, undefined>

export interface PrimitiveImpl<TParams> {
  apply(svg: SvgSelection, params: TParams, ctx: ChartContext, withTransition: boolean): Promise<void>
  remove(svg: SvgSelection, semanticKey: string): Promise<void>
  diff(prev: TParams, next: TParams): DiffStatus
}

export function stablePrimitiveParamsKey(value: unknown): string {
  return JSON.stringify(stabilize(value))
}

export function primitiveDiff<TParams>(prev: TParams, next: TParams): DiffStatus {
  return stablePrimitiveParamsKey(prev) === stablePrimitiveParamsKey(next) ? 'identical' : 'updated'
}

export function escapePrimitiveKey(key: string) {
  return key.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function stabilize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stabilize)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => [key, stabilize(entry)]),
  )
}
